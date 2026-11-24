// Crossref includes journals, books and proceedings across research disciplines.
const plain=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
export function parseCrossref(data){
 if(!Array.isArray(data?.message?.items))throw Error('Invalid Crossref response');
 return data.message.items.filter(p=>p&&typeof p.DOI==='string'&&Array.isArray(p.title)&&typeof p.title[0]==='string'&&plain(p.title[0])).map(p=>({
   id:'doi:'+p.DOI.toLowerCase(),doi:p.DOI,provider:'Crossref',title:plain(p.title[0]),
   abstract:plain(p.abstract),
   authors:(Array.isArray(p.author)?p.author:[]).filter(a=>a&&typeof a==='object').map(a=>[a.given,a.family].filter(Boolean).join(' ')||a.name||'Unknown author'),
   year:Number((p.published||p.issued)?.['date-parts']?.[0]?.[0])||0,
   category:plain(p['container-title']?.[0]||p.type||'Research')
 }));
}
export async function searchCrossref(query,fetcher=fetch,signal){
 const params=new URLSearchParams({query,rows:'50'});
 const response=await fetcher('https://api.crossref.org/works?'+params,{headers:{'User-Agent':'PaperLens/1.1 (local research discovery)','Accept':'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(18000)]):AbortSignal.timeout(18000)});
 if(!response.ok)throw Error(`Crossref returned HTTP ${response.status}`);
 return parseCrossref(await response.json());
}
