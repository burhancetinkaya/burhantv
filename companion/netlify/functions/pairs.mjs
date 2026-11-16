import { getStore } from '@netlify/blobs';
import { randomBytes, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';

const TTL = 2 * 60 * 60 * 1000;
const headers = { 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'X-Content-Type-Options':'nosniff' };
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
const store=()=>getStore({name:'burhantv-links-v1',consistency:'strong'});
async function parse(request){const raw=await request.text();if(raw.length>12000)throw new Error('Bağlantı çok uzun.');return JSON.parse(raw||'{}');}
function videoUrl(raw){const u=new URL(String(raw||'').trim());if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Geçerli bir HTTP(S) video bağlantısı gir.');return u.href;}
export default async function(request) {
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  try{
    const url=new URL(request.url), path=url.pathname, blobs=store();
    if(request.method==='POST' && path==='/api/pairs'){
      const token=randomBytes(18).toString('hex'),created=Date.now();
      await blobs.setJSON('pair/'+token,{created});
      const sendUrl=url.origin+'/send/'+token;
      return reply(201,{token,sendUrl,qr:await QRCode.toDataURL(sendUrl,{width:300,margin:2}),expiresIn:TTL});
    }
    const match=path.match(/^\/api\/pairs\/([a-f0-9]{36})(?:\/(send|status))?$/);
    if(!match)return reply(404,{error:'Bağlantı bulunamadı.'});
    const token=match[1],pair=await blobs.get('pair/'+token,{type:'json'});
    if(!pair||Date.now()-pair.created>TTL)return reply(404,{error:'QR kodun süresi doldu. TV’den yeni QR kod aç.'});
    if(request.method==='POST'&&match[2]==='send'){
      const data=await parse(request),sequence=randomUUID();
      await blobs.setJSON('message/'+token,{sequence,url:videoUrl(data.url)});
      return reply(200,{sequence});
    }
    if(request.method==='POST'&&match[2]==='status'){
      const data=await parse(request);
      if(!['received','playing','error','closed'].includes(data.state)||typeof data.sequence!=='string')return reply(400,{error:'Geçersiz oynatma durumu.'});
      // Separate status objects prevent a late acknowledgment from replacing a new message.
      await blobs.setJSON('status/'+token,{sequence:data.sequence,state:data.state,message:String(data.message||'').slice(0,200)});
      return reply(200,{ok:true});
    }
    if(request.method==='GET'){
      const [message,status]=await Promise.all([blobs.get('message/'+token,{type:'json'}),blobs.get('status/'+token,{type:'json'})]);
      return reply(200,{sequence:message?.sequence||0,url:match[2]==='status'?undefined:message?.url||'',state:!message?'waiting':status?.sequence===message.sequence?status.state:'pending',message:status?.sequence===message?.sequence?status?.message||'':''});
    }
    return reply(405,{error:'Desteklenmeyen işlem.'});
  }catch(error){console.error('Pair request failed:',error.name);return reply(400,{error:'İstek işlenemedi. Video bağlantısını kontrol edip yeniden dene.'});}
}
export const config={path:['/api/pairs','/api/pairs/*'],rateLimit:{windowSize:60,windowLimit:120,aggregateBy:['ip'],action:'rate_limit'}};
