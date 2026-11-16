import { companionUrl } from './config.js';
export const RELAY_URL = companionUrl;
export function relayRequest(path, data) {
  if (!RELAY_URL) return Promise.reject(new Error('Bağlantı servisi yapılandırılmamış.'));
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();
    request.open(data===undefined?'GET':'POST',RELAY_URL+'/api/pairs'+path);
    request.timeout=7000;
    request.onload=()=>{try{const result=JSON.parse(request.responseText);if(request.status<200||request.status>=300)throw new Error(result.error||'Bağlantı kurulamadı.');resolve(result);}catch(err){reject(err);}};
    request.onerror=request.ontimeout=()=>reject(new Error('Bağlantı servisine ulaşılamadı.'));
    if(data!==undefined)request.setRequestHeader('Content-Type','application/json');
    request.send(data===undefined?null:JSON.stringify(data));
  });
}
export function notifyReceiver(token, sequence, state, message) {
  if (token) relayRequest('/'+token+'/status',{sequence,state,message}).catch(()=>{});
}
