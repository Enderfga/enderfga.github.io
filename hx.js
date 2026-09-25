// Two exposures of one frame. The Chinese film-still layer is masked by a ring
// whose edge dissolves pixel by pixel (fixed random thresholds under a smooth
// falloff), so developing it looks like an image resolving out of noise.
(function () {
    const hero = document.getElementById('hero');
    if (!hero) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const LENS = 400;                                   // lens diameter, CSS px

    // Build the dissolve ring once.
    (function ring() {
        const N = 640, c = document.createElement('canvas'); c.width = c.height = N;
        const x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data;
        const R = N / 2, r0 = R * 0.72;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const dist = Math.hypot(i - R + 0.5, j - R + 0.5);
            let t = Math.min(1, Math.max(0, (R - dist) / (R - r0)));
            t = t * t * (3 - 2 * t);
            const k = (j * N + i) * 4;
            d[k] = d[k + 1] = d[k + 2] = 0;
            d[k + 3] = Math.random() < t ? 255 : 0;
        }
        x.putImageData(img, 0, 0);
        hero.style.setProperty('--lens', `url(${c.toDataURL('image/png')})`);
    })();

    let tx = 0, ty = 0, x = 0, y = 0, size = 0, sizeTo = 0, inside = false, raf = 0, sweeping = false;
    const set = () => {
        hero.style.setProperty('--mx', `${x}px`);
        hero.style.setProperty('--my', `${y}px`);
        hero.style.setProperty('--ms', `${size}px`);
    };
    function tick() {
        raf = 0;
        const k = sweeping ? 0.08 : 0.2;
        x += (tx - x) * 0.22; y += (ty - y) * 0.22; size += (sizeTo - size) * k;
        set();
        const busy = Math.abs(tx - x) + Math.abs(ty - y) > 0.4 || Math.abs(sizeTo - size) > 1;
        if (busy) raf = requestAnimationFrame(tick);
        else if (sweeping) finishSweep();
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const local = e => { const r = hero.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    hero.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse' || sweeping || hero.classList.contains('is-zh')) return;
        [tx, ty] = local(e);
        if (!inside) { x = tx; y = ty; inside = true; }
        sizeTo = LENS; kick();
    });
    hero.addEventListener('pointerleave', () => { if (sweeping || hero.classList.contains('is-zh')) return; inside = false; sizeTo = 0; kick(); });

    // Stacked (portrait) layout: the frame sits under the text, so give both text
    // blocks the height of the taller one and the two frames stay registered.
    const stacked = matchMedia('(max-width: 820px)');
    const blocks = [...hero.querySelectorAll('.hx-content')];
    function syncHeights() {
        blocks.forEach(b => { b.style.minHeight = ''; });
        if (!stacked.matches) return;
        const h = Math.max(...blocks.map(b => b.offsetHeight));
        blocks.forEach(b => { b.style.minHeight = `${h}px`; });
    }
    syncHeights();
    addEventListener('resize', () => { clearTimeout(syncHeights.t); syncHeights.t = setTimeout(syncHeights, 120); });
    document.fonts?.ready.then(syncHeights);

    // Develop (or re-ink) the whole frame, radiating from (px, py) in hero pixels.
    const button = hero.querySelector('.hx-toggle');
    const zhLayer = hero.querySelector('.hx-zh'), enText = hero.querySelector('.hx-en .hx-content');
    function own(zh) {
        zhLayer.inert = !zh; enText.inert = zh;
        zh ? zhLayer.removeAttribute('aria-hidden') : zhLayer.setAttribute('aria-hidden', 'true');
    }
    own(false);
    let developing = false;
    function finishSweep() {
        sweeping = false;
        if (developing) { hero.classList.add('is-zh'); own(true); }
        else { sizeTo = inside ? LENS : 0; kick(); }
    }
    function toggle(px, py) {
        const toZh = !(hero.classList.contains('is-zh') || developing);
        button.setAttribute('aria-pressed', String(toZh));
        button.textContent = toZh ? 'EN' : '中文';
        button.setAttribute('aria-label', toZh ? 'Show the English ink version' : 'Show the Chinese film-still version');
        window.getSelection()?.removeAllRanges();
        const r = hero.getBoundingClientRect(), full = 2.3 * Math.hypot(r.width, r.height);
        tx = x = px; ty = y = py;
        if (!toZh) own(false);
        if (reduce) { developing = toZh; hero.classList.toggle('is-zh', toZh); own(toZh); return; }
        developing = toZh; sweeping = true;
        if (toZh) { if (!inside) size = 0; sizeTo = full; }
        else { if (hero.classList.contains('is-zh')) size = full; hero.classList.remove('is-zh'); sizeTo = 0; }  // mid-sweep: reverse from where it is
        set(); kick();
    }
    const fromEvent = e => { const [px, py] = local(e); return [px, py]; };
    hero.addEventListener('dblclick', e => {
        if (e.target.closest('a, button')) return;
        toggle(...fromEvent(e));
    });
    // Touch has no hover and no comfortable double-tap: a tap on the frame develops it.
    hero.addEventListener('pointerup', e => {
        if (e.pointerType === 'mouse' || e.target.closest('a, button, .hx-content')) return;
        toggle(...fromEvent(e));
    });
    button.addEventListener('click', () => {
        const hr = hero.getBoundingClientRect(), br = button.getBoundingClientRect();
        toggle(br.left + br.width / 2 - hr.left, br.top + br.height / 2 - hr.top);
    });
})();
