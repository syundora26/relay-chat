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
const editPath=`/api/chat/channels/${channel.id}/update`;
const deletePath=`/api/chat/channels/${channel.id}/delete`;
await call('bob',editPath,{name:'侵入',topic:''},403);
await call('bob',deletePath,{confirmName:'侵入'},403);
await call('alice',editPath,{name:'###',topic:''},400);
await call('alice',editPath,{name:'new-name',topic:'x'.repeat(201)},400);
await call('alice',`/api/chat/channels/${dm.id}/delete`,{confirmName:''},400);
await call('alice',editPath,{name:'renamed-test',topic:'新しい説明'});
const renamed=(await call('bob','/api/chat/bootstrap')).rooms.find(r=>r.id===channel.id);
assert.equal(renamed.name,'renamed-test');assert.equal(renamed.topic,'新しい説明');assert.equal(renamed.creator,'alice');
assert((await call('bob',`/api/chat/rooms/${channel.id}/messages`)).messages.some(m=>m.id===first.message.id));
await call('alice',deletePath,{confirmName:'wrong'},409);
await call('alice',deletePath,{confirmName:'renamed-test'});
await call('alice',deletePath,{confirmName:'renamed-test'});
await call('alice',editPath,{name:'resurrect',topic:''},404);
await call('bob',`/api/chat/rooms/${channel.id}/messages`,undefined,404);
await call('alice',`/api/chat/rooms/${channel.id}/messages`,{body:'after deletion',clientId:crypto.randomUUID()},404);
assert(!(await call('alice','/api/chat/bootstrap')).rooms.some(r=>r.id===channel.id));
assert((await call('bob',`/api/chat/rooms/${dm.id}/messages`)).messages.some(m=>m.id===secret.message.id));
// Local test database only: seed channels must not reappear on bootstrap.
const seeded=(await call('alice','/api/chat/bootstrap')).rooms.find(r=>r.id==='channel-random');
if(seeded){await call(seeded.creator,'/api/chat/channels/channel-random/delete',{confirmName:seeded.name});}
assert(!(await call('charlie','/api/chat/bootstrap')).rooms.some(r=>r.id==='channel-random'));
console.log('PASS: authentication, messages, retry, DM isolation, SSE replay, CSRF, creator-only edit/delete, validation, permanent deletion, seed tombstones, unrelated history preserved');

