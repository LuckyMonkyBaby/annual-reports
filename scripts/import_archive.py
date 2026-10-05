"""Resumable S&P 500 cover import: SEC ARS first, archive PDFs for missing years."""
import argparse, concurrent.futures, datetime, hashlib, json, os, re, subprocess, time
from pathlib import Path
from import_reports import CACHE, ROOT, get, import_one, is_plain_form, sp500_universe
from color import cover_features


def finish(record):
    pdf = CACHE/f"{record['id']}.pdf"
    text_file=pdf.with_suffix('.page1.txt')
    if not text_file.exists() and pdf.exists():
        text_file.write_bytes(subprocess.run(['pdftotext','-f','1','-l','1',str(pdf),'-'],capture_output=True,check=True,timeout=40).stdout)
    text=text_file.read_text(errors='replace') if text_file.exists() else ''
    features = cover_features(ROOT/'dist'/record['cover'])
    if features['chromaticFraction'] < .08 and (len(text.split()) > 120 or sum(ord(c)<32 and c not in '\n\r\t' for c in text)/max(1,len(text)) > .02 or len(text.strip()) < 20):
        ocr=CACHE/f"{record['id']}.ocr.txt"
        if not ocr.exists():
            image=CACHE/f"{record['id']}.jpg"
            if not image.exists():
                image=CACHE/f"{record['id']}.png"
                subprocess.run(['dwebp',str(ROOT/'dist'/record['cover']),'-o',str(image)],check=True,capture_output=True,timeout=30)
            ocr.write_bytes(subprocess.run(['tesseract',str(image),'stdout','--psm','6'],check=True,capture_output=True,timeout=60,env={**os.environ,'OMP_THREAD_LIMIT':'1'}).stdout)
        text=ocr.read_text(errors='replace')
    if is_plain_form(text, features):
        raise ValueError('plain SEC form first page')
    if features['chromaticFraction'] < .05 and len(text.split()) > 220:
        raise ValueError('dense monochrome text first page')
    record.update(features)
    title_year = re.search(r'(20\d{2})\s+Annual\s+Report|Annual\s+Report\s+(20\d{2})', text, re.I)
    if title_year:
        record['year'] = int(title_year[1] or title_year[2])
        record['yearBasis'] = 'cover title'
    else:
        record.setdefault('yearBasis', 'reporting period' if record.get('period') else 'archive year')
    record['filterVersion'] = 2
    record['bytes'] = (ROOT/'dist'/record['cover']).stat().st_size
    return record


def sec_report(row):
    key = f'{row[0]}-{Path(row[4]).stem}'
    cache = CACHE/f'processed-{key}.json'
    if cache.exists():
        data = json.loads(cache.read_text())
        if 'error' in data:
            raise ValueError(data['error'])
        if (ROOT/'dist'/data['cover']).exists() and data.get('filterVersion')==2:
            return data
    try:
        result = finish(data if cache.exists() and 'error' not in data and (ROOT/'dist'/data['cover']).exists() else import_one(row))
        result['source'] = 'SEC EDGAR ARS'
        cache.write_text(json.dumps(result))
        return result
    except ValueError as e:
        cache.write_text(json.dumps({'error':str(e)}))
        raise
    finally:
        (CACHE/f'{key}.pdf').unlink(missing_ok=True)


def archive_report(job):
    company, year = job
    cik = str(company['cik_str'])
    tickers = company['tickers']
    candidates = []
    for ticker in tickers:
        for exchange in company['exchanges'] or ['NYSE','NASDAQ']:
            for name in [ticker, *({'META':['FB'], 'XYZ':['SQ'], 'GEN':['NLOK','SYMC']}.get(ticker, []))]:
                code = f'{exchange}_{name}'
                candidates.append(f'https://www.annualreports.com/HostedData/AnnualReportArchive/{name[0].lower()}/{code}_{year}.pdf')
                candidates.append(f'https://www.annualreports.com/HostedData/AnnualReports/PDF/{code}_{year}.pdf')
    for url in dict.fromkeys(candidates):
        key = f"archive-{cik}-{year}-{hashlib.sha256(url.encode()).hexdigest()[:8]}"
        cache = CACHE/f'processed-{key}.json'
        if cache.exists():
            saved = json.loads(cache.read_text())
            if 'error' in saved:
                continue
            if (ROOT/'dist'/saved['cover']).exists() and saved.get('filterVersion')==2:
                return saved
        pdf = CACHE/f'{key}.pdf'
        try:
            data = get(url, pdf)
            if not data.startswith(b'%PDF-'):
                raise ValueError('not a PDF')
            cover = ROOT/'dist/covers'/f'{key}.webp'
            subprocess.run(['pdftoppm','-f','1','-singlefile','-scale-to','900','-jpeg','-jpegopt','quality=85',str(pdf),str(CACHE/key)],check=True,capture_output=True,timeout=90)
            subprocess.run(['cwebp','-quiet','-q','76',str(CACHE/f'{key}.jpg'),'-o',str(cover)],check=True,timeout=30)
            record = finish({'id':key,'company':company['title'],'cik':cik,'year':year,'period':None,'filed':None,'pdf':url,'filing':None,'cover':f'covers/{key}.webp','form':None,'tickers':tickers,'incorporation':None,'source':'AnnualReports.com archive','yearBasis':'archive year'})
            if record['year'] != year:
                raise ValueError('cover title year does not match requested archive year')
            cache.write_text(json.dumps(record))
            return record
        except Exception as e:
            if isinstance(e,(FileNotFoundError,ValueError)):
                cache.write_text(json.dumps({'error':str(e)[:200]}))
            else:
                raise RuntimeError(f'archive download failed: {e}') from e
        finally:
            pdf.unlink(missing_ok=True)
    raise ValueError('no qualifying designed archive PDF found')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--start',type=int,default=2020)
    parser.add_argument('--end',type=int,default=2026)
    parser.add_argument('--workers',type=int,default=4,choices=[1,2,3,4])
    args=parser.parse_args()
    allowed, universe = sp500_universe()
    mapping = json.loads(get('https://www.sec.gov/files/company_tickers.json',CACHE/'sec-tickers.json'))
    exchange_data = json.loads(get('https://www.sec.gov/files/company_tickers_exchange.json',CACHE/'sec-exchanges.json'))
    columns=exchange_data['fields'];exchange_map={}
    for values in exchange_data['data']:
        row=dict(zip(columns,values));exchange_map[row['ticker'].replace('.','-')]=str(row.get('exchange') or '').upper().replace('NASDAQ','NASDAQ')
    companies={}
    for company in mapping.values():
        cik=str(company['cik_str']);ticker=company['ticker'].replace('.','-')
        if cik not in allowed or ticker not in universe['tickers']:
            continue
        item=companies.setdefault(cik,{**company,'tickers':[],'exchanges':[]})
        item['tickers'].append(ticker)
        exchange=exchange_map.get(ticker)
        if exchange in ['NYSE','NASDAQ'] and exchange not in item['exchanges']:
            item['exchanges'].append(exchange)
    out=ROOT/'dist/reports.json'
    existing=json.loads(out.read_text())['reports'] if out.exists() else []
    reports={(r['cik'],r['year']):r for r in existing if r['cik'] in allowed and args.start<=r['year']<=args.end and r.get('filterVersion')==2}
    failures=[];index_failures=[];archive_status={'state':'pending'};now=datetime.datetime.now(datetime.timezone.utc)
    def save():
        payload={'updated':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'SEC EDGAR ARS and AnnualReports.com archive','scope':'Designed first pages for current S&P 500 tracking-fund equity issuers; published reports only. Coverage is incomplete where no qualifying PDF is found.','years':[args.start,args.end],'universe':{'source':universe['source'],'asOf':universe['asOf'],'method':universe['method']},'reports':sorted(reports.values(),key=lambda r:(-r['year'],r['company'])),'failures':failures,'indexFailures':index_failures}
        payload['archiveStatus']=archive_status
        temp=out.with_suffix('.tmp');temp.write_text(json.dumps(payload,separators=(',',':'))+'\n');temp.replace(out)
        coverage={'updated':payload['updated'],'membershipAsOf':universe['asOf'],'companies':len(companies),'reportCount':len(reports),'byYear':{str(y):sum(r['year']==y for r in reports.values()) for y in range(args.start,args.end+1)},'missing':[{'cik':cik,'company':c['title'],'year':y} for cik,c in companies.items() for y in range(args.start,args.end+1) if (cik,y) not in reports],'failures':failures,'indexFailures':index_failures}
        coverage['archiveStatus']=archive_status
        (ROOT/'scripts/coverage.json').write_text(json.dumps(coverage,separators=(',',':'))+'\n')
    rows=[]
    for year in range(args.start,args.end+1):
        for quarter in range(1,5):
            if year>now.year or (year==now.year and quarter>(now.month-1)//3+1):
                continue
            url=f'https://www.sec.gov/Archives/edgar/full-index/{year}/QTR{quarter}/master.idx'
            try:
                lines=get(url,CACHE/f'{year}-QTR{quarter}.idx').decode('latin-1').splitlines()
                rows.extend(r for line in lines if '|ARS|' in line or '|ARS/A|' in line for r in [line.split('|')] if r[0] in allowed)
            except Exception as e:
                index_failures.append({'url':url,'error':str(e)[:180]})
            print(f'INDEX {year} Q{quarter}: {len(rows)} candidate filings',flush=True)
    rows.sort(key=lambda r:r[3],reverse=True)
    print(f'SEC import: {len(rows)} filings across {len(companies)} companies',flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        tasks={pool.submit(sec_report,row):row for row in rows}
        for i,task in enumerate(concurrent.futures.as_completed(tasks),1):
            row=tasks[task]
            try:
                r=task.result();key=(r['cik'],r['year'])
                if args.start<=r['year']<=args.end and (key not in reports or (r['filed'] or '')>(reports[key].get('filed') or '')):
                    reports[key]=r
            except Exception as e:
                failures.append({'source':'SEC','cik':row[0],'company':row[1],'filed':row[3],'error':str(e)[:180]})
            if i%20==0 or i==len(rows):
                save();print(f'SEC {i}/{len(rows)}: {len(reports)} designed covers; {len(failures)} skipped',flush=True)
    jobs=[(company,year) for company in sorted(companies.values(),key=lambda c:c['title']) for year in range(args.start,args.end+1) if (str(company['cik_str']),year) not in reports]
    print(f'ARCHIVE backfill: {len(jobs)} company-years',flush=True)
    # Check a known document before queuing thousands of requests to the same host.
    probe=CACHE/'archive-connectivity-probe.pdf'
    try:
        get('https://www.annualreports.com/HostedData/AnnualReportArchive/a/NASDAQ_AMZN_2020.pdf',probe)
    except Exception as e:
        archive_status={'state':'blocked','error':str(e)[:180]}
        save()
        print(f'ARCHIVE blocked: {e}',flush=True)
        return
    finally:
        probe.unlink(missing_ok=True)
    archive_status={'state':'running'}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        tasks={pool.submit(archive_report,job):job for job in jobs}
        for i,task in enumerate(concurrent.futures.as_completed(tasks),1):
            company,year=tasks[task]
            try:
                r=task.result();reports[(r['cik'],r['year'])]=r
            except Exception as e:
                failures.append({'source':'archive','cik':str(company['cik_str']),'company':company['title'],'year':year,'error':str(e)[:180]})
            if i%20==0 or i==len(jobs):
                save();print(f'ARCHIVE {i}/{len(jobs)}: {len(reports)} designed covers; {len(failures)} skipped',flush=True)
    archive_status={'state':'complete'}
    save()
    used={r['cover'] for r in reports.values()}
    for cover in (ROOT/'dist/covers').glob('*.webp'):
        if str(cover.relative_to(ROOT/'dist')) not in used:
            cover.unlink()
    print(f'DONE {len(reports)} covers from {len({r["cik"] for r in reports.values()})} companies',flush=True)

if __name__=='__main__':
    main()
