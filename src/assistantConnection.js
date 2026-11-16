import { RELAY_URL } from './linkRelay.js';
const STORAGE='burhantv-assistant-device-v1';let initial;
export function assistantRequest(path,data,token){
 if(!RELAY_URL)return Promise.reject(new Error('Bağlantı servisi yapılandırılmamış.'));
 return new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open(data===undefined?'GET':'POST',RELAY_URL+'/api/assistant'+path);x.timeout=25000;if(token)x.setRequestHeader('Authorization','Bearer '+token);x.onload=()=>{try{const result=JSON.parse(x.responseText);if(x.status<200||x.status>=300)throw Object.assign(new Error(result.error||'Asistan bağlantısı kurulamadı.'),{status:x.status});resolve(result)}catch(e){reject(e)}};x.onerror=x.ontimeout=()=>reject(new Error('Asistan bağlantısı kurulamadı.'));if(data!==undefined)x.setRequestHeader('Content-Type','application/json');x.send(data===undefined?null:JSON.stringify(data))});
}
export function assistantDevice(){
 if(initial)return initial;
 initial=(async()=>{let device;try{device=JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{};if(device?.id&&device?.token)return device;device=await assistantRequest('/register',{});localStorage.setItem(STORAGE,JSON.stringify(device));return device})().catch(e=>{initial=null;throw e});return initial;
}
let view={connected:false,name:'TV',code:'',connectCode:'',error:'',catalogCount:0};const listeners=new Set();
export function assistantView(){return view}
export function observeAssistant(fn){listeners.add(fn);return()=>listeners.delete(fn)}
export function updateAssistant(patch){view={...view,...patch};listeners.forEach(fn=>fn(view))}
