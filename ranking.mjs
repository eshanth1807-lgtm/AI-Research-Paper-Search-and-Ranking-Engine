const stopwords = new Set('the a an of for and in to with on is are was were how what why when can does do i me find show papers research about please explain'.split(' '));
export const tokenize = text => (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu) || []).filter(t => !stopwords.has(t));
export const queryTerms = query => [...new Set(tokenize(query))];
const expansions = { ai:['artificial','intelligence'], llm:['language','model'], llms:['language','models'], nlp:['natural','language','processing'] };
export function rank(papers, query, sort='relevance', year=0) {
  const tokens = [...new Set(tokenize(query).flatMap(t=>[t,...(Object.hasOwn(expansions,t)?expansions[t]:[])]))];
  const docs = papers.map(p=>tokenize(p.title+' '+p.title+' '+p.abstract+' '+(p.authors||[]).join(' ')));
  const avg = docs.reduce((a,d)=>a+d.length,0)/(docs.length||1) || 1;
  const df = Object.fromEntries(tokens.map(t=>[t,docs.filter(d=>d.includes(t)).length]));
  const results = papers.map((p,i)=>{
    const d=docs[i]; let score=0; const matches=[];
    for(const t of tokens){const tf=d.filter(w=>w===t).length; if(tf){matches.push(t);score+=Math.log(1+(docs.length-df[t]+0.5)/(df[t]+0.5))*tf*2.5/(tf+1.5*(0.25+0.75*d.length/avg));}}
    return {...p,score:Math.round(score*1000)/1000,matches};
  }).filter(p=>Number(p.year)>=year && p.score>0);
  results.sort((a,b)=>sort==='newest'?b.year-a.year||b.score-a.score:b.score-a.score||b.year-a.year);
  return {results,tokens};
}
