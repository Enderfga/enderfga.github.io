// Daily metrics snapshot — fetch every [data-metric] number once in CI and write
// data/metrics.json, so visitors read a static file instead of each hammering the
// GitHub/HF/npm/YouTube APIs on page load (and hitting rate limits behind shared IPs).
//
// All values are all-time / cumulative. On a transient fetch failure we KEEP the
// previous value rather than drop it — all-time numbers only grow, so a stale-but-
// real number always beats a hole. Run: `node scripts/snapshot-metrics.mjs`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

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
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: GH_HEADERS });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.stargazers_count === 'number' ? d.stargazers_count : null;
}

async function hfDownloads(kind, id) {
    const r = await fetch(`https://huggingface.co/api/${kind}/${id}?expand=downloadsAllTime`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.downloadsAllTime || null; // all-time only, never the 30-day window
}

async function hfCollection(slug) {
    const res = await fetch(`https://huggingface.co/api/collections/${slug}`);
    if (!res.ok) return null;
    const items = ((await res.json()).items || []).filter(i => i.type === 'model' || i.type === 'dataset');
    if (!items.length) return null;
    let total = 0;
    for (const item of items) { // all-or-nothing: any failed item aborts the sum
        const kind = item.type === 'dataset' ? 'datasets' : 'models';
        const r = await fetch(`https://huggingface.co/api/${kind}/${item.id}?expand=downloadsAllTime`);
        if (!r.ok) return null;
        const d = await r.json();
        total += d.downloadsAllTime || 0;
    }
    return total;
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

async function youtubeViews(id) {
    const r = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${id}`);
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.viewCount === 'number' ? d.viewCount : null;
}

function fetchValue({ metric, id }) {
    switch (metric) {
        case 'github-stars': return githubStars(id);
        case 'hf-dataset': return hfDownloads('datasets', id);
        case 'hf-model': return hfDownloads('models', id);
        case 'hf-collection': return hfCollection(id);
        case 'npm': return npmDownloads(id);
        case 'youtube-views': return youtubeViews(id);
        default: return Promise.resolve(null);
    }
}

const html = readFileSync(HTML, 'utf8');
const hadFile = existsSync(OUT);
const prevValues = (hadFile ? JSON.parse(readFileSync(OUT, 'utf8')).values : null) || {};
const values = {};

for (const m of parseMetrics(html)) {
    let v = null;
    try { v = await fetchValue(m); } catch (e) { console.error(`fetch error ${m.key}: ${e.message}`); }
    if (typeof v === 'number' && v > 0) {
        values[m.key] = v;
    } else if (m.key in prevValues) {
        values[m.key] = prevValues[m.key]; // keep last good value on transient failure
        console.warn(`kept previous ${m.key} = ${prevValues[m.key]}`);
    }
    console.log(`${m.key} = ${values[m.key] ?? '(none)'}`);
}

// Only rewrite when a value actually changed, so the `generated` timestamp alone
// never produces a daily no-op commit. (Order-independent compare.)
const canon = o => JSON.stringify(Object.keys(o).sort().reduce((a, k) => (a[k] = o[k], a), {}));
if (hadFile && canon(values) === canon(prevValues)) {
    console.log('No value changes — snapshot left untouched.');
} else {
    writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), values }, null, 2) + '\n');
    console.log(`wrote ${OUT} with ${Object.keys(values).length} metric(s)`);
}
