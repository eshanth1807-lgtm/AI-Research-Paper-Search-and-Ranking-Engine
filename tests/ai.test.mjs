import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeQuery} from '../query.mjs';
import {isAdultContent,extractSummary,adultFlags,summarizePapers} from '../ai.mjs';
const papers=[{id:'1',title:'Artificial intelligence',abstract:'Artificial intelligence supports classification. This study compares two learning methods.'}];
test('misspellings and acronyms are normalized, unknown names stay intact',()=>{
 assert.equal(normalizeQuery('ariticial intelligence').query,'artificial intelligence');
 assert.equal(normalizeQuery('artifical inteligence').query,'artificial intelligence');
 assert.equal(normalizeQuery('AI').query,'artificial intelligence');
 assert.equal(normalizeQuery('Eshanth தமிழ்').query,'eshanth தமிழ்');
});
test('adult filter blocks explicit queries without blocking educational topics',()=>{
 for(const query of ['porn videos','p0rn','１８＋ content','erotic stories','ஆபாச'])assert.equal(isAdultContent(query),true,query);
 for(const query of ['breast cancer treatment','sexual health education','artificial intelligence','18 year old students'])assert.equal(isAdultContent(query),false,query);
});
test('extracts use abstract text and never invent a missing abstract',()=>{
 assert.equal(extractSummary(papers[0],'classification').kind,'extract');
 assert.match(extractSummary(papers[0],'classification').text,/supports classification/);
 assert.equal(extractSummary({title:'Paper'},'test').kind,'unavailable');
});
test('no API key produces an explicitly labeled extract fallback',async t=>{
 const previous=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;t.after(()=>{if(previous!==undefined)process.env.OPENAI_API_KEY=previous;else delete process.env.OPENAI_API_KEY;});
 const result=await summarizePapers(papers,'AI',()=>{throw Error('Must not call AI without a key');});assert.equal(result.kind,'extract');
});
test('AI overview uses abstracts, bounded tokens, source references and moderation',async t=>{
 const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-placeholder';t.after(()=>{if(previous!==undefined)process.env.OPENAI_API_KEY=previous;else delete process.env.OPENAI_API_KEY;});
 const calls=[];
 const fetcher=async(url,options)=>{const body=JSON.parse(options.body);calls.push(url);assert.ok(options.headers.Authorization);if(url.endsWith('/responses')){assert.equal(body.store,false);assert.equal(body.max_output_tokens,650);assert.equal(JSON.parse(body.input).sources[0].id,'1');return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Based on the abstracts, AI supports classification [1].'}]}]})};}return {ok:true,json:async()=>({results:[{categories:{sexual:false,'sexual/minors':false}}]})};};
 const result=await summarizePapers(papers,'AI',fetcher);assert.equal(result.kind,'ai');assert.equal(result.sources[0].id,'1');assert.equal(calls.length,2);
 await assert.rejects(adultFlags(['test'],async()=>({ok:false,status:503})),/HTTP 503/);
 await assert.rejects(summarizePapers(papers,'AI',async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Unsupported source [99].'}]}]})})),/source references/);
});
