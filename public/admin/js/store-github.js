/**
 * Real backend: the GitHub repository of the website is the database.
 *   - src/data/{models,taxonomy,site}.json  → read at every load (always in sync with the site)
 *   - src/data/products/<id>.json           → one file per bag
 *   - public/media/products/<id>/<n>-{1600,900,400}.jpg → photos
 * Every save is ONE commit on the branch; the push starts the deploy workflow
 * (.github/workflows/deploy.yml) which creates the Zahls payment links and publishes the site.
 */
import { GitHubClient, GitHubError, encodePath } from './github.js';
import {
  PRODUCTS_DIR, PUBLIC_DIR, MEDIA_PREFIX, PHOTO_SIZES,
  planSave, serializeProduct, commitMessage, chooseNumber, numberFromId, productId,
} from './store.js';
import { mapLimit, createLimiter } from './util.js';

const WORKFLOW_FILE = 'deploy.yml';
const CACHE_PREFIX = 'cp-admin:blob:';

/** Long-lived cache of JSON file contents, keyed by blob SHA (content never changes for a SHA). */
const browserCache = {
  get(sha) {
    try {
      return globalThis.localStorage ? localStorage.getItem(CACHE_PREFIX + sha) : null;
    } catch {
      return null;
    }
  },
  set(sha, text) {
    try {
      if (globalThis.localStorage) localStorage.setItem(CACHE_PREFIX + sha, text);
    } catch {
      /* storage full or disabled: the cache is only an optimisation */
    }
  },
  /** Removes cached files that are no longer part of the repository. */
  prune(keepShas) {
    try {
      if (!globalThis.localStorage) return;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX) && !keepShas.has(key.slice(CACHE_PREFIX.length))) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }
  },
};

/** Maps a workflow run to the 3 states shown in the inventory. */
export function runState(run) {
  if (!run) return null;
  if (run.status !== 'completed') return 'running';
  if (run.conclusion === 'success') return 'online';
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(run.conclusion)) return 'error';
  return 'other'; // cancelled / skipped: nothing to show
}

export class GitHubBackend {
  /**
   * @param {{owner: string, repo: string, branch?: string, token: string}} session
   * @param {{fetchImpl?: Function, cache?: object}} [options]  injectable for tests
   */
  constructor(session, { fetchImpl, cache } = {}) {
    this.kind = 'github';
    this.owner = session.owner;
    this.repo = session.repo;
    this.branch = session.branch || 'main';
    this.cache = cache === undefined ? browserCache : cache;
    this.gh = new GitHubClient(session, { fetchImpl, persist: this.cache });
    this.head = null; // branch tip seen by the last load
    this.localThumbs = new Map(); // src → object URL of photos uploaded from this phone
    this.apiThumbs = new Map(); // repo path → Promise<object URL|null>
    this.thumbLimit = createLimiter(4); // photo downloads through the API, at most 4 at a time
    this.rawFailures = 0; // after a few failures, load thumbnails through the API directly
    this.isPrivate = null; // repository visibility (GET /repos/{owner}/{repo} → private), null = unknown
  }

  /** Throws a GitHubError if the token cannot read the repository. */
  async verify() {
    const info = await this.gh.getRepo();
    this.isPrivate = Boolean(info && info.private);
  }

  async load() {
    // Private repository → photos must come through the authenticated API (see thumb()).
    const repoInfo = this.isPrivate == null ? this.gh.getRepo().catch(() => null) : null;
    const head = await this.gh.getHead();
    const dataDir = await this.gh.listDir(head.treeSha, 'src/data');
    if (!dataDir.length) throw new Error('Non trovo i dati del sito (cartella src/data) in questo repository.');

    const keep = new Set();
    const readJson = async (entry, label) => {
      keep.add(entry.sha);
      const text = await this.gh.readText(entry.sha);
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`${label} non è un JSON valido.`);
      }
    };
    const file = (name) => dataDir.find((e) => e.path === name && e.type === 'blob');
    const [models, taxonomy, site] = await Promise.all(
      ['models.json', 'taxonomy.json', 'site.json'].map((name) => (file(name) ? readJson(file(name), name) : null)),
    );
    if (!models || !taxonomy) throw new Error('Mancano models.json o taxonomy.json in src/data.');

    const entries = (await this.gh.listDir(head.treeSha, PRODUCTS_DIR)).filter(
      (e) => e.type === 'blob' && e.path.endsWith('.json'),
    );
    const problems = [];
    const products = await mapLimit(entries, 6, async (entry) => {
      try {
        return await readJson(entry, entry.path);
      } catch (err) {
        if (err instanceof GitHubError) throw err;
        problems.push(err.message); // a broken file must not block the whole inventory
        return null;
      }
    });
    this.head = head;
    if (repoInfo) {
      const info = await repoInfo;
      if (info) this.isPrivate = Boolean(info.private);
    }
    if (this.cache && this.cache.prune) this.cache.prune(keep);
    return { models, taxonomy, site: site || {}, products: products.filter(Boolean), problems };
  }

  /* ---------- photos ---------- */

  /**
   * Where to show a photo from.
   *  - Private repository: raw.githubusercontent.com answers 404 without a GitHub login, so the
   *    photo is downloaded through the authenticated API (blob → object URL) right away.
   *  - Public repository: raw.githubusercontent.com (fast, cached); on error (file just
   *    uploaded, CDN delay) → the same API fallback.
   */
  thumb(src, size = 400) {
    if (this.localThumbs.has(src)) return { url: this.localThumbs.get(src) };
    const path = `${PUBLIC_DIR}/${src}-${size}.jpg`;
    const fallback = () => this.apiThumb(path);
    if (this.isPrivate === true || this.rawFailures >= 3) return { url: null, fallback };
    const url =
      `https://raw.githubusercontent.com/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}` +
      `/${encodePath(this.branch)}/${encodePath(path)}`;
    return { url, fallback };
  }

  /** Downloads a photo through the GitHub API (works for private repositories). → object URL or null */
  apiThumb(path) {
    if (!this.apiThumbs.has(path)) {
      const p = this.thumbLimit(async () => {
        const head = this.head || (this.head = await this.gh.getHead());
        const entry = await this.gh.lookup(head.treeSha, path);
        if (!entry || entry.type !== 'blob') return null;
        const blob = await this.gh.readBlob(entry.sha);
        this.rawFailures++;
        return URL.createObjectURL(new Blob([blob], { type: 'image/jpeg' }));
      }).catch(() => {
        this.apiThumbs.delete(path); // network / rate limit: try again next time
        return null;
      });
      this.apiThumbs.set(path, p);
    }
    return this.apiThumbs.get(path);
  }

  /** Frees the photo object URLs (called on logout). */
  dispose() {
    for (const p of this.apiThumbs.values()) p.then((url) => url && URL.revokeObjectURL(url));
    for (const url of this.localThumbs.values()) URL.revokeObjectURL(url);
    this.apiThumbs.clear();
    this.localThumbs.clear();
  }

  /** Paths of the photo files of `srcs` that exist in the tree (so they can be deleted). */
  async existingPhotoFiles(treeSha, srcs) {
    const paths = [];
    for (const src of srcs) {
      for (const size of PHOTO_SIZES) {
        const path = `${PUBLIC_DIR}/${src}-${size}.jpg`;
        const entry = await this.gh.lookup(treeSha, path);
        if (entry && entry.type === 'blob') paths.push(path);
      }
    }
    return paths;
  }

  /* ---------- writes ---------- */

  /** Creates or updates a bag (see planSave in store.js for `change`). One commit. */
  async save(change, onProgress = () => {}) {
    // 1. Upload the new photos once (blobs do not depend on the branch, so retries reuse them).
    const uploads = (change.photos || []).filter((p) => p.upload).map((p) => p.upload);
    const jobs = uploads.flatMap((upload) => PHOTO_SIZES.map((size) => ({ upload, size })));
    const shas = new Map(uploads.map((u) => [u, {}]));
    let done = 0;
    if (jobs.length) onProgress({ phase: 'upload', done, total: jobs.length });
    await mapLimit(jobs, 3, async ({ upload, size }) => {
      shas.get(upload)[size] = await this.gh.createBlob(upload.blobs[size]);
      onProgress({ phase: 'upload', done: ++done, total: jobs.length });
    });

    // 2. Commit, merging the change into the latest version of the file.
    onProgress({ phase: 'commit' });
    let planned = null;
    await this.gh.commit({
      prepare: async (head) => {
        const productFiles = await this.gh.listDir(head.treeSha, PRODUCTS_DIR);
        let latest = null;
        if (change.type === 'update') {
          const entry = productFiles.find((e) => e.path === `${change.id}.json`);
          if (entry) latest = JSON.parse(await this.gh.readText(entry.sha));
        }
        const number =
          change.type === 'create'
            ? chooseNumber(change.proposedNumber, productFiles.map((e) => numberFromId(e.path)).filter(Boolean))
            : (latest && latest.number) || numberFromId(change.id);
        const id = change.type === 'create' ? productId(number) : change.id;
        const mediaDir = `${PUBLIC_DIR}/${MEDIA_PREFIX}/${id}`;
        const usedPhotoNs = (await this.gh.listDir(head.treeSha, mediaDir))
          .map((e) => parseInt(e.path, 10))
          .filter((n) => n > 0);

        const plan = planSave({ change, latest, id, number, usedPhotoNs });
        const files = [{ path: `${PRODUCTS_DIR}/${id}.json`, text: serializeProduct(plan.product) }];
        for (const photo of plan.newPhotos) {
          for (const size of PHOTO_SIZES) {
            files.push({ path: `${PUBLIC_DIR}/${photo.src}-${size}.jpg`, sha: shas.get(photo.upload)[size] });
          }
        }
        const deletes = await this.existingPhotoFiles(head.treeSha, plan.removedSrcs);
        planned = plan;
        return { message: commitMessage(change.action, plan.product), files, deletes };
      },
    });

    // Show the photos just taken immediately (GitHub's CDN needs a few minutes).
    for (const photo of planned.newPhotos) {
      if (photo.upload.previewUrl) this.localThumbs.set(photo.src, photo.upload.previewUrl);
    }
    this.head = null;
    return { product: planned.product, action: change.action };
  }

  /** Deletes the bag: its JSON file and its photo folder. One commit. */
  async remove(id, onProgress = () => {}) {
    onProgress({ phase: 'commit' });
    let removed = { id, number: numberFromId(id) };
    await this.gh.commit({
      prepare: async (head) => {
        const deletes = [];
        const jsonPath = `${PRODUCTS_DIR}/${id}.json`;
        const entry = await this.gh.lookup(head.treeSha, jsonPath);
        if (entry) {
          deletes.push(jsonPath);
          try {
            removed = JSON.parse(await this.gh.readText(entry.sha));
          } catch {
            /* broken JSON: delete it anyway */
          }
        }
        const mediaDir = `${PUBLIC_DIR}/${MEDIA_PREFIX}/${id}`;
        const dir = await this.gh.lookup(head.treeSha, mediaDir);
        if (dir && dir.type === 'tree') {
          for (const f of await this.gh.listFilesRecursive(dir.sha)) deletes.push(`${mediaDir}/${f.path}`);
        }
        if (!deletes.length) return null; // already gone
        return { message: commitMessage('delete', removed), files: [], deletes };
      },
    });
    this.head = null;
    return { product: removed, action: 'delete' };
  }

  /* ---------- publishing ---------- */

  async deployStatus() {
    const run = await this.gh.latestRun(WORKFLOW_FILE);
    if (!run) return null;
    return { state: runState(run), url: run.html_url || null, createdAt: run.created_at || null };
  }

  triggerSync() {
    return this.gh.dispatch(WORKFLOW_FILE);
  }
}
