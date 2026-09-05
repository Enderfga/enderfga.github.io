import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHubUrl, hubLinks, uniqueRepositories, downloadCount, discoverRepositories,
    aggregateDownloads, hfCollectionDownloads, ownerRepositories } from './project-downloads.mjs';

const hf = 'https://huggingface.co';
const repo = parseHubUrl(`${hf}/owner/SolarWM-5B`);
const json = data => ({ ok: true, json: async () => data });
const countResponse = downloadsAllTime => json({ id: repo.id, downloadsAllTime });

test('normalize datasets, weights, subdirectories and repeated links', () => {
    const links = hubLinks(`${hf}/datasets/owner/SolarWM-Data/tree/main/annotations ${hf}/datasets/owner/SolarWM-Data?x=1 ${hf}/owner/SolarWM-5B`);
    assert.equal(uniqueRepositories(links).length, 2);
    assert.equal(links[0].url, `${hf}/datasets/owner/SolarWM-Data`);
    assert.equal(parseHubUrl(`${hf}/papers/2609.02886`), null);
    assert.equal(parseHubUrl('https://modelscope.cn.evil.test/datasets/a/b'), null);
    assert.equal(parseHubUrl('http://modelscope.cn/datasets/a/b'), null);
});

test('keep regional ModelScope repositories separate but normalize www aliases', () => {
    const links = ['https://modelscope.cn/datasets/a/SolarWM', 'https://www.modelscope.cn/datasets/a/SolarWM',
        'https://modelscope.ai/datasets/a/SolarWM'].map(parseHubUrl);
    assert.equal(uniqueRepositories(links).length, 2);
});

test('explicit zero is valid; missing, negative, strings and nonfinite are not', () => {
    assert.equal(downloadCount(0), 0);
    for (const value of [undefined, null, -1, NaN, Infinity, '123', 0.5]) assert.throws(() => downloadCount(value));
});

test('aggregate deduplicates and counts a real zero', async () => {
    const result = await aggregateDownloads([repo, repo], 'hf', async () => countResponse(0));
    assert.equal(result.total, 0);
    assert.equal(result.repositories.length, 1);
});

test('a missing all-time counter never falls back to monthly downloads', async () => {
    await assert.rejects(aggregateDownloads([repo], 'hf', async () => json({ id: repo.id, downloads: 123 })));
});

test('any failed repository aborts rather than returning a partial sum', async () => {
    const second = parseHubUrl(`${hf}/owner/SolarWM-14B`);
    await assert.rejects(aggregateDownloads([repo, second], 'hf', async url =>
        url.includes('14B') ? { ok: false, status: 503 } : countResponse(123)));
});

test('reject HTTP-200 ModelScope errors and wrong repository identities', async () => {
    const ms = parseHubUrl('https://modelscope.cn/datasets/owner/SolarWM-Data');
    for (const data of [{ Code: 500 }, { Code: 200, Data: { Namespace: 'other', Name: 'SolarWM-Data', Downloads: 999 } },
        { Code: 200, Data: { Namespace: 'owner', Name: 'SolarWM-Data' } }]) {
        await assert.rejects(aggregateDownloads([ms], 'modelscope', async () => json(data)));
    }
});

test('sum China and international counters, not likes or views', async () => {
    const repos = ['cn', 'ai'].map(region => parseHubUrl(`https://modelscope.${region}/datasets/owner/SolarWM-Data`));
    const result = await aggregateDownloads(repos, 'modelscope', async url => json({ Code: 200,
        Data: { Namespace: 'owner', Name: 'SolarWM-Data', Downloads: url.includes('.cn/') ? 3 : 7, Likes: 500 } }));
    assert.equal(result.total, 10);
});

test('discover official collections, new latent links, and retain the known release floor', async () => {
    const config = { namePrefix: 'SolarWM', sources: ['https://example.test/release'],
        repositories: [repo.url], collections: [`${hf}/collections/owner/solarwm`] };
    const catalog = await discoverRepositories(config, async url => url.includes('/collections/')
        ? json({ items: [{ id: repo.id, type: 'model' }, { id: 'owner/SolarWM-Data', type: 'dataset' },
            { id: '2609.02886', type: 'paper' }] })
        : { ok: true, text: async () => 'Coming soon\nhttps://modelscope.ai/datasets/owner/SolarWM-New-Latent\nhttps://huggingface.co/other/Unrelated-Backbone' });
    assert.equal(catalog.length, 3);
    assert(catalog.some(r => r.id === 'owner/SolarWM-New-Latent'));
    await assert.rejects(discoverRepositories(config, async () => ({ ok: false, status: 503 })));
});

test('one renamed source doc degrades to the floor; all of them failing does not', async () => {
    const config = { namePrefix: 'SolarWM', repositories: [repo.url],
        sources: ['https://example.test/gone', 'https://example.test/live'] };
    // A doc renamed upstream must not silently freeze the metric forever: the
    // configured floor still counts, and a link only found in the live doc is kept.
    const catalog = await discoverRepositories(config, async url => url.endsWith('/live')
        ? { ok: true, text: async () => `https://modelscope.ai/datasets/owner/SolarWM-New-Latent` }
        : { ok: false, status: 404 });
    assert.deepEqual(catalog.map(r => r.id).sort(), [repo.id, 'owner/SolarWM-New-Latent'].sort());
    // Every source failing is systemic, not a rename — do not publish a fresh number.
    await assert.rejects(discoverRepositories(config, async () => ({ ok: false, status: 404 })),
        /No project source was readable/);
});

const msPage = (datasets, total, page = 1) => json({ success: true,
    data: { datasets, total_count: total, page_number: page, page_size: 50 } });

test('publisher enumeration discovers an unlinked raw dataset beyond the first page', async () => {
    const first = Array.from({ length: 50 }, (_, n) => ({ id: `owner/Unrelated-${n}` }));
    const raw = { id: 'owner/SolarWM-Data_Raw-WDS' };
    const catalog = await discoverRepositories({ namePrefix: 'SolarWM', sources: [],
        publishers: [{ host: 'modelscope.cn', owner: 'owner' }] }, async url => {
        if (url.includes('/models?')) return json({ success: true,
            data: { models: [], total_count: 0, page_number: 1, page_size: 50 } });
        return url.includes('page_number=2') ? msPage([raw], 51, 2) : msPage(first, 51);
    });
    assert.deepEqual(catalog.map(r => r.id), [raw.id]);
});

test('ModelScope rejects empty, duplicate, changing, or malformed pagination', async () => {
    const owner = { host: 'modelscope.cn', owner: 'owner' };
    const item = { id: 'owner/SolarWM-Data' };
    for (const next of [msPage([], 2, 2), msPage([item], 2, 2),
        msPage([{ id: 'owner/SolarWM-New' }], 3, 2), json({ success: true, data: {} }),
        msPage([{ id: 'other/SolarWM-Data' }], 2, 2)]) {
        await assert.rejects(ownerRepositories(owner, 'dataset', async url =>
            url.includes('page_number=1') ? msPage([item], 2) : next));
    }
    await assert.rejects(ownerRepositories(owner, 'dataset', async () => ({ ok: false, status: 503 })));
});

test('HF follows publisher Link pagination and rejects loops or offsite links', async () => {
    const owner = { host: 'huggingface.co', owner: 'owner' };
    const next = `${hf}/api/models?author=owner&limit=100&cursor=next`;
    const result = await ownerRepositories(owner, 'model', async url => url === next
        ? json([{ id: 'owner/SolarWM-H3' }]) : { ...json([{ id: repo.id }]), headers: new Headers({ link: `<${next}>; rel="next"` }) });
    assert.equal(result.length, 2);
    for (const invalid of ['https://evil.test/api/models?author=owner',
        `${hf}/api/models?author=other`, `${hf}/api/models?author=owner&limit=100`]) {
        await assert.rejects(ownerRepositories(owner, 'model', async () =>
            ({ ...json([{ id: repo.id }]), headers: new Headers({ link: `<${invalid}>; rel="next"` }) })));
    }
});

test('AnyFlow-style collections deduplicate entries and reject missing counts', async () => {
    const fetcher = async url => url.includes('/collections/') ? json({ items: [
        { id: repo.id, type: 'model' }, { id: repo.id, type: 'model' }] }) : countResponse(10);
    assert.equal(await hfCollectionDownloads('owner/anyflow', fetcher), 10);
    await assert.rejects(hfCollectionDownloads('owner/anyflow', async url => url.includes('/collections/')
        ? fetcher(url) : json({ id: repo.id, downloads: 10 })));
});

test('browser collection fallback is also all-or-nothing and deduplicated', async () => {
    const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    const block = source.slice(source.indexOf('    metrics: {') + '    metrics: '.length,
        source.indexOf('    // One-click BibTeX')).trim().replace(/,$/, '');
    let missing = false;
    const metrics = vm.runInNewContext(`(${block})`, { fetch: async url => url.includes('/collections/')
        ? json({ items: [{ id: repo.id, type: 'model' }, { id: repo.id, type: 'model' }] })
        : missing ? json({ downloads: 999 }) : countResponse(10) });
    assert.equal(await metrics.hfCollection('owner/anyflow'), 10);
    missing = true;
    await assert.rejects(metrics.hfCollection('owner/anyflow'));
    assert.equal(await metrics.fetchValue({ getAttribute: () => 'modelscope-project' }), null);
});
