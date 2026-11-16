import { db,hash,token,uuid,controller,device,safeItem,catalog,saveCatalog,paired,command } from '../lib/assistant-store.mjs';
import { resolveVideo } from '../lib/resolve-video.mjs';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','X-Content-Type-Options':'nosniff'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
async function body(r,max=20000){const text=await r.text();if(text.length>max)fail(413,'İstek çok büyük.');try{return JSON.parse(text||'{}')}catch{fail(400,'Geçersiz JSON.')}}
export default async function(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
  const url=new URL(request.url),path=url.pathname.replace('/api/assistant',''),store=db();
  if(path==='/register'&&request.method==='POST'){
   const id=uuid(),key=token(),code=token().slice(0,8).toUpperCase(),created=Date.now();
   await store.setJSON('device/'+id,{id,tokenHash:hash(key),name:'Yeni TV',paired:false,code,created,lastSeen:created});
   await store.setJSON('pair-code/'+code,{id,expires:created+600000});
   return reply(201,{id,token:key,code});
  }
  const dm=path.match(/^\/device\/([a-f0-9-]{36})\/(poll|catalog)$/);
  if(dm){
   const d=await device(request,dm[1]);if(!d)fail(401,'TV kimliği doğrulanamadı.');
   if(request.method!=='POST')fail(405,'POST gerekli.');
   const b=await body(request,dm[2]==='catalog'?4500000:60000);
   if(dm[2]==='catalog'){
    if(!d.paired)fail(403,'TV önce eşleştirilmeli.');
    if(!Array.isArray(b.items)||b.items.length>50000)fail(400,'Geçersiz arşiv.');
    const previous=new Map((await catalog(d.id)).map(i=>[i.type+':'+i.id,i]));const items=b.items.map(safeItem).filter(Boolean).map(i=>{const old=previous.get(i.type+':'+i.id);return old?.title===i.title?{...old,...i,year:i.year||old.year,genre:i.genre||old.genre}:i});await saveCatalog(d.id,items);
    await store.setJSON('presence/'+d.id,{...(await store.get('presence/'+d.id,{type:'json'})||{}),catalogCount:items.length,catalogAt:Date.now(),lastSeen:Date.now()});return reply(200,{count:items.length});
   }
   if(b.ack&&typeof b.ack.sequence==='string'){
    const c=await store.get('command/'+d.id,{type:'json'});
    if(c?.sequence===b.ack.sequence){
     const ack={sequence:c.sequence,state:['received','opened','playing','paused','error','complete'].includes(b.ack.state)?b.ack.state:'error',at:Date.now()};
     if(c.action==='inspect'&&Array.isArray(b.ack.items)){
      const allowed=new Set(c.items.map(i=>i.type+':'+i.id));ack.items=b.ack.items.map(safeItem).filter(i=>i&&allowed.has(i.type+':'+i.id));
      const rows=await catalog(d.id),patch=new Map(ack.items.map(i=>[i.type+':'+i.id,i]));await saveCatalog(d.id,rows.map(i=>patch.has(i.type+':'+i.id)?{...i,...patch.get(i.type+':'+i.id)}:i));
     }
     await store.setJSON('ack/'+d.id,ack);
    }
   }
   if(Date.now()-d.lastSeen>12000||b.ack)await store.setJSON('presence/'+d.id,{...(await store.get('presence/'+d.id,{type:'json'})||{}),lastSeen:Date.now(),playback:b.playback?{sequence:String(b.playback.sequence||''),state:['playing','paused','opened','error','closed'].includes(b.playback.state)?b.playback.state:'opened'}:d.playback});
   let connect=await store.get('connect/'+d.id,{type:'json'});
   if(d.paired&&(!connect||connect.expires<Date.now())){connect={code:token().slice(0,8).toUpperCase(),expires:Date.now()+600000};await store.setJSON('connect/'+d.id,connect);await store.setJSON('connect-code/'+connect.code,{deviceId:d.id,expires:connect.expires});}
   const c=d.paired?await store.get('command/'+d.id,{type:'json'}):null;
   return reply(200,{paired:d.paired,name:d.name,code:d.code,connectCode:connect?.code,command:c&&c.expires>Date.now()&&c.sequence!==b.seenSequence?c:null});
  }
  if(!await controller(request))fail(401,'Asistan anahtarı gerekli.');
  if(path==='/pair'&&request.method==='POST'){
   const b=await body(request),code=String(b.code||'').trim().toUpperCase();
   const pair=await store.get('pair-code/'+code,{type:'json'});if(!pair||pair.expires<Date.now())fail(404,'Eşleştirme kodu geçersiz veya süresi dolmuş.');
   const d=await store.get('device/'+pair.id,{type:'json'});if(!d)fail(404,'TV bulunamadı.');
   d.paired=true;d.name=String(b.name||'TV').slice(0,60);await store.setJSON('device/'+d.id,d);await store.delete('pair-code/'+code);return reply(200,{deviceId:d.id,name:d.name});
  }
  const devices=await paired();
  if(path==='/devices'&&request.method==='GET')return reply(200,{devices:devices.map(d=>({id:d.id,name:d.name,online:Date.now()-d.lastSeen<25000,catalogCount:d.catalogCount||0,catalogAt:d.catalogAt||null}))});
  if(path==='/search'&&request.method==='GET'){
   const d=devices.find(d=>d.id===url.searchParams.get('deviceId'));if(!d)fail(404,'Önce devices ile TV seçin.');
   const q=(url.searchParams.get('query')||'').trim().toLocaleLowerCase('tr-TR').slice(0,100),genre=(url.searchParams.get('genre')||'').toLocaleLowerCase('tr-TR');
   const min=Number(url.searchParams.get('minRating'))||0,max=Number(url.searchParams.get('maxMinutes'))||0;
   const rows=await catalog(d.id);let matches=rows.filter(i=>(!q||i.title.toLocaleLowerCase('tr-TR').includes(q))&&(!genre||i.genre.toLocaleLowerCase('tr-TR').includes(genre))&&(!min||i.imdbRating>=min)&&(!max||(i.runtimeMinutes>0&&i.runtimeMinutes<=max))&&!(url.searchParams.get('unwatched')==='true'&&i.watched));
   matches.sort((a,b)=>(b.imdbRating||0)-(a.imdbRating||0));return reply(200,{deviceId:d.id,total:matches.length,items:matches.slice(0,20),note:'Puan ve süre filtreleri yalnız doğrulanmış bilgisi olan yapımları içerir. Eksik bilgiyi inspect ile TV’den alın.'});
  }
  if((path==='/play'||path==='/inspect')&&request.method==='POST'){
   const b=await body(request),d=devices.find(d=>d.id===b.deviceId);if(!d)fail(404,'TV bulunamadı.');
   let payload;
   if(path==='/inspect'){
    if(!Array.isArray(b.items)||!b.items.length||b.items.length>5)fail(400,'1–5 yapım seçin.');const rows=await catalog(d.id);
    const items=b.items.map(i=>rows.find(r=>r.type===i.type&&r.id===String(i.id)));if(items.some(i=>!i))fail(404,'Yapım arşivde yok.');payload={action:'inspect',items};
   }else if(b.url){const u=new URL(b.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||b.url.length>10000)fail(400,'Geçersiz video bağlantısı.');if(!/\.(mp4|m3u8)(?:$|\?)/i.test(u.pathname+u.search))fail(400,'Doğrudan MP4/M3U8 verin veya resolve kullanın.');payload={action:'play_url',url:u.href,title:String(b.title||'Gönderilen video').slice(0,160)};
   }else{const rows=await catalog(d.id),item=rows.find(i=>i.id===String(b.id)&&i.type===b.type);if(!item)fail(404,'Yapım arşivde yok.');payload={action:'play_library',id:item.id,type:item.type,title:item.title};}
   const c=await command(d,payload,b.requestId);return reply(202,{deviceId:d.id,sequence:c.sequence,state:'pending',message:'Komut iletildi; started demeden status ile gerçek durumu kontrol edin.'});
  }
  if(path==='/status'&&request.method==='GET'){
   const d=devices.find(d=>d.id===url.searchParams.get('deviceId'));if(!d)fail(404,'TV bulunamadı.');
   const sequence=url.searchParams.get('sequence'),ack=await store.get('ack/'+d.id,{type:'json'}),c=await store.get('command/'+d.id,{type:'json'});
   const playback=d.playback?.sequence===sequence?d.playback:null;
   return reply(200,{online:Date.now()-d.lastSeen<25000,state:playback?.state||(ack?.sequence===sequence?ack.state:c?.sequence===sequence&&c.expires<Date.now()?'expired':'pending'),items:ack?.sequence===sequence?ack.items:undefined});
  }
  if(path==='/resolve'&&request.method==='POST'){const b=await body(request);return reply(200,await resolveVideo(b.url));}
  fail(404,'İşlem bulunamadı.');
 }catch(e){return reply(e.status||500,{error:e.status?e.message:'İstek işlenemedi. Yeniden deneyin.'})}
}
export const config={path:'/api/assistant/*',rateLimit:{windowSize:60,windowLimit:120,aggregateBy:['ip'],action:'rate_limit'}};
