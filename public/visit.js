// Approximate engaged time: visible page, with interaction in the last minute.
let lastInteraction=Date.now(),sending=false;
for(const event of ['pointerdown','keydown','scroll','touchstart'])addEventListener(event,()=>{lastInteraction=Date.now();},{passive:true});
async function heartbeat(){
 if(sending)return;sending=true;
 try{await fetch('/api/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:document.visibilityState==='visible'&&Date.now()-lastInteraction<60000}),keepalive:true});}catch{}finally{sending=false;}
}
heartbeat();setInterval(heartbeat,15000);document.addEventListener('visibilitychange',heartbeat);
