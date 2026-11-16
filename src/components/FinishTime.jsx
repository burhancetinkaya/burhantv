import React, { useEffect, useState } from 'react';
export function runtimeMinutes(value){
 if(typeof value==='number')return value>0?value:0;
 const s=String(value||'').trim();if(!s)return 0;
 if(/^\d+:\d\d(?::\d\d)?$/.test(s)){const n=s.split(':').map(Number);return n.length===3?n[0]*60+n[1]+n[2]/60:n[0]+n[1]/60;}
 const n=Number(s.replace(/\s*(?:min|dk|minutes?)\.?$/i,''));return Number.isFinite(n)&&n>0?n:0;
}
export default function FinishTime({item}){
 const [now,setNow]=useState(Date.now());useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(t)},[]);
 if(!item||item.type!=='movie')return null;
 const mins=Number(item.runtimeMinutes)||runtimeMinutes(item.duration);if(!mins)return null;
 const end=new Date(now+mins*60000),today=new Date(now);
 const clock=String(end.getHours()).padStart(2,'0')+'.'+String(end.getMinutes()).padStart(2,'0');
 return <div className="finish-time">Şimdi başlarsanız {end.getDate()!==today.getDate()?'yarın ':''}{clock}’ta biter <small>· yaklaşık {Math.round(mins)} dk</small></div>;
}
