import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {rank} from '../ranking.mjs';
import {server,parseFeed} from '../server.mjs';
let base, blocked=false;
before(async()=>{await new Promise((resolve,reject)=>{server.once('error',error=>{if(error.code==='EPERM'){blocked=true;resolve();}else reject(error);});server.listen(0,'127.0.0.1',resolve);});if(!blocked)base=`http://127.0.0.1:${server.address().port}`;});
after(()=>server.listening?new Promise(resolve=>server.close(resolve)):undefined);
const papers=[{id:'1',title:'Language model',abstract:'Natural language processing',year:2020},{id:'2',title:'Robotics',abstract:'Robot motion planning',year:2024}];
async function request(method,url,body=''){
 const req=Readable.from([body]);req.method=method;req.url=url;
 const res={status:200,body:'',destroyed:false,setHeader(){},writeHead(status){this.status=status;},write(chunk){this.body+=chunk;},end(chunk=''){this.body+=chunk;}};
 await server.listeners('request')[0](req,res);return res;
}
test('request handler serves assets without a socket',async()=>{for(const route of ['/','/app.js','/style.css','/api/health']){const r=await request('GET',route);assert.equal(r.status,200);assert.ok(r.body.length>0);}assert.equal((await request('GET','/missing')).status,404);});
test('request handler streams demo results without a socket',async()=>{const r=await request('POST','/api/search',JSON.stringify({query:'language',source:'demo'}));const events=r.body.trim().split('\n').map(JSON.parse);assert.ok(events.some(e=>e.stage==='RANKING'));assert.ok(events.find(e=>e.type==='results').results.length>0);});
test('request handler rejects invalid filters without a socket',async()=>{const r=await request('POST','/api/search',JSON.stringify({query:'language',year:-1}));assert.ok(r.body.includes('"type":"error"'));});
test('acronyms expand and unrelated papers are excluded',()=>assert.equal(rank(papers,'LLM').results[0].id,'1'));
test('newest sorting still excludes unrelated papers',()=>assert.deepEqual(rank(papers,'language','newest').results.map(p=>p.id),['1']));
test('year filter and empty corpus are safe',()=>{assert.equal(rank(papers,'language','relevance',2021).results.length,0);assert.deepEqual(rank([],'test').results,[]);});
test('Atom metadata and entities are parsed',()=>{const result=parseFeed('<feed><entry><id>http://arxiv.org/abs/1234.5678v1</id><title>A &amp; B</title><summary>Example</summary><published>2021-01-01</published><author><name>Author</name></author><category term="cs.AI"/></entry></feed>');assert.equal(result[0].title,'A & B');assert.equal(result[0].year,2021);assert.equal(result[0].category,'cs.AI');assert.throws(()=>parseFeed('<html>Unavailable</html>'));});
test('application assets load',async t=>{if(blocked)return t.skip('Sandbox blocks local ports');for(const route of ['/','/app.js','/style.css','/api/health'])assert.equal((await fetch(base+route)).status,200);assert.equal((await fetch(base+'/missing')).status,404);});
test('demo search streams real results and observable logs',async t=>{if(blocked)return t.skip('Sandbox blocks local ports');const response=await fetch(base+'/api/search',{method:'POST',body:JSON.stringify({query:'language',source:'demo'})});const events=(await response.text()).trim().split('\n').map(JSON.parse);const result=events.find(e=>e.type==='results');assert.ok(result.results.length>0);assert.equal(result.source,'demo');assert.ok(events.some(e=>e.stage==='RANKING'));});
test('invalid input emits a readable error',async t=>{if(blocked)return t.skip('Sandbox blocks local ports');for(const body of ['{',JSON.stringify({query:'x'}),JSON.stringify({query:'test',source:'unknown'})]){const r=await fetch(base+'/api/search',{method:'POST',body});assert.ok((await r.text()).includes('"type":"error"'));}});

test('live search retains distinct version-like DOIs, deduplicates repeats, and uses cache',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async url=>{calls++;if(String(url).includes('crossref'))return {ok:true,json:async()=>({message:{items:[{DOI:'10.1/fixturev1',title:['Fixture agriculture'],published:{'date-parts':[[2020]]}},{DOI:'10.1/fixturev2',title:['Fixture agriculture'],published:{'date-parts':[[2024]]}},{DOI:'10.1/fixturev2',title:['Fixture agriculture'],published:{'date-parts':[[2024]]}}]}})};return {ok:true,text:async()=>'<feed></feed>'};});
 const body=JSON.stringify({query:'fixture agriculture',source:'live',sort:'newest'});
 const first=(await request('POST','/api/search',body)).body.trim().split('\n').map(JSON.parse).find(e=>e.type==='results');assert.equal(first.results.length,2);assert.equal(first.results[0].year,2024);
 const second=(await request('POST','/api/search',body)).body.trim().split('\n').map(JSON.parse).find(e=>e.type==='results');assert.equal(second.cacheHit,true);assert.equal(calls,2);
});
test('one failed source preserves results and shows a warning',async t=>{
 t.mock.method(globalThis,'fetch',async url=>{if(String(url).includes('crossref'))return {ok:true,json:async()=>({message:{items:[{DOI:'10.1/partial',title:['Partial test']}]}})};throw Error('Provider unavailable');});
 const events=(await request('POST','/api/search',JSON.stringify({query:'partial test',source:'live'}))).body.trim().split('\n').map(JSON.parse);const result=events.find(e=>e.type==='results');assert.equal(result.results.length,1);assert.equal(result.warnings.length,1);
});
test('both unavailable sources return an explicit error',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw Error('Offline');});
 const events=(await request('POST','/api/search',JSON.stringify({query:'both offline',source:'live'}))).body.trim().split('\n').map(JSON.parse);assert.ok(events.some(e=>e.type==='error'));assert.ok(!events.some(e=>e.type==='results'));
});

test('misspelled artificial intelligence is corrected before retrieval and returns summaries',async t=>{
 let sentQuery='';
 t.mock.method(globalThis,'fetch',async url=>{if(String(url).includes('crossref')){sentQuery=new URL(url).searchParams.get('query');return {ok:true,json:async()=>({message:{items:[{DOI:'10.1/intelligence',title:['Artificial intelligence applications'],abstract:'Artificial intelligence supports learning tasks.'}]}})};}return {ok:true,text:async()=>'<feed></feed>'};});
 const events=(await request('POST','/api/search',JSON.stringify({query:'ariticial intelligence',source:'live'}))).body.trim().split('\n').map(JSON.parse);
 assert.equal(sentQuery,'artificial intelligence');const result=events.find(e=>e.type==='results');assert.equal(result.corrected,true);assert.equal(result.results.length,1);assert.equal(result.results[0].summary.kind,'extract');assert.ok(events.some(e=>e.type==='summary'));
});
test('adult queries are blocked before calling any external source',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{assert.fail('Blocked content must not be searched');});
 const events=(await request('POST','/api/search',JSON.stringify({query:'porn videos',source:'live'}))).body.trim().split('\n').map(JSON.parse);assert.match(events.find(e=>e.type==='error').message,/Adult/);
});

test('disconnecting a search cancels upstream fetches',async t=>{
 const {EventEmitter}=await import('node:events');const res=new EventEmitter();let cancelled=0,started=0;
 Object.assign(res,{destroyed:false,setHeader(){},write(){},end(){}});
 t.mock.method(globalThis,'fetch',async(url,options)=>new Promise((resolve,reject)=>{started++;options.signal.addEventListener('abort',()=>{cancelled++;reject(new DOMException('Aborted','AbortError'));});if(started===2){res.destroyed=true;res.emit('close');}}));
 const req=Readable.from([JSON.stringify({query:'cancellation test unique',source:'live'})]);req.method='POST';req.url='/api/search';
 await server.listeners('request')[0](req,res);assert.equal(cancelled,2);
});
