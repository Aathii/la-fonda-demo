/* La Fonda Antioqueña — film hero (outside → doors open → inside → the sign), rail, menu, nav, reveals (v4) */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || location.search.includes('motion=reduce');
  if (reduce) document.documentElement.classList.add('reduce-motion');
  const $ = (s, r = document) => r.querySelector(s);
  const idle = window.requestIdleCallback ? (f, o) => window.requestIdleCallback(f, o) : (f) => setTimeout(f, 250);

  /* ---------- nav state, active section, mobile bar ---------- */
  const nav = $('#nav');
  const film = $('#film');
  const mobileBar = $('#mobileBar');
  // the hero is 100svh: start from the viewport height and measure after the first frame (no forced layout at startup)
  let heroH = window.innerHeight;
  let embers = null, started = false;
  const video = $('#filmVideo');
  const play = $('#filmPlay');
  const onScroll = () => {
    const past = window.scrollY > heroH - 90;
    nav.classList.toggle('nav--solid', past);
    mobileBar.classList.toggle('is-on', past);
    // the film is sticky under the page; once fully covered, stop painting and animating it
    const off = window.scrollY > heroH + 40;
    film.classList.toggle('film--offstage', off);
    if (embers) embers.visible = !off;
    if (video) { if (off && !video.paused) video.pause(); else if (!off && started && !video.ended && play.hidden && video.paused && !reduce) video.play().catch(() => {}); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { heroH = film.offsetHeight; onScroll(); });
  onScroll();
  requestAnimationFrame(() => requestAnimationFrame(() => { heroH = film.offsetHeight; onScroll(); }));

  const navLinks = [...document.querySelectorAll('.nav__links a[href^="#"]')];
  const secIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = '#' + e.target.id;
      navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  navLinks.forEach((a) => { const t = $(a.getAttribute('href')); if (t) secIO.observe(t); });

  /* ---------- open now (America/Los_Angeles, every day 10:00–18:45) ---------- */
  const status = $('#visitStatus');
  if (status) idle(() => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
      const h = +parts.find((p) => p.type === 'hour').value, m = +parts.find((p) => p.type === 'minute').value;
      const mins = h * 60 + m, open = mins >= 600 && mins < 1125;
      status.textContent = open ? 'Open now · closes 6:45 pm' : 'Closed now · opens 10:00 am';
      status.classList.toggle('is-open', open);
    } catch (e) { /* keep the static text */ }
  }, { timeout: 2000 });

  /* ---------- film hero ---------- */
  const plaque = $('#plaque');
  const caption = $('#filmCaption');
  const meta = $('#filmMeta');
  const skip = $('#filmSkip');
  const hint = $('#filmHint');
  const canvas = $('#embers');
  const doors = $('#doors');

  // timing comes from the build script (media/film.json); the data attributes are the fallback
  let CUT = parseFloat(video.dataset.cut) || 8;
  let FREEZE = parseFloat(video.dataset.freeze) || 3;
  fetch('media/film.json').then((r) => r.json()).then((j) => { if (j.cut) CUT = j.cut; if (j.freeze) FREEZE = j.freeze; }).catch(() => {});

  let revealed = false, doorsShown = false, doorsOpen = false, raf = 0;

  // pick the film size for this screen (the HTML carries the 1080 sources; other tiers are swapped in here)
  // Upright phones and tablets get a true 9:16 film (a centre crop of the landscape one would be magnified about 5x).
  // same test as the poster's <source media="(orientation: portrait)">, so the poster and the first frame always match
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const pickSource = () => {
    const w = Math.min(window.innerWidth, 3840), dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = w * dpr, conn = navigator.connection || {};
    const slow = !!conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || '');
    if (portrait) return (dpr >= 2 && !slow) ? 'media/film-p1080.mp4' : 'media/film-p720.mp4';
    if (w < 768 || slow) return 'media/film-480.mp4';
    if (px < 1300) return 'media/film-720.mp4';
    if (px >= 2560 && (conn.effectiveType || '4g') === '4g') return 'media/film-2160.mp4';
    return null;
  };
  const chosen = pickSource();
  if (chosen) { video.innerHTML = ''; video.src = chosen; }
  // the film downloads once the page has loaded and painted; the poster (its first frame) holds the screen until then
  const startLoad = () => { video.preload = 'auto'; video.load(); };
  // Keyed to the first real paint, not the load event: on devices where the first frame is slow, a load-timed start
  // would pull the film's megabytes ahead of the first paint.
  const afterFirstPaint = (fn, delay) => {
    let done = false;
    const go = () => { if (done) return; done = true; setTimeout(() => idle(fn, { timeout: 1500 }), delay); };
    try {
      const po = new PerformanceObserver((list) => {
        if (list.getEntries().some((e) => e.name === 'first-contentful-paint')) { po.disconnect(); go(); }
      });
      po.observe({ type: 'paint', buffered: true });
    } catch (e) { /* no paint timing: the load fallback below starts it */ }
    const fallback = () => setTimeout(go, 2500);
    if (document.readyState === 'complete') fallback(); else window.addEventListener('load', fallback, { once: true });
  };
  if (!reduce) afterFirstPaint(startLoad, 600);

  // the door frame and the last frame are only needed seconds into the film: fetch them once it plays
  let stillsLoaded = false;
  const loadStills = () => {
    if (stillsLoaded) return; stillsLoaded = true;
    film.querySelectorAll('[data-src]').forEach((el) => {
      el.src = (portrait && el.dataset.srcP) ? el.dataset.srcP : el.dataset.src;
      el.removeAttribute('data-src'); el.removeAttribute('data-src-p');
    });
  };
  // the sign's script face is requested only when the film starts, so it never competes with the first paint
  const armSign = () => { plaque.classList.add('is-armed'); loadStills(); };

  const showStatic = () => {
    armSign();
    plaque.classList.add('is-static', 'is-on');
    caption.classList.add('is-static', 'is-on');
    film.classList.add('film--done', 'film--ended', 'film--static');
    revealed = true;
  };

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    armSign();
    if (!reduce) { embers = runEmbers(); setTimeout(() => plaque.classList.add('is-on'), 900); }
    else plaque.classList.add('is-on');
    caption.classList.add('is-on');
    if (meta) meta.classList.add('is-on');
    setTimeout(() => { hint.classList.add('is-on'); film.classList.add('film--done', 'film--ended'); }, 6400);
  };

  // the doors: panels cover the frame just before the cut, then swing open over the interior
  // if the door frame has not arrived (very slow connection), skip the swing and let the cut play as a hard cut
  const doorImg = doors.querySelector('img');
  const showDoors = () => {
    if (doorsShown) return; doorsShown = true;
    if (!doorImg || !doorImg.complete || !doorImg.naturalWidth) return;
    doors.classList.add('is-on'); film.classList.add('film--doors');
  };
  const openDoors = () => {
    if (doorsOpen) return; doorsOpen = true;
    doors.classList.add('is-open');
    film.classList.add('film--stepping');
    setTimeout(() => doors.classList.remove('is-on'), 3800);
  };
  const resetDoors = () => { doorsShown = doorsOpen = false; doors.classList.remove('is-on', 'is-open'); film.classList.remove('film--stepping', 'film--doors'); };

  // frame-accurate watcher (timeupdate is too coarse for a hard cut)
  const check = () => {
    const t = video.currentTime;
    if (!doorsShown && t >= CUT - 0.14) showDoors();
    if (!doorsOpen && t >= CUT + 0.02) openDoors();
    if (!revealed && video.duration && t >= Math.max(video.duration - FREEZE - 0.5, CUT + 5.0)) reveal();
  };
  const watch = () => { check(); if (!video.paused && !video.ended) raf = requestAnimationFrame(watch); };
  // backup trigger when frame callbacks are throttled (hidden tab, low-power mode): timeupdate fires about 4 times a second
  video.addEventListener('timeupdate', check);
  video.addEventListener('playing', () => { started = true; armSign(); film.classList.add('film--playing'); cancelAnimationFrame(raf); raf = requestAnimationFrame(watch); });
  video.addEventListener('ended', () => { reveal(); film.classList.add('film--ended'); });

  const tryPlay = () => {
    const p = video.play();
    // Only the autoplay policy (NotAllowedError) gets the fallback; an AbortError from a
    // pause() or load() racing play() is not a refusal.
    if (p && p.catch) p.catch((err) => { if (!err || err.name !== 'AbortError') { play.hidden = false; showStatic(); } });
  };

  if (reduce) {
    showStatic();
    play.hidden = false;
  } else {
    video.addEventListener('loadedmetadata', tryPlay, { once: true });
    setTimeout(() => { if (!started && play.hidden && video.paused && video.readyState >= 1) tryPlay(); }, 2500);
  }

  play.addEventListener('click', () => {
    play.hidden = true;
    plaque.classList.remove('is-on', 'is-static');
    caption.classList.remove('is-on', 'is-static');
    hint.classList.remove('is-on');
    if (meta) meta.classList.remove('is-on');
    film.classList.remove('film--done', 'film--ended', 'film--static', 'film--playing');
    resetDoors();
    revealed = false;
    video.currentTime = 0;
    video.play().catch(() => {});
  });

  skip.addEventListener('click', () => {
    video.pause();
    const story = $('#story');
    story.setAttribute('tabindex', '-1');
    story.focus({ preventScroll: true });
    window.scrollTo({ top: story.offsetTop, behavior: reduce ? 'auto' : 'smooth' });
  });

  // pause off-screen, resume in view (if not finished); ignore callbacks before playback begins
  new IntersectionObserver(([e]) => {
    if (embers) embers.visible = e.isIntersecting;
    if (!started) return;
    if (!e.isIntersecting) video.pause();
    else if (!video.ended && !reduce && play.hidden) video.play().catch(() => {});
  }, { threshold: 0.2 }).observe(film);

  /* ---------- embers: sparks gather from the room onto the edges of the sign, then a few keep rising ---------- */
  function runEmbers() {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.width = film.clientWidth * dpr;
    const H = canvas.height = film.clientHeight * dpr;
    const cx = W / 2, cy = H * 0.46;
    // the sign's rectangle in canvas space (the plaque is not visible yet, so use its layout box)
    const pr = plaque.getBoundingClientRect(), fr = film.getBoundingClientRect();
    const box = { x: (pr.left - fr.left) * dpr, y: (pr.top - fr.top) * dpr, w: pr.width * dpr, h: pr.height * dpr };
    const perim = 2 * (box.w + box.h);
    const onEdge = (u) => {
      if (u < box.w) return [box.x + u, box.y];
      u -= box.w; if (u < box.h) return [box.x + box.w, box.y + u];
      u -= box.h; if (u < box.w) return [box.x + box.w - u, box.y + box.h];
      u -= box.w; return [box.x, box.y + box.h - u];
    };
    const N = 170;
    const parts = Array.from({ length: N }, () => {
      const [tx, ty] = onEdge(Math.random() * perim);
      return { x: cx + (Math.random() - .5) * W * .7, y: cy + (Math.random() - .2) * H * .6, tx, ty, r: (0.8 + Math.random() * 2.2) * dpr, t: Math.random() * -0.45, s: 0.55 + Math.random() * 0.6, wob: Math.random() * Math.PI * 2, hue: 32 + Math.random() * 18 };
    });
    const state = { visible: true, stop: false };
    canvas.classList.add('is-on');
    const t0 = performance.now();
    const DUR = 3600;
    // ambient sparks after the gathering: they rise from the bottom edge of the sign
    const amb = Array.from({ length: 14 }, (_, i) => ({ x: 0, y: 0, born: -1, life: 5000 + Math.random() * 2500, r: (0.7 + Math.random() * 1.4) * dpr, wob: Math.random() * Math.PI * 2, hue: 34 + Math.random() * 14, delay: i * 420 }));
    const tick = (now) => {
      if (state.stop) return;
      const el = (now - t0) / DUR;
      if (el >= 1.15 && (!state.visible || document.hidden)) { setTimeout(() => requestAnimationFrame(tick), 300); return; }
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      if (el < 1.15) {
        for (const p of parts) {
          p.t += 0.007 * p.s;
          if (p.t < 0) continue;
          const k = Math.min(p.t, 1);
          const e = 1 - Math.pow(1 - k, 3);
          const sw = 24 * (1 - e) + 6;
          const x = p.x + (p.tx - p.x) * e + Math.sin(now / 260 + p.wob) * sw * dpr * (1 - e);
          const y = p.y + (p.ty - p.y) * e + Math.cos(now / 300 + p.wob) * sw * dpr * (1 - e) - 18 * dpr * (1 - e);
          const alpha = k < 0.85 ? 0.85 : (1 - k) / 0.15 * 0.85;
          ctx.shadowBlur = 14 * dpr; ctx.shadowColor = `hsla(${p.hue},95%,60%,${alpha})`;
          ctx.fillStyle = `hsla(${p.hue},95%,${62 + 20 * (1 - k)}%,${alpha})`;
          ctx.beginPath(); ctx.arc(x, y, p.r * (1 - 0.5 * e), 0, Math.PI * 2); ctx.fill();
        }
      }
      if (el > 0.9 && state.visible && !document.hidden) {
        const ms = now - t0 - DUR * 0.9;
        for (const a of amb) {
          if (ms < a.delay) continue;
          if (a.born < 0 || now - a.born > a.life) { a.born = now; a.x = box.x + box.w * (0.08 + Math.random() * 0.84); a.y = box.y + box.h - 2 * dpr; }
          const age = (now - a.born) / a.life;
          const y = a.y - age * 110 * dpr, x = a.x + Math.sin(now / 900 + a.wob) * 9 * dpr;
          const alpha = 0.28 * (age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 0.85);
          ctx.shadowBlur = 10 * dpr; ctx.shadowColor = `hsla(${a.hue},95%,62%,${alpha})`;
          ctx.fillStyle = `hsla(${a.hue},95%,70%,${alpha})`;
          ctx.beginPath(); ctx.arc(x, y, a.r, 0, Math.PI * 2); ctx.fill();
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return state;
  }

  /* ---------- section reveals ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -14% 0px', threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  /* ---------- full menu tabs ---------- */
  const tablist = document.querySelector('.menu__tabs');
  if (tablist) {
    const tabs = [...tablist.querySelectorAll('[role=tab]')];
    const activate = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus({ preventScroll: true });
      tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
    };
    tabs.forEach((t) => t.addEventListener('click', () => activate(t, false)));
    tablist.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); activate(tabs[(i + 1) % tabs.length], true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); activate(tabs[(i - 1 + tabs.length) % tabs.length], true); }
    });
  }

  /* ---------- dishes rail ---------- */
  const rail = $('#rail');
  const track = $('#railTrack');
  const stage = $('#railStage');
  const prev = $('#railPrev');
  const next = $('#railNext');
  const cardW = () => track.querySelector('.card').getBoundingClientRect().width + 20;
  prev.addEventListener('click', () => track.scrollBy({ left: -cardW() * 2, behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: cardW() * 2, behavior: 'smooth' }));

  // GSAP is injected only on wide screens that use the pinned rail
  const GSAP_SRC = ['https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js'];
  let gsapLoading = null;
  const loadGsap = () => gsapLoading || (gsapLoading = GSAP_SRC.reduce((p, src) => p.then(() => new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
  })), Promise.resolve()));
  const wantPin = () => window.innerWidth >= 1024 && !reduce;
  const canPin = () => wantPin() && window.gsap && window.ScrollTrigger;
  let pinned = null, par = null, curtain = null;
  const setupPin = () => {
    if (!canPin()) return;
    gsap.registerPlugin(ScrollTrigger);
    rail.classList.add('rail--pinned');
    const distance = () => track.scrollWidth - window.innerWidth;
    pinned = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: { trigger: stage, start: 'top top', end: () => '+=' + distance(), pin: true, scrub: 1.4, anticipatePin: 1, invalidateOnRefresh: true }
    });
    par = gsap.fromTo(track.querySelectorAll('.card__visual img'), { xPercent: 5 }, {
      xPercent: -5, ease: 'none',
      scrollTrigger: { trigger: stage, start: 'top top', end: () => '+=' + distance(), scrub: 1.4, invalidateOnRefresh: true }
    });
    // the sign and the hint recede as the cream page slides over the film
    curtain = gsap.fromTo('#filmStage', { opacity: 1, y: 0 }, { opacity: 0, y: -40, ease: 'none', immediateRender: false, scrollTrigger: { trigger: '#story', start: 'top bottom', end: 'top 55%', scrub: 0.8 } });
    // keyboard users: bring the focused card into the pinned view
    track.addEventListener('focusin', (ev) => {
      const card = ev.target.closest('.card');
      if (!card || !pinned) return;
      const cards = [...track.children];
      const i = cards.indexOf(card);
      const st = pinned.scrollTrigger;
      window.scrollTo({ top: st.start + (st.end - st.start) * (i / Math.max(cards.length - 1, 1)), behavior: 'auto' });
    });
  };
  const teardownPin = () => {
    if (!pinned) return;
    [pinned, par, curtain].forEach((t) => { if (t) { if (t.scrollTrigger) t.scrollTrigger.kill(true); t.kill(); } });
    gsap.set(track, { clearProps: 'all' });
    gsap.set(track.querySelectorAll('.card__visual img'), { clearProps: 'all' });
    gsap.set('#filmStage', { clearProps: 'all' });
    rail.classList.remove('rail--pinned');
    pinned = par = curtain = null;
  };
  const decidePin = () => {
    if (wantPin() && !pinned) loadGsap().then(() => { if (canPin() && !pinned) setupPin(); }).catch(() => {});
    else if (!wantPin() && pinned) teardownPin();
  };
  window.addEventListener('load', decidePin);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(decidePin, 200); });
})();
