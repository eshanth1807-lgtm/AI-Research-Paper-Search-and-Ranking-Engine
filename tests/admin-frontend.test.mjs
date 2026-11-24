import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const code=await fs.readFile(new URL('../public/admin.js',import.meta.url),'utf8');
test('a delayed analytics response cannot reopen the dashboard after logout',async()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,value:'',textContent:'',replaceChildren(){},append(){}});return nodes.get(id);};
 let resolveVisit;const fetch=async(url)=>url.endsWith('/visitors')?new Promise(resolve=>resolveVisit=resolve):{ok:true,json:async()=>({ok:true})};
 const context=vm.createContext({document:{getElementById:get,createElement:()=>({})},fetch,setInterval(){}});
 vm.runInContext(code,context);
 await get('logout').onclick();resolveVisit({ok:true,json:async()=>({visitors:[{id:'test',ip:'127.0.0.1',activeSeconds:1}],storageError:false})});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(get('dashboard').hidden,true);assert.equal(get('message').textContent,'Signed out.');
});
