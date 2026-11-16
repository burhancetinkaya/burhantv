import { localizeTvItem } from './tmdbTV.js';
const cache=new Map(),jobs=[];let active=0;
function pump(){while(active<3&&jobs.length){const run=jobs.shift();active++;run().finally(()=>{active--;pump()})}}
export function titleMetadata(item,priority=false){
 if(!item||item.type==='live')return Promise.resolve(item);
 const key=[item.type,item.id,item.name,item.year||''].join(':');
 if(cache.has(key))return cache.get(key);
 const promise=new Promise(resolve=>{jobs[priority?'unshift':'push'](async()=>{try{resolve(await localizeTvItem(item))}catch{resolve(item)}});pump()});
 cache.set(key,promise);return promise;
}
