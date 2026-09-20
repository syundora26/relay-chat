import assert from 'node:assert/strict';
const base='http://127.0.0.1:5174';
// Run against a fresh local test database with RELAY_OWNER_EMAIL=alice@example.test,second@example.test.
async function call(user,path,data,status=200){
 const response=await fetch(base+'/api/chat/'+path,{method:data?'POST':'GET',headers:{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test',Origin:base,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;
}
// Bob initializes the default channels before the owner signs in.
await call('bob','bootstrap');
const owner=await call('alice','bootstrap');
const second=await call('second','bootstrap');
await call('charlie','bootstrap');
for(const id of ['channel-general','channel-development','channel-random']){
 const room=owner.rooms.find(r=>r.id===id);assert.equal(room.creator,'bob');assert.equal(room.canManage,true);
 assert.equal(second.rooms.find(r=>r.id===id).canManage,true);
 await call('second',`channels/${id}/update`,{name:room.name,topic:room.topic});
 const viewer=(await call('charlie','bootstrap')).rooms.find(r=>r.id===id);assert.equal(viewer.canManage,false);
 await call('charlie',`channels/${id}/delete`,{confirmName:room.name},403);
 await call('alice',`channels/${id}/delete`,{confirmName:room.name});
}
assert.equal((await call('alice','bootstrap')).rooms.length,0);
assert.equal((await call('bob','bootstrap')).rooms.length,0);
const custom=await call('bob','channels',{name:'bob-custom',topic:'',clientId:crypto.randomUUID()},201);
assert.equal((await call('alice','bootstrap')).rooms.find(r=>r.id===custom.id).canManage,false);
await call('alice',`channels/${custom.id}/delete`,{confirmName:'bob-custom'},403);
console.log('PASS: owner can delete all three initial channels created by someone else; other viewers denied; no recreation; custom channels remain creator-only');
