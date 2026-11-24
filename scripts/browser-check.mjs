import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1365,height:900},acceptDownloads:true});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.APP_URL||'http://127.0.0.1:8787';
async function search(query){await page.locator('#query').fill(query);await page.locator('#search-button').click();await page.waitForFunction(()=>!document.querySelector('#search-button').disabled,{},{timeout:65000});}
try{
 await page.goto(base);assert.equal(await page.title(),'PaperLens · Research explorer');assert.equal(await page.locator('#source').inputValue(),'live');
 await page.locator('#source').selectOption('demo');await search('language');assert.equal(await page.locator('.card').count(),4);
 await page.locator('.save').first().click();await page.reload();await page.locator('#saved').click();assert.equal(await page.locator('.card').count(),1);
 const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;const stream=await download.createReadStream();let exported='';for await(const chunk of stream)exported+=chunk;assert.equal(JSON.parse(exported).papers.length,1);
 await page.locator('.save').click();assert.match(await page.locator('#status').textContent(),/^0 papers/);assert.equal(await page.locator('.card').count(),0);
 await page.locator('#explore').click();await page.locator('#source').selectOption('demo');await page.locator('#year').selectOption('2020');await search('language');assert.equal(await page.locator('.card').count(),3);
 await page.locator('#sort').selectOption('newest');await search('language');assert.match(await page.locator('.card').first().textContent(),/LoRA/);
 await search('zzzznomatchingtopic');assert.equal(await page.locator('.card').count(),0);assert.match(await page.locator('#results').textContent(),/No matching/);
 await page.locator('#year').selectOption('0');await search('constructor');assert.doesNotMatch(await page.locator('#notice').textContent(),/not iterable/);
 await page.route('**/api/search',route=>route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'error',message:'Sources unavailable (test)'})+'\n'}));await search('test error');assert.match(await page.locator('#notice').textContent(),/Sources unavailable/);await page.unroute('**/api/search');
 await page.locator('#source').selectOption('live');await search('agriculture water');assert.ok(await page.locator('.card').count()>0);assert.match(await page.locator('#status').textContent(),/live research/);console.log('Live results:',await page.locator('.card').count());
 for(const width of [1365,768,390,320]){await page.setViewportSize({width,height:900});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`Horizontal overflow at ${width}px`);}
 await page.screenshot({path:'/tmp/paperlens-mobile.png',fullPage:false});
 await page.setViewportSize({width:1365,height:900});await page.screenshot({path:'/tmp/paperlens-desktop.png',fullPage:false});
 assert.deepEqual(errors,[]);console.log('PASS: search, bookmarks, persistence, export, removal, filters, sorting, empty results, errors, live retrieval, responsive widths, no JavaScript errors.');
}finally{await browser.close();}
