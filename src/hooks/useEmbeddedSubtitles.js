import { useEffect, useState } from 'react';
import { inspectTvSubtitles, tvSubtitleWindow } from '../tvEmbeddedSubtitles.js';

export default function useEmbeddedSubtitles(url, time) {
  const [tracks,setTracks]=useState([]),[session,setSession]=useState(null),[selected,setSelected]=useState(''),[status,setStatus]=useState(''),[cues,setCues]=useState([]),[offset,setOffset]=useState(0),[retry,setRetry]=useState(0);
  const onTV=location.protocol==='file:';
  const available=!!url;
  useEffect(()=>{
    let alive=true;
    setTracks([]);setSession(null);setSelected('');setCues([]);setOffset(0);setStatus('');
    if(!available)return;
    setStatus('Gömülü altyazılar okunuyor…');
    const request=onTV?inspectTvSubtitles(url):fetch('/api/external-subtitles/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);return data;});
    request.then(data=>{if(!alive)return;setSession(onTV?data:data.id);setTracks(data.tracks);setStatus(data.tracks.length?'':'Seçilebilir metin altyazısı bulunamadı.');}).catch(error=>{if(alive)setStatus(error.message||'Altyazılar okunamadı.');});
    return()=>{alive=false;};
  },[url,available,retry]);
  useEffect(()=>{setCues([]);},[session,selected]);
  const effectiveTime=Math.max(0,time-offset),segment=onTV?15:60,window=Math.floor(effectiveTime/segment);
  useEffect(()=>{
    let alive=true;
    if(!session||!selected)return;
    setStatus('Altyazı yükleniyor…');
    const timer=setTimeout(()=>{
      const request=onTV?tvSubtitleWindow(session,selected,Math.max(0,window*segment)):fetch('/api/external-subtitles/'+session+'/'+selected+'?time='+Math.max(0,window*segment)).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);return data;});
      request.then(data=>{if(alive){setCues(data.cues);setStatus('');}}).catch(error=>{if(alive)setStatus(error.message||'Altyazı yüklenemedi.');});
    },250);
    return()=>{alive=false;clearTimeout(timer);};
  },[session,selected,window,retry]);
  return {available,tracks,selected,select:setSelected,status,offset,setOffset,retry:()=>setRetry(value=>value+1),text:selected?cues.filter(c=>effectiveTime>=c.start&&effectiveTime<c.end).map(c=>c.text).join('\n'):''};
}
