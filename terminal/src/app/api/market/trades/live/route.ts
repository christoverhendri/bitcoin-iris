import {readLiveTrades} from '@/lib/sources/liveTrades';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const encoder=new TextEncoder();let timer:ReturnType<typeof setTimeout>|undefined,closed=false;
  const cleanup=()=>{closed=true;clearTimeout(timer);request.signal.removeEventListener('abort',stop);};
  let stop=()=>{};
  const stream=new ReadableStream<Uint8Array>({
    start(controller){
      stop=()=>{if(closed)return;cleanup();controller.close();};
      request.signal.addEventListener('abort',stop,{once:true});
      const send=()=>{
        if(closed)return;
        // Coalesce snapshots; slow consumers never build an unbounded tick queue.
        if((controller.desiredSize??0)>0)controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(readLiveTrades(undefined,Date.now(),params))}\n\n`));
        timer=setTimeout(send,1000);
      };
      if(request.signal.aborted)stop();else send();
    },cancel(){cleanup();},
  });
  return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store, no-transform','x-accel-buffering':'no'}});
}
