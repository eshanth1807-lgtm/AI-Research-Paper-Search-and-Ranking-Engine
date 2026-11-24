import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const entry=fileURLToPath(new URL('../server.mjs',import.meta.url));
test('starting twice detects the existing app without a stack trace',async()=>{
 const existing=http.createServer((req,res)=>res.end(JSON.stringify({status:'ok',engine:'BM25 + acronym expansion'})));
 await new Promise((resolve,reject)=>{existing.once('error',reject);existing.listen(0,'127.0.0.1',resolve);});
 try{
   const {stdout,stderr}=await exec(process.execPath,[entry],{env:{...process.env,PORT:String(existing.address().port)}});
   assert.match(stdout,/already running/);assert.equal(stderr,'');
 }finally{await new Promise(resolve=>existing.close(resolve));}
});
test('unrelated application on the port is preserved and an alternative is suggested',async()=>{
 const existing=http.createServer((req,res)=>res.end('Another application'));
 await new Promise((resolve,reject)=>{existing.once('error',reject);existing.listen(0,'127.0.0.1',resolve);});
 try{
   await assert.rejects(exec(process.execPath,[entry],{env:{...process.env,PORT:String(existing.address().port)}}),error=>{
     assert.equal(error.code,1);assert.match(error.stderr,/another application/);assert.match(error.stderr,/PORT=/);assert.doesNotMatch(error.stderr,/Unhandled/);return true;
   });
   assert.ok(existing.listening);
 }finally{await new Promise(resolve=>existing.close(resolve));}
});
test('invalid port displays an understandable error',async()=>{
 await assert.rejects(exec(process.execPath,[entry],{env:{...process.env,PORT:'invalid'}}),error=>{assert.match(error.stderr,/whole number/);return true;});
});
