/**
 * Minimal GitHub REST API client for the admin.
 *
 * Reads go through the Git Data API (trees and blobs are addressed by their SHA, so they
 * can be cached forever). Writes create ONE commit per save:
 *   blobs → tree (with base_tree) → commit → move the branch (PATCH ref, force:false).
 * If someone else pushed in the meantime (422 "not a fast forward") the commit is rebuilt
 * on top of the fresh branch, up to 3 times.
 *
 * The token is kept in a private class field: it is never logged, rendered or serialised.
 */
import { bytesToBase64 } from './crypto.js';
import { sleep } from './util.js';

const API_ROOT = 'https://api.github.com';

/** Error with a friendly Italian message and a `kind` the UI can react to. */
export class GitHubError extends Error {
  /**
   * @param {string} message  friendly message (Italian)
   * @param {{status?: number, kind?: string, detail?: string}} [info]
   *   kind: 'auth' | 'forbidden' | 'ratelimit' | 'notfound' | 'conflict' | 'server' | 'network' | 'http'
   */
  constructor(message, { status = 0, kind = 'http', detail = '' } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.kind = kind;
    this.detail = detail;
  }
}

/** Encodes every segment of a path but keeps the slashes. */
export function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

async function errorFromResponse(res) {
  let detail = '';
  try {
    detail = (await res.json()).message || '';
  } catch {
    /* body is not JSON */
  }
  const status = res.status;
  const remaining = res.headers.get('x-ratelimit-remaining');
  if (status === 401) {
    return new GitHubError('Accesso a GitHub scaduto o non valido.', { status, kind: 'auth', detail });
  }
  if (status === 429 || (status === 403 && (remaining === '0' || /rate limit/i.test(detail)))) {
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    const reset = Number(res.headers.get('x-ratelimit-reset')) || 0;
    const minutes = retryAfter
      ? Math.ceil(retryAfter / 60)
      : reset
        ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000))
        : 1;
    return new GitHubError(
      `GitHub ha ricevuto troppe richieste. Riprova tra ${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}.`,
      { status, kind: 'ratelimit', detail },
    );
  }
  if (status === 403) {
    return new GitHubError('Il token di accesso non ha il permesso per questa operazione.', { status, kind: 'forbidden', detail });
  }
  if (status === 404) return new GitHubError('Non trovato su GitHub.', { status, kind: 'notfound', detail });
  if (status === 409 || status === 422) {
    return new GitHubError(detail || 'Conflitto su GitHub.', { status, kind: 'conflict', detail });
  }
  if (status >= 500) {
    return new GitHubError('GitHub non risponde in questo momento. Riprova tra poco.', { status, kind: 'server', detail });
  }
  return new GitHubError(`Errore GitHub (${status}). ${detail}`.trim(), { status, kind: 'http', detail });
}

export class GitHubClient {
  #token;

  /**
   * @param {{owner: string, repo: string, branch?: string, token: string}} session
   * @param {{fetchImpl?: Function, persist?: {get(k: string): string|null, set(k: string, v: string): void}}} [options]
   *   fetchImpl: injectable fetch (tests); persist: optional long-lived cache for blob texts
   */
  constructor({ owner, repo, branch = 'main', token }, { fetchImpl, persist } = {}) {
    if (!owner || !repo || !token) throw new Error('Servono proprietario, repository e token.');
    this.owner = owner;
    this.repo = repo;
    this.branch = branch || 'main';
    this.#token = token;
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    this.persist = persist || null;
    // Caches keyed by SHA (content-addressed → never stale).
    this.commits = new Map();
    this.trees = new Map();
    this.texts = new Map();
  }

  get base() {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  /**
   * Low-level call. `as`: 'json' (default) | 'text' | 'blob' | 'none'.
   * `cache: 'no-store'` matters: GitHub sends max-age=60 and a stale branch ref would
   * make us commit on top of an old version.
   */
  async request(method, path, { body, accept = 'application/vnd.github+json', as = 'json' } = {}) {
    const headers = { Accept: accept, Authorization: `Bearer ${this.#token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await this.fetchImpl(API_ROOT + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch {
      throw new GitHubError('Connessione assente o instabile. Controlla la rete e riprova.', { kind: 'network' });
    }
    if (!res.ok) throw await errorFromResponse(res);
    if (res.status === 204 || as === 'none') return null;
    if (as === 'text') return res.text();
    if (as === 'blob') return res.blob();
    return res.json();
  }

  /** Repository info (used to check that the token works). */
  getRepo() {
    return this.request('GET', this.base);
  }

  /** Current tip of the branch: { commitSha, treeSha }. */
  async getHead() {
    const ref = await this.request('GET', `${this.base}/git/ref/heads/${encodePath(this.branch)}`);
    const commitSha = ref.object.sha;
    let commit = this.commits.get(commitSha);
    if (!commit) {
      commit = await this.request('GET', `${this.base}/git/commits/${commitSha}`);
      this.commits.set(commitSha, commit);
    }
    return { commitSha, treeSha: commit.tree.sha };
  }

  /** Entries of one tree (non recursive): [{ path: name, mode, type: 'blob'|'tree', sha, size }]. */
  async getTree(sha) {
    if (!this.trees.has(sha)) {
      const p = this.request('GET', `${this.base}/git/trees/${sha}`).then((t) => t.tree || []);
      this.trees.set(sha, p);
      p.catch(() => this.trees.delete(sha)); // do not cache failures
    }
    return this.trees.get(sha);
  }

  /** Finds `path` (e.g. "src/data/products") inside a root tree. Returns the entry or null. */
  async lookup(rootTreeSha, path) {
    let entry = { type: 'tree', sha: rootTreeSha, path: '' };
    for (const part of String(path).split('/').filter(Boolean)) {
      if (entry.type !== 'tree') return null;
      const entries = await this.getTree(entry.sha);
      entry = entries.find((e) => e.path === part);
      if (!entry) return null;
    }
    return entry;
  }

  /** Lists a folder (non recursive). Missing folder → []. */
  async listDir(rootTreeSha, path) {
    const entry = await this.lookup(rootTreeSha, path);
    if (!entry || entry.type !== 'tree') return [];
    return this.getTree(entry.sha);
  }

  /** All files below a tree, with paths relative to it. */
  async listFilesRecursive(treeSha) {
    const t = await this.request('GET', `${this.base}/git/trees/${treeSha}?recursive=1`);
    return (t.tree || []).filter((e) => e.type === 'blob');
  }

  /** Text content of a blob (UTF-8), cached by SHA in memory and in `persist`. */
  async readText(sha) {
    if (this.texts.has(sha)) return this.texts.get(sha);
    const stored = this.persist && this.persist.get(sha);
    if (stored != null) {
      this.texts.set(sha, stored);
      return stored;
    }
    const text = await this.request('GET', `${this.base}/git/blobs/${sha}`, {
      accept: 'application/vnd.github.raw+json',
      as: 'text',
    });
    this.texts.set(sha, text);
    if (this.persist) this.persist.set(sha, text);
    return text;
  }

  /** Binary content of a blob. */
  readBlob(sha) {
    return this.request('GET', `${this.base}/git/blobs/${sha}`, { accept: 'application/vnd.github.raw+json', as: 'blob' });
  }

  /** Uploads a file (string → UTF-8, Blob → base64). Returns its SHA. */
  async createBlob(data) {
    const body =
      typeof data === 'string'
        ? { content: data, encoding: 'utf-8' }
        : { content: bytesToBase64(new Uint8Array(await data.arrayBuffer())), encoding: 'base64' };
    const res = await this.request('POST', `${this.base}/git/blobs`, { body });
    return res.sha;
  }

  /**
   * Creates ONE commit on the branch.
   * `prepare(head, attempt)` is called with the fresh branch tip on every attempt and returns
   *   { message, files: [{ path, sha } | { path, text }], deletes: [path] }   (or null = nothing to do)
   * so the caller can merge its change into the latest version of each file.
   * Paths in `deletes` must exist in head's tree.
   */
  async commit({ prepare, maxRetries = 3 }) {
    for (let attempt = 0; ; attempt++) {
      const head = await this.getHead();
      const plan = await prepare(head, attempt);
      if (!plan) return { skipped: true, commitSha: head.commitSha };
      const tree = [];
      for (const file of plan.files || []) {
        const sha = file.sha || (await this.createBlob(file.text));
        tree.push({ path: file.path, mode: '100644', type: 'blob', sha });
      }
      for (const path of plan.deletes || []) tree.push({ path, mode: '100644', type: 'blob', sha: null });

      const newTree = await this.request('POST', `${this.base}/git/trees`, { body: { base_tree: head.treeSha, tree } });
      const commit = await this.request('POST', `${this.base}/git/commits`, {
        body: { message: plan.message, tree: newTree.sha, parents: [head.commitSha] },
      });
      try {
        await this.request('PATCH', `${this.base}/git/refs/heads/${encodePath(this.branch)}`, {
          body: { sha: commit.sha, force: false },
        });
        this.commits.set(commit.sha, { sha: commit.sha, tree: { sha: newTree.sha } });
        return { commitSha: commit.sha, plan };
      } catch (err) {
        const notFastForward = err.kind === 'conflict' && /fast.?forward/i.test(err.detail || err.message);
        if (notFastForward && attempt < maxRetries) {
          await sleep(400 * (attempt + 1)); // someone else pushed: rebuild on top of it
          continue;
        }
        if (notFastForward) {
          throw new GitHubError('Qualcun altro sta salvando proprio adesso. Aspetta qualche secondo e riprova.', {
            status: err.status,
            kind: 'conflict',
          });
        }
        if (err.kind === 'conflict' && /protected/i.test(err.detail)) {
          throw new GitHubError('Il branch è protetto: GitHub non accetta salvataggi diretti.', { status: err.status, kind: 'forbidden' });
        }
        throw err;
      }
    }
  }

  /** Latest run of a workflow on the branch (falls back to any workflow if the file is unknown). */
  async latestRun(workflowFile = 'deploy.yml') {
    const query = `branch=${encodeURIComponent(this.branch)}&per_page=1`;
    let data;
    try {
      data = await this.request('GET', `${this.base}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${query}`);
    } catch (err) {
      if (err.kind !== 'notfound') throw err;
      data = await this.request('GET', `${this.base}/actions/runs?${query}`);
    }
    return (data && data.workflow_runs && data.workflow_runs[0]) || null;
  }

  /** Starts a workflow manually (needs `workflow_dispatch` in the workflow and Actions: write). */
  dispatch(workflowFile = 'deploy.yml') {
    return this.request('POST', `${this.base}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`, {
      body: { ref: this.branch },
      as: 'none',
    });
  }
}
