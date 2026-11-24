import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCrossref,searchCrossref} from '../sources.mjs';
import {queryTerms,rank} from '../ranking.mjs';
const fixture={message:{items:[{DOI:'10.1234/example',title:['Agriculture &amp; water'],author:[{given:'Anu',family:'Kumar'}],published:{'date-parts':[[2024]]},'container-title':['Water Journal']}]}};
test('Crossref records retain DOI, authors and missing abstract',()=>{const [p]=parseCrossref(fixture);assert.equal(p.title,'Agriculture & water');assert.equal(p.doi,'10.1234/example');assert.equal(p.abstract,'');assert.equal(p.year,2024);assert.equal(rank([p],'Anu Kumar').results.length,1);});
test('natural questions drop filler words and retain Unicode',()=>{assert.deepEqual(queryTerms('How can I find papers about agriculture?'),['agriculture']);assert.deepEqual(queryTerms('தமிழ் மொழி'),['தமிழ்','மொழி']);});
test('Crossref search safely encodes the query and parses results',async()=>{const papers=await searchCrossref('water & crops',async url=>{assert.equal(new URL(url).searchParams.get('query'),'water & crops');return {ok:true,json:async()=>fixture};});assert.equal(papers.length,1);});
test('provider failures and malformed responses are not treated as empty results',async()=>{await assert.rejects(searchCrossref('test',async()=>({ok:false,status:429})),/429/);assert.throws(()=>parseCrossref({}),/Invalid/);});

test('JavaScript prototype property names are valid search terms',()=>{const result=rank([{title:'constructor',abstract:'Constructor functions',year:2024}],'constructor');assert.equal(result.results.length,1);});

test('one malformed Crossref record does not discard valid papers',()=>{
 const results=parseCrossref({message:{items:[null,{DOI:123,title:['Bad']},{DOI:'10.1/empty',title:['']},{DOI:'10.1/ok',title:['Valid'],author:{}},{DOI:'10.1/ok2',title:['Also valid'],author:[null,{family:'Author'}]}]}});
 assert.equal(results.length,2);assert.deepEqual(results[0].authors,[]);assert.deepEqual(results[1].authors,['Author']);
});
test('Crossref receives and honors cancellation',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(searchCrossref('test',async(url,options)=>{options.signal.throwIfAborted();},controller.signal),{name:'AbortError'});
});
