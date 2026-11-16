import { getStore } from '@netlify/blobs';
export default async function(){
  const store=getStore({name:'burhantv-links-v1',consistency:'strong'});
  for await(const page of store.list({prefix:'pair/',paginate:true})){
    for(const blob of page.blobs){
      const pair=await store.get(blob.key,{type:'json'});
      if(pair&&Date.now()-pair.created>24*60*60*1000){
        const token=blob.key.slice(5);
        await Promise.all([store.delete(blob.key),store.delete('message/'+token),store.delete('status/'+token)]);
      }
    }
  }
  return new Response('ok');
}
export const config={schedule:'0 4 * * *'};
