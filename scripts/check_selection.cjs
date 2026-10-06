const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.REPORTS_BASE_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch();
 for(const width of [1440,1000,390]){
  const context=await browser.newContext({viewport:{width,height:900},recordVideo:width===1440?{dir:'/private/tmp/annual-report-atlas-demo/selection',size:{width:1440,height:900}}:undefined});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.snapshots=0;const start=document.startViewTransition?.bind(document);if(start)document.startViewTransition=fn=>{window.snapshots++;return start(fn)}});
  await page.goto(new URL('?view=all',base).href);
  await page.waitForResponse(r=>r.url().includes('catalog.json')).catch(()=>{});
  const card=page.locator('#gallery>.card').nth(32);
  await card.scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelectorAll('#gallery>.card')][32]?.querySelector('img').naturalWidth>0);
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(()=>scrollY>1500));
  await page.route('**/covers/**',async r=>{await new Promise(resolve=>setTimeout(resolve,1000));await r.continue().catch(()=>{})});
  await card.evaluate(c=>{const img=c.querySelector('img');window.startRect=img.getBoundingClientRect().toJSON();window.clickedAt=performance.now();c.click();window.overlayRect=document.querySelector('.cover-opening')?.getBoundingClientRect().toJSON();window.openMs=performance.now()-window.clickedAt;});
  const start=await page.evaluate(()=>({from:window.startRect,overlay:window.overlayRect,ms:window.openMs,snapshots:window.snapshots,scroll:scrollY}));
  assert.ok(start.overlay,`No opening overlay at ${width}`);
  for(const key of ['left','top','width','height'])assert.ok(Math.abs(start.from[key]-start.overlay[key])<1,`${width}: ${key} jumped`);
  assert.equal(start.snapshots,0);assert.equal(start.scroll,0);
  assert.ok(await page.locator('.cover-opening').evaluate(c=>c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data[3]===255),'The moving cover must already contain decoded artwork');
  const animation=await page.locator('.cover-opening').evaluate(e=>e.getAnimations()[0].effect.getTiming());assert.equal(animation.duration,600);
  await page.waitForTimeout(180);await page.screenshot({path:`/private/tmp/annual-report-atlas-demo/selection-mid-${width}.png`});
  await page.locator('.cover-opening').waitFor({state:'detached'});
  assert.equal(await page.locator('.selected-card img').evaluate(i=>getComputedStyle(i).visibility),'visible');
  assert.equal(await page.locator('#gallery>.card').count(),13);
  await page.locator('.card:not(.selected-card)').first().click();
  await page.locator('#search').fill('goldman');await page.locator('.cover-opening').waitFor({state:'detached'});
  assert.equal(await page.locator('.selected-card').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#gallery>.card').first().click();assert.equal(await page.locator('.cover-opening').count(),0);
  assert.deepEqual(errors,[]);
  const video=width===1440?page.video():null;await context.close();if(video)await video.saveAs('/private/tmp/annual-report-atlas-demo/selection-opening.webm');
  console.log(`PASS ${width}px: far-down click starts at original cover bounds, resets underneath, no page snapshot, 600ms expansion, delayed images, interruption and reduced motion (${start.ms.toFixed(1)}ms setup)`);
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
