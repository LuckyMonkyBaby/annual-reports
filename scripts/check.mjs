import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {selectReports,similarReports} from '../dist/app.mjs';
const data=JSON.parse(readFileSync(new URL('../dist/reports.json',import.meta.url)));
assert.ok(data.reports.length>=10);
assert.equal(new Set(data.reports.map(r=>`${r.cik}:${r.year}`)).size,data.reports.length);
for(const r of data.reports){assert.ok(r.form===null||['ARS','ARS/A'].includes(r.form));assert.ok(r.year>=2020&&r.year<=2026);assert.ok(r.color.length===3&&r.color.every(c=>c>=0&&c<=255));assert.ok(existsSync(new URL('../dist/'+r.cover,import.meta.url)));const image=readFileSync(new URL('../dist/'+r.cover,import.meta.url));assert.equal(image.toString('ascii',0,4),'RIFF');assert.equal(image.toString('ascii',8,12),'WEBP');assert.ok(['www.sec.gov','www.annualreports.com'].includes(new URL(r.pdf).hostname));assert.match(r.pdf,/\.pdf$/i);assert.ok(['cover title','reporting period','archive year'].includes(r.yearBasis));if(r.yearBasis==='reporting period')assert.equal(r.year,Number(r.period.slice(0,4))); }
assert.ok(selectReports(data.reports,'amazon').length>=1);
assert.equal(selectReports(data.reports,'AMZN')[0].company,'AMAZON COM INC');
assert.ok(selectReports(data.reports,'2024').length>=1);
assert.equal(selectReports(data.reports,'no-such-company').length,0);
const universe=JSON.parse(readFileSync(new URL('universe.json',import.meta.url)));
for(const r of data.reports)assert.ok(universe.ciks.includes(r.cik));
const selected={id:'blue',color:[20,80,190]};
const samples=[selected,{id:'near-blue',color:[25,90,185]},{id:'red',color:[190,20,30]}];
assert.equal(similarReports(samples,selected)[0].id,'near-blue');
assert.ok(similarReports(data.reports,data.reports[0]).every(r=>r.id!==data.reports[0].id));
console.log(`PASS: ${data.reports.length} unique records, sources, WebP assets, fiscal years, S&P membership, ticker search and color ranking`);

const catalog=JSON.parse(readFileSync(new URL('../dist/catalog.json',import.meta.url))).reports;
assert.deepEqual(catalog.map(r=>r.id),data.reports.map(r=>r.id));
for(const r of catalog){assert.ok(r.width>0&&r.height>0);const source=data.reports.find(s=>s.id===r.id);assert.equal(r.pdf,source.pdf);assert.equal(r.cover,source.cover);assert.deepEqual(r.color,source.color)}
console.log('PASS: compact catalog matches the reviewed archive and contains intrinsic image sizes');

const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for(const source of ['app.mjs','style.css']){const [stem,ext]=source.split('.');const bytes=readFileSync(new URL('../dist/'+source,import.meta.url));const name=`${stem}-${createHash('sha256').update(bytes).digest('hex').slice(0,12)}.${ext}`;assert.ok(html.includes(name));assert.deepEqual(readFileSync(new URL('../dist/'+name,import.meta.url)),bytes)}
console.log('PASS: immutable app/style hashes match source and HTML references');
