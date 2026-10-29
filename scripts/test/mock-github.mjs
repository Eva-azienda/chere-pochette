// In-memory fake of the GitHub REST endpoints used by the admin page (Git Data API + Actions),
// for scripts/test/admin-store.test.mjs. Trees are stored flat (full path → blob sha);
// sub-trees get stable synthetic ids.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function createMockGitHub({ owner = 'o', repo = 'r', branch = 'main', token = 'tok', files = {} } = {}) {
  let counter = 0;
  // prefix + zero-padded counter: unique (padEnd would make "b1" and "b10" collide)
  const newSha = (p) => p + (++counter).toString(16).padStart(39, '0');
  const blobs = new Map(); // sha → Uint8Array
  const roots = new Map(); // root tree sha → Map(path → blobSha)
  const subIds = new Map(); // "root|prefix" → id
  const subs = new Map(); // id → {root, prefix}
  const commits = new Map(); // sha → {tree, parents, message}
  const log = []; // requests
  const hooks = { beforePatch: null };
  let runs = [{ id: 1, status: 'completed', conclusion: 'success', html_url: 'https://github.com/o/r/actions/runs/1', created_at: '2026-10-29T10:00:00Z' }];
  let dispatched = 0;

  function putBlob(bytes) {
    const s = newSha('b');
    blobs.set(s, bytes);
    return s;
  }
  function putRoot(map) {
    const s = newSha('t');
    roots.set(s, map);
    subs.set(s, { root: s, prefix: '' });
    return s;
  }
  function subId(root, prefix) {
    const key = `${root}|${prefix}`;
    if (!subIds.has(key)) {
      const id = newSha('s');
      subIds.set(key, id);
      subs.set(id, { root, prefix });
    }
    return subIds.get(key);
  }
  function commitTree(map, message, parents) {
    const tree = putRoot(map);
    const s = newSha('c');
    commits.set(s, { tree, parents, message });
    return s;
  }

  // initial commit
  const initial = new Map();
  for (const [path, content] of Object.entries(files)) {
    initial.set(path, putBlob(typeof content === 'string' ? enc.encode(content) : content));
  }
  let refSha = commitTree(initial, 'init', []);

  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  function listing(id, recursive) {
    const s = subs.get(id);
    if (!s) return null;
    const map = roots.get(s.root);
    const out = [];
    const seen = new Set();
    for (const [path, sha] of map) {
      if (!path.startsWith(s.prefix)) continue;
      const rest = path.slice(s.prefix.length);
      if (recursive) {
        out.push({ path: rest, mode: '100644', type: 'blob', sha, size: blobs.get(sha).length });
        continue;
      }
      const slash = rest.indexOf('/');
      if (slash === -1) out.push({ path: rest, mode: '100644', type: 'blob', sha, size: blobs.get(sha).length });
      else {
        const dir = rest.slice(0, slash);
        if (!seen.has(dir)) {
          seen.add(dir);
          out.push({ path: dir, mode: '040000', type: 'tree', sha: subId(s.root, `${s.prefix}${dir}/`) });
        }
      }
    }
    return out;
  }

  const base = `/repos/${owner}/${repo}`;

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const method = init.method || 'GET';
    const path = u.pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    log.push({ method, path: path + u.search, body });
    if (init.headers.Authorization !== `Bearer ${token}`) return json(401, { message: 'Bad credentials' });
    if (init.cache !== 'no-store') throw new Error('expected cache: no-store');

    if (method === 'GET' && path === base) return json(200, { full_name: `${owner}/${repo}`, private: false });
    if (method === 'GET' && path === `${base}/git/ref/heads/${branch}`) return json(200, { object: { sha: refSha, type: 'commit' } });
    let m;
    if (method === 'GET' && (m = path.match(/\/git\/commits\/(\w+)$/))) {
      const c = commits.get(m[1]);
      return c ? json(200, { sha: m[1], tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })) }) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = path.match(/\/git\/trees\/(\w+)$/))) {
      const t = listing(m[1], u.searchParams.get('recursive') === '1');
      return t ? json(200, { sha: m[1], tree: t, truncated: false }) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = path.match(/\/git\/blobs\/(\w+)$/))) {
      const b = blobs.get(m[1]);
      if (!b) return json(404, { message: 'Not Found' });
      if (/raw/.test(init.headers.Accept)) return new Response(b, { status: 200 });
      return json(200, { sha: m[1], content: Buffer.from(b).toString('base64'), encoding: 'base64' });
    }
    if (method === 'POST' && path === `${base}/git/blobs`) {
      const bytes = body.encoding === 'base64' ? new Uint8Array(Buffer.from(body.content, 'base64')) : enc.encode(body.content);
      return json(201, { sha: putBlob(bytes) });
    }
    if (method === 'POST' && path === `${base}/git/trees`) {
      const baseRoot = subs.get(body.base_tree);
      if (!baseRoot || baseRoot.prefix !== '') return json(422, { message: 'base_tree must be a root tree' });
      const map = new Map(roots.get(baseRoot.root));
      for (const e of body.tree) {
        if (e.sha === null) {
          if (!map.has(e.path)) return json(422, { message: `GitRPC::BadObjectState: ${e.path} does not exist` });
          map.delete(e.path);
        } else {
          if (!blobs.has(e.sha)) return json(422, { message: 'tree.sha is not a valid blob' });
          map.set(e.path, e.sha);
        }
      }
      return json(201, { sha: putRoot(map) });
    }
    if (method === 'POST' && path === `${base}/git/commits`) {
      const s = newSha('c');
      commits.set(s, { tree: body.tree, parents: body.parents, message: body.message });
      return json(201, { sha: s });
    }
    if (method === 'PATCH' && path === `${base}/git/refs/heads/${branch}`) {
      if (hooks.beforePatch) {
        const h = hooks.beforePatch;
        hooks.beforePatch = null;
        h(api);
      }
      const c = commits.get(body.sha);
      if (!c) return json(422, { message: 'Object does not exist' });
      if (!body.force && c.parents[0] !== refSha) return json(422, { message: 'Update is not a fast forward' });
      refSha = body.sha;
      return json(200, { object: { sha: refSha } });
    }
    if (method === 'GET' && path === `${base}/actions/workflows/deploy.yml/runs`) {
      return json(200, { total_count: runs.length, workflow_runs: runs.slice(0, 1) });
    }
    if (method === 'POST' && path === `${base}/actions/workflows/deploy.yml/dispatches`) {
      dispatched++;
      return new Response(null, { status: 204 });
    }
    return json(404, { message: `Not Found (${method} ${path})` });
  }

  const api = {
    fetchImpl,
    log,
    hooks,
    get dispatched() {
      return dispatched;
    },
    setRuns(r) {
      runs = r;
    },
    headMessage: () => commits.get(refSha).message,
    commitCount: () => {
      let n = 0;
      let s = refSha;
      while (s) {
        n++;
        s = commits.get(s).parents[0];
      }
      return n;
    },
    files() {
      return roots.get(commits.get(refSha).tree);
    },
    read(path) {
      const sha = api.files().get(path);
      return sha ? dec.decode(blobs.get(sha)) : null;
    },
    readBytes(path) {
      const sha = api.files().get(path);
      return sha ? blobs.get(sha) : null;
    },
    /** Simulates another commit (e.g. the Zahls sync) directly on the branch. */
    externalCommit(changes, message = 'sync') {
      const map = new Map(api.files());
      for (const [path, content] of Object.entries(changes)) {
        if (content === null) map.delete(path);
        else map.set(path, putBlob(enc.encode(content)));
      }
      refSha = commitTree(map, message, [refSha]);
    },
  };
  return api;
}
