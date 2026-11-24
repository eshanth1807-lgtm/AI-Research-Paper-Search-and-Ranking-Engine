import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const code=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
function setup(stored='[]'){
 const elements=new Map();let storage=stored,blob;
 const element=()=>({textContent:'',innerHTML:'',value:'',disabled:false,dataset:{},classList:{toggle(){}},addEventListener(type,handler){this[type]=handler;},replaceChildren(){},append(){},reportValidity(){return true;},click(){}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const context=vm.createContext({document:{getElementById:get,querySelectorAll:()=>[],createElement:element},localStorage:{getItem:()=>storage,setItem:(_,value)=>storage=value},AbortController,Blob,URL:{createObjectURL:b=>{blob=b;return 'blob:test';},revokeObjectURL(){}},setTimeout:fn=>fn(),TextDecoder,fetch:async()=>new Response(JSON.stringify({type:'results',results:[{id:'1',title:'<script>alert(1)</script>',abstract:'Language',authors:['Author'],year:2020,score:1,matches:['language']}],duration:1})+'\n')});
 vm.runInContext(code,context);get('source').value='demo';get('year').value='0';get('sort').value='relevance';get('query').value='language';
 return {get,context,run:s=>vm.runInContext(s,context),storage:()=>storage,blob:()=>blob};
}
test('frontend handles search, escaped titles, bookmark persistence, removal and JSON export',async()=>{
 const ui=setup();await ui.run('search()');assert.match(ui.get('results').innerHTML,/&lt;script&gt;/);assert.equal(ui.get('search-button').disabled,false);
 ui.get('results').click({target:{closest:()=>({dataset:{id:'1'}})}});assert.equal(JSON.parse(ui.storage()).length,1);
 ui.get('saved').onclick();assert.equal(ui.get('status').textContent,'1 papers saved in this browser');ui.get('export').onclick();assert.equal(JSON.parse(await ui.blob().text()).papers.length,1);
 ui.get('results').click({target:{closest:()=>({dataset:{id:'1'}})}});assert.equal(ui.get('status').textContent,'0 papers saved in this browser');assert.equal(ui.get('export').disabled,true);
});
test('malformed bookmark storage does not crash rendering',()=>{
 for(const stored of ['broken','{}',JSON.stringify([{id:'1',title:'Test',authors:[],matches:'bad'}])]){const ui=setup(stored);assert.doesNotThrow(()=>ui.get('saved').onclick());}
});
test('search failure re-enables submit and displays the error',async()=>{const ui=setup();ui.context.fetch=async()=>{throw Error('Offline');};await ui.run('search()');assert.equal(ui.get('notice').textContent,'Offline');assert.equal(ui.get('search-button').disabled,false);});
test('switching to reading list while search finishes preserves reading-list status',async()=>{const ui=setup();let finish;ui.context.fetch=()=>new Promise(resolve=>finish=resolve);const pending=ui.run('search()');ui.get('saved').onclick();finish(new Response(JSON.stringify({type:'results',results:[],duration:2})+'\n'));await pending;assert.equal(ui.get('status').textContent,'0 papers saved in this browser');});

test('correction notice and cited AI overview render without interpreting HTML',async()=>{
 const ui=setup();ui.context.fetch=async()=>new Response([
 {type:'results',corrected:true,normalizedQuery:'artificial intelligence',results:[{id:'1',title:'Paper',authors:[],abstract:'Example',summary:{kind:'extract',text:'Example'}}],duration:1},
 {type:'summary',kind:'ai',text:'Finding [1] <script>',sources:[{number:1,id:'1',title:'Paper'}]}
 ].map(JSON.stringify).join('\n')+'\n');
 await ui.run('search()');assert.match(ui.get('notice').textContent,/artificial intelligence/);assert.equal(ui.get('overview').hidden,false);assert.equal(ui.get('overview-text').textContent,'Finding [1] <script>');assert.match(ui.get('overview-sources').innerHTML,/https:\/\/arxiv.org/);
 ui.get('saved').onclick();assert.equal(ui.get('overview').hidden,true);
});

test('connection failure explains how to restart and does not claim no matches',async()=>{
 const ui=setup();ui.context.fetch=async()=>{throw Error('Failed to fetch');};await ui.run('search()');assert.match(ui.get('notice').textContent,/Cannot connect to PaperLens/);assert.match(ui.get('notice').textContent,/start.command/);assert.doesNotMatch(ui.get('results').innerHTML,/No matching papers/);
});

test('pagination shows ten papers, keeps global ranks, and exports the full collection',async()=>{
 const ui=setup();ui.context.fetch=async()=>new Response(JSON.stringify({type:'results',duration:1,results:Array.from({length:23},(_,i)=>({id:String(i),title:'Paper '+i,authors:[],matches:[],year:2024}))})+'\n');
 await ui.run('search()');assert.equal((ui.get('results').innerHTML.match(/<article/g)||[]).length,10);assert.equal(ui.get('previous-page').disabled,true);
 ui.get('next-page').onclick();assert.match(ui.get('results').innerHTML,/#11<\/span>/);assert.doesNotMatch(ui.get('results').innerHTML,/>Paper 0</);
 ui.get('next-page').onclick();assert.equal((ui.get('results').innerHTML.match(/<article/g)||[]).length,3);assert.equal(ui.get('next-page').disabled,true);
 ui.get('export').onclick();assert.equal(JSON.parse(await ui.blob().text()).papers.length,23);
 ui.get('saved').onclick();assert.equal(ui.get('pagination').hidden,true);
});
test('cancel search aborts request and restores usable controls',async()=>{
 const ui=setup();let aborted=false;
 ui.context.fetch=(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));}));
 const pending=ui.run('search()');assert.equal(ui.get('cancel-search').hidden,false);ui.get('cancel-search').onclick();await pending;
 assert.equal(aborted,true);assert.equal(ui.get('search-button').disabled,false);assert.equal(ui.get('cancel-search').hidden,true);assert.match(ui.get('status').textContent,/cancelled/);
});
