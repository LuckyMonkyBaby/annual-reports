"""Import real SEC ARS PDFs and render page one. Stdlib + Poppler only."""
import argparse, csv, datetime, html, io, json, os, re, subprocess, tempfile, time, threading
from pathlib import Path
from color import cover_features

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(tempfile.gettempdir()) / 'annual-report-atlas-cache'
CACHE.mkdir(exist_ok=True)
REQUEST_LOCK = threading.Lock()
NEXT_REQUEST = 0.0
UA = os.environ.get('SEC_USER_AGENT', 'AnnualReportAtlas/0.1 lukas@abloatai.com')


def get(url, path=None):
    global NEXT_REQUEST
    if path and path.exists():
        return path.read_bytes()
    for attempt in range(3):
        try:
            with REQUEST_LOCK:
                time.sleep(max(0, NEXT_REQUEST-time.monotonic()))
                NEXT_REQUEST = time.monotonic()+.2
            response = subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--max-time', '60', '--user-agent', UA, '--write-out', '\n%{http_code}', url], capture_output=True)
            data, _, status = response.stdout.rpartition(b'\n')
            if status in [b'404', b'410']:
                raise FileNotFoundError(url)
            response.check_returncode()
            if path:
                with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
                    temporary.write(data)
                Path(temporary.name).replace(path)
            return data
        except FileNotFoundError:
            raise
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def pdf_links(page, base):
    from urllib.parse import urljoin, urlparse
    links = []
    for href in re.findall(r'href=["\']([^"\']+\.pdf(?:\?[^"\']*)?)["\']', page, re.I):
        url = urljoin(base, html.unescape(href))
        if urlparse(url).hostname == 'www.sec.gov' and url not in links:
            links.append(url)
    return links


def import_one(row):
    cik, company, form, filed, filename = row
    accession = Path(filename).stem
    key = f'{cik}-{accession}'
    cover = ROOT / 'dist/covers' / f'{key}-crop.webp'
    record = CACHE / f'{key}.json'
    entity = json.loads(get(f'https://data.sec.gov/submissions/CIK{int(cik):010d}.json', CACHE / f'entity-{cik}.json'))
    state = entity.get('stateOfIncorporation', '')
    if record.exists() and cover.exists():
        result = json.loads(record.read_text())
        result['cover'] = f'covers/{key}-crop.webp'
        result['incorporation'] = state
        result['tickers'] = entity.get('tickers', [])
        return result
    base = f'https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace("-", "")}/'
    index_url = base + accession + '-index.html'
    page = get(index_url, CACHE / f'{key}.html').decode('utf-8', 'replace')
    period = re.search(r'Period of Report\s*</div>\s*<div[^>]*>\s*(\d{4}-\d{2}-\d{2})', page)
    if not period:
        raise ValueError('missing reporting period')
    urls = pdf_links(page, base)
    if not urls:
        raise ValueError('no PDF attachment')
    # ponytail: first PDF in an ARS filing; inspect attachments if multi-report filings appear.
    pdf_url = urls[0]
    pdf = CACHE / f'{key}.pdf'
    data = get(pdf_url, pdf)
    if not data.startswith(b'%PDF-'):
        pdf.unlink(missing_ok=True)
        raise ValueError('attachment is not a PDF')
    subprocess.run(['pdftoppm', '-cropbox', '-f', '1', '-singlefile', '-scale-to', '900', '-jpeg', '-jpegopt', 'quality=85', str(pdf), str(CACHE/key)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=90)
    subprocess.run(['cwebp', '-quiet', '-q', '76', str(CACHE/f'{key}.jpg'), '-o', str(cover)], check=True, timeout=30)
    result = {'id': key, 'company': re.sub(r'\s*(/DE/|/MD/|/NY/|\\DE\\)$', '', company, flags=re.I).strip(), 'cik': cik, 'year': int(period[1][:4]), 'period': period[1], 'filed': filed, 'pdf': pdf_url, 'filing': index_url, 'cover': f'covers/{key}-crop.webp', 'form': form, 'incorporation': state, 'tickers': entity.get('tickers', [])}
    record.write_text(json.dumps(result))
    return result


def is_plain_form(text, features):
    heading = re.search(r'SECURITIES\s+AND\s+EXCHANGE\s+COMMISSION', text, re.I) and re.search(r'FORM\s*10\s*[-‐‑‒–—−]?\s*[KQ]\b', text, re.I)
    # ponytail: monochrome SEC form headers only; preserve monochrome designed covers.
    return bool(heading and features['chromaticFraction'] < .08)


def sp500_universe():
    url = 'https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf/latest-holdings.csv'
    source = get(url, CACHE/'sp500-holdings.csv').decode('utf-8-sig')
    lines = source.splitlines()
    header = next(i for i,line in enumerate(lines) if line.startswith('Ticker,Name,'))
    holdings = list(csv.DictReader(io.StringIO('\n'.join(lines[header:]))))
    tickers = {r['Ticker'].replace('.', '-').replace(' ', '-') for r in holdings if r.get('Asset Class') == 'Equity'}
    entities = json.loads(get('https://www.sec.gov/files/company_tickers.json', CACHE/'sec-tickers.json'))
    allowed = {str(r['cik_str']) for r in entities.values() if r['ticker'].replace('.', '-') in tickers}
    provenance = {'source':url, 'asOf':next(csv.reader([lines[1]]))[1], 'method':'Equity holdings of IVV, an S&P 500 tracking ETF; membership proxy, not an official S&P constituent license.', 'ciks':sorted(allowed), 'tickers':sorted(tickers)}
    (ROOT/'scripts/universe.json').write_text(json.dumps(provenance,indent=2)+'\n')
    return allowed, provenance


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--years', nargs='+', type=int, default=[2025])
    p.add_argument('--limit', type=int, default=10, help='Companies per filing year, bounded initial collection')
    args = p.parse_args()
    out = ROOT / 'dist/reports.json'
    old = json.loads(out.read_text()) if out.exists() else {'reports': []}
    reports = {}
    errors = []
    total_discovered = {}
    allowed, universe = sp500_universe()
    for year in args.years:
        url = f'https://www.sec.gov/Archives/edgar/full-index/{year}/QTR2/master.idx'
        data = get(url, CACHE / f'{year}-QTR2.idx').decode('latin-1')
        rows = [line.split('|') for line in data.splitlines() if '|ARS|' in line]
        total_discovered[str(year)] = len(rows)
        # Stable company ordering gives the same cohort where filings exist across years.
        rows = [r for r in rows if r[0] in allowed]
        rows.sort(key=lambda r: r[1].casefold())
        rows = [r for r in rows if not re.search(r'\b(FUND|TRUST|PORTFOLIO|ETF|SERIES)\b', r[1], re.I)]
        imported = 0
        for row in rows:
            try:
                r = import_one(row)
                text = subprocess.run(['pdftotext', '-f', '1', '-l', '1', str(CACHE/f"{r['id']}.pdf"), '-'], capture_output=True, check=True).stdout.decode('utf-8','replace')
                features = cover_features(ROOT/'dist'/r['cover'])
                if is_plain_form(text, features):
                    raise ValueError('plain SEC form first page (image + heading check)')
                r.update(features)
                title_year = re.search(r'(20\d{2})\s+Annual\s+Report|Annual\s+Report\s+(20\d{2})', text, re.I)
                r['yearBasis'] = 'cover title' if title_year else 'reporting period'
                if title_year:
                    r['year'] = int(title_year[1] or title_year[2])
                reports[r['id']] = r
                imported += 1
                print(f'OK {r["year"]} {r["company"]}', flush=True)
            except Exception as e:
                errors.append({'company': row[1], 'filed': row[3], 'error': str(e)[:180]})
                print(f'SKIP {row[1]}: {e}', flush=True)
            payload = {'updated': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source': 'SEC EDGAR Form ARS', 'scope': f'Selected designed first pages of US-incorporated corporate ARS filings from Q2 filing years {args.years}; not a complete issuer census.', 'discoveredByFilingYear': total_discovered, 'reports': sorted(reports.values(), key=lambda r: (-r['year'], r['company'])), 'failures': errors, 'universe': {'source':universe['source'], 'asOf':universe['asOf'], 'method':universe['method']}}
            temp = out.with_suffix('.tmp')
            temp.write_text(json.dumps(payload, indent=2))
            temp.replace(out)
            if imported >= args.limit:
                break
    print(f'Imported {len(reports)} reports; {len(errors)} skipped.', flush=True)

if __name__ == '__main__':
    main()
