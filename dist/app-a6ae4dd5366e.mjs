export function selectReports(reports, query = '') {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return reports.filter(r => terms.every(t => `${r.company} ${(r.tickers || []).join(' ')} ${r.cik} ${r.year}`.toLowerCase().includes(t)));
}
export function similarReports(reports, selected, limit = 12) {
  const distance = r => r.color.reduce((sum, c, i) => sum + (c - selected.color[i]) ** 2, 0);
  return reports.filter(r => r.id !== selected.id && r.color)
    .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id)).slice(0, limit);
}
export function foldPaper(width, height, progress, diagonal = true) {
  const p = Math.max(.0001, Math.min(1, progress));
  const dx = 2.25 * width * p, dy = diagonal ? 2.25 * height * p : height * (.4 * Math.sin(Math.PI * p) + .08 * p);
  const edge = dx * (width - dx / 2) - dy * dy / 2;
  const score = ([x, y]) => dx * x - dy * y - edge;
  const rectangle = [[0,0],[width,0],[width,height],[0,height]];
  const clip = side => rectangle.flatMap((a, i) => {
    const b = rectangle[(i + 1) % 4], sa = side * score(a), sb = side * score(b);
    const points = sa >= 0 ? [a] : [];
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      points.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
    return points;
  });
  const turned = clip(1);
  const length = Math.hypot(dx,dy), depth = Math.max(...turned.map(point => score(point) / length));
  // Bend the projected underside continuously between the crease and lifted corner.
  const bend = Math.min(depth * .15, Math.min(width,height) * .075) * Math.sin(Math.PI * p);
  const underside = turned.flatMap((a,i) => {
    const b = turned[(i+1)%turned.length];
    return Array.from({length:16},(_,j) => [a[0]+(b[0]-a[0])*j/16,a[1]+(b[1]-a[1])*j/16]);
  });
  const shape = {front:clip(-1), back:underside.map(point => {
    const amount = 2 * score(point) / (dx * dx + dy * dy);
    const curve = depth > 0 ? bend * Math.sin(Math.PI * score(point) / length / depth) / length : 0;
    return [point[0] - amount * dx + curve * dx, point[1] + amount * dy - curve * dy];
  }), crease:turned.filter(point => Math.abs(score(point)) < .001)};
  for (const key of ['front','back','crease']) shape[key] = shape[key].map(([x,y]) => [x,height-y]);
  return {...shape,normal:[dx,dy]};
}
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const isFeatured = new URLSearchParams(location.search).get('view') !== 'all';
  const introduce = document.documentElement.dataset.view === 'landing';
  let reports = [], filtered = [], shown = 0, selected = null, transition;
  const coverRatios = new Map();
  let reusableCards = new Map();
  let catalogPromise;
  function loadCatalog() {
    return catalogPromise ||= fetch('catalog.json?v=cropbox', {priority:'low'}).then(r => {
      if (!r.ok) throw Error('Collection unavailable');
      return r.json();
    }).then(data => { reports = data.reports; render(); });
  }
  function alignToolbar() {
    const gallery = $('gallery'), featured = gallery.querySelector('.selected-card');
    if (featured && innerWidth > 760 && gallery.getBoundingClientRect().width) {
      const columns = getComputedStyle(gallery).gridTemplateColumns.split(' ').length;
      const count = columns - 2, nearby = [...gallery.children].slice(1, 1 + count * 2);
      const captionHeight = cards => Math.max(0, ...cards.map(card => card.querySelector('.card-caption').getBoundingClientRect().height));
      const height = featured.querySelector('.cover-stage').getBoundingClientRect().width / Number(featured.style.getPropertyValue('--cover-ratio'));
      featured.style.setProperty('--selected-height', `${height.toFixed(2)}px`);
      gallery.style.setProperty('--cover-height', `${(height/2).toFixed(2)}px`);
      const offset = captionHeight(nearby.slice(0,count)) + captionHeight(nearby.slice(count)) + parseFloat(getComputedStyle(gallery).rowGap) - captionHeight([featured]);
      gallery.style.setProperty('--cover-height', `${Math.max(1,(height-offset)/2).toFixed(2)}px`);
    } else {
      gallery.style.removeProperty('--cover-height');
      featured?.style.removeProperty('--selected-height');
    }
    if (document.activeElement === $('search')) return;
    const cards = $('gallery').children;
    if (!cards.length) return;
    const top = cards[0].getBoundingClientRect().top;
    const row = [];
    for (const card of cards) {
      if (Math.abs(card.getBoundingClientRect().top - top) >= 2) break;
      row.push(card);
    }
    const bounds = row.map(card => { const img = card.querySelector('img'); return (img.naturalWidth ? img : card.querySelector('.card-caption')).getBoundingClientRect(); });
    const header = document.querySelector('header');
    const nav = document.querySelector('.site-nav');
    const box = header.getBoundingClientRect();
    const left = bounds[0].left, right = Math.max(...bounds.map(b => b.right));
    // Keep the controls usable when a narrow cover cannot fit the mobile toolbar.
    for (const bar of [header, nav]) {
      if (right - left < 280) { bar.style.removeProperty('padding-left'); bar.style.removeProperty('padding-right'); }
      else { bar.style.paddingLeft = `${left - box.left}px`; bar.style.paddingRight = `${box.right - right}px`; }
    }
  }
  new ResizeObserver(alignToolbar).observe($('gallery'));
  const name = s => s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;
  const preloader = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      preloader.unobserve(entry.target);
      const image = entry.target.querySelector('img');
      image.loading = 'eager';
      image.decode().catch(() => {});
    }
  }, {rootMargin: '800px 0px'});
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  $('gallery').after(sentinel);
  const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) append(); }, {rootMargin: '1200px'});
  function append() {
    $('gallery').append(...filtered.slice(shown, shown + 48).map(r => makeCard(r)));
    shown += 48;
    if (shown >= filtered.length) observer.unobserve(sentinel);
  }
  function select(record) {
    selected = record && selected?.id !== record.id ? record : null;
    $('search').value = '';
    const update = () => { render(); window.scrollTo({top: 0, behavior: 'instant'}); };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      transition?.skipTransition();
      const opening = selected && `cover-${selected.id}`;
      transition = document.startViewTransition(() => {
        update();
      });
      transition.ready.then(() => {
        if (!opening) return;
        document.documentElement.animate([
          {transform:'perspective(1200px) rotateY(0deg)',filter:'drop-shadow(0 0 0 transparent)',offset:0},
          {transform:'perspective(1200px) rotateY(-12deg)',filter:'drop-shadow(8px 6px 12px #0002)',offset:.32},
          {transform:'perspective(1200px) rotateY(1deg)',filter:'drop-shadow(2px 2px 3px #0001)',offset:.8},
          {transform:'perspective(1200px) rotateY(0deg)',filter:'drop-shadow(0 0 0 transparent)',offset:1}
        ].map(frame => ({...frame,transformOrigin:'left center'})), {
          duration:300,easing:'cubic-bezier(.22,1,.36,1)',pseudoElement:`::view-transition-image-pair(${CSS.escape(opening)})`
        });
      }).catch(() => {});
    } else update();
  }
  function makeCard(r, isSelected = false) {
    const existing = reusableCards.get(r.id);
    if (existing?.tagName === (isSelected ? 'ARTICLE' : 'BUTTON')) { preloader.observe(existing); return existing; }
    const card = document.createElement(isSelected ? 'article' : 'button');
    card.className = isSelected ? 'card selected-card' : 'card';
    card.dataset.reportId = r.id;
    card.style.setProperty('--cover-ratio', r.width / r.height || coverRatios.get(r.id) || .67);
    card.setAttribute('aria-label', isSelected ? `Show all reports; selected ${r.company} ${r.year}` : `Show colors similar to ${r.company} ${r.year}`);
    if (!isSelected) card.setAttribute('aria-pressed', 'false');
    const stage = document.createElement('div');
    stage.className = 'cover-stage';
    const img = existing?.querySelector('img') || document.createElement('img');
    img.style.viewTransitionName = img.complete && img.naturalWidth ? `cover-${r.id}` : 'none';
    img.onload = () => { const ratio = img.naturalWidth / img.naturalHeight; coverRatios.set(r.id, ratio); card.style.setProperty('--cover-ratio', ratio); img.style.viewTransitionName = `cover-${r.id}`; alignToolbar(); };
    img.width = r.width; img.height = r.height;
    if (img.getAttribute('src') !== r.cover) img.src = r.cover;
    img.alt = `${r.company} ${r.year} cover`;
    img.loading = isSelected ? 'eager' : 'lazy'; img.decoding = 'async';
    img.fetchPriority = isSelected ? 'high' : 'auto';
    stage.append(img);
    const caption = document.createElement('div');
    caption.className = 'card-caption';
    const company = document.createElement('span');
    company.textContent = name(r.company);
    const year = document.createElement('span');
    year.className = 'card-year'; year.textContent = r.year;
    caption.append(company, year);
    const inner = document.createElement('div');
    inner.className = 'card-inner';
    if (isSelected) {
      const action = document.createElement('button');
      action.className = 'selected-action';
      action.setAttribute('aria-label', 'Show all reports');
      action.setAttribute('aria-pressed', 'true');
      action.append(stage, caption);
      action.addEventListener('click', () => select(r));
      inner.append(action);
    } else {
      inner.append(stage, caption);
      card.addEventListener('click', () => select(r));
    }
    card.append(inner);
    preloader.observe(card);
    return card;
  }
  function render() {
    reusableCards = new Map([...$('gallery').children].map(card => [card.dataset.reportId, card]));
    filtered = selected ? similarReports(reports, selected) : selectReports(reports, $('search').value);
    shown = 0;
    observer.unobserve(sentinel);
    preloader.disconnect();
    $('empty').hidden = filtered.length > 0 || !!selected;
    $('clear-search').hidden = !$('search').value;
    $('pdf-link').hidden = !selected;
    $('reset').hidden = !selected || isFeatured;
    if (selected) $('pdf-link').href = selected.pdf;
    $('gallery').classList.toggle('selected-mode', !!selected);
    document.body.classList.toggle('filtered', !!selected);
    $('gallery').replaceChildren();
    if (selected) $('gallery').append(makeCard(selected, true));
    append();
    alignToolbar();
    if (shown < filtered.length) observer.observe(sentinel);
  }
  $('search').addEventListener('input', () => { transition?.skipTransition(); selected = null; render(); });
  $('clear-search').addEventListener('click', () => select(null));
  $('reset').addEventListener('click', () => select(null));
  $('empty-reset').addEventListener('click', () => select(null));
  document.addEventListener('keydown', e => {
    const find = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.altKey && !e.shiftKey;
    if (find) {
      e.preventDefault(); $('search').focus(); $('search').select();
    } else if (e.key === 'Escape' && selected) {
      e.preventDefault(); select(null);
    } else if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault(); $('search').focus();
    }
  });
  const initial = JSON.parse($('initial-reports').textContent);
  reports = isFeatured ? initial.featured : initial.initial;
  if (isFeatured) selected = reports[0];
  render();
  const fillCatalog = () => loadCatalog().catch(() => { $('gallery').append('The full collection could not load. Reload to retry.'); });
  function scheduleCatalog() {
    if ('requestIdleCallback' in window) requestIdleCallback(fillCatalog, {timeout:1000});
    else setTimeout(fillCatalog, 100);
  }
  function openCover(reveal) {
    const cover = document.querySelector('.entry-cover'), box = cover.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'paper-opening'; overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`});
    Object.assign(cover.style, {display:'flex',width:'100%',height:'100%',aspectRatio:'auto',transform:'none',viewTransitionName:'none'});
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.innerHTML = '<defs><linearGradient id="paper-back"><stop stop-color="var(--crease)"/><stop offset=".35" stop-color="var(--paper)"/><stop offset="1" stop-color="var(--paper)"/></linearGradient><clipPath id="paper-back-clip"><polygon/></clipPath></defs><g clip-path="url(#paper-back-clip)"><polygon class="paper-back" fill="url(#paper-back)"/></g><polyline class="paper-crease"/>';
    overlay.append(cover, svg); document.body.append(overlay); reveal();
    const back = svg.querySelector('polygon'), crease = svg.querySelector('polyline');
    const face = svg.querySelector('.paper-back');
    const gradient = svg.querySelector('linearGradient');
    const duration = innerWidth > 760 ? 2400 : 1800, started = performance.now();
    overlay.dataset.duration = duration;
    const events = ['wheel','touchstart','pointerdown','keydown','resize'];
    let frame, done = false;
    const finish = () => {
      if (done) return;
      done = true; cancelAnimationFrame(frame); overlay.remove();
      events.forEach(event => window.removeEventListener(event, finish));
    };
    events.forEach(event => window.addEventListener(event, finish, {passive:true}));
    function turn(now) {
      if (done) return;
      const time = Math.min(1, (now - started) / duration);
      const progress = time * time * time * (time * (time * 6 - 15) + 10);
      const shape = foldPaper(box.width, box.height, progress, box.width > 760);
      cover.style.clipPath = shape.front.length ? `polygon(${shape.front.map(p => `${p[0]}px ${p[1]}px`).join(',')})` : 'inset(0 100% 0 0)';
      back.setAttribute('points', shape.back.map(p => p.join(',')).join(' '));
      face.setAttribute('points',back.getAttribute('points'));
      crease.setAttribute('points', shape.crease.map(p => p.join(',')).join(' '));
      if (shape.crease.length === 2) {
        gradient.setAttribute('gradientUnits','userSpaceOnUse');
        const x = (shape.crease[0][0] + shape.crease[1][0]) / 2, y = (shape.crease[0][1] + shape.crease[1][1]) / 2;
        const length = Math.hypot(...shape.normal);
        gradient.setAttribute('x1',x); gradient.setAttribute('y1',y);
        const lightWidth = 12 + Math.min(box.width,box.height) * .12 * Math.sin(Math.PI * progress);
        gradient.setAttribute('x2',x - lightWidth * shape.normal[0] / length); gradient.setAttribute('y2',y - lightWidth * shape.normal[1] / length);
      }
      if (time === 1) finish(); else frame = requestAnimationFrame(turn);
    }
    frame = requestAnimationFrame(turn);
  }
  if (introduce) {
    const reveal = () => { document.documentElement.dataset.view = 'featured'; render(); scheduleCatalog(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) reveal();
    else Promise.race([
      $('gallery').querySelector('img').decode().catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 180))
    ]).then(() => openCover(reveal));
  } else scheduleCatalog();
}
