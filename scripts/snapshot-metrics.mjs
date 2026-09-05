// Daily metrics snapshot — fetch every [data-metric] number once in CI and write
// data/metrics.json, so visitors read a static file instead of each hammering the
// GitHub/HF/npm/YouTube APIs on page load (and hitting rate limits behind shared IPs).
//
// All values are all-time / cumulative. On a transient fetch failure we KEEP the
// previous value rather than drop it — all-time numbers only grow, so a stale-but-
// real number always beats a hole. Run: `node scripts/snapshot-metrics.mjs`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { discoverRepositories, aggregateDownloads, downloadCount, hfCollectionDownloads } from './project-downloads.mjs';

const HTML = 'index.html';
const OUT = 'data/metrics.json';

// Parse every element carrying data-metric + its id attribute straight from the page,
// so adding a metric to index.html is enough — there's no second list to maintain here.
function parseMetrics(html) {
    const out = [];
    const tagRe = /<[^>]*\bdata-metric=["']([^"']+)["'][^>]*>/g;
    let m;
    while ((m = tagRe.exec(html))) {
        const tag = m[0], metric = m[1];
        const attr = name => {
            const r = new RegExp(`\\b${name}=["']([^"']+)["']`).exec(tag);
            return r ? r[1] : null;
        };
        const id = attr('data-repo') || attr('data-id') || attr('data-slug') ||
            attr('data-pkg') || attr('data-video') || '';
        out.push({ metric, id, key: `${metric}:${id}` });
    }
    return out;
}

const GH_HEADERS = {
    'User-Agent': 'enderfga-metrics-snapshot',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function githubStars(repo) {
    // Comma-separated repos sum into one count (co-developed projects shown as a
    // single number); all-or-nothing so a failed repo never yields an undercount.
    let total = 0;
    for (const name of repo.split(',').map(s => s.trim()).filter(Boolean)) {
        const r = await fetch(`https://api.github.com/repos/${name}`, { headers: GH_HEADERS });
        if (!r.ok) return null;
        const d = await r.json();
        if (typeof d.stargazers_count !== 'number') return null;
        total += d.stargazers_count;
    }
    return total || null;
}

async function hfDownloads(kind, id) {
    const r = await fetch(`https://huggingface.co/api/${kind}/${id}?expand=downloadsAllTime`);
    if (!r.ok) return null;
    const d = await r.json();
    return downloadCount(d.downloadsAllTime); // all-time only, never the 30-day window
}

async function hfCollection(slug) {
    return hfCollectionDownloads(slug);
}

const catalogs = new Map();
const projectDetails = {};
async function projectDownloads(platform, id, key) {
    const configs = JSON.parse(readFileSync('data/download-projects.json', 'utf8'));
    if (!configs[id]) throw new Error(`Unknown download project: ${id}`);
    if (!catalogs.has(id)) catalogs.set(id, discoverRepositories(configs[id]));
    const result = await aggregateDownloads(await catalogs.get(id), platform);
    projectDetails[key] = { ...result, checkedAt: new Date().toISOString(), sources: configs[id].sources,
        publishers: configs[id].publishers,
        counter: platform === 'hf' ? 'downloadsAllTime' : 'Data.Downloads' };
    return result.total;
}

async function npmDownloads(pkg) {
    // npm's point API only exposes fixed recent windows, so we walk 18-month range
    // segments from the publish date and sum the daily counts for an all-time total.
    let start = '2015-01-10';
    try {
        const meta = await fetch(`https://registry.npmjs.org/${pkg}`);
        if (meta.ok) {
            const created = ((await meta.json()).time || {}).created;
            if (created) start = created.slice(0, 10);
        }
    } catch { /* fall back to the stats epoch */ }
    const today = new Date();
    const segments = [];
    for (let cursor = new Date(start); cursor < today;) {
        const segEnd = new Date(cursor);
        segEnd.setMonth(segEnd.getMonth() + 18);
        const end = segEnd > today ? today : segEnd;
        segments.push([cursor.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]);
        cursor = new Date(end);
        cursor.setDate(cursor.getDate() + 1);
    }
    let total = 0;
    for (const [s, e] of segments) {
        const r = await fetch(`https://api.npmjs.org/downloads/range/${s}:${e}/${pkg}`);
        if (!r.ok) continue;
        const d = await r.json();
        if (Array.isArray(d.downloads)) total += d.downloads.reduce((a, b) => a + (b.downloads || 0), 0);
    }
    return total > 0 ? total : null;
}

async function pypiDownloads(pkg) {
    // All-time downloads from pepy.tech. Needs a free API key (PEPY_API_KEY) — the
    // public PyPI API exposes no download counts and pypistats is rolling-window only.
    // CI-only: the key lives as a GitHub Actions secret and never reaches the page,
    // which just reads the number snapshotted here. No key → skip (keep prev value).
    const key = process.env.PEPY_API_KEY;
    if (!key) return null;
    const r = await fetch(`https://api.pepy.tech/api/v2/projects/${pkg}`, { headers: { 'X-API-Key': key } });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.total_downloads === 'number' ? d.total_downloads : null;
}

async function youtubeViews(id) {
    const r = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${id}`);
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.viewCount === 'number' ? d.viewCount : null;
}

function fetchValue({ metric, id, key }) {
    switch (metric) {
        case 'github-stars': return githubStars(id);
        case 'hf-dataset': return hfDownloads('datasets', id);
        case 'hf-model': return hfDownloads('models', id);
        case 'hf-collection': return hfCollection(id);
        case 'hf-project': return projectDownloads('hf', id, key);
        case 'modelscope-project': return projectDownloads('modelscope', id, key);
        case 'npm': return npmDownloads(id);
        case 'pypi-downloads': return pypiDownloads(id);
        case 'youtube-views': return youtubeViews(id);
        default: return Promise.resolve(null);
    }
}

const html = readFileSync(HTML, 'utf8');
const hadFile = existsSync(OUT);
const previous = hadFile ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const prevValues = previous.values || {};
const values = {};
const details = {};

for (const m of parseMetrics(html)) {
    let v = null;
    try { v = await fetchValue(m); } catch (e) { console.error(`fetch error ${m.key}: ${e.message}`); }
    // A real zero is publishable (a freshly released repo), but an all-time counter
    // that was positive yesterday never legitimately returns to zero — that is an API
    // hiccup, so fall through and keep the last good value.
    const usable = typeof v === 'number' && Number.isFinite(v) && v >= 0 &&
        !(v === 0 && prevValues[m.key] > 0);
    if (usable) {
        values[m.key] = v;
        if (projectDetails[m.key]) details[m.key] = projectDetails[m.key];
    } else if (m.key in prevValues) {
        values[m.key] = prevValues[m.key]; // keep last good value on transient failure
        if (previous.details?.[m.key]) details[m.key] = previous.details[m.key];
        console.warn(`kept previous ${m.key} = ${prevValues[m.key]}`);
    }
    console.log(`${m.key} = ${values[m.key] ?? '(none)'}`);
}

// Rewrite when values or audited project details change. A failed project fetch
// keeps its previous checkedAt as well as its count and complete repository list.
const canon = o => JSON.stringify(Object.keys(o).sort().reduce((a, k) => (a[k] = o[k], a), {}));
if (hadFile && canon(values) === canon(prevValues) && canon(details) === canon(previous.details || {})) {
    console.log('No value changes — snapshot left untouched.');
} else {
    writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), values, details }, null, 2) + '\n');
    console.log(`wrote ${OUT} with ${Object.keys(values).length} metric(s)`);
}
