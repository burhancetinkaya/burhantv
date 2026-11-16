// Local Mac experiment: read MP4 subtitle samples with HTTP ranges, not a full movie download.
import { createFile } from 'mp4box';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

const cache=new Map(), inflight=new Map(), TTL=30*60*1000;
const labels={tur:'Türkçe',tr:'Türkçe',eng:'İngilizce',en:'İngilizce',per:'Farsça',fas:'Farsça',deu:'Almanca',ger:'Almanca',fra:'Fransızca',und:'Altyazı'};
function privateIp(ip){
 if(net.isIP(ip)===6)return !/^2|^3/.test(ip); // only global unicast IPv6
 const a=ip.split('.').map(Number);
 return a[0]===0||a[0]===10||a[0]===127||a[0]>=224||(a[0]===169&&a[1]===254)||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168)||(a[0]===100&&a[1]>=64&&a[1]<=127);
}
async function publicUrl(raw){
 const url=new URL(raw);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Geçersiz video bağlantısı.');
 const addresses=await dns.lookup(url.hostname.replace(/^\[|\]$/g,''),{all:true});
 if(!addresses.length||addresses.some(a=>privateIp(a.address)))throw new Error('Yalnızca internetteki video bağlantıları desteklenir.');
 return url;
}
async function range(raw,start,end){
 if(end-start>32*1024*1024)throw new Error('MP4 üstbilgisi bu deneme için çok büyük.');
 let url=await publicUrl(raw);
 for(let i=0;i<5;i++){
  const response=await fetch(url,{headers:{Range:`bytes=${start}-${end}`,'Accept-Encoding':'identity'},redirect:'manual',signal:AbortSignal.timeout(15000)});
  if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();url=await publicUrl(new URL(response.headers.get('location'),url).href);continue;}
  const contentRange=response.headers.get('content-range')||'';
  if(response.status!==206||!contentRange.startsWith(`bytes ${start}-`)){await response.body?.cancel();throw new Error('Video sunucusu gerekli parça isteklerini desteklemiyor veya bağlantının süresi dolmuş.');}
  const parts=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>end-start+1)throw new Error('Video sunucusundan beklenmeyen yanıt.');parts.push(chunk);}
  return Buffer.concat(parts);
 }
 throw new Error('Video bağlantısında çok fazla yönlendirme var.');
}
async function metadata(url){
 let offset=0,ftyp;
 for(let count=0;count<64;count++){
  const head=await range(url,offset,offset+15);
  let size=head.readUInt32BE(0),header=8;
  if(size===1){size=Number(head.readBigUInt64BE(8));header=16;}
  if(!Number.isSafeInteger(size)||size<header)throw new Error('Bu MP4 yapısı desteklenmiyor.');
  const type=head.toString('ascii',4,8);
  if(type==='ftyp')ftyp=await range(url,offset,offset+size-1);
  if(type==='moov'){
   const moov=await range(url,offset,offset+size-1);
   const buffer=Buffer.concat([ftyp||Buffer.alloc(0),moov]);
   const file=createFile(false);let info;
   file.onReady=value=>{info=value;};file.onError=()=>{throw new Error('MP4 altyazı bilgileri okunamadı.');};
   const ab=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);ab.fileStart=0;file.appendBuffer(ab);
   if(!info)throw new Error('MP4 parça listesi bulunamadı.');
   const tracks=info.tracks.filter(t=>t.codec==='tx3g').map(t=>{
    let empty=0,media=0;
    for(const edit of t.edits||[]){if(edit.media_time===-1)empty+=edit.segment_duration/info.timescale;else{media=edit.media_time/t.timescale;break;}}
    return {id:t.id,language:t.language,label:labels[t.language]||t.language||'Altyazı',samples:file.getTrackSamplesInfo(t.id).map(s=>({offset:s.offset,size:s.size,start:s.cts/s.timescale+empty-media,end:(s.cts+s.duration)/s.timescale+empty-media})),cues:new Map()};
   });
   return {tracks,duration:info.duration/info.timescale};
  }
  offset+=size;
 }
 throw new Error('MP4 parça bilgisi bulunamadı.');
}
async function cue(session,track,index){
 if(track.cues.has(index))return track.cues.get(index);
 const sample=track.samples[index];
 const work=(async()=>{
  if(sample.size<=2||sample.size>65536)return null;
  const bytes=await range(session.url,sample.offset,sample.offset+sample.size-1),length=bytes.readUInt16BE(0);
  if(length>bytes.length-2)throw new Error('Altyazı örneği okunamadı.');
  let text=bytes.subarray(2,2+length);
  let value=text[0]===0xfe&&text[1]===0xff?new TextDecoder('utf-16be').decode(text.subarray(2)):new TextDecoder().decode(text);
  value=value.replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim();
  return value?{start:sample.start,end:sample.end,text:value}:null;
 })();
 track.cues.set(index,work);
 try{return await work;}catch(error){track.cues.delete(index);throw error;}
}
async function inspect(url){
 const key=crypto.createHash('sha256').update(url).digest('hex');
 const old=cache.get(key);if(old&&Date.now()-old.created<TTL)return old;
 if(inflight.has(key))return inflight.get(key);
 if(cache.size>=12)cache.delete(cache.keys().next().value);
 const task=(async()=>{
  const data=await metadata(url),session={...data,url,key,created:Date.now()};
  for(const track of data.tracks){
   const first=track.samples.map((s,i)=>({s,i})).filter(x=>x.s.size>2).slice(0,3);
   const texts=await Promise.all(first.map(x=>cue(session,track,x.i)));
   if(texts.some(c=>c&&/[ğĞıİşŞ]/.test(c.text)))track.label='Türkçe';
  }
  cache.set(key,session);return session;
 })();inflight.set(key,task);
 try{return await task;}finally{inflight.delete(key);}
}
function localOnly(req,res,next){
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return res.status(403).json({error:'Bu deneme yalnızca Mac üzerinde kullanılabilir.'});
 res.set('Cache-Control','no-store');next();
}
export function registerEmbeddedSubtitles(app){
 app.post('/api/external-subtitles/inspect',localOnly,async(req,res)=>{
  try{const session=await inspect(String(req.body.url||''));res.json({id:session.key,duration:session.duration,tracks:session.tracks.map(t=>({id:t.id,label:t.label,language:t.language}))});}
  catch(error){res.status(400).json({error:error.message});}
 });
 app.get('/api/external-subtitles/:id/:track',localOnly,async(req,res)=>{
  const session=cache.get(req.params.id),track=session?.tracks.find(t=>t.id===Number(req.params.track));
  if(!session||!track||Date.now()-session.created>TTL)return res.status(404).json({error:'Altyazı oturumunu yeniden aç.'});
  const time=Number(req.query.time);if(!Number.isFinite(time)||time<0)return res.status(400).json({error:'Geçersiz zaman.'});
  const start=Math.max(0,Math.floor(time/60)*60-10),end=start+130;
  const samples=track.samples.map((s,i)=>({s,i})).filter(x=>x.s.size>2&&x.s.end>start&&x.s.start<end);
  try{
   const cues=[];
   for(let i=0;i<samples.length;i+=5){const group=await Promise.all(samples.slice(i,i+5).map(x=>cue(session,track,x.i)));cues.push(...group.filter(Boolean));}
   res.json({start,end,cues});
  }catch(error){res.status(400).json({error:error.message});}
 });
}
