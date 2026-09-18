import assert from 'node:assert/strict';
const base='http://127.0.0.1:5174';
const who=(id)=>({'oai-authenticated-user-id':id,'oai-authenticated-user-email':id+'@example.test','oai-authenticated-user-full-name':encodeURIComponent({alice:'葵',bob:'蓮',charlie:'美咲'}[id]||id),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'});
async function call(user,path,data,status=200){const r=await fetch(base+path,{headers:{...who(user),Origin:base,...(data?{'Content-Type':'application/json'}:{})},method:data?'POST':'GET',body:data?JSON.stringify(data):undefined});const result=await r.json();assert.equal(r.status,status,JSON.stringify(result));return result;}
const anonymous=await fetch(base+'/api/chat/bootstrap');assert.equal(anonymous.status,401);
for(const u of ['alice','bob','charlie'])await call(u,'/api/chat/bootstrap');
const channel=await call('alice','/api/chat/channels',{name:'test-'+Date.now(),topic:'統合テスト',clientId:crypto.randomUUID()},201);
const msg={body:'こんにちは、チーム！',clientId:crypto.randomUUID()};
const first=await call('alice',`/api/chat/rooms/${channel.id}/messages`,msg,201);
const duplicate=await call('alice',`/api/chat/rooms/${channel.id}/messages`,msg,201);assert.equal(first.message.id,duplicate.message.id);
await call('alice',`/api/chat/rooms/${channel.id}/messages`,{...msg,body:'変更'},409);
const dm=await call('alice','/api/chat/dms',{recipientId:'bob'});
const sameDm=await call('bob','/api/chat/dms',{recipientId:'alice'});assert.equal(dm.id,sameDm.id);
const secret=await call('alice',`/api/chat/rooms/${dm.id}/messages`,{body:'DMの秘密',clientId:crypto.randomUUID()},201);
await call('charlie',`/api/chat/rooms/${dm.id}/messages`,undefined,404);
await call('charlie',`/api/chat/rooms/${dm.id}/messages`,{body:'侵入',clientId:crypto.randomUUID()},404);
const third=await call('charlie','/api/chat/bootstrap');assert(!third.rooms.some(r=>r.id===dm.id));
const history=await call('bob',`/api/chat/rooms/${dm.id}/messages`);assert(history.messages.some(m=>m.id===secret.message.id));
const crossOrigin=await fetch(base+'/api/chat/channels',{method:'POST',headers:{...who('alice'),Origin:'https://wrong.example','Content-Type':'application/json'},body:JSON.stringify({name:'invalid'})});assert.equal(crossOrigin.status,403);
async function readEvents(user,after,duration=8000){const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),duration);let text='';try{const r=await fetch(base+'/api/events?after='+after,{headers:who(user),signal:ac.signal});assert.equal(r.status,200);const reader=r.body.getReader();while(true){const x=await reader.read();if(x.done)break;text+=new TextDecoder().decode(x.value);}}catch(e){if(e.name!=='AbortError')throw e;}finally{clearTimeout(timer)}return text;}
const thirdEvents=await readEvents('charlie',0);assert(!thirdEvents.includes('DMの秘密'));assert(thirdEvents.includes('こんにちは'));
const bobEvents=await readEvents('bob',first.message.seq);assert(bobEvents.includes('DMの秘密'));assert(!bobEvents.includes('こんにちは'));
console.log('PASS: anonymous rejection, channel send, durable history, idempotent retry, conflict rejection, DM uniqueness, third-party DM isolation, SSE isolation/replay, CSRF');

