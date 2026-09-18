import { assertRoom, body, ChatError, database, fail, identity, initialize, input, json, messageSelect, roomAccess, sameOrigin } from '@/lib/chat';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const user=await identity();const db=database();const url=new URL(request.url);const part=url.pathname.split('/').slice(3);
  if(part[0]==='bootstrap'){
   await initialize(user);
   const rooms=await db.prepare(`SELECT r.id,r.kind,r.name,r.topic,r.creator,r.created_at AS createdAt,
    (SELECT u.name FROM members mm JOIN users u ON u.id=mm.user_id WHERE mm.room_id=r.id AND mm.user_id<>? LIMIT 1) AS peerName,
    (SELECT COALESCE(MAX(seq),0) FROM messages WHERE room_id=r.id) AS lastSeq
    FROM rooms r WHERE ${roomAccess} ORDER BY r.kind,r.created_at,r.name`).bind(user.id,user.id).all();
   const people=await db.prepare('SELECT id,name FROM users ORDER BY name').all();return json({user,rooms:rooms.results,people:people.results});
  }
  if(part[0]==='rooms'&&part[2]==='messages'){
   const roomId=decodeURIComponent(part[1]);await assertRoom(roomId,user.id);const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
   if(!Number.isSafeInteger(before)||before<1)throw new ChatError(400,'履歴の位置が不正です。');
   const result=await db.prepare(`${messageSelect} WHERE m.room_id=? AND m.seq<? ORDER BY m.seq DESC LIMIT 51`).bind(roomId,before).all();
   return json({messages:result.results.slice(0,50).reverse(),hasMore:result.results.length>50});
  }throw new ChatError(404,'見つかりません。');
 }catch(error){return fail(error)}
}
export async function POST(request:Request){
 try{
  sameOrigin(request);const user=await identity();const db=database();const data=await body(request);const part=new URL(request.url).pathname.split('/').slice(3);
  if(part[0]==='channels'&&part.length===3&&(part[2]==='update'||part[2]==='delete')){
   const id=decodeURIComponent(part[1]);
   const channel=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(id).first();
   if(!channel)throw new ChatError(404,'チャンネルが見つかりません。');
   if(channel.kind!=='channel')throw new ChatError(400,'DMにはこの操作を行えません。');
   if(channel.creator!==user.id)throw new ChatError(403,'チャンネルの作成者だけが変更・削除できます。');
   if(part[2]==='delete'){
    if(data.confirmName!==channel.name)throw new ChatError(409,'確認用のチャンネル名が一致しません。最新の名前を確認してください。');
    const result=await db.batch([
     db.prepare('UPDATE rooms SET deleted_at=COALESCE(deleted_at,?) WHERE id=? AND name=?').bind(Date.now(),id,data.confirmName),
     db.prepare('DELETE FROM messages WHERE room_id=? AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND deleted_at IS NOT NULL)').bind(id,id),
     db.prepare('DELETE FROM members WHERE room_id=? AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND deleted_at IS NOT NULL)').bind(id,id),
    ]);if(!result[0].meta.changes)throw new ChatError(409,'チャンネル名が変更されました。再読み込みして確認してください。');return json({id});
   }
   if(channel.deleted_at!==null)throw new ChatError(404,'このチャンネルは削除されています。');
   const name=input(data.name,40,'チャンネル名').replace(/^#+/,'').trim();
   if(!name)throw new ChatError(400,'チャンネル名を入力してください。');
   if(typeof data.topic!=='string'||data.topic.trim().length>200)throw new ChatError(400,'説明は200文字以内で入力してください。');
   const result=await db.prepare('UPDATE rooms SET name=?,topic=? WHERE id=? AND deleted_at IS NULL').bind(name,data.topic.trim(),id).run();
   if(!result.meta.changes)throw new ChatError(404,'このチャンネルは削除されています。');
   return json({id,name,topic:data.topic.trim()});
  }
  if(part[0]==='channels'&&part.length===1){
   const name=input(data.name,40,'チャンネル名').replace(/^#+/,'');if(!name)throw new ChatError(400,'チャンネル名を入力してください。');
   const topic=typeof data.topic==='string'?data.topic.trim().slice(0,200):'';const id=input(data.clientId,80,'作成ID');if(!/^[a-zA-Z0-9-]{8,80}$/.test(id))throw new ChatError(400,'作成IDが不正です。');
   await db.prepare("INSERT OR IGNORE INTO rooms(id,kind,name,topic,creator,created_at) VALUES(?,'channel',?,?,?,?)").bind(id,name,topic,user.id,Date.now()).run();
   const saved=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(id).first();if(!saved||saved.deleted_at!==null||saved.creator!==user.id||saved.name!==name||saved.topic!==topic||saved.kind!=='channel')throw new ChatError(409,'作成IDが重複しました。');return json({id},201);
  }
  if(part[0]==='dms'){
   const recipientId=input(data.recipientId,200,'相手');if(recipientId===user.id)throw new ChatError(400,'別のメンバーを選択してください。');
   if(!await db.prepare('SELECT id FROM users WHERE id=?').bind(recipientId).first())throw new ChatError(404,'メンバーが見つかりません。');
   const pair=JSON.stringify([user.id,recipientId].sort());const id=crypto.randomUUID();
   await db.batch([
    db.prepare("INSERT OR IGNORE INTO rooms(id,kind,name,topic,pair_key,creator,created_at) VALUES(?,'dm','','',?,?,?)").bind(id,pair,user.id,Date.now()),
    db.prepare('INSERT OR IGNORE INTO members(room_id,user_id) SELECT id,? FROM rooms WHERE pair_key=?').bind(user.id,pair),
    db.prepare('INSERT OR IGNORE INTO members(room_id,user_id) SELECT id,? FROM rooms WHERE pair_key=?').bind(recipientId,pair),
   ]);return json(await db.prepare('SELECT id FROM rooms WHERE pair_key=?').bind(pair).first());
  }
  if(part[0]==='rooms'&&part[2]==='messages'){
   const roomId=decodeURIComponent(part[1]);await assertRoom(roomId,user.id);const text=input(data.body,4000,'メッセージ');const clientId=input(data.clientId,80,'送信ID');
   if(!/^[a-zA-Z0-9-]{8,80}$/.test(clientId))throw new ChatError(400,'送信IDが不正です。');
   await db.prepare(`INSERT OR IGNORE INTO messages(id,room_id,sender_id,client_id,body,created_at) SELECT ?,r.id,?,?,?,? FROM rooms r WHERE r.id=? AND ${roomAccess}`).bind(crypto.randomUUID(),user.id,clientId,text,Date.now(),roomId,user.id).run();
   const message=await db.prepare(`${messageSelect} WHERE m.sender_id=? AND m.client_id=?`).bind(user.id,clientId).first();
   if(!message||message.roomId!==roomId||message.body!==text)throw new ChatError(409,'送信IDが重複しました。内容を確認してください。');return json({message},201);
  }throw new ChatError(404,'見つかりません。');
 }catch(error){return fail(error)}
}
