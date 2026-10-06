const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const baseURL=process.env.REPORTS_BASE_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce',recordVideo:{dir:'/private/tmp/annual-report-atlas-demo/alignment',size:{width:1600,height:1000}}});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function check(width,label){
  await page.setViewportSize({width,height:1000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#gallery img')].slice(0,5).every(i=>i.complete&&i.naturalWidth));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const geometry=await page.locator('#gallery').evaluate(g=>{
   const hero=g.querySelector('.selected-card'),img=hero.querySelector('img'),b=img.getBoundingClientRect(),caption=hero.querySelector('.card-caption').getBoundingClientRect(),stage=hero.querySelector('.cover-stage').getBoundingClientRect();
   const columns=getComputedStyle(g).gridTemplateColumns.split(' ').length,n=columns-2,neighbors=[...g.children].slice(1,1+n*2);
   return {imageRatio:b.width/b.height,sourceRatio:img.naturalWidth/img.naturalHeight,captionInside:caption.left>=b.left-1&&caption.right<=b.right+1,imageInside:b.left>=stage.left-1&&b.right<=stage.right+1&&b.top>=stage.top-1&&b.bottom<=stage.bottom+1,overflow:document.documentElement.scrollWidth>innerWidth,topGap:innerWidth>760?b.top-neighbors[0].querySelector('.cover-stage').getBoundingClientRect().top:0,bottomGap:innerWidth>760?caption.bottom-Math.max(...neighbors.slice(n).map(c=>c.querySelector('.card-caption').getBoundingClientRect().bottom)):0,toolbarGap:document.querySelector('#pdf-link').getBoundingClientRect().left-caption.left};
  });
  assert.ok(Math.abs(geometry.imageRatio-geometry.sourceRatio)<.002,`${label}/${width}: image proportions ${JSON.stringify(geometry)}`);
  assert.ok(geometry.captionInside&&geometry.imageInside&&!geometry.overflow,`${label}/${width}: image/caption bounds ${JSON.stringify(geometry)}`);
  assert.ok(Math.abs(geometry.topGap)<2&&Math.abs(geometry.bottomGap)<2,`${label}/${width}: row alignment ${JSON.stringify(geometry)}`);
  if(width>760)assert.ok(Math.abs(geometry.toolbarGap)<2,`${label}/${width}: toolbar alignment`);
  await page.screenshot({path:`/private/tmp/annual-report-atlas-demo/alignment-${label}-${width}.png`});
 }
 await page.goto(new URL('?view=featured',baseURL).href);
 // Effective CSS viewport widths cover desktop zoom and the four/three/two-column breakpoints.
 for(const width of [1600,1440,1280,1101,1100,1000,900,800,761,760,590,390,320,1440])await check(width,'featured');
 await page.goto(new URL('?view=all',baseURL).href);
 await page.locator('#search').fill('ALTRIA');await page.locator('#gallery .card').first().click();
 for(const width of [1440,1000,800,390,1440])await check(width,'selected');
 await page.keyboard.press('Escape');assert.equal(await page.locator('.selected-card').count(),0);
 assert.equal(await page.locator('#gallery').evaluate(g=>g.style.getPropertyValue('--cover-height')),'');
 assert.deepEqual(errors,[]);
 const video=page.video();await context.close();await video.saveAs('/private/tmp/annual-report-atlas-demo/alignment.webm');await browser.close();
 console.log('PASS: 19 featured/selected viewport scenarios, breakpoint and zoom-equivalent row alignment, proportions, caption/toolbar bounds, mobile overflow and reset');
})().catch(e=>{console.error(e);process.exit(1)});
