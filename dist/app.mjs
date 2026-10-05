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
  let reports = [];
  const name = s => s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;
  function openReport(r) {
    $('detail-cover').src = r.cover;
    $('detail-cover').alt = `${r.company} ${r.year} annual report cover`;
    $('detail-company').textContent = `${name(r.company)} · ${r.year}`;
    $('pdf-link').href = r.pdf;
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
    return card;
  }
  function render() {
    const filtered = selectReports(reports, $('search').value);
    $('empty').hidden = filtered.length > 0;
    $('gallery').replaceChildren(...filtered.map(makeCard));
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
    if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) && !$('detail').open) {
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
