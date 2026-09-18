'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Hash, MessageSquare, Plus, ChevronDown, ArrowUp, Menu, X, Users, LogOut, LockKeyhole, WifiOff, CircleHelp, MoreVertical, Pencil, Trash2, ArrowDown, LoaderCircle } from 'lucide-react';

type Person={id:string;name:string};
type Room={id:string;kind:'channel'|'dm';name:string;topic:string;creator:string;canManage:boolean;peerName:string|null;lastSeq:number};
type Message={seq:number;id:string;roomId:string;senderId:string;senderName:string;body:string;createdAt:number};
type Bootstrap={user:Person;rooms:Room[];people:Person[]};
type History={messages:Message[];hasMore:boolean};
async function api<T>(path:string,data?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/chat/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,signal,cache:'no-store'});
 const result=await response.json() as T & {error?:string};if(!response.ok){if(response.status===401)throw new Error('ログインの有効期限が切れました。ページを再読み込みしてください。');throw new Error(result.error||'通信に失敗しました。');}return result;
}
const roomName=(r:Room)=>r.kind==='channel'?r.name:r.peerName||'ダイレクトメッセージ';
const time=(n:number)=>new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit'}).format(n);
const day=(n:number)=>new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'short'}).format(n);
function Avatar({name,small=false}:{name:string;small?:boolean}){let code=0;for(const c of name)code+=c.codePointAt(0)||0;return <span className={'avatar '+(small?'small ':'')+'tone-'+code%5}>{Array.from(name)[0]?.toUpperCase()||'?'}</span>;}

export default function Chat(){
 const [data,setData]=useState<Bootstrap|null>(null);const [active,setActive]=useState('channel-general');
 const [cache,setCache]=useState<Record<string,Message[]>>({});const [more,setMore]=useState<Record<string,boolean>>({});
 const [drafts,setDrafts]=useState<Record<string,string>>({});const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const [sending,setSending]=useState(false);const [connection,setConnection]=useState('接続中');const [mobile,setMobile]=useState(false);
 const [modal,setModal]=useState<'channel'|'edit-channel'|'delete-channel'|'dm'|'members'|'help'|null>(null);const [formName,setFormName]=useState('');const [topic,setTopic]=useState('');
 const [managedRoom,setManagedRoom]=useState<Room|null>(null);const refreshGeneration=useRef(0);const channelMenu=useRef<HTMLDetailsElement>(null);
 const [formError,setFormError]=useState('');const [busy,setBusy]=useState(false);const [newBelow,setNewBelow]=useState(false);
 const [unread,setUnread]=useState<Record<string,boolean>>({});const list=useRef<HTMLDivElement>(null);const end=useRef<HTMLDivElement>(null);
 const activeRef=useRef(active);activeRef.current=active;const nearBottom=useRef(true);const cursor=useRef(0);const initialized=useRef(false);
 const historyGeneration=useRef(0);const channelOperation=useRef<{name:string;topic:string;clientId:string}|null>(null);
 const pending=useRef<Record<string,{body:string;clientId:string}>>({});const dialog=useRef<HTMLDialogElement>(null);const composer=useRef<HTMLTextAreaElement>(null);
 const room=data?.rooms.find(r=>r.id===active);const messages=room?cache[active]||[]:[];const draft=drafts[active]||'';
 const merge=useCallback((incoming:Message[])=>{setCache(previous=>{
  const next={...previous};const ids=new Set(incoming.map(m=>m.roomId));for(const id of ids){const unique=new Map((previous[id]||[]).map(m=>[m.id,m]));for(const m of incoming)if(m.roomId===id)unique.set(m.id,m);next[id]=[...unique.values()].sort((a,b)=>a.seq-b.seq);}return next;
 });},[]);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const generation=++refreshGeneration.current;const next=await api<Bootstrap>('bootstrap',undefined,signal);
  if(generation!==refreshGeneration.current)return next;
  if(!initialized.current){cursor.current=Math.max(0,...next.rooms.map(r=>r.lastSeq));initialized.current=true;}
  setData(next);return next;
 },[]);
 useEffect(()=>{if(data&&!data.rooms.some(r=>r.id===active))setActive(data.rooms[0]?.id||'');},[data,active]);
 useEffect(()=>{if(channelMenu.current)channelMenu.current.open=false;},[active]);
 useEffect(()=>{const abort=new AbortController();void refresh(abort.signal).catch(e=>{if(!abort.signal.aborted)setError(e.message)});const timer=setInterval(()=>void refresh(abort.signal).catch(()=>{}),15000);return()=>{abort.abort();clearInterval(timer)};},[refresh]);
 useEffect(()=>{
  if(!data?.user.id)return;
  const stream=new EventSource('/api/events?after='+cursor.current);
  stream.addEventListener('ready',()=>setConnection('接続済み'));
  stream.addEventListener('messages',(event:MessageEvent)=>{
   const incoming=JSON.parse(event.data) as Message[];merge(incoming);cursor.current=Number(event.lastEventId)||cursor.current;
   setUnread(previous=>{const next={...previous};for(const m of incoming)if(m.roomId!==activeRef.current)next[m.roomId]=true;return next});
   if(incoming.some(m=>m.roomId===activeRef.current)&&!nearBottom.current)setNewBelow(true);
   setData(previous=>previous?{...previous,rooms:previous.rooms.map(r=>({...r,lastSeq:Math.max(r.lastSeq,...incoming.filter(m=>m.roomId===r.id).map(m=>m.seq))}))}:previous);
  });
  stream.onerror=()=>setConnection(navigator.onLine?'再接続中':'オフライン');
  const offline=()=>setConnection('オフライン');window.addEventListener('offline',offline);
  return()=>{stream.close();window.removeEventListener('offline',offline)};
 },[data?.user.id,merge]);
 useEffect(()=>{
  if(!data?.user.id||!active){setLoading(false);return;}
  ++historyGeneration.current;const abort=new AbortController();setLoading(true);setError('');setNewBelow(false);nearBottom.current=true;
  setUnread(previous=>({...previous,[active]:false}));
  api<History>('rooms/'+encodeURIComponent(active)+'/messages',undefined,abort.signal).then(result=>{merge(result.messages);setMore(p=>({...p,[active]:result.hasMore}));}).catch(e=>{if(!abort.signal.aborted)setError(e.message)}).finally(()=>{if(!abort.signal.aborted)setLoading(false)});
  return()=>{abort.abort();historyGeneration.current++;};
 },[active,data?.user.id,merge]);
 useEffect(()=>{if(nearBottom.current)end.current?.scrollIntoView({behavior:'instant'});},[messages.length,loading]);
 useEffect(()=>{if(modal){channelOperation.current=null;setFormError('');setFormName(modal==='edit-channel'?managedRoom?.name||'':'');setTopic(modal==='edit-channel'?managedRoom?.topic||'':'');dialog.current?.showModal();}else dialog.current?.close();},[modal,managedRoom]);
 function manage(action:'edit-channel'|'delete-channel'){if(!room)return;setManagedRoom(room);setModal(action);if(channelMenu.current)channelMenu.current.open=false;}
 async function saveChannel(){
  if(!managedRoom||busy)return;setBusy(true);setFormError('');
  try{
   const deleting=modal==='delete-channel';
   const result=await api<{id:string;name:string;topic:string}>('channels/'+encodeURIComponent(managedRoom.id)+(deleting?'/delete':'/update'),deleting?{confirmName:formName}:{name:formName,topic});
   ++refreshGeneration.current;
   setData(previous=>previous?{...previous,rooms:deleting?previous.rooms.filter(r=>r.id!==managedRoom.id):previous.rooms.map(r=>r.id===managedRoom.id?{...r,name:result.name,topic:result.topic}:r)}:previous);
   if(deleting){const id=managedRoom.id;setCache(p=>{const n={...p};delete n[id];return n});setDrafts(p=>{const n={...p};delete n[id];return n});setMore(p=>({...p,[id]:false}));setUnread(p=>({...p,[id]:false}));delete pending.current[id];}
   setModal(null);void refresh().catch(()=>{});
  }catch(e){setFormError((e as Error).message)}finally{setBusy(false)}
 }
 async function send(){
  const text=draft.trim();if(!text||sending||!room)return;
  const roomId=active;const item=pending.current[roomId]?.body===text?pending.current[roomId]:{body:text,clientId:crypto.randomUUID()};pending.current[roomId]=item;
  setSending(true);setError('');
  try{const result=await api<{message:Message}>('rooms/'+encodeURIComponent(roomId)+'/messages',item);merge([result.message]);
   setDrafts(previous=>previous[roomId]?.trim()===text?{...previous,[roomId]:''}:previous);delete pending.current[roomId];
   if(activeRef.current===roomId){nearBottom.current=true;requestAnimationFrame(()=>end.current?.scrollIntoView({behavior:'smooth'}));}
  }catch(e){setError((e as Error).message)}finally{setSending(false);composer.current?.focus();}
 }
 async function create(recipientId?:string){
  setBusy(true);setFormError('');try{
   if(!recipientId&&(!channelOperation.current||channelOperation.current.name!==formName||channelOperation.current.topic!==topic))channelOperation.current={name:formName,topic,clientId:crypto.randomUUID()};
   const result=await api<{id:string}>(recipientId?'dms':'channels',recipientId?{recipientId}:channelOperation.current);
   await refresh();setActive(result.id);setModal(null);setMobile(false);
  }catch(e){setFormError((e as Error).message)}finally{setBusy(false)}
 }
 async function older(){
  if(!messages.length||loading)return;setLoading(true);const id=active;const generation=historyGeneration.current;const top=list.current?.scrollHeight||0;
  try{const result=await api<History>('rooms/'+encodeURIComponent(id)+'/messages?before='+messages[0].seq);if(activeRef.current!==id||generation!==historyGeneration.current)return;nearBottom.current=false;merge(result.messages);setMore(p=>({...p,[id]:result.hasMore}));requestAnimationFrame(()=>{if(list.current&&generation===historyGeneration.current)list.current.scrollTop=list.current.scrollHeight-top;});}
  catch(e){if(generation===historyGeneration.current)setError((e as Error).message)}finally{if(activeRef.current===id&&generation===historyGeneration.current)setLoading(false)}
 }
 useEffect(()=>{
  const context=(document as Document&{modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>unknown}}).modelContext;
  if(!context?.registerTool||!data)return;const lifecycle=new AbortController();
  try{Promise.resolve(context.registerTool({name:'list_relay_conversations',description:'現在のユーザーが閲覧できるチャンネルとDMを一覧表示する。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('引数は空のオブジェクトを指定してください。');return {conversations:data.rooms.map(r=>({id:r.id,name:roomName(r),kind:r.kind}))};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  return()=>lifecycle.abort();
 },[data]);
 if(!data)return <main className="boot"><span className="brand-mark">r</span><h1>Relay</h1>{error?<><p role="alert">{error}</p><button className="primary" onClick={()=>location.reload()}>再読み込み</button></>:<p role="status">ワークスペースを開いています…</p>}</main>;
 const choose=(id:string)=>{setActive(id);setMobile(false)};
 return <div className="workspace">
  {mobile&&<button className="sidebar-overlay" aria-label="会話一覧を閉じる" onClick={()=>setMobile(false)}/>}
  <aside className={'sidebar '+(mobile?'is-open':'')} aria-label="会話一覧" onKeyDown={e=>{if(e.key==='Escape')setMobile(false)}}>
   <div className="brand"><span className="brand-mark">r</span>relay<span className="brand-dot">.</span><button className="mobile-close icon-button" aria-label="閉じる" onClick={()=>setMobile(false)}><X size={20}/></button></div>
   <div className="workspace-name"><span className="workspace-symbol">R</span><div><strong>Relay Workspace</strong><span>チームのコミュニケーション</span></div></div>
   <div className="sidebar-scroll">
    <div className="section-label"><span><ChevronDown size={14}/> チャンネル</span><button className="icon-button" aria-label="チャンネルを作成" onClick={()=>setModal('channel')}><Plus size={17}/></button></div>
    <nav aria-label="チャンネル">{data.rooms.filter(r=>r.kind==='channel').map(r=><button key={r.id} className={'nav-item '+(active===r.id?'selected':'')} aria-current={active===r.id?'page':undefined} onClick={()=>choose(r.id)}><Hash size={18}/><span>{r.name}</span>{unread[r.id]&&<span className="unread" aria-label="新着あり"/>}</button>)}</nav>
    <button className="add-item" onClick={()=>setModal('channel')}><Plus size={17}/>チャンネルを追加</button>
    <div className="section-label dm-label"><span><ChevronDown size={14}/> ダイレクトメッセージ</span><button className="icon-button" aria-label="DMを開始" onClick={()=>setModal('dm')}><Plus size={17}/></button></div>
    <nav aria-label="ダイレクトメッセージ">{data.rooms.filter(r=>r.kind==='dm').map(r=><button key={r.id} className={'nav-item '+(active===r.id?'selected':'')} aria-current={active===r.id?'page':undefined} onClick={()=>choose(r.id)}><Avatar name={roomName(r)} small/><span>{roomName(r)}</span>{unread[r.id]&&<span className="unread" aria-label="新着あり"/>}</button>)}</nav>
    {!data.rooms.some(r=>r.kind==='dm')&&<p className="sidebar-hint">気になることは、<br/>ひとことから。</p>}
    <button className="add-item" onClick={()=>setModal('dm')}><Plus size={17}/>メッセージを始める</button>
   </div>
   <button className="sidebar-help" onClick={()=>setModal('help')}><CircleHelp size={17}/>使い方とメンバーの参加</button>
   <div className="profile"><Avatar name={data.user.name}/><div><strong>{data.user.name}</strong><span>自分のアカウント</span></div><a className="icon-button" href="/signout-with-chatgpt?return_to=%2F" target="_top" aria-label="ログアウト"><LogOut size={17}/></a></div>
  </aside>
  <main className="chat-main">
   <div className="topbar"><div><button className="icon-button mobile-menu" aria-label="会話一覧を開く" onClick={()=>setMobile(true)}><Menu size={21}/></button><span>ワークスペース</span><span className="breadcrumb">/</span><strong>{room?.kind==='dm'?'ダイレクトメッセージ':'チャンネル'}</strong></div><span className={'connection '+(connection==='接続済み'?'connected':'')} role="status">{connection==='接続済み'?<span className="status-dot"/>:<WifiOff size={14}/>}<span>{connection}</span></span></div>
   <header className="conversation-header"><div className="conversation-title"><span className="conversation-icon">{room?.kind==='dm'?<LockKeyhole size={24}/>:<Hash size={26}/>}</span><div><h1>{room?roomName(room):'会話を選んでください'}</h1><p>{room?.kind==='dm'?'この会話は、あなたと相手だけに表示されます。':room?.topic||'チームの会話をここから。'}</p></div></div>{room?.kind!=='dm'&&<button className="members-button" aria-label="メンバー一覧" onClick={()=>setModal('members')}><Users size={17}/><span>{data.people.length} 人のメンバー</span></button>}{room?.kind==='channel'&&room.canManage&&<details className="channel-menu" ref={channelMenu}><summary className="icon-button" aria-label="チャンネルの設定"><MoreVertical size={21}/></summary><div className="channel-menu-items"><button onClick={()=>manage('edit-channel')}><Pencil size={16}/>名前・説明を変更</button><button className="danger-text" onClick={()=>manage('delete-channel')}><Trash2 size={16}/>チャンネルを削除</button></div></details>}</header>
   <div className="messages" ref={list} onScroll={()=>{const el=list.current;if(el){nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;if(nearBottom.current)setNewBelow(false)}}}>
    {more[active]&&<button className="older" onClick={older} disabled={loading}>{loading?'読み込み中…':'以前のメッセージを表示'}</button>}
    {room&&!more[active]&&<div className="conversation-intro"><span className="intro-icon">{room?.kind==='dm'?<MessageSquare size={28}/>:<Hash size={32}/>}</span><div className="eyebrow">{room?.kind==='dm'?'DIRECT MESSAGE':'YOUR TEAM, IN SYNC'}</div><h2>{room?.kind==='dm'?`${roomName(room)}さんとの会話`:`${room?.name||'general'} へようこそ`}</h2><p>{room?.kind==='dm'?'相談も、ちょっとした連絡も。ここから会話を始めましょう。':room?.topic}</p>{!messages.length&&!loading&&<span className="first-message">最初のメッセージを送って、会話を始めましょう。</span>}</div>}
    {loading&&!messages.length&&<p className="loading-text" role="status"><LoaderCircle size={16} className="spin"/>メッセージを読み込み中…</p>}
    {!room&&<div className="conversation-intro"><h2>会話の場所をつくりましょう</h2><p>チャンネルを追加するか、メンバーとのDMを始めてください。</p><button className="primary" onClick={()=>setModal('channel')}>チャンネルを作成</button></div>}{messages.map((m,i)=><div key={m.id}>{(i===0||day(messages[i-1].createdAt)!==day(m.createdAt))&&<div className="day-divider"><span>{day(m.createdAt)}</span></div>}<article className="message"><Avatar name={m.senderName}/><div className="message-content"><div className="message-meta"><strong>{m.senderName}</strong>{m.senderId===data.user.id&&<span className="you">自分</span>}<time dateTime={new Date(m.createdAt).toISOString()}>{time(m.createdAt)}</time></div><p>{m.body}</p></div></article></div>)}
    <div ref={end}/>
   </div>
   <div className="composer-area">{newBelow&&<button className="new-messages" onClick={()=>{nearBottom.current=true;end.current?.scrollIntoView({behavior:'smooth'});setNewBelow(false)}}><ArrowDown size={15}/>新しいメッセージ</button>}
    {error&&<p className="error-banner" role="alert">{error}</p>}
    {room&&<><form className="composer" onSubmit={e=>{e.preventDefault();void send()}}><label htmlFor="message-input">{room?.kind==='dm'?`${roomName(room)}さんにメッセージ`:`# ${room?.name||'general'} にメッセージ`}</label>
     <textarea id="message-input" ref={composer} value={draft} maxLength={4000} rows={2} disabled={sending} placeholder="メッセージを入力…" onChange={e=>{const value=e.target.value;setDrafts(p=>({...p,[active]:value}))}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.nativeEvent.keyCode!==229&&window.matchMedia('(min-width: 768px)').matches){e.preventDefault();void send()}}}/>
     <div className="composer-bottom"><span><LockKeyhole size={13}/>{room?.kind==='dm'?'会話の参加者だけに送信':'チャンネルの全員に送信'}</span><div>{draft.length>3500&&<span>{draft.length}/4000</span>}<button className="send-button" type="submit" disabled={!draft.trim()||sending||!room} aria-label="メッセージを送信">{sending?<LoaderCircle size={18} className="spin"/>:<ArrowUp size={20}/>}</button></div></div>
    </form><div className="composer-hint"><span>Enter で送信 · Shift + Enter で改行</span><span>Relay Workspace</span></div></>}
   </div>
  </main>
  <dialog ref={dialog} onCancel={e=>{if(busy)e.preventDefault();else setModal(null)}} onClose={()=>setModal(null)} onClick={e=>{if(!busy&&e.target===dialog.current)setModal(null)}}>
   <div className="dialog-content"><div className="dialog-heading"><h2>{modal==='edit-channel'?'チャンネルを編集':modal==='delete-channel'?'チャンネルを削除':modal==='channel'?'チャンネルを作成':modal==='dm'?'メッセージを始める':modal==='members'?'ワークスペースのメンバー':'Relayの使い方'}</h2><button className="icon-button" aria-label="ダイアログを閉じる" disabled={busy} onClick={()=>setModal(null)}><X size={20}/></button></div>
    {(modal==='channel'||modal==='edit-channel')&&<form onSubmit={e=>{e.preventDefault();if(modal==='edit-channel')void saveChannel();else void create()}}><p>話題ごとに、会話の場所をつくりましょう。</p><label htmlFor="channel-name">チャンネル名</label><input id="channel-name" value={formName} onChange={e=>setFormName(e.target.value)} placeholder="例：project-launch" required maxLength={40} autoFocus/><label htmlFor="channel-topic">説明 <span>（任意）</span></label><input id="channel-topic" value={topic} onChange={e=>setTopic(e.target.value)} placeholder="どんな話題を共有しますか？" maxLength={200}/><p className="field-hint">このワークスペースのメンバー全員が閲覧できます。</p><button className="primary" disabled={busy||!formName.trim()}>{busy?'保存中…':modal==='edit-channel'?'変更を保存':'チャンネルを作成'}</button></form>}
    {modal==='delete-channel'&&managedRoom&&<form onSubmit={e=>{e.preventDefault();void saveChannel()}}><p><strong># {managedRoom.name}</strong> を削除します。このチャンネルのメッセージ履歴も全員分削除され、元に戻せません。</p><label htmlFor="delete-channel-name">確認のため「{managedRoom.name}」と入力してください</label><input id="delete-channel-name" value={formName} onChange={e=>setFormName(e.target.value)} autoComplete="off" disabled={busy} autoFocus/><div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setModal(null)}>キャンセル</button><button className="primary danger" disabled={busy||formName!==managedRoom.name}>{busy?'削除中…':'チャンネルと履歴を削除'}</button></div></form>}
    {(modal==='dm'||modal==='members')&&<><p>{modal==='dm'?'同じワークスペースのメンバーを選んでください。':'このワークスペースにログインしたメンバーです。'}</p>{modal==='dm'&&<input aria-label="メンバーを検索" placeholder="名前で絞り込み…" value={formName} onChange={e=>setFormName(e.target.value)}/>}<div className="people-list">{data.people.filter(p=>(modal==='members'||p.id!==data.user.id)&&p.name.toLowerCase().includes(formName.toLowerCase())).map(p=><button key={p.id} disabled={busy||p.id===data.user.id} className="person-row" onClick={()=>void create(p.id)}><Avatar name={p.name}/><span>{p.name}{p.id===data.user.id?'（自分）':''}</span>{p.id!==data.user.id&&<MessageSquare size={18}/>}</button>)}</div>{data.people.length===1&&<div className="empty-members"><Users size={24}/><h3>仲間が参加すると、DMを始められます</h3><p>このサイトのURLをメンバーに送ってください。ログインしたメンバーがここに表示されます。</p></div>}</>}
    {modal==='help'&&<div className="help-copy"><h3><Hash size={18}/>チャンネルで共有</h3><p>左の一覧で話題を選び、下の入力欄から投稿できます。「＋」で新しいチャンネルも作成できます。</p><h3><MessageSquare size={18}/>DMで個別に相談</h3><p>「メッセージを始める」から相手を選びます。内容は参加している2人だけに表示されます。</p><h3><Users size={18}/>仲間を迎える</h3><p>このサイトのURLを伝えてください。相手がChatGPTでログインするとメンバー一覧に表示されます。</p><p className="field-hint">通信が切れたときも、送信に失敗した本文は入力欄に残ります。接続後、同じ内容を再送できます。</p></div>}
    {formError&&<p className="error-banner" role="alert">{formError}</p>}
   </div>
  </dialog>
 </div>;
}

