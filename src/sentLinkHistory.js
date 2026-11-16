const KEY='burhantv-sent-links-v1',LIMIT=50;
export function linkTitle(raw){
  try{const url=new URL(raw);let name=url.pathname.split('/').filter(Boolean).pop()||url.hostname;try{name=decodeURIComponent(name);}catch(_){}return name.replace(/\.(mp4|m3u8)$/i,'').replace(/_/g,' ').slice(0,160)||'Gönderilen video';}catch(_){return 'Gönderilen video';}
}
function valid(item){
  if(!item||typeof item.id!=='string'||typeof item.url!=='string')return false;
  try{const url=new URL(item.url);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch(_){return false;}
}
export function loadSentLinks(){
  try{const items=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(items)?items.filter(valid).slice(0,LIMIT).map(item=>Object.assign({},item,{title:typeof item.title==='string'?item.title:linkTitle(item.url),sentAt:Number.isFinite(item.sentAt)?item.sentAt:Date.now()})):[];}catch(_){return [];}
}
function save(items){
  try{localStorage.setItem(KEY,JSON.stringify(items.slice(0,LIMIT)));return true;}catch(_){return false;}
}
export function rememberSentLink(raw){
  const url=new URL(raw).href;
  if(!valid({id:'new',url}))throw new Error('Geçersiz video bağlantısı.');
  const items=loadSentLinks(),previous=items.find(item=>item.url===url);
  const item=Object.assign({},previous||{},{id:previous?previous.id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),url,title:linkTitle(url),sentAt:Date.now()});
  return {saved:save([item,...items.filter(entry=>entry.url!==url)]),item};
}
export function removeSentLink(id){
  const items=loadSentLinks(),item=items.find(entry=>entry.id===id);
  return {saved:save(items.filter(entry=>entry.id!==id)),item};
}
export function restoreSentLink(item){
  if(!valid(item))return false;
  const items=loadSentLinks();return save([item,...items.filter(entry=>entry.id!==item.id&&entry.url!==item.url)].sort((a,b)=>b.sentAt-a.sentAt));
}

export function sentLinkProgress(raw){
  const item=loadSentLinks().find(entry=>entry.url===raw);
  return {position:item&&!item.completed&&Number.isFinite(item.position)?Math.max(0,item.position):0,duration:item&&Number.isFinite(item.duration)?item.duration:0};
}
export function saveSentLinkProgress(raw,position,duration,completed=false){
  if(!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0||position<0)return null;
  const items=loadSentLinks(),index=items.findIndex(item=>item.url===raw);
  if(index<0)return null;
  items[index]=Object.assign({},items[index],{position:Math.min(position,duration),duration,completed,progressAt:Date.now()});
  return save(items);
}
export function sentPositionLabel(position){
  const total=Math.max(0,Math.floor(Number(position)||0));
  const seconds=('0'+total%60).slice(-2),minutes=Math.floor(total/60)%60,hours=Math.floor(total/3600);
  return hours?hours+':'+('0'+minutes).slice(-2)+':'+seconds:Math.floor(total/60)+':'+seconds;
}
