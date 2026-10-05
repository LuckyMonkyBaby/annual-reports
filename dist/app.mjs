export function selectReports(reports, query = '') {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return reports.filter(r => terms.every(t => `${r.company} ${(r.tickers || []).join(' ')} ${r.cik} ${r.year}`.toLowerCase().includes(t)));
}
export function similarReports(reports, selected, limit = 12) {
  const distance = r => r.color.reduce((sum, c, i) => sum + (c - selected.color[i]) ** 2, 0);
  return reports.filter(r => r.id !== selected.id && r.color)
    .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id)).slice(0, limit);
}
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  let reports = [], filtered = [], shown = 0, selected = null, transition;
  const coverRatios = new Map();
  let reusableCards = new Map();
  function alignToolbar() {
    if (document.activeElement === $('search')) return;
    const cards = [...$('gallery').children];
    if (!cards.length) return;
    const top = cards[0].getBoundingClientRect().top;
    const row = cards.filter(card => Math.abs(card.getBoundingClientRect().top - top) < 2);
    const bounds = row.map(card => card.querySelector('.card-caption').getBoundingClientRect());
    const header = document.querySelector('header');
    const box = header.getBoundingClientRect();
    const left = bounds[0].left, right = Math.max(...bounds.map(b => b.right));
    // Keep the controls usable when a narrow cover cannot fit the mobile toolbar.
    if (right - left < 280) { header.style.removeProperty('padding-left'); header.style.removeProperty('padding-right'); return; }
    header.style.paddingLeft = `${left - box.left}px`;
    header.style.paddingRight = `${box.right - right}px`;
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
      transition = document.startViewTransition(async () => {
        update();
        await Promise.all([...$('gallery').querySelectorAll('img')].filter(img => img.closest('.card').getBoundingClientRect().top < innerHeight + 200).map(img => {
          img.loading = 'eager';
          return img.decode().catch(() => {});
        }));
        alignToolbar();
      });
      transition.ready.catch(() => {});
    } else update();
  }
  function makeCard(r, isSelected = false) {
    const existing = reusableCards.get(r.id);
    if (!isSelected && existing?.tagName === 'BUTTON') { preloader.observe(existing); return existing; }
    const card = document.createElement(isSelected ? 'article' : 'button');
    card.className = isSelected ? 'card selected-card' : 'card';
    card.dataset.reportId = r.id;
    if (coverRatios.has(r.id)) card.style.setProperty('--cover-ratio', coverRatios.get(r.id));
    card.setAttribute('aria-label', isSelected ? `Show all reports; selected ${r.company} ${r.year}` : `Show colors similar to ${r.company} ${r.year}`);
    if (!isSelected) card.setAttribute('aria-pressed', 'false');
    const stage = document.createElement('div');
    stage.className = 'cover-stage';
    const img = document.createElement('img');
    img.style.viewTransitionName = `cover-${r.id}`;
    img.addEventListener('load', () => { const ratio = img.naturalWidth / img.naturalHeight; coverRatios.set(r.id, ratio); card.style.setProperty('--cover-ratio', ratio); alignToolbar(); });
    img.src = r.cover; img.alt = `${r.company} ${r.year} cover`;
    img.loading = 'lazy'; img.decoding = 'async';
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
    $('pdf-link').hidden = $('reset').hidden = !selected;
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
  fetch('reports.json').then(r => {
    if (!r.ok) throw Error('Collection unavailable');
    return r.json();
  }).then(data => {
    reports = data.reports;
    if (new URLSearchParams(location.search).get('view') !== 'all') selected = reports.find(r => r.cik === '886982' && r.year === 2024) || reports[0];
    render();
  }).catch(() => {
    $('gallery').textContent = 'The collection could not load. Please reload to try again.';
  });
}
