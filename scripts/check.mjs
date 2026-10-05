import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {selectReports,similarReports,foldPaper} from '../dist/app.mjs';
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

for(const [w,h,diagonal] of [[1360,765,true],[350,466,false]]){
 const area=points=>Math.abs(points.reduce((sum,[x,y],i)=>{const [xx,yy]=points[(i+1)%points.length];return sum+x*yy-xx*y},0))/2;
 let previous=w*h;
 for(const p of [.001,.1,.25,.5,.75,.9,1]){
  const shape=foldPaper(w,h,p,diagonal),remaining=area(shape.front);
  assert.ok(remaining<=previous+1);previous=remaining;
  assert.ok(shape.front.every(([x,y])=>x>=-.001&&x<=w+.001&&y>=-.001&&y<=h+.001));
  const dx=2.25*w*p,dy=diagonal?2.25*h*p:h*(.4*Math.sin(Math.PI*p)+.08*p);
  assert.ok(shape.back.some(([x,y])=>Math.hypot(x-(w-dx),y-(h-dy))<.001));
  assert.ok(shape.crease.every(q=>shape.front.some(f=>Math.hypot(q[0]-f[0],q[1]-f[1])<.001)));
 }
 assert.equal(previous,0);
 const back=foldPaper(w,h,.5,diagonal).back;
 assert.ok(back.some((q,i)=>i%16===8&&Math.hypot(q[0]-(back[i-8][0]+back[(i+8)%back.length][0])/2,q[1]-(back[i-8][1]+back[(i+8)%back.length][1])/2)>1),'The lifted underside must bend rather than stay a rigid triangle');
}
console.log('PASS: bottom-right paper fold reflects the dragged corner, anchors its crease and progressively reveals both cover orientations');
