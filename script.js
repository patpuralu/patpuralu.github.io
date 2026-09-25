/* PATPURALU // interaction layer
   Enhanced version: scroll depth, 3D tilt, ambient particles,
   page transitions, responsive navigation and reduced-motion support.
*/

(() => {
  'use strict';

  const MUSIC_KEY = 'patpur_music_v2';
  let musicStarted = false;
  let rafPending = false;
  let lastScrollY = window.scrollY || 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  /* -------------------- MUSIC -------------------- */
  function getAudio() { return $('#bgm'); }
  function getMusicBtn() { return $('#musicBtn'); }

  function updateMusicUI(playing) {
    const btn = getMusicBtn();
    if (!btn) return;
    const icon = $('.music-icon', btn);
    const label = $('.music-label', btn);
    if (icon) icon.textContent = playing ? '♫' : '♩';
    if (label) label.textContent = playing ? 'MUSIC ON' : 'MUSIC OFF';
    btn.classList.toggle('playing', playing);
  }

  function startMusic() {
    if (musicStarted) return;
    const audio = getAudio();
    if (!audio || sessionStorage.getItem(MUSIC_KEY) === 'off') return;
    audio.volume = 0;
    audio.play().then(() => {
      musicStarted = true;
      if (reducedMotion) {
        audio.volume = 0.28;
      } else {
        let v = 0;
        const fade = setInterval(() => {
          v = Math.min(v + 0.012, 0.28);
          audio.volume = v;
          if (v >= 0.28) clearInterval(fade);
        }, 80);
      }
      updateMusicUI(true);
    }).catch(() => {});
  }

  window.toggleMusic = function toggleMusic() {
    const audio = getAudio();
    if (!audio) return;
    if (!musicStarted) {
      sessionStorage.removeItem(MUSIC_KEY);
      audio.volume = 0.28;
      audio.play().then(() => {
        musicStarted = true;
        updateMusicUI(true);
      }).catch(() => {});
      return;
    }
    if (audio.paused) {
      audio.play().catch(() => {});
      sessionStorage.removeItem(MUSIC_KEY);
      updateMusicUI(true);
    } else {
      audio.pause();
      sessionStorage.setItem(MUSIC_KEY, 'off');
      updateMusicUI(false);
    }
  };

  function onInteraction() {
    startMusic();
    document.removeEventListener('click', onInteraction);
    document.removeEventListener('keydown', onInteraction);
    document.removeEventListener('touchstart', onInteraction);
  }

  /* -------------------- NAVIGATION -------------------- */
  function buildMobileNav() {
    $$('.navbar').forEach(nav => {
      if ($('.nav-toggle', nav)) return;
      const links = $('.nav-links', nav);
      if (!links) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-toggle';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open navigation');
      btn.innerHTML = '<span></span><span></span><span></span>';
      nav.appendChild(btn);

      const close = () => {
        nav.classList.remove('nav-open');
        btn.setAttribute('aria-expanded', 'false');
      };

      btn.addEventListener('click', () => {
        const open = !nav.classList.contains('nav-open');
        nav.classList.toggle('nav-open', open);
        btn.setAttribute('aria-expanded', String(open));
      });

      links.addEventListener('click', e => {
        if (e.target.closest('a')) close();
      });

      document.addEventListener('click', e => {
        if (!nav.contains(e.target)) close();
      });
    });
  }

  function setupPageTransitions() {
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;

      const raw = link.getAttribute('href');
      if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) return;
      if (/^https?:\/\//i.test(raw)) return;
      if (reducedMotion) return;

      e.preventDefault();
      document.body.classList.add('fade-out');
      window.setTimeout(() => { window.location.href = raw; }, 360);
    });
  }

  /* -------------------- AMBIENT SCENE -------------------- */
  function ensureScene() {
    if (!$('.scene-noise')) {
      const noise = document.createElement('div');
      noise.className = 'scene-noise';
      document.body.appendChild(noise);
    }
    if (!$('.scene-grid')) {
      const grid = document.createElement('div');
      grid.className = 'scene-grid';
      document.body.appendChild(grid);
    }
    if (!$('.scroll-progress')) {
      const progress = document.createElement('div');
      progress.className = 'scroll-progress';
      document.body.appendChild(progress);
    }
  }

  /* -------------------- PARTICLES -------------------- */
  function setupParticles() {
    let canvas = $('#particles');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'particles';
      document.body.prepend(canvas);
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const mobile = window.innerWidth < 700;
    const count = reducedMotion ? 45 : mobile ? 60 : 115;
    let W = 0, H = 0, dpr = 1;
    let pts = [];
    let mouseX = -9999, mouseY = -9999;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.45 + 0.25,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        a: Math.random() * 0.55 + 0.15,
        tw: Math.random() * Math.PI * 2
      }));
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    if (!coarsePointer) {
      window.addEventListener('pointermove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
      }, { passive: true });
    }

    const draw = time => {
      ctx.clearRect(0, 0, W, H);
      const grid = 112;
      const buckets = new Map();

      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        p.tw += 0.018;
        if (p.x < -4) p.x = W + 4;
        if (p.x > W + 4) p.x = -4;
        if (p.y < -4) p.y = H + 4;
        if (p.y > H + 4) p.y = -4;

        if (!coarsePointer && !reducedMotion) {
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const d2 = dx * dx + dy * dy;
          if (d2 < 13000 && d2 > 50) {
            const d = Math.sqrt(d2);
            const force = (1 - d / 114) * 0.012;
            p.x += dx * force;
            p.y += dy * force;
          }
        }

        const alpha = p.a * (0.7 + Math.sin(p.tw + time * 0.0003) * 0.3);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56,212,255,${Math.max(0.04, alpha * 0.34)})`;
        ctx.fill();

        const gx = Math.floor(p.x / grid);
        const gy = Math.floor(p.y / grid);
        const key = `${gx}:${gy}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(p);
      }

      const seen = new Set();
      for (const [key, arr] of buckets) {
        const [gx, gy] = key.split(':').map(Number);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const list = buckets.get(`${gx + ox}:${gy + oy}`);
            if (!list) continue;
            for (const a of arr) {
              for (const b of list) {
                if (a === b) continue;
                const id = a.x < b.x || (a.x === b.x && a.y <= b.y) ? `${a.x}:${a.y}|${b.x}:${b.y}` : `${b.x}:${b.y}|${a.x}:${a.y}`;
                if (seen.has(id)) continue;
                seen.add(id);
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const d = Math.hypot(dx, dy);
                if (d < 96) {
                  ctx.beginPath();
                  ctx.moveTo(a.x, a.y);
                  ctx.lineTo(b.x, b.y);
                  ctx.strokeStyle = `rgba(56,212,255,${(1 - d / 96) * 0.055})`;
                  ctx.lineWidth = 0.45;
                  ctx.stroke();
                }
              }
            }
          }
        }
      }

      requestAnimationFrame(draw);
    };

    requestAnimationFrame(draw);
  }

  /* -------------------- HOMEPAGE EXTRAS -------------------- */
  /* -------------------- CINEMATIC SCROLL VIDEO -------------------- */
  function setupScrollVideo() {
    const tracks = $$('.video-scroll-track');
    if (!tracks.length || reducedMotion) return;

    tracks.forEach(track => {
      const video = $('.scroll-video', track);
      const progressBar = $('.video-progress span', track);
      const centerCopy = $('.video-center-copy', track);
      const hint = $('.video-scroll-hint', track);
      if (!video) return;

      // The video follows scroll directly. The important smoothing happens by
      // preventing a backlog of seeks: while the decoder is seeking, we keep
      // only the newest target and apply that as soon as the current frame is ready.
      const FPS = 30;
      const FRAME = 1 / FPS;
      const MIN_SEEK_GAP_MS = 20;

      let duration = 0;
      let targetTime = 0;
      let ready = false;
      let renderRaf = 0;
      let seekRaf = 0;
      let destroyed = false;
      let rawProgress = 0;
      let lastApplied = -1;
      let lastSeekStamp = -Infinity;
      let seeking = false;
      let pendingSeek = false;

      video.preload = 'auto';
      video.autoplay = false;
      video.muted = true;
      video.playsInline = true;
      video.pause();

      const clamp01 = value => Math.max(0, Math.min(1, value));

      const calculate = () => {
        const rect = track.getBoundingClientRect();
        const scrollable = Math.max(1, track.offsetHeight - window.innerHeight);
        const raw = clamp01(-rect.top / scrollable);

        // Keep the small cinematic ease at the start/end without delaying the
        // middle of the sequence.
        const eased = raw < 0.035
          ? (raw / 0.035) * 0.018
          : raw > 0.975
            ? 0.982 + ((raw - 0.975) / 0.025) * 0.018
            : 0.018 + ((raw - 0.035) / 0.94) * 0.964;

        rawProgress = raw;
        targetTime = Math.max(0, Math.min(duration, eased * Math.max(0, duration - FRAME * 0.5)));

        if (progressBar) {
          progressBar.style.transform = `scaleY(${raw})`;
        }
        track.classList.toggle('is-complete', raw > 0.94);

        if (centerCopy) {
          const introFade = Math.min(1, raw / 0.14);
          const outroFade = raw > 0.72 ? Math.max(0, 1 - (raw - 0.72) / 0.22) : 1;
          const alpha = introFade * outroFade;
          const lift = raw < 0.5 ? (0.5 - raw) * 28 : 0;
          centerCopy.style.opacity = String(Math.min(1, alpha));
          centerCopy.style.transform = `translate(-50%, calc(-50% + ${lift.toFixed(1)}px)) scale(${(1 + raw * 0.028).toFixed(4)})`;
        }

        if (hint) hint.style.opacity = String(Math.max(0, 1 - raw / 0.18));
      };

      const getNextTime = () => {
        return Math.max(
          0,
          Math.min(
            duration - 0.001,
            Math.round(targetTime / FRAME) * FRAME
          )
        );
      };

      const requestSeek = () => {
        if (destroyed || !ready || !duration) return;
        pendingSeek = true;
        if (!seekRaf) seekRaf = requestAnimationFrame(runSeek);
      };

      const runSeek = (stamp) => {
        seekRaf = 0;
        if (destroyed || !ready || !duration || !pendingSeek) return;
        if (seeking) return;

        if (stamp - lastSeekStamp < MIN_SEEK_GAP_MS) {
          seekRaf = requestAnimationFrame(runSeek);
          return;
        }

        const next = getNextTime();
        pendingSeek = false;
        if (Math.abs(next - lastApplied) < FRAME * 0.75) return;

        try {
          seeking = true;
          video.currentTime = next;
          lastApplied = next;
          lastSeekStamp = stamp;
        } catch (_) {
          seeking = false;
        }
      };

      const scheduleRender = () => {
        if (!renderRaf) {
          renderRaf = requestAnimationFrame(() => {
            renderRaf = 0;
            if (destroyed) return;
            calculate();
            requestSeek();
          });
        }
      };

      const onReady = () => {
        duration = Number.isFinite(video.duration) ? video.duration : 0;
        ready = duration > 0;
        lastApplied = -1;
        seeking = false;
        pendingSeek = true;
        video.classList.add('scrub-ready');
        calculate();
        requestSeek();
      };

      video.addEventListener('loadedmetadata', onReady, { once: true });
      video.addEventListener('seeked', () => {
        seeking = false;
        // Apply only the newest scroll target; this avoids a queue of stale seeks.
        if (pendingSeek || Math.abs(targetTime - lastApplied) >= FRAME * 0.75) requestSeek();
      });
      video.addEventListener('canplay', () => {
        ready = Number.isFinite(video.duration) && video.duration > 0;
      }, { once: true });

      if (video.readyState >= 1) onReady();

      window.addEventListener('scroll', scheduleRender, { passive: true });
      window.addEventListener('resize', scheduleRender, { passive: true });
      window.addEventListener('pagehide', () => { destroyed = true; }, { once: true });

      calculate();
      requestSeek();
    });
  }

  function setupHomeExtras() {
    const hero = $('.hero-wrapper');
    if (!hero || $('.scroll-cue')) return;

    const cue = document.createElement('div');
    cue.className = 'scroll-cue';
    cue.innerHTML = '<span>SCROLL TO EXPLORE</span><i></i>';
    hero.appendChild(cue);

    if (!$('.home-command')) {
      const lang = document.documentElement.lang === 'en' ? 'en' : 'es';
      const isEn = lang === 'en';
      const section = document.createElement('section');
      section.className = 'home-command';
      section.id = 'explore';
      section.innerHTML = `
        <div class="home-command-head">
          <p class="section-kicker">${isEn ? 'SYSTEM // NAVIGATION' : 'SISTEMA // NAVEGACIÓN'}</p>
          <h2>${isEn ? 'Explore the archive' : 'Explora el archivo'}</h2>
          <p>${isEn ? 'A layered portfolio built around projects, experiments and low-level systems.' : 'Un portfolio por capas construido alrededor de proyectos, experimentos y sistemas de bajo nivel.'}</p>
        </div>
        <div class="home-module-grid">
          <a class="home-module autobot-module" href="${isEn ? 'autobots-en.html' : 'autobots-es.html'}">
            <span class="module-index">01</span><img src="../img/autobots.png" alt="Autobots"><div><strong>AUTOBOTS</strong><span>${isEn ? 'Utility · automation · hardware' : 'Utilidad · automatización · hardware'}</span></div><b>↗</b>
          </a>
          <a class="home-module decep-module" href="${isEn ? 'decepticons-en.html' : 'decepticons-es.html'}">
            <span class="module-index">02</span><img src="../img/decepticons.png" alt="Decepticons"><div><strong>DECEPTICONS</strong><span>${isEn ? 'ASM · binaries · low level' : 'ASM · binarios · bajo nivel'}</span></div><b>↗</b>
          </a>
          <a class="home-module about-module" href="${isEn ? 'about-en.html' : 'about-es.html'}">
            <span class="module-index">03</span><img src="../img/info.png" alt="About"><div><strong>${isEn ? 'ABOUT' : 'SOBRE MÍ'}</strong><span>${isEn ? 'Profile · stack · stats' : 'Perfil · herramientas · estadísticas'}</span></div><b>↗</b>
          </a>
        </div>
        <div class="home-system-line"><span>SYS.STATUS</span><i></i><span>${isEn ? 'ONLINE' : 'EN LÍNEA'}</span><span>PORTFOLIO.V3</span><span>ES // EN</span></div>
      `;
      hero.insertAdjacentElement('afterend', section);
    }
  }

  /* -------------------- NAV STATE / BACK TO TOP -------------------- */


  function updateScroll() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const y = Math.max(0, window.scrollY || 0);
    const ratio = Math.min(1, y / max);
    const dir = y >= lastScrollY ? 1 : -1;
    lastScrollY = y;

    doc.style.setProperty('--scroll', ratio.toFixed(4));
    doc.style.setProperty('--scroll-y', `${y}px`);

    if (document.body.classList.contains('cybertron-bg') && !reducedMotion) {
      const bgShift = 50 + Math.min(9, y * 0.012);
      doc.style.setProperty('--cybertron-bg-y', `${bgShift}%`);
      doc.style.setProperty('--cybertron-drift', `${Math.min(34, y * -0.018).toFixed(1)}px`);
    }

    const bar = $('.scroll-progress');
    if (bar) bar.style.transform = `scaleX(${ratio})`;

    const nav = $('.navbar');
    if (nav) {
      nav.classList.toggle('scrolled', y > 24);
      nav.classList.toggle('nav-hidden', !reducedMotion && dir > 0 && y > 160 && document.body.classList.contains('nav-autohide'));
    }

    const hero = $('.hero-wrapper');
    if (hero && !reducedMotion) {
      const fade = Math.min(1, y / Math.max(1, window.innerHeight * 0.72));
      hero.style.setProperty('--hero-fade', String(1 - fade * 0.82));
      hero.style.setProperty('--hero-shift', `${y * 0.16}px`);
    }

    document.querySelectorAll('[data-parallax]').forEach(el => {
      const speed = Number(el.dataset.parallax) || 0.1;
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const offset = (window.innerHeight / 2 - center) * speed;
      el.style.setProperty('--parallax-y', `${offset}px`);
    });

    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        document.body.classList.toggle('scrolling', Math.abs(dir) === 1);
        rafPending = false;
      });
    }
  }

  function setupScroll() {
    const isHome = !!$('.hero-wrapper');
    if (isHome) document.body.classList.add('nav-autohide');
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll, { passive: true });
    updateScroll();
  }

  function setupReveals() {
    const selectors = [
      '.faction-card', '.project-card', '.detail-section', '.about-section',
      '.about-banner', '.about-header', '.detail-hero', '.detail-screenshot',
      '.wip-box', '.home-module', '.lang-btn', '.fake-terminal', '.fake-panel'
    ];
    const elements = $$(selectors.join(','));
    if (!elements.length) return;

    elements.forEach((el, i) => {
      el.classList.add('reveal-ready');
      if (el.style.getPropertyValue('--reveal-delay') === '') {
        el.style.setProperty('--reveal-delay', `${Math.min(i * 55, 450)}ms`);
      }
    });

    if (reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach(el => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });

    elements.forEach(el => observer.observe(el));
  }

  function tiltTargets() {
    return $$('.faction-card, .project-card, .detail-section, .detail-screenshot, .about-section, .lang-btn, .home-module');
  }

  function setupTilt() {
    if (coarsePointer || reducedMotion) return;

    tiltTargets().forEach(card => {
      if (card.dataset.tiltReady) return;
      card.dataset.tiltReady = '1';
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--lift', '0px');
      card.style.setProperty('--tilt-scale', '1');

      const glow = document.createElement('span');
      glow.className = 'card-glow';
      card.appendChild(glow);

      const reset = () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--lift', '0px');
        card.style.setProperty('--tilt-scale', '1');
        glow.style.setProperty('--gx', '50%');
        glow.style.setProperty('--gy', '50%');
      };

      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const rx = (0.5 - y) * 8;
        const ry = (x - 0.5) * 9;
        card.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
        card.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
        card.style.setProperty('--lift', '-8px');
        card.style.setProperty('--tilt-scale', '1.012');
        glow.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
        glow.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
      });

      card.addEventListener('pointerleave', reset);
    });
  }

  function setupMicroFX() {
    if (coarsePointer || reducedMotion) return;
    $$('.btn, .btn-large, .btn-back, .music-btn').forEach(btn => {
      if (btn.dataset.microReady) return;
      btn.dataset.microReady = '1';
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        btn.style.setProperty('--bx', `${(x * 5).toFixed(2)}px`);
        btn.style.setProperty('--by', `${(y * 4).toFixed(2)}px`);
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--bx', '0px');
        btn.style.setProperty('--by', '0px');
      });
    });

    $$('.project-img, .about-banner, .detail-screenshot img').forEach(img => {
      img.addEventListener('load', () => img.closest('.project-card, .about-page, .project-detail')?.classList.add('media-ready'), { once: true });
    });
  }

  function setupNavState() {
    const current = location.pathname.split('/').pop().toLowerCase();
    $$('.nav-links a').forEach(link => {
      const href = (link.getAttribute('href') || '').split('/').pop().toLowerCase();
      if (!href || href.startsWith('http') || href === '#') return;
      if (href === current) {
        link.classList.add('current');
        link.setAttribute('aria-current', 'page');
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      $$('.navbar.nav-open').forEach(nav => nav.classList.remove('nav-open'));
    });
  }

  function setupBackTop() {
    if ($('.back-top')) return;
    const btn = document.createElement('button');
    btn.className = 'back-top';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '↑';
    document.body.appendChild(btn);
    const sync = () => btn.classList.toggle('show', window.scrollY > window.innerHeight * 0.65);
    window.addEventListener('scroll', sync, { passive:true });
    sync();
    btn.addEventListener('click', () => window.scrollTo({ top:0, behavior: reducedMotion ? 'auto' : 'smooth' }));
  }

  /* -------------------- LANGUAGE MEMORY -------------------- */
  function setupLanguageMemory() {
    const page = location.pathname;
    const isLanguageChooser = page.endsWith('/index.html') || page.endsWith('/');
    if (isLanguageChooser) return;
    const current = document.documentElement.lang === 'en' ? 'en' : 'es';
    try { localStorage.setItem('patpur_language', current); } catch (_) {}
  }



  /* -------------------- V4 GLOBAL CHROME -------------------- */
  function setupLanguageSwitch() {
    $$('.navbar').forEach(nav => {
      const links = $('.nav-links', nav);
      if (!links || $('.nav-language', links)) return;
      const path = location.pathname.replace(/\\/g, '/');
      const parts = path.split('/').filter(Boolean);
      const isEn = document.documentElement.lang === 'en';
      let target = '';
      if (parts.length >= 2 && (parts[0] === 'es' || parts[0] === 'en')) {
        const prefix = isEn ? 'es' : 'en';
        const currentName = parts[parts.length - 1];
        const isProjectDetail = parts.length >= 3 && parts[1] === 'proyectos';
        const cleanName = currentName.replace(/\.html+$/i, '').replace(/-(en|es)$/i, '');
        const name = isProjectDetail
          ? cleanName + '.html'
          : cleanName + (isEn ? '-es.html' : '-en.html');
        target = '../' + prefix + '/' + (isProjectDetail ? 'proyectos/' : '') + name;
      }
      if (!target) return;
      const li = document.createElement('li');
      li.className = 'nav-language';
      const a = document.createElement('a');
      a.href = target;
      a.setAttribute('lang', isEn ? 'es' : 'en');
      a.textContent = isEn ? 'ES' : 'EN';
      a.setAttribute('aria-label', isEn ? 'Cambiar a español' : 'Switch to English');
      li.appendChild(a);
      links.appendChild(li);
    });
  }

  function setupSectionMarkers() {
    const content = document.querySelector('.projects-page, .about-page, .project-detail, .home-command');
    if (!content || $('.page-marker')) return;
    const marker = document.createElement('div');
    marker.className = 'page-marker';
    marker.innerHTML = '<span></span><b></b><small>SCROLL</small>';
    document.body.appendChild(marker);
  }

  function setupPageFooter() {
    if ($('.site-footer') || location.pathname.endsWith('/index.html') || location.pathname === '/' || location.pathname.endsWith('index.html') && !document.querySelector('.hero-wrapper')) return;
    const isEn = document.documentElement.lang === 'en';
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = `
      <div class="site-footer-line"><span></span></div>
      <div class="site-footer-grid">
        <strong>PATPUR<em>ALU</em></strong>
        <span>${isEn ? 'PERSONAL PORTFOLIO · ES / EN' : 'PORTFOLIO PERSONAL · ES / EN'}</span>
        <span>${isEn ? 'SYSTEM ONLINE' : 'SISTEMA EN LÍNEA'}</span>
        <a href="${isEn ? 'index-en.html' : 'index-es.html'}">${isEn ? 'BACK TO HOME ↗' : 'VOLVER AL INICIO ↗'}</a>
      </div>`;
    document.body.appendChild(footer);
  }

  function setupVideoCleanup() {}

  function setupCardDepthDecor() {
    $$('.faction-card, .project-card, .about-section, .detail-section, .detail-screenshot, .home-module').forEach(card => {
      if (card.dataset.chromeReady) return;
      card.dataset.chromeReady = '1';
      const mark = document.createElement('span');
      mark.className = 'card-corner';
      card.appendChild(mark);
    });
  }

  /* -------------------- TRANSFORMER ATMOSPHERE -------------------- */
  function setupTransformerAtmosphere() {
    const body = document.body;
    if (!$('.cybertron-layer') && body.classList.contains('cybertron-bg')) {
      const bg = document.createElement('div');
      bg.className = 'cybertron-layer';
      document.body.prepend(bg);
    }

    if ($('.tf-atmosphere')) return;
    const faction = body.classList.contains('autobots-page') ? 'autobots' :
      body.classList.contains('decepticons-page') ? 'decepticons' :
      body.classList.contains('about-page') || $('.about-page') ? 'core' :
      $('.hero-wrapper') ? 'cybertron' : 'core';

    const atmosphere = document.createElement('div');
    atmosphere.className = `tf-atmosphere tf-${faction}`;
    atmosphere.setAttribute('aria-hidden', 'true');
    atmosphere.innerHTML = `
      <div class="tf-frame tf-frame-a"></div>
      <div class="tf-frame tf-frame-b"></div>
      <div class="tf-emblem-watermark"></div>
      <div class="tf-status-readout">
        <span>${faction === 'autobots' ? 'AUTOBOTS' : faction === 'decepticons' ? 'DECEPTICONS' : faction === 'cybertron' ? 'CYBERTRON' : 'PATPUR'}</span>
        <i></i>
        <b>${faction === 'autobots' ? 'NODE 01' : faction === 'decepticons' ? 'NODE 02' : 'ARCHIVE'}</b>
      </div>
    `;
    document.body.appendChild(atmosphere);
  }



  /* -------------------- V7 // CINEMATIC HOME SYSTEM -------------------- */
  function setupV7CinematicHome() {
    const hero = $('.hero-wrapper');
    if (!hero) return;

    // Boot overlay: lightweight, skippable, and only used on the homepage.
    if (!$('.system-boot')) {
      const boot = document.createElement('div');
      boot.className = 'system-boot';
      const en = document.documentElement.lang === 'en';
      boot.innerHTML = `
        <div class="boot-grid"></div>
        <div class="boot-core">
          <div class="boot-mark"><span></span><b>SR</b><span></span></div>
          <p class="boot-kicker">PATPURALU // ${en ? 'CYBERTRON LINK' : 'ENLACE CYBERTRON'}</p>
          <div class="boot-line"><span class="boot-caret"></span><strong class="boot-message">${en ? 'INITIALIZING SYSTEM' : 'INICIANDO SISTEMA'}</strong></div>
          <div class="boot-progress"><i></i></div>
          <small class="boot-status">00 // 04</small>
        </div>`;
      document.body.appendChild(boot);
      document.body.classList.add('system-booting');

      const messages = en
        ? ['INITIALIZING SYSTEM','LINKING CYBERTRON','SYNCING FACTION DATA','SYSTEM READY']
        : ['INICIANDO SISTEMA','CONECTANDO CYBERTRON','SINCRONIZANDO DATOS','SISTEMA LISTO'];
      let index = 0;
      const msg = $('.boot-message', boot);
      const status = $('.boot-status', boot);
      const progress = $('.boot-progress i', boot);
      const advance = () => {
        index += 1;
        if (index < messages.length) {
          if (msg) msg.textContent = messages[index];
          if (status) status.textContent = `0${index} // 04`;
          if (progress) progress.style.width = `${Math.round((index / (messages.length - 1)) * 100)}%`;
          window.setTimeout(advance, 310);
        } else {
          window.setTimeout(() => {
            document.body.classList.remove('system-booting');
            boot.classList.add('boot-complete');
            window.setTimeout(() => boot.remove(), 620);
          }, 340);
        }
      };
      window.setTimeout(advance, 320);
    }

    if (!$('.hero-orbit')) {
      const orbit = document.createElement('div');
      orbit.className = 'hero-orbit';
      orbit.innerHTML = '<span class="orbit-ring ring-1"></span><span class="orbit-ring ring-2"></span><span class="orbit-node node-1"></span><span class="orbit-node node-2"></span>';
      hero.appendChild(orbit);
    }

    if (!$('.hero-techreadout')) {
      const readout = document.createElement('div');
      readout.className = 'hero-techreadout';
      const en = document.documentElement.lang === 'en';
      readout.innerHTML = `
        <span>${en ? 'CYBERTRON SKYLINE' : 'CYBERTRON SKYLINE'}</span>
        <i></i><span>${en ? 'SIGNAL LOCKED' : 'SEÑAL BLOQUEADA'}</span>
        <i></i><span>SR-01</span>`;
      hero.appendChild(readout);
    }

    if (!$('.hero-scroll-label')) {
      const label = document.createElement('div');
      label.className = 'hero-scroll-label';
      label.innerHTML = '<span>01</span><i></i><b>SCROLL</b><i></i><span>03</span>';
      hero.appendChild(label);
    }

    // Pointer movement only adjusts a very subtle scene light; no custom cursor is rendered.
    if (!coarsePointer && !reducedMotion) {
      let px = 50, py = 50, pending = false;
      hero.addEventListener('pointermove', e => {
        const r = hero.getBoundingClientRect();
        px = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
        py = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          hero.style.setProperty('--hero-mx', `${px.toFixed(1)}%`);
          hero.style.setProperty('--hero-my', `${py.toFixed(1)}%`);
          pending = false;
        });
      }, { passive: true });
      hero.addEventListener('pointerleave', () => {
        hero.style.setProperty('--hero-mx', '50%');
        hero.style.setProperty('--hero-my', '50%');
      }, { passive: true });
    }

    // The old vertical chapter rail was visually noisy on the homepage.
    // Navigation is now handled by the main HUD/scroll progress only.
  }

  /* -------------------- V7 // PROJECT DOSSIER FX -------------------- */
  function setupV7ProjectChrome() {
    const cards = $$('.project-card');
    cards.forEach((card, index) => {
      card.style.setProperty('--node-index', `0${Math.min(9,index+1)}`);
      if (!card.querySelector('.project-node-chip')) {
        const chip = document.createElement('span');
        chip.className = 'project-node-chip';
        chip.textContent = `NODE 0${Math.min(9,index+1)} // READY`;
        card.appendChild(chip);
      }
    });
    $$('.project-detail').forEach(detail => detail.classList.add('dossier-detail'));
  }

  /* -------------------- V7 // ABOUT TERMINAL / DATA FX -------------------- */
  function setupV7About() {
    const page = $('.about-redesign');
    if (!page || $('.about-side-status')) return;
    const status = document.createElement('aside');
    status.className = 'about-side-status';
    status.innerHTML = '<span>PROFILE NODE</span><i></i><b>ONLINE</b><small>SHOCKROOT</small>';
    document.body.appendChild(status);
  }



  /* -------------------- V10 // CYBERTRON EXPERIENCE -------------------- */
  function setupV10Experience() {
    const lang = document.documentElement.lang === 'en';
    const home = $('.hero-wrapper');
    const projectList = $('.projects-grid');
    const detail = $('.project-detail');
    const about = $('.about-redesign');
    const chooser = $('.language-entry-screen');

    // Cleaner, stronger homepage command console.
    if (home && !$('.home-console')) {
      const consolePanel = document.createElement('div');
      consolePanel.className = 'home-console';
      consolePanel.innerHTML = `
        <div class="home-console-left">
          <span class="console-live"><i></i>${lang ? 'LIVE LINK' : 'ENLACE ACTIVO'}</span>
          <span>${lang ? 'CYBERTRON NODE // SR-01' : 'NODO CYBERTRON // SR-01'}</span>
        </div>
        <div class="home-console-mid"><span></span><b></b><span></span><em></em></div>
        <div class="home-console-right"><span>${lang ? 'ARCHIVE' : 'ARCHIVO'}</span><strong>03</strong></div>`;
      home.appendChild(consolePanel);
    }

    // Faction pages get a slim identity band after the main heading.
    if (projectList && !$('.faction-identity-band')) {
      const faction = document.body.classList.contains('decepticons-page') ? 'DECEPTICONS' : 'AUTOBOTS';
      const node = faction === 'DECEPTICONS' ? 'NODE 02' : 'NODE 01';
      const band = document.createElement('div');
      band.className = 'faction-identity-band';
      band.innerHTML = `
        <div><span class="identity-dot"></span><b>${faction}</b><small>${lang ? 'FACTION CHANNEL' : 'CANAL DE FACCION'}</small></div>
        <div class="identity-line"></div>
        <div><small>${lang ? 'ACTIVE ARCHIVE' : 'ARCHIVO ACTIVO'}</small><b>${node}</b></div>`;
      const header = $('.page-header', projectList.parentElement);
      (header || projectList).insertAdjacentElement('afterend', band);
    }

    // Project cards: lightweight technical footer instead of extra heavy widgets.
    if (projectList) {
      $$('.project-card').forEach((card, index) => {
        if (card.querySelector('.project-techline')) return;
        const title = $('.project-title', card)?.textContent.trim() || 'PROJECT';
        const tech = document.createElement('div');
        tech.className = 'project-techline';
        const node = String(index + 1).padStart(2, '0');
        tech.innerHTML = `<span>UNIT ${node}</span><i></i><span>${title}</span><b>${lang ? 'OPEN' : 'ABRIR'} ↗</b>`;
        const body = $('.project-body', card);
        if (body) body.insertBefore(tech, body.firstChild);
      });
    }

    // Project detail: add a compact dossier header with data derived from the page itself.
    if (detail && !$('.detail-dossier-bar', detail)) {
      const faction = document.body.classList.contains('decepticons-page') ? 'DECEPTICONS' : 'AUTOBOTS';
      const title = $('.detail-title', detail)?.textContent.trim() || 'PROJECT';
      const status = $('.project-status', detail)?.textContent.trim() || (lang ? 'ACTIVE' : 'ACTIVO');
      const bar = document.createElement('div');
      bar.className = 'detail-dossier-bar';
      bar.innerHTML = `
        <span><i></i>${faction}</span>
        <span>PROJECT // <b>${title.toUpperCase()}</b></span>
        <span>${lang ? 'STATUS' : 'ESTADO'} // <b>${status.toUpperCase()}</b></span>`;
      detail.prepend(bar);
    }

    // About gets a compact profile strip and a soft image treatment.
    if (about && !$('.about-command-strip', about)) {
      const strip = document.createElement('div');
      strip.className = 'about-command-strip';
      strip.innerHTML = `
        <span><i></i>${lang ? 'PROFILE NODE' : 'NODO DE PERFIL'}</span>
        <span>${lang ? 'SHOCKROOT' : 'SHOCKROOT'}</span>
        <span>${lang ? 'STATUS // ONLINE' : 'ESTADO // EN LÍNEA'}</span>`;
      const head = $('.about-command-head', about);
      (head || about).insertAdjacentElement('beforebegin', strip);
    }

    // Language chooser becomes a true entry console.
    if (chooser && !$('.language-system-line', chooser)) {
      const line = document.createElement('div');
      line.className = 'language-system-line';
      line.innerHTML = `<span>CYBERTRON // LANGUAGE NODE</span><i></i><span>02 CHANNELS</span><i></i><span>READY</span>`;
      chooser.appendChild(line);
    }
  }

  /* -------------------- BOOT -------------------- */
  function init() {
    document.body.classList.add('enhanced');
    ensureScene();
    setupTransformerAtmosphere();
    setupV7CinematicHome();
    setupV7About();
    setupV10Experience();
    setupV7ProjectChrome();
    setupVideoCleanup();
    setupLanguageSwitch();
    setupSectionMarkers();
    setupPageFooter();
    setupCardDepthDecor();
    buildMobileNav();
    setupPageTransitions();
    setupHomeExtras();
    setupScrollVideo();
    setupScroll();
    setupReveals();
    setupTilt();
    setupMicroFX();
    setupParticles();
    setupNavState();
    setupBackTop();
    setupLanguageMemory();

    document.addEventListener('click', onInteraction, { passive: true });
    document.addEventListener('keydown', onInteraction, { passive: true });
    document.addEventListener('touchstart', onInteraction, { passive: true });
    window.addEventListener('load', startMusic, { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
