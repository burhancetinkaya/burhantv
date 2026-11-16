import { useEffect,useRef } from 'react';
import { useNavigate,useLocation } from 'react-router-dom';
import { assistantRequest,assistantDevice,updateAssistant } from '../assistantConnection.js';
import { assistantCatalogTV,isStartupCatalogFresh } from '../apiTV.js';
import { titleMetadata } from '../titleMetadata.js';
import { api } from '../api.js';
import { rememberSentLink } from '../sentLinkHistory.js';
import { RELAY_URL } from '../linkRelay.js';
export default function useAssistant(enabled){
 const navigate=useNavigate(),location=useLocation();
 const navigateRef=useRef(navigate),locationRef=useRef(location);navigateRef.current=navigate;locationRef.current=location;
 useEffect(()=>{
  if(!enabled||!RELAY_URL)return;let alive=true,timer,device,seen=localStorage.getItem('burhantv-assistant-last-command')||'',ack=null,catalogSynced=false,nextCatalogAttempt=0;
  let playbackCommand='',playbackPath='';
  async function poll(){
   try{
    if(!device)device=await assistantDevice();
    const v=document.querySelector('.watch video'),err=document.querySelector('.watch-error');
    const playback=playbackCommand?{sequence:playbackCommand,state:locationRef.current.pathname!==playbackPath?'closed':err?'error':v&&!v.paused&&v.readyState>=2?'playing':v&&v.readyState>=2?'paused':'opened'}:undefined;
    const result=await assistantRequest('/device/'+device.id+'/poll',{seenSequence:seen,ack,playback},device.token);if(!alive)return;ack=null;
    updateAssistant({connected:result.paired,name:result.name,code:result.code,connectCode:result.connectCode||'',error:''});
    // Upload only after both provider lists were refreshed this launch.
    // A failed upload retries without fetching the provider or ratings again.
    if(result.paired&&!catalogSynced&&isStartupCatalogFresh()&&Date.now()>=nextCatalogAttempt){
     nextCatalogAttempt=Date.now()+30000;
     try{
      const rows=assistantCatalogTV();
      const saved=await assistantRequest('/device/'+device.id+'/catalog',{items:rows},device.token);
      catalogSynced=true;updateAssistant({catalogCount:saved.count});
     }catch(e){updateAssistant({error:'Arşiv gönderilemedi; tekrar denenecek. '+e.message})}
    }
    if(!alive)return;
    const c=result.command;if(c&&c.sequence!==seen){
     seen=c.sequence;localStorage.setItem('burhantv-assistant-last-command',seen);
     if(c.action==='inspect'){
      const keepAlive=setInterval(()=>{if(alive)assistantRequest('/device/'+device.id+'/poll',{seenSequence:seen,playback},device.token).catch(()=>{})},8000);
      try{
        const items=await Promise.all(c.items.map(async item=>{try{const detail=await api.detail(item.type,item.id);const m=await titleMetadata(detail,true);return {id:String(item.id),type:item.type,title:item.title,year:m.year,genre:m.genre,runtimeMinutes:m.runtimeMinutes,imdbId:m.imdbId,imdbRating:m.imdbRating,imdbVotes:m.imdbVotes}}catch{return item}}));
        ack={sequence:c.sequence,state:'complete',items};
      }finally{clearInterval(keepAlive)}
     }else if(c.action==='play_library'){
      const match=assistantCatalogTV().find(i=>i.id===String(c.id)&&i.type===c.type);
      if(match){playbackCommand=c.sequence;ack={sequence:c.sequence,state:'opened'};playbackPath='/watch/'+c.type+'/'+c.id;navigateRef.current(playbackPath)}else ack={sequence:c.sequence,state:'error'};
     }else if(c.action==='play_url'){
      try{const u=new URL(c.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();const remembered=rememberSentLink(c.url);playbackCommand=c.sequence;ack={sequence:c.sequence,state:'opened'};playbackPath='/external';navigateRef.current('/external',{state:{url:c.url,historySaved:remembered.saved}})}catch{ack={sequence:c.sequence,state:'error'}};
     }
    }
   }catch(e){if(alive)updateAssistant({error:e.message});}
   if(alive)timer=setTimeout(poll,ack?250:3500);
  }
  poll();return()=>{alive=false;clearTimeout(timer)};
 },[enabled]);
}
