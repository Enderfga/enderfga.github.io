// Repository-level public counters only. Never download payloads to measure use.
// CI enumerates public publisher repositories and release links; browsers read a snapshot.
export function downloadCount(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Missing or invalid download counter');
    return value; // An explicit zero is valid; a missing field is NOT zero.
}

export function parseHubUrl(value) {
    let url;
    try { url = new URL(value); } catch { return null; }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.protocol !== 'https:' || url.port || !['huggingface.co', 'modelscope.cn', 'modelscope.ai'].includes(host)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    let kind = 'model';
    if (host === 'huggingface.co') {
        if (parts[0] === 'collections') kind = 'collection';
        else if (parts[0] === 'datasets') kind = 'dataset';
        else if (['api', 'docs', 'spaces', 'papers'].includes(parts[0])) return null;
        if (kind !== 'model') parts.shift();
    } else {
        if (!['models', 'datasets'].includes(parts[0])) return null;
        kind = parts.shift() === 'datasets' ? 'dataset' : 'model';
    }
    if (parts.length < 2) return null;
    const id = parts.slice(0, 2).join('/');
    const prefix = kind === 'collection' ? 'collections/' : kind === 'dataset' ? 'datasets/' : host === 'huggingface.co' ? '' : 'models/';
    return { platform: host === 'huggingface.co' ? 'hf' : 'modelscope', host, kind, id,
        url: `https://${host}/${prefix}${id}` };
}

export function hubLinks(text) {
    return [...text.matchAll(/https:\/\/(?:www\.)?(?:huggingface\.co|modelscope\.(?:cn|ai))\/[^\s"'<>`)\]]+/g)]
        .map(m => parseHubUrl(m[0].replace(/&amp;/g, '&'))).filter(Boolean);
}

export function uniqueRepositories(repos) {
    const unique = new Map();
    for (const repo of repos) {
        // .cn and .ai have separate repository IDs/counters: do not merge regions.
        const key = `${repo.host}/${repo.kind}/${repo.id}`.toLowerCase();
        if (!unique.has(key)) unique.set(key, repo);
    }
    return [...unique.values()].sort((a, b) => a.url.localeCompare(b.url));
}

async function request(url, fetcher = fetch) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response;
}

async function collectionRepositories(slug, fetcher) {
    const data = await (await request(`https://huggingface.co/api/collections/${slug}`, fetcher)).json();
    if (!Array.isArray(data.items)) throw new Error(`Invalid collection: ${slug}`);
    const repos = data.items.filter(item => ['model', 'dataset'].includes(item.type)).map(item => {
        if (typeof item.id !== 'string') throw new Error(`Invalid collection item: ${slug}`);
        const repo = parseHubUrl(`https://huggingface.co/${item.type === 'dataset' ? 'datasets/' : ''}${item.id}`);
        if (!repo || repo.kind !== item.type || repo.id !== item.id) throw new Error(`Invalid repository: ${item.id}`);
        return repo;
    });
    if (!repos.length) throw new Error(`Empty collection: ${slug}`);
    return uniqueRepositories(repos);
}

export async function ownerRepositories({ host, owner }, kind, fetcher = fetch) {
    if (!['huggingface.co', 'modelscope.cn', 'modelscope.ai'].includes(host) ||
        !/^[a-z0-9][a-z0-9._-]*$/i.test(owner) || !['model', 'dataset'].includes(kind)) {
        throw new Error('Invalid publisher configuration');
    }
    const plural = `${kind}s`;
    const isHF = host === 'huggingface.co';
    const endpoint = `https://${host}/${isHF ? 'api' : 'openapi/v1'}/${plural}`;
    let url = isHF ? `${endpoint}?author=${encodeURIComponent(owner)}&limit=100`
        : `${endpoint}?owner=${encodeURIComponent(owner)}&page_number=1&page_size=50`;
    const visited = new Set(), identities = new Set(), repos = [];
    let expectedTotal;
    for (let page = 1; url; page++) {
        if (page > (isHF ? 100 : 60) || visited.has(url)) throw new Error('Incomplete or looping publisher pagination');
        visited.add(url);
        const response = await request(url, fetcher);
        const data = await response.json();
        const items = isHF ? data : data.data?.[plural];
        if (!Array.isArray(items)) throw new Error('Missing publisher repository list');
        if (!isHF) {
            if (data.success !== true || data.data.page_number !== page || data.data.page_size !== 50) {
                throw new Error('Invalid ModelScope publisher response');
            }
            const total = downloadCount(data.data.total_count);
            if (expectedTotal !== undefined && total !== expectedTotal) throw new Error('Publisher changed during pagination');
            expectedTotal = total;
        }
        for (const item of items) {
            const prefix = kind === 'dataset' ? 'datasets/' : isHF ? '' : 'models/';
            const repo = typeof item.id === 'string' && parseHubUrl(`https://${host}/${prefix}${item.id}`);
            if (!repo || repo.id !== item.id || repo.id.split('/')[0].toLowerCase() !== owner.toLowerCase()) {
                throw new Error('Publisher repository identity mismatch');
            }
            const identity = repo.id.toLowerCase();
            if (identities.has(identity)) throw new Error('Duplicate repository across publisher pages');
            identities.add(identity);
            repos.push(repo);
        }
        if (isHF) {
            const link = response.headers?.get('link') || '';
            const next = /<([^>]+)>\s*;\s*rel="next"/.exec(link)?.[1];
            if (next) {
                const parsed = new URL(next);
                if (!items.length || parsed.origin + parsed.pathname !== endpoint ||
                    parsed.searchParams.get('author') !== owner) throw new Error('Invalid HF pagination link');
            }
            url = next || null;
        } else {
            if (repos.length > expectedTotal || (!items.length && repos.length < expectedTotal)) {
                throw new Error('Incomplete ModelScope publisher list');
            }
            url = repos.length === expectedTotal ? null
                : `${endpoint}?owner=${encodeURIComponent(owner)}&page_number=${page + 1}&page_size=50`;
        }
    }
    return repos;
}

export async function discoverRepositories(config, fetcher = fetch) {
    // Keep the verified release floor even if a link moves/disappears from a doc.
    // Links are not exhaustive: enumerate each publisher's public models AND datasets.
    const links = [...(config.repositories || []), ...(config.collections || [])].map(parseHubUrl);
    if (links.some(link => !link)) throw new Error('Invalid configured repository URL');
    // A renamed or deleted doc must not freeze the metric forever: the configured
    // floor above and the publisher enumeration below already cover every known
    // repository, so only a total source outage counts as a failure.
    const fetched = await Promise.allSettled(config.sources.map(async url => (await request(url, fetcher)).text()));
    const pages = fetched.filter(r => r.status === 'fulfilled').map(r => r.value);
    for (const failed of fetched.filter(r => r.status === 'rejected')) {
        console.warn(`source unreadable, falling back to the configured floor: ${failed.reason.message}`);
    }
    if (config.sources.length && !pages.length) throw new Error('No project source was readable');
    for (const page of pages) links.push(...hubLinks(page));
    const collections = uniqueRepositories(links.filter(link => link.kind === 'collection'));
    const children = await Promise.all(collections.map(link => collectionRepositories(link.id, fetcher)));
    const publishers = await Promise.all((config.publishers || []).flatMap(publisher =>
        ['model', 'dataset'].map(kind => ownerRepositories(publisher, kind, fetcher))));
    const prefix = config.namePrefix.toLowerCase();
    const repos = uniqueRepositories([...links, ...children.flat(), ...publishers.flat()].filter(link =>
        link.kind !== 'collection' && link.id.split('/')[1].toLowerCase().startsWith(prefix)));
    if (!repos.length) throw new Error('No project repositories found');
    return repos;
}

export async function repositoryDownloads(repo, fetcher = fetch) {
    const kind = repo.kind === 'dataset' ? 'datasets' : 'models';
    const api = repo.platform === 'hf'
        ? `https://huggingface.co/api/${kind}/${repo.id}?expand=downloadsAllTime`
        : `https://${repo.host}/api/v1/${kind}/${repo.id}`;
    const data = await (await request(api, fetcher)).json();
    let count;
    if (repo.platform === 'hf') {
        if (data.id?.toLowerCase() !== repo.id.toLowerCase()) throw new Error(`Repository mismatch: ${repo.url}`);
        count = downloadCount(data.downloadsAllTime); // NEVER substitute 30-day `downloads`.
    } else {
        if (data.Code !== 200 || !data.Data) throw new Error(`ModelScope API error: ${repo.url}`);
        const name = `${data.Data.Namespace}/${data.Data.Name}`;
        if (name.toLowerCase() !== repo.id.toLowerCase()) throw new Error(`Repository mismatch: ${repo.url}`);
        count = downloadCount(data.Data.Downloads);
    }
    return { ...repo, downloads: count, api };
}

export async function aggregateDownloads(repos, platform, fetcher = fetch) {
    const selected = uniqueRepositories(repos.filter(repo => repo.platform === platform));
    if (!selected.length) throw new Error(`No repositories for ${platform}`);
    // All-or-nothing: HTTP errors, missing fields, and non-finite values abort.
    const repositories = await Promise.all(selected.map(repo => repositoryDownloads(repo, fetcher)));
    return { total: downloadCount(repositories.reduce((sum, repo) => sum + repo.downloads, 0)), repositories };
}

export async function hfCollectionDownloads(slug, fetcher = fetch) {
    return (await aggregateDownloads(await collectionRepositories(slug, fetcher), 'hf', fetcher)).total;
}
