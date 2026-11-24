import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createAdmin} from './admin.mjs';
import {networkInterfaces} from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {rank,queryTerms} from './ranking.mjs';
import {searchCrossref} from './sources.mjs';
import {normalizeQuery} from './query.mjs';
import {aiEnabled,isAdultContent,adultFlags,extractSummary,summarizePapers} from './ai.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
// Keep credentials on the server. An existing environment variable takes precedence.
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{process.loadEnvFile(path.join(ROOT,'.env'));}catch(error){if(error.code!=='ENOENT')console.error('Could not load .env configuration.');}
}
const cache=new Map(); let nextRequest=0; let retrieval=Promise.resolve(); let queued=0;
async function fetchFeed(url,signal){
 if(queued>=10)throw Error('Search queue is busy. Please try again shortly.');
 queued++;
 const task=retrieval.then(async()=>{
   signal?.throwIfAborted();
   const wait=Math.max(0,nextRequest-Date.now());
   if(wait)await delay(wait,undefined,{signal});
   try{
     const response=await fetch(url,{headers:{'User-Agent':'PaperLens/1.0 (local academic research tool)'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
     if(!response.ok)throw Error(`arXiv returned HTTP ${response.status}. Try again later or select Demo collection.`);
     return await response.text();
   }finally{nextRequest=Date.now()+3100;}
 });
 retrieval=task.catch(()=>{});
 try{return await task;}finally{queued--;}
}
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0]==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&amp;/g,'&');
const tag=(s,n)=>decode((s.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`))||[])[1]||'').replace(/\s+/g,' ').trim();
export function parseFeed(xml){
 if(!xml.includes('<feed')) throw Error('Invalid response from arXiv');
 return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([,s])=>{
 const id=tag(s,'id').split('/abs/')[1]; if(!id)throw Error(tag(s,'summary')||'arXiv returned an invalid paper');
 return {id,provider:'arXiv',title:tag(s,'title'),abstract:tag(s,'summary'),authors:[...s.matchAll(/<author>([\s\S]*?)<\/author>/g)].map(([,a])=>tag(a,'name')),year:Number(tag(s,'published').slice(0,4)),category:(s.match(/<category[^>]*term="([^"]+)"/)||[])[1]||'Research'};
 });
}
const adminHandler=createAdmin({root:ROOT,trustTunnel:process.env.PAPERLENS_TRUST_TUNNEL==='1'});
export const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(await adminHandler(req,res,url))return;
 if(req.method==='GET'&&url.pathname==='/api/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({status:'ok',engine:'BM25 + acronym expansion',cachedQueries:cache.size,version:'1.3',aiEnabled:aiEnabled(),contentFilter:aiEnabled()?'local + AI':'local keywords'}));}
 if(req.method==='POST'&&url.pathname==='/api/search'){
   const cancellation=new AbortController();const signal=cancellation.signal;
   res.once?.('close',()=>cancellation.abort());
   res.setHeader('Content-Type','application/x-ndjson');res.setHeader('Cache-Control','no-store');
   const emit=(type,data)=>{if(!res.destroyed)res.write(JSON.stringify({type,time:new Date().toISOString(),...data})+'\n');};
   const log=(stage,message)=>{emit('log',{stage,message});console.log(`[${stage}] ${message}`);};
   const started=Date.now();
   try{
     let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)throw Error('Request too large');}
     const {query,source='live',sort='relevance',year=0}=JSON.parse(body);
     if(typeof query!=='string'||query.trim().length<2||query.length>200)throw Error('Enter a search between 2 and 200 characters.');
     if(!['live','demo'].includes(source)||!['relevance','newest'].includes(sort)||!Number.isInteger(Number(year))||Number(year)<0||Number(year)>2100)throw Error('Invalid search filters.');
     const normalized=normalizeQuery(query);
     if(isAdultContent(query)||isAdultContent(normalized.query))throw Error('Adult or sexually explicit content is not supported. Please search for an educational topic.');
     if((await adultFlags([normalized.query]))[0])throw Error('This search was blocked by the adult-content filter.');
     log('RECEIVED',`Search accepted: ${query.trim()}`);
     if(normalized.changed)log('QUERY',`Searching for: ${normalized.query}`);
     let papers;let hit=false;let warnings=[];
     if(source==='demo'){papers=JSON.parse(await fs.readFile(path.join(ROOT,'data/demo.json'),'utf8'));log('RETRIEVAL','Loaded 6 bundled demonstration records; synopses are paraphrased.');}
     else {
       const terms=queryTerms(normalized.query);
       if(!terms.length)throw Error('Enter a topic, title, author, or meaningful search phrase.');
       const key=terms.join(' ');const cached=cache.get(key);
       if(cached && Date.now()-cached.time<3600000){papers=cached.papers;hit=true;log('CACHE','Reused cached records.');}
       else{
         log('RETRIEVAL','Searching Crossref across disciplines and arXiv in parallel.');
         const params=new URLSearchParams({search_query:terms.slice(0,20).map(t=>'all:'+t).join(' OR '),start:'0',max_results:'50',sortBy:'relevance'});
         const responses=await Promise.allSettled([searchCrossref(terms.join(' '),fetch,signal),fetchFeed('https://export.arxiv.org/api/query?'+params,signal).then(parseFeed)]);
         signal.throwIfAborted();
         papers=[];
         responses.forEach((response,i)=>{
           const provider=i===0?'Crossref':'arXiv';
           if(response.status==='fulfilled'){papers.push(...response.value);log('RETRIEVAL',provider+': '+response.value.length+' records retrieved.');}
           else{warnings.push(provider+' is unavailable. Results may be incomplete.');log('WARNING',provider+' could not complete this search.');}
         });
         if(responses.every(r=>r.status==='rejected'))throw Error('Live sources are unavailable. Check your internet connection and try again.');
         if(!warnings.length){cache.set(key,{time:Date.now(),papers});if(cache.size>100)cache.delete(cache.keys().next().value);}
       }
     }
     signal.throwIfAborted();
     papers=[...new Map(papers.map(p=>[p.doi?'doi:'+p.doi.toLowerCase():p.id.replace(/v\d+$/,''),p])).values()];
     const flags=await adultFlags(papers.map(p=>p.title+'\n'+p.abstract));
     const removed=flags.filter(Boolean).length;
     papers=papers.filter((_,i)=>!flags[i]);
     if(removed)warnings.push(`${removed} records were withheld by the adult-content filter.`);
     log('RANKING','Tokenizing titles and abstracts; applying BM25 with title weighting and acronym expansion.');
     const ranked=rank(papers,normalized.query,sort,Number(year));
     ranked.results=ranked.results.map(p=>({...p,summary:extractSummary(p,normalized.query)}));
     log('FILTER',`${ranked.results.length} results after year and relevance filters.`);
     const duration=Date.now()-started;
     log('COMPLETE',`Finished in ${duration} ms. Scores are lexical relevance, not confidence probabilities.`);
     emit('results',{...ranked,warnings,source,cacheHit:hit,duration,candidates:papers.length,normalizedQuery:normalized.query,corrected:normalized.changed,aiEnabled:aiEnabled()});
     if(ranked.results.length){
       log('SUMMARY',aiEnabled()?'Generating an AI overview from up to five matching abstracts.':'Preparing abstract extracts. AI overview requires a server API key.');
       try{emit('summary',await summarizePapers(ranked.results,normalized.query));}
       catch{emit('summary',{kind:'unavailable',text:'AI overview is unavailable. Check the server API key, quota, or connection. Abstract extracts remain available.',sources:[]});}
     }
   }catch(error){if(!signal.aborted){log('ERROR',error.message);emit('error',{message:error.message});}}
   return res.end();
 }
 const routes={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/admin':['admin.html','text/html'],'/admin.js':['admin.js','text/javascript'],'/admin.css':['admin.css','text/css'],'/visit.js':['visit.js','text/javascript']};
 if(req.method==='GET'&&routes[url.pathname]){try{const [file,type]=routes[url.pathname];res.setHeader('Content-Type',type+'; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.end(await fs.readFile(path.join(ROOT,'public',file)));}catch{res.writeHead(500);res.end('Unable to load application');}return;}
 res.writeHead(404);res.end('Not found');
});
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||8787);
 if(!Number.isInteger(port)||port<1||port>65535){
   console.error('PORT must be a whole number between 1 and 65535.');
   process.exitCode=1;
 }else{
   const address=`http://127.0.0.1:${port}`;
   server.once('error',async error=>{
     if(error.code==='EADDRINUSE'){
       let isPaperLens=false;
       try{
         const response=await fetch(address+'/api/health',{signal:AbortSignal.timeout(2000)});
         const health=await response.json();
         isPaperLens=response.ok&&health.status==='ok'&&health.engine==='BM25 + acronym expansion';
       }catch{}
       if(isPaperLens){
         console.log(`PaperLens is already running. Open ${address} in your browser.`);
         console.log('You can close this Terminal window; the existing app will keep running.');
       }else{
         console.error(`Port ${port} is being used by another application.`);
         console.error(`Start PaperLens on another port: PORT=${port===65535?8787:port+1} ./start.command`);
         process.exitCode=1;
       }
     }else{
       console.error(`Unable to start PaperLens: ${error.message}`);
       process.exitCode=1;
     }
   });
   const host=process.env.PAPERLENS_HOST||'127.0.0.1';
   server.listen(port,host,()=>{
     console.log(`PaperLens running at ${address}`);
     if(host==='0.0.0.0'){
       const addresses=[...new Set(Object.values(networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal).map(a=>a.address))];
       console.log('Other devices must connect to the same Wi-Fi. Open one of these network addresses:');
       for(const ip of addresses)console.log(`  http://${ip}:${port}`);
       if(!addresses.length)console.log('No network address found. Connect to Wi-Fi and restart.');
     }
     console.log('Keep this Terminal open. Press Control+C to stop access for everyone.');
   });
 }
}
