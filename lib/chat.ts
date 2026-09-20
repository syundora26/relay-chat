import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export class ChatError extends Error { constructor(public status:number, message:string){super(message)} }
export function database(){if(!env.DB) throw new ChatError(503,'データベースに接続できません。時間をおいて再試行してください。'); return env.DB;}
export async function identity(){
 const user=await getChatGPTUser();if(!user)throw new ChatError(401,'ログインしてください。');
 const ownerEmails=((env as typeof env & {RELAY_OWNER_EMAIL?:string}).RELAY_OWNER_EMAIL||'').split(',').map(email=>email.trim().toLowerCase()).filter(Boolean);
 return {id:user.userId,name:user.fullName || user.email.split('@')[0],managesInitialChannels:ownerEmails.includes(user.email.trim().toLowerCase())};
}
const initialChannelIds=new Set(['channel-general','channel-development','channel-random']);
export function canManageChannel(room:{id:unknown;kind:unknown;creator:unknown},user:{id:string;managesInitialChannels:boolean}){
 return room.kind==='channel'&&(room.creator===user.id||(user.managesInitialChannels&&initialChannelIds.has(String(room.id))));
}
export async function initialize(user:{id:string,name:string}){
 const db=database();const now=Date.now();
 await db.batch([
  db.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').bind(user.id,user.name,now),
  ...[['general','全員へのお知らせや、チームの共有事項はこちら。'],['development','開発の相談、進捗、アイデアを共有しましょう。'],['random','ちょっとした雑談も、チームをつなぐきっかけに。']].map(([name,topic])=>db.prepare("INSERT OR IGNORE INTO rooms(id,kind,name,topic,creator,created_at) VALUES(?,'channel',?,?,?,?)").bind('channel-'+name,name,topic,user.id,now))
 ]);
}
export const roomAccess="r.deleted_at IS NULL AND (r.kind='channel' OR EXISTS(SELECT 1 FROM members a WHERE a.room_id=r.id AND a.user_id=?))";
export async function assertRoom(roomId:string,userId:string){
 const room=await database().prepare(`SELECT r.* FROM rooms r WHERE r.id=? AND ${roomAccess}`).bind(roomId,userId).first();
 if(!room)throw new ChatError(404,'この会話は見つからないか、アクセスできません。');return room;
}
export const messageSelect='SELECT m.seq,m.id,m.room_id AS roomId,m.sender_id AS senderId,m.body,m.created_at AS createdAt,u.name AS senderName FROM messages m JOIN users u ON u.id=m.sender_id';
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}})}
export function fail(error:unknown){
 if(error instanceof ChatError)return json({error:error.message},error.status);
 console.error('Relay request failed',error);return json({error:'処理を完了できませんでした。入力はそのままで、もう一度お試しください。'},503);
}
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new ChatError(403,'この操作はアプリの画面から実行してください。');
}
export async function body(request:Request){
 if(!request.headers.get('content-type')?.includes('application/json'))throw new ChatError(415,'JSON形式が必要です。');
 const text=await request.text();if(text.length>20000)throw new ChatError(413,'入力が長すぎます。');
 try{const obj=JSON.parse(text);if(!obj||typeof obj!=='object'||Array.isArray(obj))throw new Error();return obj as Record<string,unknown>;}catch{throw new ChatError(400,'入力内容を確認してください。');}
}
export function input(value:unknown,max:number,label:string){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new ChatError(400,`${label}は1〜${max}文字で入力してください。`);return value.trim();}
