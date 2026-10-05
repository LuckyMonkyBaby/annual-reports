import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {selectReports,similarReports} from '../dist/app.mjs';
const data=JSON.parse(readFileSync(new URL('../dist/reports.json',import.meta.url)));
assert.equal(data.reports.length,10);
for(const r of data.reports){assert.equal(r.form,'ARS');assert.ok(r.incorporation);assert.ok(r.color.length===3&&r.color.every(c=>c>=0&&c<=255));assert.ok(existsSync(new URL('../dist/'+r.cover,import.meta.url)));assert.equal(new URL(r.pdf).hostname,'www.sec.gov');assert.match(r.pdf,/\.pdf$/i);assert.ok(['cover title','reporting period'].includes(r.yearBasis));if(r.yearBasis==='reporting period')assert.equal(r.year,Number(r.period.slice(0,4))); }
assert.equal(selectReports(data.reports,'amazon').length,1);
assert.equal(selectReports(data.reports,'AMZN')[0].company,'AMAZON COM INC');
assert.equal(selectReports(data.reports,'2024').length,10);
assert.equal(selectReports(data.reports,'no-such-company').length,0);
const universe=JSON.parse(readFileSync(new URL('universe.json',import.meta.url)));
for(const r of data.reports)assert.ok(universe.ciks.includes(r.cik));
const selected={id:'blue',color:[20,80,190]};
const samples=[selected,{id:'near-blue',color:[25,90,185]},{id:'red',color:[190,20,30]}];
assert.equal(similarReports(samples,selected)[0].id,'near-blue');
assert.ok(similarReports(data.reports,data.reports[0]).every(r=>r.id!==data.reports[0].id));
console.log('PASS: 10 records, sources, assets, fiscal years, filters, ticker search and color ranking');
