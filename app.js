'use strict';

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

            window.addEventListener('scroll', () => {
                if (window.scrollY > 50) {
                    nav.classList.add('scrolled');
                } else {
                    nav.classList.remove('scrolled');
                }
            });
        },

        handleNavClick(event) {
            const navLinks = document.querySelectorAll('.nav-list a');
            navLinks.forEach(nav => nav.classList.remove('active'));
            event.currentTarget.classList.add('active');

            const targetId = event.currentTarget.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth' });
            }
        }
    },

    // Back to top functionality
    backToTop: {
        init() {
            this.button = document.querySelector('.to-top');
            if (this.button) {
                this.button.addEventListener('click', this.scrollToTop);
                window.addEventListener('scroll', this.toggleVisibility.bind(this));
            }
        },

        toggleVisibility() {
            const scrollTop = document.body.scrollTop || document.documentElement.scrollTop;
            if (this.button) {
                this.button.style.display = scrollTop > 100 ? 'flex' : 'none';
            }
        },

        scrollToTop(event) {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
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

            document.querySelectorAll('.collaboration-item').forEach(item => {
                item.style.opacity = '0';
                item.style.transform = 'translateY(30px)';
                item.style.transition = 'all 0.6s ease';
                observer.observe(item);
            });
        }
    },

    // News "Show more" — reveal the folded older items inline (no inner scroll box)
    news: {
        init() {
            const btn = document.querySelector('.news-toggle');
            if (!btn) return;
            const extra = document.querySelectorAll('.news-list .news-extra');
            if (!extra.length) { btn.hidden = true; return; }
            btn.addEventListener('click', () => {
                const open = btn.getAttribute('aria-expanded') === 'true';
                extra.forEach(li => { li.hidden = open; });
                btn.setAttribute('aria-expanded', String(!open));
                btn.innerHTML = open
                    ? 'Show more <i class="fas fa-chevron-down" aria-hidden="true"></i>'
                    : 'Show less <i class="fas fa-chevron-up" aria-hidden="true"></i>';
            });
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
            switch(theme) {
                case 'light':
                    this.body.classList.remove('dark-mode');
                    break;
                case 'dark':
                    this.body.classList.add('dark-mode');
                    break;
                case 'system':
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    this.body.classList.toggle('dark-mode', prefersDark);
                    break;
            }
        },

        saveTheme(theme) {
            try {
                localStorage.setItem('preferred-theme', theme);
            } catch (e) {
                console.warn('Unable to save theme preference');
            }
        },

        initializeTheme() {
            let theme = 'light';
            try {
                theme = localStorage.getItem('preferred-theme') || 'light';
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
        init() {
            document.querySelectorAll('[data-metric]').forEach(el => this.load(el));
        },

        async load(el) {
            try {
                const value = await this.fetchValue(el);
                if (value == null || value <= 0) return;
                const valEl = el.querySelector('.metric-val');
                if (valEl) valEl.textContent = this.humanize(value);
                el.hidden = false;
            } catch (e) {
                /* leave hidden on failure */
            }
        },

        fetchValue(el) {
            switch (el.getAttribute('data-metric')) {
                case 'github-stars': return this.githubStars(el.getAttribute('data-repo'));
                case 'hf-dataset':   return this.hfDownloads('datasets', el.getAttribute('data-id'));
                case 'hf-model':     return this.hfDownloads('models', el.getAttribute('data-id'));
                case 'hf-collection':return this.hfCollection(el.getAttribute('data-slug'));
                case 'npm':          return this.npmDownloads(el.getAttribute('data-pkg'));
                case 'youtube-views':return this.youtubeViews(el.getAttribute('data-video'));
                default:             return Promise.resolve(null);
            }
        },

        async githubStars(repo) {
            if (!repo) return null;
            const r = await fetch(`https://api.github.com/repos/${repo}`);
            if (!r.ok) return null;
            const d = await r.json();
            return typeof d.stargazers_count === 'number' ? d.stargazers_count : null;
        },

        async hfDownloads(kind, id) {
            if (!id) return null;
            const r = await fetch(`https://huggingface.co/api/${kind}/${id}?expand=downloadsAllTime`);
            if (!r.ok) return null;
            const d = await r.json();
            return d.downloadsAllTime || d.downloads || null;
        },

        async hfCollection(slug) {
            if (!slug) return null;
            const res = await fetch(`https://huggingface.co/api/collections/${slug}`);
            if (!res.ok) return null;
            const items = ((await res.json()).items || [])
                .filter(i => i.type === 'model' || i.type === 'dataset');
            if (!items.length) return null;
            const counts = await Promise.all(items.map(async item => {
                const kind = item.type === 'dataset' ? 'datasets' : 'models';
                try {
                    const r = await fetch(`https://huggingface.co/api/${kind}/${item.id}?expand=downloadsAllTime`);
                    if (!r.ok) return 0;
                    const d = await r.json();
                    return d.downloadsAllTime || d.downloads || 0;
                } catch (e) {
                    return 0;
                }
            }));
            return counts.reduce((a, b) => a + b, 0);
        },

        async npmDownloads(pkg) {
            if (!pkg) return null;
            // npm's point API only exposes fixed recent windows (last-week/month/year),
            // so for an all-time total we walk 18-month range segments from npm's
            // stats epoch (2015-01-10) to today and sum the daily counts.
            const today = new Date();
            const segments = [];
            for (let cursor = new Date('2015-01-10'); cursor < today;) {
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
            this.theme.init();
            this.profileImage.init();
            this.scrollAnimations.init();
            this.lazyVideos.init();
            this.metrics.init();

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
