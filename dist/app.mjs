export function selectReports(reports, query = '') {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return reports.filter(r => terms.every(t => `${r.company} ${(r.tickers || []).join(' ')} ${r.cik} ${r.year}`.toLowerCase().includes(t)));
}
export function similarReports(reports, selected, limit = 4) {
  const distance = r => r.color.reduce((sum, c, i) => sum + (c - selected.color[i]) ** 2, 0);
  return reports.filter(r => r.id !== selected.id && r.color)
    .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id)).slice(0, limit);
}
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  let reports = [], filtered = [], shown = 0;
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
    $('gallery').append(...filtered.slice(shown, shown + 48).map(makeCard));
    shown += 48;
    if (shown >= filtered.length) observer.unobserve(sentinel);
  }
  const name = s => s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;
  function openReport(r) {
    $('detail-cover').src = r.cover;
    $('detail-cover').alt = `${r.company} ${r.year} annual report cover`;
    $('detail-company').textContent = `${name(r.company)} · ${r.year}`;
    $('pdf-link').href = r.pdf;
    for (const card of $('similar').children) preloader.unobserve(card);
    $('similar').replaceChildren(...similarReports(reports, r).map(makeCard));
    if (!$('detail').open) $('detail').showModal();
  }
  function makeCard(r) {
    const card = document.createElement('button');
    card.className = 'card';
    card.setAttribute('aria-label', `View ${r.company} ${r.year} annual report`);
    const stage = document.createElement('div');
    stage.className = 'cover-stage';
    const img = document.createElement('img');
    img.addEventListener('load', () => card.style.setProperty('--cover-ratio', img.naturalWidth / img.naturalHeight));
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
    card.append(stage, caption);
    card.addEventListener('click', () => openReport(r));
    preloader.observe(card);
    return card;
  }
  function render() {
    filtered = selectReports(reports, $('search').value);
    shown = 0;
    observer.unobserve(sentinel);
    preloader.disconnect();
    $('empty').hidden = filtered.length > 0;
    $('gallery').replaceChildren();
    append();
    if (shown < filtered.length) observer.observe(sentinel);
  }
  $('search').addEventListener('input', render);
  $('empty-reset').addEventListener('click', () => { $('search').value = ''; render(); });
  $('close').addEventListener('click', () => $('detail').close());
  $('detail').addEventListener('click', e => {
    if (e.target !== $('detail')) return;
    const b = $('detail').getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) $('detail').close();
  });
  document.addEventListener('keydown', e => {
    const find = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.altKey;
    if (find) {
      e.preventDefault();
      if ($('detail').open) $('detail').close();
      $('search').focus();
      $('search').select();
    } else if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) && !$('detail').open) {
      e.preventDefault(); $('search').focus();
    }
  });
  fetch('reports.json').then(r => {
    if (!r.ok) throw Error('Collection unavailable');
    return r.json();
  }).then(data => { reports = data.reports; render(); }).catch(() => {
    $('gallery').textContent = 'The collection could not load. Please reload to try again.';
  });
}
