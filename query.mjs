const corrections={ariticial:'artificial',artifical:'artificial',artificiall:'artificial',inteligence:'intelligence',intelligance:'intelligence',intellegence:'intelligence',machin:'machine',lerning:'learning',nuero:'neuro',algoritm:'algorithm',agriculure:'agriculture'};
const vocabulary=['artificial','intelligence','learning','machine','agriculture','computer','science','transformer','neural','climate','quantum','biology','chemistry','physics','psychology','education','language','robotics','medicine'];
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next[j+1]=Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]===b[j]?0:1));row=next;}return row[b.length];}
export function normalizeQuery(value){
 const original=value.normalize('NFKC').trim().replace(/\s+/g,' ');
 let query=original.toLowerCase().replace(/[a-z]+/g,word=>{
   if(Object.hasOwn(corrections,word))return corrections[word];
   if(word.length<6||vocabulary.includes(word))return word;
   const near=vocabulary.filter(candidate=>distance(word,candidate)===1);
   return near.length===1?near[0]:word;
 });
 query=query.replace(/\bai\b/g,'artificial intelligence').replace(/\bllms?\b/g,'large language models').replace(/\bnlp\b/g,'natural language processing');
 return {original,query,changed:query!==original.toLowerCase()};
}
