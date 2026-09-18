import { database, fail, identity, messageSelect, roomAccess, ChatError } from '@/lib/chat';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const user=await identity();const db=database();let cursor=Number(request.headers.get('last-event-id')||new URL(request.url).searchParams.get('after')||0);
  if(!Number.isSafeInteger(cursor)||cursor<0)throw new ChatError(400,'同期位置が不正です。');
  let stopped=false;let timer:ReturnType<typeof setTimeout>|undefined;let finish:()=>void=()=>{};const encoder=new TextEncoder();const start=Date.now();
  const stream=new ReadableStream<Uint8Array>({
   start(controller){
    finish=()=>{if(stopped)return;stopped=true;clearTimeout(timer);request.signal.removeEventListener('abort',finish);try{controller.close()}catch{}};
    request.signal.addEventListener('abort',finish,{once:true});if(request.signal.aborted){finish();return;}
    controller.enqueue(encoder.encode('retry: 1500\nevent: ready\ndata: {}\n\n'));
    const poll=async()=>{
     if(stopped)return;
     try{
      const rows=await db.prepare(`${messageSelect} JOIN rooms r ON r.id=m.room_id WHERE m.seq>? AND ${roomAccess} ORDER BY m.seq LIMIT 100`).bind(cursor,user.id).all();
      if(stopped)return;if((controller.desiredSize??1)<0){finish();return;}
      if(rows.results.length){cursor=Number(rows.results[rows.results.length-1].seq);controller.enqueue(encoder.encode(`id: ${cursor}\nevent: messages\ndata: ${JSON.stringify(rows.results)}\n\n`));}
      else controller.enqueue(encoder.encode(': heartbeat\n\n'));
      if(Date.now()-start>25000){finish();return;}timer=setTimeout(poll,rows.results.length===100?20:1000);
     }catch(error){console.error('Relay sync failed',error);finish();}
    };void poll();
   },cancel(){stopped=true;clearTimeout(timer);request.signal.removeEventListener('abort',finish);}
  });return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
 }catch(error){return fail(error)}
}
