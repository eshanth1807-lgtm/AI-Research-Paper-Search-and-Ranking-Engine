import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {verifyPassword} from './scripts/launcher-password.mjs';

export function visitorIP(req,trustTunnel=false){
 const peer=req.socket.remoteAddress||'unknown';
 const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);
 const forwarded=req.headers['cf-connecting-ip'];
 return trustTunnel&&loopback&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:peer.replace(/^::ffff:/,'');
}
export function deviceInfo(ua=''){
 const os=/Android/i.test(ua)?'Android':/iPhone|iPad|iPod/i.test(ua)?'iOS / iPadOS':/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Unknown OS';
 const browser=/Edg\//.test(ua)?'Edge':/Firefox|FxiOS/.test(ua)?'Firefox':/Chrome|CriOS/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':'Unknown browser';
 return {device:/iPad|Tablet/i.test(ua)?'Tablet':/Mobile|iPhone|Android/i.test(ua)?'Mobile':'Desktop / unknown',os,browser};
}
const cookie=(req,name)=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
export function createAdmin({root,trustTunnel=false,now=Date.now}){
 const file=path.join(root,'.visitor-analytics.json');
 const credentials=path.join(root,'.launcher-password.json');
 let records=[];let storageError=false;let storageWritable=true;
 try{
  const loaded=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(loaded)||loaded.some(r=>!r||typeof r.id!=='string'||typeof r.ip!=='string'||!['firstSeen','lastSeen','activeSeconds'].every(k=>Number.isFinite(r[k])&&r[k]>=0)))throw Error('Invalid analytics data');
  records=loaded;
 }catch(e){if(e.code!=='ENOENT'){storageError=true;storageWritable=false;}}
 const sessions=new Map(),attempts=new Map(),beats=new Map();let globalAttempts=[];
 const prune=()=>{const before=records.length;const cutoff=now()-30*86400000;records=records.filter(r=>r.lastSeen>=cutoff).slice(-5000);if(records.length!==before)save();for(const [k,v] of sessions)if(v<=now())sessions.delete(k);for(const [k,v] of beats)if(now()-v.time>120000)beats.delete(k);for(const [k,v] of attempts)if(now()-v.start>600000)attempts.delete(k);};
 const save=()=>{if(!storageWritable)return;try{fs.writeFileSync(file+'.tmp',JSON.stringify(records),{mode:0o600});fs.renameSync(file+'.tmp',file);}catch{storageError=true;}};
 const secure=trustTunnel?'; Secure':'';
 const setCookie=(res,name,value,age)=>res.setHeader('Set-Cookie',name+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+secure);
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const body=async req=>{let s='';for await(const c of req){s+=c;if(s.length>4096)throw Error('Request too large');}return JSON.parse(s||'{}');};
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/admin/')&&url.pathname!=='/api/visit')return false;
  try{
   prune();
   const ip=visitorIP(req,trustTunnel);
   if(req.method==='POST'){
    let valid=false;try{valid=new URL(req.headers.origin).host===req.headers.host;}catch{}
    if(!valid||!String(req.headers['content-type']).startsWith('application/json')){json(res,403,{error:'Same-origin JSON requests required.'});return true;}
   }
   if(url.pathname==='/api/visit'&&req.method==='POST'){
    const data=await body(req);let id=cookie(req,'pl_visitor');let r=records.find(r=>r.id===id);
    if(!r){id=randomBytes(24).toString('hex');r={id,ip,...deviceInfo(String(req.headers['user-agent']||'').slice(0,512)),firstSeen:now(),lastSeen:now(),activeSeconds:0};records.push(r);setCookie(res,'pl_visitor',id,30*86400);}
    const previous=beats.get(id);const active=data.active===true;
    if(previous&&active&&previous.active){const delta=(now()-previous.time)/1000;if(delta>0&&delta<=45)r.activeSeconds+=delta;}
    beats.set(id,{time:now(),active});r.ip=ip;r.lastSeen=now();records=records.slice(-5000);save();json(res,200,{ok:true});return true;
   }
   if(url.pathname==='/api/admin/login'&&req.method==='POST'){
    const a=attempts.get(ip)||{start:now(),count:0};globalAttempts=globalAttempts.filter(t=>now()-t<60000);
    if(a.count>=5||globalAttempts.length>=20){json(res,429,{error:'Too many attempts. Try again later (up to 10 minutes).'});return true;}
    a.count++;attempts.set(ip,a);globalAttempts.push(now());
    const data=await body(req);let record;try{record=JSON.parse(fs.readFileSync(credentials,'utf8'));}catch{json(res,503,{error:'Set your password by running share.command in Terminal first.'});return true;}
    if(typeof data.password!=='string'||data.password.length>1024||!verifyPassword(data.password,record)){json(res,401,{error:'Incorrect password.'});return true;}
    attempts.delete(ip);const token=randomBytes(32).toString('hex');if(sessions.size>=100)sessions.delete(sessions.keys().next().value);sessions.set(token,now()+3600000);setCookie(res,'pl_admin',token,3600);json(res,200,{ok:true});return true;
   }
   const token=cookie(req,'pl_admin');
   if(!sessions.has(token)){json(res,401,{error:'Please sign in.'});return true;}
   if(url.pathname==='/api/admin/logout'&&req.method==='POST'){sessions.delete(token);setCookie(res,'pl_admin','',0);json(res,200,{ok:true});return true;}
   if(url.pathname==='/api/admin/visitors'&&req.method==='GET'){
    json(res,200,{visitors:records.map(r=>({...r,online:now()-r.lastSeen<45000})).sort((a,b)=>b.lastSeen-a.lastSeen),storageError,retentionDays:30});return true;
   }
   json(res,404,{error:'Not found.'});return true;
  }catch{json(res,400,{error:'Unable to process request.'});return true;}
 };
}
