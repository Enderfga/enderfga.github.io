'use strict';

// Honor the OS "reduce motion" setting for JS-driven scrolling. The CSS
// `scroll-behavior: smooth` is already neutralised by the reduced-motion media
// query, but programmatic scrollIntoView/scrollTo with an explicit behavior
// bypass CSS, so they need this guard too.
const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Website functionality module
const Website = {
    // Navigation functionality
    navigation: {
        init() {
            const nav = document.querySelector('nav');
            const navLinks = document.querySelectorAll('.nav-list a[href^="#"]');

            navLinks.forEach(link => {
                link.addEventListener('click', this.handleNavClick.bind(this));
            });

            // Only touch the DOM when the scrolled state actually flips, not on
            // every scroll frame.
            let scrolled = false;
            window.addEventListener('scroll', () => {
                const next = window.scrollY > 50;
                if (next !== scrolled) {
                    scrolled = next;
                    nav.classList.toggle('scrolled', next);
                }
            }, { passive: true });
        },

        handleNavClick(event) {
            const navLinks = document.querySelectorAll('.nav-list a');
            navLinks.forEach(nav => nav.classList.remove('active'));
            event.currentTarget.classList.add('active');

            const targetId = event.currentTarget.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
            }
        }
    },

    // Back to top functionality
    backToTop: {
        init() {
            this.button = document.querySelector('.to-top');
            this.visible = false;
            if (this.button) {
                this.button.addEventListener('click', this.scrollToTop);
                window.addEventListener('scroll', this.toggleVisibility.bind(this), { passive: true });
            }
        },

        toggleVisibility() {
            const scrollTop = document.body.scrollTop || document.documentElement.scrollTop;
            const show = scrollTop > 100;
            if (show !== this.visible) {
                this.visible = show;
                this.button.classList.toggle('is-visible', show);
            }
        },

        scrollToTop(event) {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        }
    },

    // Intersection Observer for scroll animations
    scrollAnimations: {
        init() {
            const observerOptions = {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            };

            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry, index) => {
                    if (entry.isIntersecting) {
                        setTimeout(() => {
                            entry.target.style.opacity = '1';
                            entry.target.style.transform = 'translateY(0)';
                        }, index * 100);
                        observer.unobserve(entry.target);
                    }
                });
            }, observerOptions);

            document.querySelectorAll('.research-paper').forEach(paper => {
                observer.observe(paper);
            });
            // Acknowledgement cards live in a carousel (one shown at a time), so we
            // don't fade them on scroll — off-screen slides would never intersect
            // and would stay invisible. The carousel manages their reveal instead.
        }
    },

    // News "Show more" — reveal the folded older items inline (no inner scroll box)
    news: {
        init() {
            const btn = document.querySelector('.news-toggle');
            if (!btn) return;
            const extra = document.querySelectorAll('.news-list .news-extra');
            if (!extra.length) { btn.hidden = true; return; }
            const label = btn.querySelector('.news-toggle-label');
            btn.addEventListener('click', () => {
                const open = btn.getAttribute('aria-expanded') === 'true';
                extra.forEach(li => { li.hidden = open; });
                btn.setAttribute('aria-expanded', String(!open));
                if (label) label.textContent = open ? 'Show more' : 'Show less';
            });
        }
    },

    // Acknowledgements carousel — centred card at full strength, dimmed neighbours
    // peeking on both sides, infinite loop (arrows / dots / swipe / ← →). Degrades
    // to a plain stack without JS (arrows/dots are CSS-hidden).
    acknowledgements: {
        init() {
            const carousel = document.querySelector('.ack-carousel');
            if (!carousel) return;
            const track = carousel.querySelector('.ack-track');
            const win = carousel.querySelector('.ack-window');
            const prev = carousel.querySelector('.ack-prev');
            const next = carousel.querySelector('.ack-next');
            const dotsWrap = carousel.querySelector('.ack-dots');
            const real = track ? Array.from(track.children) : [];
            if (real.length <= 1) {
                if (prev) prev.hidden = true;
                if (next) next.hidden = true;
                return;
            }

            // Infinite loop. At the wrap boundary a CLONE briefly sits in the centre
            // before we snap to its real twin, so that clone needs a neighbour on each
            // side too. Cloning the last PAD reals before the first and the first PAD
            // reals after the last (PAD = 2) keeps BOTH peeks filled through the wrap,
            // so the snap is visually identical — no flicker.
            const N = real.length;
            const PAD = 2;
            const clone = (node) => {
                const c = node.cloneNode(true);
                c.setAttribute('aria-hidden', 'true');
                return c;
            };
            real.slice(N - PAD).forEach((node) => track.insertBefore(clone(node), real[0]));
            real.slice(0, PAD).forEach((node) => track.appendChild(clone(node)));
            const children = Array.from(track.children);

            let pos = PAD;          // track-child index at centre (first real card)
            let animating = false;

            const dots = real.map((_, i) => {
                const d = document.createElement('button');
                d.type = 'button';
                d.className = 'ack-dot';
                d.setAttribute('aria-label', `Go to acknowledgement ${i + 1}`);
                d.addEventListener('click', () => goLogical(i));
                dotsWrap.appendChild(d);
                return d;
            });

            const render = (animate) => {
                if (!animate) track.classList.add('ack-snap'); // freeze track + card transitions
                track.style.transition = animate ? '' : 'none';
                const child = children[pos];
                const x = win.clientWidth / 2 - (child.offsetLeft + child.offsetWidth / 2);
                track.style.transform = `translateX(${x}px)`;
                children.forEach((c, ci) => c.classList.toggle('is-active', ci === pos));
                const logical = (pos - PAD + N) % N;
                dots.forEach((d, di) => d.setAttribute('aria-current', String(di === logical)));
                if (!animate) {
                    void track.offsetWidth; // flush the instant jump, then re-enable transitions
                    track.classList.remove('ack-snap');
                    track.style.transition = '';
                }
            };

            const step = (dir) => {
                if (animating) return;
                animating = true;
                pos += dir;
                render(true);
            };

            const goLogical = (i) => {
                const target = i + PAD;
                if (animating || target === pos) return;
                animating = true;
                pos = target;
                render(true);
            };

            track.addEventListener('transitionend', (e) => {
                if (e.propertyName !== 'transform') return;
                if (pos >= PAD + N) { pos -= N; render(false); }   // into trailing clones → snap back
                else if (pos < PAD) { pos += N; render(false); }   // into leading clones → snap forward
                animating = false;
            });

            prev.addEventListener('click', () => step(-1));
            next.addEventListener('click', () => step(1));

            carousel.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') step(-1);
                else if (e.key === 'ArrowRight') step(1);
            });

            // Click a peeking neighbour to advance toward it (ignore link clicks)
            children.forEach((c, ci) => {
                c.addEventListener('click', (e) => {
                    if (ci !== pos && !e.target.closest('a')) step(ci < pos ? -1 : 1);
                });
            });

            // Touch swipe
            let startX = null;
            win.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
            win.addEventListener('touchend', (e) => {
                if (startX == null) return;
                const dx = e.changedTouches[0].clientX - startX;
                if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
                startX = null;
            }, { passive: true });

            // Slide widths are %-based, so re-centre (without animating) on resize.
            let raf = null;
            window.addEventListener('resize', () => {
                if (raf) cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => render(false));
            }, { passive: true });

            render(false);
        }
    },

    // Theme switcher functionality
    theme: {
        init() {
            this.body = document.body;
            this.radios = document.querySelectorAll('.three-way-radio input');
            this.themeIcons = document.querySelectorAll('.theme-icon');

            this.bindEvents();
            this.initializeTheme();
        },

        bindEvents() {
            this.radios.forEach(radio => {
                radio.addEventListener('change', this.handleThemeChange.bind(this));
            });

            this.themeIcons.forEach((icon, index) => {
                icon.addEventListener('click', () => {
                    if (index === 0) {
                        this.setTheme('light');
                    } else {
                        this.setTheme('dark');
                    }
                });
            });

            // While in "system" mode, follow live OS day/night changes.
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                let saved = 'system';
                try {
                    saved = localStorage.getItem('preferred-theme') || 'system';
                } catch (e) { /* ignore */ }
                if (saved === 'system') this.applyTheme('system');
            });
        },

        handleThemeChange(event) {
            const theme = event.target.value;
            this.applyTheme(theme);
            this.saveTheme(theme);
        },

        setTheme(theme) {
            const radioToCheck = document.querySelector(`input[value="${theme}"]`);
            if (radioToCheck) {
                radioToCheck.checked = true;
                this.applyTheme(theme);
                this.saveTheme(theme);
            }
        },

        applyTheme(theme) {
            // The class lives on <html> as well as <body>: the root scrollbar and
            // overscroll canvas belong to <html>, so its vars must flip too.
            const dark = theme === 'dark' ||
                (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.classList.toggle('dark-mode', dark);
            this.body.classList.toggle('dark-mode', dark);
        },

        saveTheme(theme) {
            try {
                localStorage.setItem('preferred-theme', theme);
            } catch (e) {
                console.warn('Unable to save theme preference');
            }
        },

        initializeTheme() {
            // Default to following the OS day/night setting on first visit; a saved
            // explicit choice (light/dark/system) still wins.
            let theme = 'system';
            try {
                theme = localStorage.getItem('preferred-theme') || 'system';
            } catch (e) {
                console.warn('Unable to load theme preference');
            }
            this.setTheme(theme);
        }
    },

    // Live repo/model metrics — we pull the same numbers the old shields badges
    // showed (GitHub stars, Hugging Face downloads, npm downloads, YouTube views)
    // straight from each source's public API and render them as our own quiet text
    // indicators. Every anchor and its parent row start [hidden]; we only reveal on
    // a successful, positive fetch, so a failure / zero / rate-limit shows nothing
    // rather than a broken badge.
    metrics: {
        CACHE_TTL: 6 * 60 * 60 * 1000, // 6h — fresh numbers, instant repeat visits, no rate-limit roulette

        // Numbers are snapshotted daily into data/metrics.json by a GitHub Action,
        // so most visitors read one static file and hit zero external APIs. The live
        // per-source fetch below stays as a fallback for anything the snapshot is
        // missing (e.g. a metric added since the last run, or the file 404ing).
        snapshot: {},

        async init() {
            await this.loadSnapshot();
            document.querySelectorAll('[data-metric]').forEach(el => this.load(el));
        },

        async loadSnapshot() {
            try {
                const r = await fetch('data/metrics.json', { cache: 'no-cache' });
                if (r.ok) this.snapshot = (await r.json()).values || {};
            } catch (e) {
                /* no snapshot — every metric falls back to a live fetch */
            }
        },

        async load(el) {
            try {
                let value = this.snapshotGet(el);
                if (value == null) {
                    const key = this.cacheKey(el);
                    value = this.cacheGet(key);
                    if (value == null) {
                        value = await this.fetchValue(el);
                        if (value == null || value <= 0) return;
                        this.cacheSet(key, value);
                    }
                }
                const valEl = el.querySelector('.metric-val');
                if (valEl) valEl.textContent = this.humanize(value);
                el.hidden = false;
            } catch (e) {
                /* leave hidden on failure */
            }
        },

        metricId(el) {
            return el.getAttribute('data-repo') || el.getAttribute('data-id') ||
                el.getAttribute('data-slug') || el.getAttribute('data-pkg') ||
                el.getAttribute('data-video') || '';
        },

        snapshotGet(el) {
            const v = this.snapshot[`${el.getAttribute('data-metric')}:${this.metricId(el)}`];
            return typeof v === 'number' && v > 0 ? v : null;
        },

        cacheKey(el) {
            // v2: bumped to invalidate entries cached before the all-or-nothing
            // collection fix (a partial undercount could be pinned for the TTL)
            return `metric-v2:${el.getAttribute('data-metric')}:${this.metricId(el)}`;
        },

        cacheGet(key) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                const { v, t } = JSON.parse(raw);
                if (typeof v !== 'number' || Date.now() - t > this.CACHE_TTL) return null;
                return v;
            } catch (e) {
                return null;
            }
        },

        cacheSet(key, v) {
            try {
                localStorage.setItem(key, JSON.stringify({ v, t: Date.now() }));
            } catch (e) {
                /* private mode / quota — fine, just no cache */
            }
        },

        fetchValue(el) {
            switch (el.getAttribute('data-metric')) {
                case 'github-stars': return this.githubStars(el.getAttribute('data-repo'));
                case 'hf-dataset':   return this.hfDownloads('datasets', el.getAttribute('data-id'));
                case 'hf-model':     return this.hfDownloads('models', el.getAttribute('data-id'));
                case 'hf-collection':return this.hfCollection(el.getAttribute('data-slug'));
                case 'npm':          return this.npmDownloads(el.getAttribute('data-pkg'));
                // PyPI all-time needs an API key that can't ship in client JS — this
                // metric is snapshot-only (filled by CI). No live fallback on purpose.
                case 'pypi-downloads':return Promise.resolve(null);
                case 'youtube-views':return this.youtubeViews(el.getAttribute('data-video'));
                default:             return Promise.resolve(null);
            }
        },

        async githubStars(repo) {
            if (!repo) return null;
            // One repo, or a comma-separated list summed into a single count (e.g.
            // two co-developed repos shown as one number). All-or-nothing: any failed
            // repo aborts the sum, so a partial undercount is never shown or cached.
            let total = 0;
            for (const name of repo.split(',').map(s => s.trim()).filter(Boolean)) {
                const r = await fetch(`https://api.github.com/repos/${name}`);
                if (!r.ok) return null;
                const d = await r.json();
                if (typeof d.stargazers_count !== 'number') return null;
                total += d.stargazers_count;
            }
            return total || null;
        },

        async hfDownloads(kind, id) {
            if (!id) return null;
            const r = await fetch(`https://huggingface.co/api/${kind}/${id}?expand=downloadsAllTime`);
            if (!r.ok) return null;
            const d = await r.json();
            // All-time only — never fall back to `downloads` (a 30-day rolling
            // window), or the metric would silently shrink week to week.
            return d.downloadsAllTime || null;
        },

        async hfCollection(slug) {
            if (!slug) return null;
            const res = await fetch(`https://huggingface.co/api/collections/${slug}`);
            if (!res.ok) return null;
            const items = ((await res.json()).items || [])
                .filter(i => i.type === 'model' || i.type === 'dataset');
            if (!items.length) return null;
            // All-or-nothing: all-time downloads only ever grow, so a partial sum
            // (one item's fetch failing → counted as 0) would read as a drop —
            // and the cache would pin that undercount for the whole TTL. Any
            // failed item aborts instead: nothing shown, nothing cached, retried
            // on the next visit.
            const counts = await Promise.all(items.map(async item => {
                const kind = item.type === 'dataset' ? 'datasets' : 'models';
                const r = await fetch(`https://huggingface.co/api/${kind}/${item.id}?expand=downloadsAllTime`);
                if (!r.ok) throw new Error(`metric fetch failed for ${item.id}`);
                const d = await r.json();
                return d.downloadsAllTime || 0;  // all-time only, no 30-day fallback
            }));
            return counts.reduce((a, b) => a + b, 0);
        },

        async npmDownloads(pkg) {
            if (!pkg) return null;
            // npm's point API only exposes fixed recent windows (last-week/month/year),
            // so for an all-time total we walk 18-month range segments and sum the
            // daily counts. Segments start at the package's publish date (falling
            // back to npm's stats epoch, 2015-01-10) to avoid empty-range requests.
            let start = '2015-01-10';
            try {
                const meta = await fetch(`https://registry.npmjs.org/${pkg}`);
                if (meta.ok) {
                    const created = ((await meta.json()).time || {}).created;
                    if (created) start = created.slice(0, 10);
                }
            } catch (e) { /* fall back to the stats epoch */ }
            const today = new Date();
            const segments = [];
            for (let cursor = new Date(start); cursor < today;) {
                const segStart = new Date(cursor);
                const segEnd = new Date(cursor);
                segEnd.setMonth(segEnd.getMonth() + 18);
                const end = segEnd > today ? today : segEnd;
                segments.push([segStart.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]);
                cursor = new Date(end);
                cursor.setDate(cursor.getDate() + 1);
            }
            const counts = await Promise.all(segments.map(async ([s, e]) => {
                try {
                    const r = await fetch(`https://api.npmjs.org/downloads/range/${s}:${e}/${pkg}`);
                    if (!r.ok) return 0;
                    const d = await r.json();
                    return Array.isArray(d.downloads)
                        ? d.downloads.reduce((a, b) => a + (b.downloads || 0), 0)
                        : 0;
                } catch (e) {
                    return 0;
                }
            }));
            const total = counts.reduce((a, b) => a + b, 0);
            return total > 0 ? total : null;
        },

        async youtubeViews(id) {
            if (!id) return null;
            const r = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${id}`);
            if (!r.ok) return null;
            const d = await r.json();
            return typeof d.viewCount === 'number' ? d.viewCount : null;
        },

        humanize(n) {
            if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
            if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
            return String(n);
        }
    },

    // One-click BibTeX copy — each publication carries its entry in an inert
    // <script type="text/plain" data-bibtex> block; the button copies it and
    // confirms inline, no popover or extra UI.
    bibtex: {
        init() {
            document.querySelectorAll('.bib-copy').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const content = btn.closest('.paper-content');
                    const src = content && content.querySelector('script[data-bibtex]');
                    if (!src || !navigator.clipboard) return;
                    try {
                        await navigator.clipboard.writeText(src.textContent.trim() + '\n');
                    } catch (e) {
                        return;
                    }
                    const label = btn.querySelector('.bib-label');
                    if (label && !btn.classList.contains('copied')) {
                        btn.classList.add('copied');
                        label.textContent = 'Copied!';
                        setTimeout(() => {
                            label.textContent = 'BibTeX';
                            btn.classList.remove('copied');
                        }, 1600);
                    }
                });
            });
        }
    },

    // Profile image hover effect
    profileImage: {
        init() {
            this.container = document.querySelector('.profile-image');
            this.hoverImage = document.getElementById('guian_image');

            if (this.container && this.hoverImage) {
                this.container.addEventListener('mouseenter', this.show.bind(this));
                this.container.addEventListener('mouseleave', this.hide.bind(this));
                if (!document.body.classList.contains('pokopia-mode')) {
                    this.hide();
                }
            }
        },

        show() {
            if (this.hoverImage) {
                this.hoverImage.style.opacity = '1';
            }
        },

        hide() {
            if (document.body.classList.contains('pokopia-mode')) return;
            if (this.hoverImage) {
                this.hoverImage.style.opacity = '0';
            }
        }
    },

    // In-view video playback — play demo videos only when scrolled into view, pause
    // when out of view, and never auto-play under prefers-reduced-motion. Replaces the
    // old `autoplay` attributes so the external mp4s aren't fetched + played on load.
    lazyVideos: {
        init() {
            const videos = document.querySelectorAll('video.paper-video');
            if (!videos.length || !('IntersectionObserver' in window)) return;
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const video = entry.target;
                    if (entry.isIntersecting) {
                        if (!reduceMotion) video.play().catch(() => {});
                    } else if (!video.paused) {
                        video.pause();
                    }
                });
            }, { threshold: 0.25 });
            videos.forEach(video => observer.observe(video));
        }
    },

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.navigation.init();
            this.backToTop.init();
            this.news.init();
            this.acknowledgements.init();
            this.theme.init();
            this.profileImage.init();
            this.scrollAnimations.init();
            this.lazyVideos.init();
            this.metrics.init();
            this.bibtex.init();

            document.body.classList.add('loaded');
        });
    }
};

Website.init();

let pokopiaStylesPromise = null;

function loadPokopiaStyles() {
    if (pokopiaStylesPromise) return pokopiaStylesPromise;

    const existing = document.querySelector('link[data-pokopia-styles]');
    if (existing) {
        pokopiaStylesPromise = Promise.resolve();
        return pokopiaStylesPromise;
    }

    pokopiaStylesPromise = new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'pokopia.css';
        link.dataset.pokopiaStyles = 'true';
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
    });

    return pokopiaStylesPromise;
}

window.guian_start = function() {
    const hoverImage = document.getElementById('guian_image');
    if (hoverImage) {
        hoverImage.style.opacity = '1';
    }
};

window.guian_stop = function() {
    if (document.body.classList.contains('pokopia-mode')) return;
    const hoverImage = document.getElementById('guian_image');
    if (hoverImage) {
        hoverImage.style.opacity = '0';
    }
};

window.togglePokopia = async function() {
    const body = document.body;
    const enablePokopia = !body.classList.contains('pokopia-mode');

    if (enablePokopia) {
        try {
            await loadPokopiaStyles();
        } catch (e) {
            console.warn('Unable to load Pokopia styles');
        }
    }

    const isPokopia = body.classList.toggle('pokopia-mode', enablePokopia);

    const hoverImage = document.getElementById('guian_image');
    if (hoverImage) {
        hoverImage.style.opacity = isPokopia ? '1' : '0';
    }

    const overlay = document.createElement('div');
    overlay.className = 'pokopia-transition-overlay';
    body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add('active');
        setTimeout(() => {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 600);
        }, 400);
    });

    if (isPokopia) {
        spawnPokopiaDecorations();
    } else {
        clearPokopiaDecorations();
    }
    // Session-only easter egg: intentionally NOT persisted. Every fresh visit lands
    // in the sober academic view; the playful mode is always an explicit opt-in.
};

function spawnPokopiaDecorations() {
    clearPokopiaDecorations();
    const container = document.createElement('div');
    container.id = 'pokopia-decorations';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);

    const emojis = ['🌿', '⭐', '🌸', '☁️', '🍃', '🌻', '✨', '🦋', '🐝', '🍄', '🌈'];
    for (let i = 0; i < 20; i++) {
        const el = document.createElement('span');
        el.className = 'pokopia-float';
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animationDuration = (8 + Math.random() * 12) + 's';
        el.style.animationDelay = (Math.random() * 10) + 's';
        el.style.fontSize = (14 + Math.random() * 20) + 'px';
        el.style.opacity = 0.4 + Math.random() * 0.4;
        container.appendChild(el);
    }
}

function clearPokopiaDecorations() {
    const existing = document.getElementById('pokopia-decorations');
    if (existing) existing.remove();
}
