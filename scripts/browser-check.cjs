const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:'/private/tmp/annual-report-atlas-demo',size:{width:1440,height:1000}}});
 const page=await context.newPage();const data=JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'../dist/reports.json')));const initialCount=Math.min(48,data.reports.length);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/');await page.waitForFunction(n=>document.querySelectorAll('#gallery .card').length>=n,initialCount);
 assert.equal(await page.locator('#gallery .card').first().evaluate(el=>getComputedStyle(el).contentVisibility),'auto');
 await page.locator('#gallery img').first().waitFor();await page.waitForTimeout(1200);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgba(0, 0, 0, 0)');
 assert.ok(await page.locator('#gallery .card').first().evaluate(card=>{const img=card.querySelector('img'),stage=card.querySelector('.cover-stage').getBoundingClientRect(),caption=card.querySelector('.card-caption').getBoundingClientRect();const w=Math.min(stage.width,stage.height*img.naturalWidth/img.naturalHeight);return caption.left>=stage.left+(stage.width-w)/2-1&&caption.right<=stage.left+(stage.width+w)/2+1}));
 await page.screenshot({path:'/private/tmp/annual-report-atlas-demo/gallery.png',fullPage:false});
 await page.locator('#search').fill('ALTRIA');await page.waitForTimeout(900);assert.ok(await page.locator('#gallery .card').count()>=1);
 await page.locator('#gallery .card').first().click();await page.waitForTimeout(1500);assert.equal(await page.locator('#similar .card').count(),4);
 assert.match(await page.locator('#pdf-link').getAttribute('href'),/^https:\/\/www.sec.gov\/.*\.pdf$/);
 await page.screenshot({path:'/private/tmp/annual-report-atlas-demo/similar.png'});
 const next=await page.locator('#similar .card').first().getAttribute('aria-label');
 await page.locator('#similar .card').first().click();await page.waitForTimeout(1500);
 const name=(await page.locator('#detail-company').textContent()).split(' · ')[0];assert.ok(next.toLowerCase().includes(name.toLowerCase()));
 await page.keyboard.press('Escape');await page.locator('#search').fill('no-such-company');assert.equal(await page.locator('#empty').isVisible(),true);
 await page.locator('#empty-reset').click();assert.ok(await page.locator('#gallery .card').count()>=initialCount);
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('#gallery img')).slice(0,4).every(i=>i.complete&&i.naturalWidth>0));
 if(data.reports.length>48){await page.locator('#gallery .card').last().scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelectorAll('#gallery .card').length>48);}
 const video=page.video();await context.close();await video.saveAs('/private/tmp/annual-report-atlas-demo/annual-report-atlas.webm');
 const mobile=await browser.newContext({viewport:{width:390,height:844}});const m=await mobile.newPage();await m.goto('http://127.0.0.1:8765/');await m.waitForFunction(n=>document.querySelectorAll('#gallery .card').length>=n,initialCount);
 assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await m.locator('#gallery .card').first().click();await m.locator('#similar').scrollIntoViewIfNeeded();assert.equal(await m.locator('#similar .card').count(),4);await m.screenshot({path:'/private/tmp/annual-report-atlas-demo/mobile.png'});
 await mobile.close();await browser.close();assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile images, search, fiscal year, empty state, PDF link, similar covers, Escape and no overflow; demo saved');
})().catch(e=>{console.error(e);process.exit(1)});
