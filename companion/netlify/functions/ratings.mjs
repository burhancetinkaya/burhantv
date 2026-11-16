import { getStore } from '@netlify/blobs';
import { gunzipSync } from 'node:zlib';
let loadedDay='', ratings=null, pending=null;
async function database(){
 const day=new Date().toISOString().slice(0,10);
 if(ratings&&loadedDay===day)return ratings;
 if(pending)return pending;
 pending=(async()=>{
  const store=getStore('burhantv-imdb-v1');
  const entry=await store.getWithMetadata('ratings.gz',{type:'arrayBuffer'});
  let data=entry?.data;
  if(!data||entry.metadata?.day!==day){
   const response=await fetch('https://datasets.imdbws.com/title.ratings.tsv.gz',{signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error('IMDb dataset unavailable');
   data=await response.arrayBuffer();
   await store.set('ratings.gz',data,{metadata:{day,sourceModified:response.headers.get('last-modified')}});
  }
  const text=gunzipSync(Buffer.from(data)).toString('utf8');
  const map=new Map();let start=text.indexOf('\n')+1;
  while(start<text.length){let end=text.indexOf('\n',start);if(end<0)end=text.length;const line=text.slice(start,end),a=line.indexOf('\t'),b=line.indexOf('\t',a+1);if(a>0&&b>a)map.set(line.slice(0,a),[Number(line.slice(a+1,b)),Number(line.slice(b+1))]);start=end+1;}
  ratings=map;loadedDay=day;return map;
 })().finally(()=>{pending=null});return pending;
}
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'};
export default async function(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='GET')return new Response('{}',{status:405,headers});
 const ids=[...new Set((new URL(request.url).searchParams.get('ids')||'').split(','))];
 if(!ids.length||ids.length>100||ids.some(id=>!/^tt\d{5,12}$/.test(id)))return new Response('{}',{status:400,headers});
 try{const db=await database();const result={};for(const id of ids){const r=db.get(id);result[id]=r?{rating:r[0],votes:r[1],updated:loadedDay,source:'IMDb'}:null;}return new Response(JSON.stringify({ratings:result}),{headers});}
 catch{ return new Response(JSON.stringify({error:'IMDb puanları şu anda alınamıyor.'}),{status:503,headers:{...headers,'Cache-Control':'no-store'}}); }
}
export const config={path:'/api/ratings',rateLimit:{windowSize:60,windowLimit:120,aggregateBy:['ip'],action:'rate_limit'}};
