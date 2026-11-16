import { RELAY_URL } from './linkRelay.js';
const cache={},pending=new Map(),waiting=new Map();let timer,dbPromise;
const FALLBACK_PREFIX='burhantv-imdb-rating:';
function valid(value){return value&&Number.isFinite(value.rating)&&value.rating>0&&value.rating<=10&&Number.isFinite(value.votes)&&value.votes>=0&&typeof value.updated==='string'}
function database(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise(resolve=>{
  try{
   if(typeof indexedDB==='undefined'){resolve(null);return}
   const request=indexedDB.open('burhantv-imdb-ratings',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('ratings'))request.result.createObjectStore('ratings')};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=request.onblocked=()=>resolve(null);
  }catch{resolve(null)}
 });return dbPromise;
}
async function read(id){
 const db=await database();
 if(db){const value=await new Promise(resolve=>{try{const request=db.transaction('ratings','readonly').objectStore('ratings').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null)}catch{resolve(null)}});if(valid(value))return value}
 try{const value=JSON.parse(localStorage.getItem(FALLBACK_PREFIX+id)||'null');return valid(value)?value:null}catch{return null}
}
async function write(id,value){
 const db=await database();
 if(db){const stored=await new Promise(resolve=>{try{const transaction=db.transaction('ratings','readwrite');transaction.objectStore('ratings').put(value,id);transaction.oncomplete=()=>resolve(true);transaction.onerror=transaction.onabort=()=>resolve(false)}catch{resolve(false)}});if(stored)return}
 try{localStorage.setItem(FALLBACK_PREFIX+id,JSON.stringify(value))}catch{}
}
// IMDb IDs identify the work, so duplicate provider entries share one permanent
// score. No expiry or automatic refresh; failures/unknown IDs are not cached.
export function imdbRating(id,previous){
 if(!/^tt\d{5,12}$/.test(id||''))return Promise.resolve(null);
 if(cache[id])return Promise.resolve(cache[id]);
 if(pending.has(id))return pending.get(id);
 const promise=(async()=>{
  let value=await read(id);
  // Migrate already verified scores from the previous metadata cache.
  if(!value&&valid(previous)){value=previous;await write(id,value)}
  if(!value)value=await new Promise(resolve=>{waiting.set(id,resolve);clearTimeout(timer);timer=setTimeout(flush,70)});
  if(value)cache[id]=value;
  return value;
 })().finally(()=>pending.delete(id));
 pending.set(id,promise);return promise;
}
function flush(){
 const batch=Array.from(waiting.entries()).slice(0,100);for(const [id]of batch)waiting.delete(id);
 const xhr=new XMLHttpRequest();xhr.open('GET',RELAY_URL+'/api/ratings?ids='+batch.map(x=>x[0]).join(','));xhr.timeout=30000;
 let finished=false;
 async function finish(data){
  if(finished)return;finished=true;
  await Promise.all(batch.map(async([id,resolve])=>{const value=data?.ratings?.[id];if(valid(value)){cache[id]=value;await write(id,value);resolve(value)}else resolve(null)}));
  if(waiting.size)timer=setTimeout(flush,70);
 }
 xhr.onload=()=>{try{finish(xhr.status===200?JSON.parse(xhr.responseText):null)}catch{finish(null)}};xhr.onerror=xhr.ontimeout=()=>finish(null);xhr.send();
}
