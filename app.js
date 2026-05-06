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

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof feather !== 'undefined') {
                feather.replace();
            }

            this.navigation.init();
            this.backToTop.init();
            this.theme.init();
            this.profileImage.init();
            this.scrollAnimations.init();

            document.body.classList.add('loaded');
        });

        if ('addEventListener' in window) {
            window.addEventListener('scroll', () => {}, { passive: true });
        }
    }
};

Website.init();

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

window.togglePokopia = function() {
    const body = document.body;
    const isPokopia = body.classList.toggle('pokopia-mode');

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

    try {
        localStorage.setItem('pokopia-mode', isPokopia ? 'on' : 'off');
    } catch(e) {}
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

try {
    if (localStorage.getItem('pokopia-mode') === 'on') {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.classList.add('pokopia-mode');
            spawnPokopiaDecorations();
            const hoverImage = document.getElementById('guian_image');
            if (hoverImage) hoverImage.style.opacity = '1';
        });
    }
} catch(e) {}

if ('PerformanceObserver' in window) {
    const perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') {
                console.log('LCP:', entry.renderTime || entry.loadTime);
            }
        }
    });
    perfObserver.observe({ entryTypes: ['largest-contentful-paint'] });
}
