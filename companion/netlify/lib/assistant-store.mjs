import { getStore } from '@netlify/blobs';
import { randomBytes,randomUUID,createHash,timingSafeEqual } from 'node:crypto';
import { gzipSync,gunzipSync } from 'node:zlib';
export const db=()=>getStore({name:'burhantv-assistant-v1',consistency:'strong'});
export const hash=s=>createHash('sha256').update(s).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export const uuid=()=>randomUUID();
export function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&timingSafeEqual(x,y)}
export async function controller(request){
 const bearer=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const key=process.env.BURHANTV_ASSISTANT_KEY;if(key&&equal(bearer,key))return true;
 if(!/^[a-f0-9]{64}$/.test(bearer))return false;
 const grant=await db().get('access/'+hash(bearer),{type:'json'});return !!grant&&grant.expires>Date.now();
}
export async function device(request,id){const d=await db().get('device/'+id,{type:'json'});const key=(request.headers.get('authorization')||'').replace(/^Bearer /,'');return d&&equal(d.tokenHash,hash(key))?{...d,...(await db().get('presence/'+id,{type:'json'})||{})}:null}
export function safeItem(r){
 const id=String(r.id||'');if(!/^\d{1,15}$/.test(id)||!['movie','series'].includes(r.type))return null;
 const out={id,type:r.type,title:String(r.title||r.name||'').slice(0,180),year:String(r.year||'').slice(0,4),genre:String(r.genre||'').slice(0,200),watched:!!r.watched};
 for(const k of ['runtimeMinutes','imdbRating','imdbVotes'])if(Number.isFinite(r[k])&&r[k]>=0)out[k]=r[k];
 if(/^tt\d+$/.test(r.imdbId||''))out.imdbId=r.imdbId;
 return out;
}
export async function catalog(id){const data=await db().get('catalog/'+id,{type:'arrayBuffer'});return data?JSON.parse(gunzipSync(Buffer.from(data)).toString()):[]}
export async function saveCatalog(id,rows){await db().set('catalog/'+id,gzipSync(JSON.stringify(rows)));}
export async function paired(){const rows=[];for await(const page of db().list({prefix:'device/',paginate:true})){for(const b of page.blobs){const d=await db().get(b.key,{type:'json'});if(d?.paired)rows.push({...d,...(await db().get('presence/'+d.id,{type:'json'})||{})})}}return rows}
export async function command(d,payload,requestId){
 if(Date.now()-d.lastSeen>25000)throw Object.assign(new Error('TV çevrimdışı. BurhanTv uygulamasını açın.'),{status:409});
 if(!/^[\w-]{8,100}$/.test(requestId||''))throw Object.assign(new Error('Geçerli requestId gerekli.'),{status:400});
 const key='request/'+d.id+'/'+requestId,old=await db().get(key,{type:'json'});if(old&&old.created>Date.now()-600000)return old;
 const current=await db().get('command/'+d.id,{type:'json'});
 const status=await db().get('ack/'+d.id,{type:'json'});
 if(current&&current.expires>Date.now()&&status?.sequence!==current.sequence)throw Object.assign(new Error('TV önceki isteği işliyor. Durumu kontrol edin.'),{status:409});
 const c={...payload,sequence:uuid(),created:Date.now(),expires:Date.now()+120000};await db().setJSON('command/'+d.id,c);await db().setJSON(key,c);return c;
}
