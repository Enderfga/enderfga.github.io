// Render the Publications and Products cards in index.html from data/works.mjs.
//
//   node scripts/build-works.mjs          rewrite the generated blocks in index.html
//   node scripts/build-works.mjs --check  exit 1 if index.html is out of date (CI)
//
// Only the text between the `works:<section>` marker comments is touched; the
// rest of index.html stays hand-written.
import { readFileSync, writeFileSync } from 'node:fs';
import { publications, products } from '../data/works.mjs';

const HTML = 'index.html';
const SELF = 'Guian Fang';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icon = name => `<svg class="fa-svg" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
const link = (label, href) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;

// Each live-metric chip: the platform mark, and which data-* attribute app.js and
// scripts/snapshot-metrics.mjs read the identifier from.
const METRICS = {
    'github-stars':       { key: 'repo',  mark: icon('github'),     label: 'GitHub stars' },
    'hf-collection':      { key: 'slug',  mark: 'hf',               label: 'Hugging Face downloads' },
    'hf-project':         { key: 'id',    mark: 'hf',               label: 'Hugging Face downloads' },
    'hf-dataset':         { key: 'id',    mark: 'hf',               label: 'Hugging Face dataset downloads' },
    'hf-model':           { key: 'id',    mark: 'hf',               label: 'Hugging Face model downloads' },
    'modelscope-project': { key: 'id',    mark: icon('modelscope'), label: 'ModelScope downloads' },
    'npm':                { key: 'pkg',   mark: icon('npm'),        label: 'npm downloads (all-time)' },
    'youtube-views':      { key: 'video', mark: icon('youtube'),    label: 'YouTube views' },
};

function metric(m) {
    const spec = METRICS[m.type];
    if (!spec) throw new Error(`Unknown metric type: ${m.type}`);
    if (m[spec.key] == null) throw new Error(`Metric ${m.type} needs "${spec.key}"`);
    const mark = spec.mark === 'hf' ? '<span class="metric-logo" aria-hidden="true">🤗</span>' : spec.mark;
    return `<a class="metric" href="${esc(m.href)}" target="_blank" rel="noopener" data-metric="${m.type}" ` +
        `data-${spec.key}="${esc(m[spec.key])}" aria-label="${esc(m.label ?? spec.label)}" hidden>` +
        `${mark}<span class="metric-val"></span></a>`;
}

function media(m) {
    switch (m.type) {
        case 'img':
            return `<img src="${esc(m.src)}"${m.width ? ` width="${m.width}" height="${m.height}"` : ''}\n` +
                `     alt="${esc(m.alt)}"\n     loading="lazy">`;
        case 'video':
            return `<video class="paper-video"\n       src="${esc(m.src)}"\n       poster="${esc(m.poster)}"\n` +
                `       loop\n       muted\n       playsinline\n       controls\n       preload="none"\n       aria-label="${esc(m.label)}"></video>`;
        case 'youtube':
            return `<lite-youtube videoid="${esc(m.id)}" playlabel="${esc(m.label)}"></lite-youtube>`;
        default:
            throw new Error(`Unknown media type: ${m.type}`);
    }
}

function authors(list) {
    if (list.split(SELF).length !== 2) throw new Error(`Author list must name ${SELF} exactly once: ${list}`);
    return esc(list).replace(SELF, `<strong>${SELF}</strong>`);
}

function card(w) {
    for (const f of ['href', 'title', 'venue', 'year', 'media']) {
        if (w[f] == null) throw new Error(`"${w.title ?? '?'}" is missing ${f}`);
    }
    const out = [];
    const cls = w.highlight ? 'research-paper highlight' : 'research-paper';
    out.push(`<article class="${cls}"${w.id ? ` id="${esc(w.id)}" tabindex="-1"` : ''}>`);
    out.push('    <div class="paper-media">', ...indent(media(w.media), 8), '    </div>');
    out.push('    <div class="paper-content">');
    if (w.chip) out.push(`        <span class="cat-chip">${esc(w.chip)}</span>`);
    const title = w.subtitle ? `${esc(w.title)}:<br>${esc(w.subtitle)}` : esc(w.title);
    out.push('        <h3 class="paper-title">',
        `            <a href="${esc(w.href)}" target="_blank" rel="noopener">`,
        `                ${icon(w.icon ?? 'file-lines')} ${title}`,
        '            </a>',
        '        </h3>');
    if (w.authors) out.push('        <p class="paper-authors">', `            ${authors(w.authors)}`, '        </p>');
    out.push(`        <p class="paper-venue"><em>${esc(w.venue)}</em>, ${w.year}` +
        (w.award ? `<span class="paper-award">${esc(w.award)}</span>` : '') +
        (w.metrics ?? []).map(metric).join('') + '</p>');
    if (w.adoption) {
        out.push(`        <p class="paper-adoption">${esc(w.adoption.text)} ` +
            w.adoption.links.map(([l, h]) => link(l, h)).join(' · ') + '</p>');
    }
    if (w.links?.length || w.bibtex) {
        out.push('        <div class="paper-links">');
        for (const [l, h] of w.links ?? []) out.push(`            ${link(l, h)}`);
        if (w.bibtex) {
            out.push('            <button type="button" class="bib-copy" aria-label="Copy BibTeX to clipboard"><span class="bib-label">BibTeX</span></button>');
        }
        out.push('        </div>');
    }
    if (w.bibtex) {
        const bib = w.bibtex.replace(/^\n+|\s+$/g, '');
        if (/<\/script/i.test(bib)) throw new Error(`BibTeX of "${w.title}" cannot contain </script`);
        out.push('        <script type="text/plain" data-bibtex>', ...bib.split('\n').map(l => FLUSH + l), '        </script>');
    }
    out.push('    </div>', '</article>');
    return out;
}

function indent(text, n) {
    return text.split('\n').map(line => ' '.repeat(n) + line);
}

// Cards sit 16 spaces deep inside <div class="research-content">, taking their
// indent from the marker line. BibTeX lines are tagged FLUSH and stay flush-left,
// so the entry the BibTeX button copies carries no stray indentation.
const FLUSH = '\0';

function render(html, name, works) {
    const open = `<!-- works:${name} `, close = `<!-- /works:${name} -->`;
    const start = html.indexOf(open), end = html.indexOf(close);
    if (start < 0 || end < start) throw new Error(`Markers for works:${name} not found in ${HTML}`);
    const lineStart = html.lastIndexOf('\n', start) + 1;
    const pad = html.slice(lineStart, start);
    const lines = [`${open.trim()} — generated from data/works.mjs by scripts/build-works.mjs; edit the data, not this block -->`];
    works.forEach((w, i) => { if (i) lines.push(''); lines.push(...card(w)); });
    lines.push(close);
    const body = lines.map(l => l.startsWith(FLUSH) ? l.slice(1) : l ? pad + l : '').join('\n');
    return html.slice(0, lineStart) + body + html.slice(end + close.length);
}

const current = readFileSync(HTML, 'utf8');
const next = render(render(current, 'publications', publications), 'products', products);

if (process.argv.includes('--check')) {
    if (next !== current) {
        console.error(`${HTML} is out of date with data/works.mjs — run: node scripts/build-works.mjs`);
        process.exit(1);
    }
    console.log(`${HTML} matches data/works.mjs (${publications.length} publications, ${products.length} products).`);
} else if (next === current) {
    console.log('No changes.');
} else {
    writeFileSync(HTML, next);
    console.log(`Rebuilt ${publications.length} publications and ${products.length} products in ${HTML}.`);
}
