import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createAdmin,visitorIP,deviceInfo} from '../admin.mjs';
import {makeCredential} from '../scripts/launcher-password.mjs';
test('IP forwarding requires explicit trust and loopback peer',()=>{
 const req={socket:{remoteAddress:'192.168.1.4'},headers:{'cf-connecting-ip':'8.8.8.8'}};
 assert.equal(visitorIP(req,true),'192.168.1.4');req.socket.remoteAddress='127.0.0.1';assert.equal(visitorIP(req),'127.0.0.1');assert.equal(visitorIP(req,true),'8.8.8.8');
 assert.equal(deviceInfo('Mozilla/5.0 (iPhone) Mobile Safari').device,'Mobile');
});
test('analytics require login, bound elapsed time, persist, and revoke sessions',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'paperlens-admin-'));let time=10000000000;
 fs.writeFileSync(path.join(root,'.launcher-password.json'),JSON.stringify(makeCredential('test-password-only')));
 const handler=createAdmin({root,now:()=>time});const server=http.createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const post=(url,body,cookie='',origin=base)=>fetch(base+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/api/admin/visitors')).status,401);
 assert.equal((await post('/api/admin/login',{password:'wrong'})).status,401);
 assert.equal((await post('/api/admin/login',{password:'test-password-only'},'','https://evil.example')).status,403);
 const login=await post('/api/admin/login',{password:'test-password-only'});assert.equal(login.status,200);const admin=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
 const first=await post('/api/visit',{active:true});const visitor=first.headers.get('set-cookie').split(';')[0];time+=15000;
 await post('/api/visit',{active:true},visitor);time+=15000;await post('/api/visit',{active:false},visitor);time+=15000;await post('/api/visit',{active:true},visitor);time+=60000;await post('/api/visit',{active:true},visitor);
 let result=await fetch(base+'/api/admin/visitors',{headers:{Cookie:admin}});let data=await result.json();assert.equal(data.visitors.length,1);assert.equal(data.visitors[0].activeSeconds,15);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.visitor-analytics.json')))[0].activeSeconds,15);
 assert.equal(fs.statSync(path.join(root,'.visitor-analytics.json')).mode&0o777,0o600);
 await post('/api/admin/logout',{},admin);assert.equal((await fetch(base+'/api/admin/visitors',{headers:{Cookie:admin}})).status,401);
 for(let i=0;i<5;i++)await post('/api/admin/login',{password:'wrong'});
 assert.equal((await post('/api/admin/login',{password:'test-password-only'})).status,429);
});

test('damaged analytics are preserved while visits remain usable',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'paperlens-damaged-'));
 const file=path.join(root,'.visitor-analytics.json');fs.writeFileSync(file,'{"invalid":"format"}');
 const handler=createAdmin({root});const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const result=await fetch(base+'/api/visit',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{"active":true}'});
 assert.equal(result.status,200);assert.equal(fs.readFileSync(file,'utf8'),'{"invalid":"format"}');
});
