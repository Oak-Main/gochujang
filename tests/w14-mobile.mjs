import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.W14_PLAYWRIGHT_MODULE);
const browser=await chromium.launch();
const results=[];
await fs.mkdir('w14-receipts',{recursive:true});
const base=process.env.W14_BASE_URL||'http://127.0.0.1:4173';
try {
 for (const width of [320,390,768,1363]) {
  const context=await browser.newContext({viewport:{width,height:936},hasTouch:width<768,isMobile:width<768,deviceScaleFactor:1});
  const page=await context.newPage();
  for (const route of ['/','/recipes/','/recipes/dolsot-bibimbap/']) {
   const response=await page.goto(base+route,{waitUntil:'networkidle'});
   const observed={route,width,status:response?.status(),url:page.url(),title:await page.title(),bodyExcerpt:(await page.locator('body').innerText()).slice(0,600)};
   results.push({case:'navigation observation',...observed});
   assert.equal(response?.status(),200,JSON.stringify(observed));
   assert.equal(await page.locator('main').count(),1,JSON.stringify(observed));
   assert.equal(await page.locator('h1').count(),1);
   assert.equal(await page.locator('img:not([alt])').count(),0);
   const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(dims.scroll<=dims.width+1,JSON.stringify({route,width,...dims}));
   results.push({width,route,case:'landmarks, image alt attributes, no horizontal overflow',status:'PASS',...dims});
   await page.screenshot({path:'w14-receipts/'+width+'-'+(route==='/'?'home':route.includes('dolsot')?'recipe':'catalog')+'.png',fullPage:false});
  }
  await page.goto(base+'/',{waitUntil:'networkidle'});
  const cta=page.getByRole('link',{name:'Browse all 14 recipes',exact:false});
  assert.equal(await cta.count(),1);
  for(let i=0;i<25&&!await cta.evaluate(e=>e===document.activeElement);i++) await page.keyboard.press('Tab');
  assert.ok(await cta.evaluate(e=>e===document.activeElement),'CTA must be reached through Tab');
  assert.ok(await cta.evaluate(e=>e.matches(':focus-visible')),'CTA needs visible keyboard focus');
  const box=await cta.boundingBox(); assert.ok(box&&box.height>=44&&box.width>=44);
  await page.keyboard.press('Enter'); await page.waitForURL('**/recipes/');
  await page.locator('[data-recipe] h3 a').filter({hasText:'Bibimbap'}).click();
  await page.waitForURL('**/recipes/dolsot-bibimbap/');
  assert.match(await page.locator('h1').innerText(),/Dolsot Bibimbap/i);
  results.push({width,case:'W14 keyboard CTA to catalog to actual recipe',status:'PASS',ctaBox:box});
  await page.getByRole('button',{name:'Search recipes',exact:true}).click();
  assert.ok(await page.locator('#search-dialog').isVisible());
  await page.locator('#global-search').fill('chocolate');
  await page.locator('#global-search').press('Enter');
  await page.waitForURL('**/recipes/?q=chocolate');
  assert.equal(await page.locator('[data-recipe]:visible').count(),1);
  await page.locator('#collection-query').fill('zz-no-such-dish-987');
  assert.equal(await page.locator('[data-recipe]:visible').count(),0);
  assert.ok(await page.locator('.no-results').isVisible());
  await page.locator('[data-reset]').click();
  assert.equal(await page.locator('[data-recipe]:visible').count(),14);
  assert.equal(await page.locator('#collection-query').inputValue(),'');
  await page.locator('[data-filter="fusion"]').click();
  assert.equal(await page.locator('[data-filter="fusion"]').getAttribute('aria-pressed'),'true');
  await page.locator('#collection-query').fill('chocolate');
  assert.equal(await page.locator('[data-recipe]:visible').count(),1);
  await page.goto(base+'/recipes/?lane=invalid&q=chocolate',{waitUntil:'networkidle'});
  assert.equal(await page.locator('[data-filter="all"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-recipe]:visible').count(),1);
  await page.getByRole('button',{name:'Search recipes',exact:true}).click();
  await page.keyboard.press('Escape');
  assert.ok(!await page.locator('#search-dialog').isVisible());
  results.push({width,case:'search submit, no results, reset, filter combination, malformed lane deep link, Escape dialog',status:'PASS'});
  if(width<768){
   await page.getByRole('button',{name:'Open menu',exact:true}).click();
   assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');
   assert.ok(await page.locator('#mobile-menu').isVisible());
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
   results.push({width,case:'mobile menu open/Escape/expanded state',status:'PASS'});
  }
  await context.close();
 }
} catch(error) {results.push({status:'FAIL',error:String(error)});throw error}
finally {await fs.writeFile('w14-receipts/results.json',JSON.stringify({observedAt:new Date().toISOString(),base,source:process.env.GITHUB_SHA,results,limits:'Bounded Chromium viewport and keyboard/touch-emulation checks, not full accessibility compliance or field performance.'},null,2));await browser.close()}
