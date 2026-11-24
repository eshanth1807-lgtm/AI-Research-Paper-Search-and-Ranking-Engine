import fs from 'node:fs';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {emitKeypressEvents} from 'node:readline';
import {fileURLToPath} from 'node:url';
const credentialFile=new URL('../.launcher-password.json',import.meta.url);
export function makeCredential(password){
  if(password.length<8)throw Error('Use at least 8 characters.');
  const salt=randomBytes(16).toString('hex');
  return {version:1,salt,hash:scryptSync(password,salt,64).toString('hex')};
}
export function verifyPassword(password,record){
  if(record.version!==1||! /^[a-f0-9]{32}$/.test(record.salt)||! /^[a-f0-9]{128}$/.test(record.hash))throw Error('Invalid password settings.');
  return timingSafeEqual(scryptSync(password,record.salt,64),Buffer.from(record.hash,'hex'));
}
function askHidden(label){
  return new Promise((resolve,reject)=>{
    const input=process.stdin;let value='';const wasRaw=Boolean(input.isRaw);
    process.stdout.write(label);emitKeypressEvents(input);input.setRawMode(true);input.resume();
    function finish(error){
      input.removeListener('keypress',onKey);input.setRawMode(wasRaw);input.pause();process.stdout.write('\n');
      if(error)reject(error);else resolve(value);
    }
    function onKey(text,key={}){
      if(key.ctrl&&(key.name==='c'||key.name==='d'))return finish(Error('Cancelled.'));
      if(key.name==='return'||key.name==='enter')return finish();
      if(key.name==='backspace'){value=Array.from(value).slice(0,-1).join('');return;}
      if(!key.ctrl&&!key.meta&&text&&!/[\x00-\x1f\x7f]/.test(text))value+=text;
    }
    input.on('keypress',onKey);
  });
}
async function main(){
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Run share.command directly in an interactive Terminal to enter your password.');
  if(!fs.existsSync(credentialFile)){
    console.log('First run: create a launcher password (at least 8 characters). Typing is hidden.');
    const password=await askHidden('New password: ');const record=makeCredential(password);
    if(password!==await askHidden('Confirm password: '))throw Error('Passwords do not match. Nothing was started.');
    fs.writeFileSync(credentialFile,JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});
    console.log('Password saved. Starting PaperLens.');return;
  }
  const record=JSON.parse(fs.readFileSync(credentialFile,'utf8'));
  for(let attempt=0;attempt<3;attempt++){
    if(verifyPassword(await askHidden('PaperLens password: '),record))return;
    console.log('Incorrect password.');
  }
  throw Error('Too many attempts. Nothing was started.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
