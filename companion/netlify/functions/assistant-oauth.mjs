import { db,token,hash,uuid } from '../lib/assistant-store.mjs';
import { publicOrigin } from '../lib/public-origin.mjs';
const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json=(status,value)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(hidden,error=''){return new Response(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BurhanTv bağlantısı</title><style>body{font:18px system-ui;background:#141414;color:white;max-width:620px;margin:60px auto;padding:24px}h1{color:#fff;background:#e50914;padding:18px}input,button{font:inherit;padding:14px;box-sizing:border-box;width:100%;margin:12px 0}button{background:#e50914;color:white;border:0;border-radius:6px}small{color:#bbb}p{line-height:1.5}.error{color:#ffb4b4}</style><h1>BurhanTv Asistan</h1><p>ChatGPT, eşleştirilmiş TV’lerin film/dizi arşivini arayabilecek ve istediğin videoyu TV’de açabilecek. IPTV şifren paylaşılmaz.</p><p>TV’de <b>ChatGPT Asistan</b> ekranını aç. Oradaki 8 karakterli bağlantı kodunu gir.</p>${error?'<p class="error">'+escape(error)+'</p>':''}<form method="post" action="/oauth/authorize">${Object.entries(hidden).map(([k,v])=>`<input type="hidden" name="${escape(k)}" value="${escape(v)}">`).join('')}<label>TV bağlantı kodu<input name="tv_code" required maxlength="8" autocomplete="off" placeholder="Örnek: A1B2C3D4"></label><button>ChatGPT’ye bağlan</button></form><small>Bu bağlantı bilgisayar açık kalmadan çalışır. Kod kısa süreli ve tek kullanımlıktır.</small></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}})}
async function grant(){const access=token(),refresh=token(),expires=Date.now()+30*86400000;await db().setJSON('access/'+hash(access),{expires});await db().setJSON('refresh/'+hash(refresh),{expires:Date.now()+90*86400000});return {access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:30*86400,scope:'tv:read tv:play'}}
export default async function(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 const ORIGIN=publicOrigin();
 const u=new URL(request.url),store=db();
 try{
  if(u.pathname.includes('oauth-protected-resource'))return json(200,{resource:ORIGIN+'/mcp',authorization_servers:[ORIGIN],scopes_supported:['tv:read','tv:play']});
  if(u.pathname.includes('oauth-authorization-server'))return json(200,{issuer:ORIGIN,authorization_endpoint:ORIGIN+'/oauth/authorize',token_endpoint:ORIGIN+'/oauth/token',registration_endpoint:ORIGIN+'/oauth/register',revocation_endpoint:ORIGIN+'/oauth/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:['tv:read','tv:play']});
  if(u.pathname==='/oauth/register'&&request.method==='POST'){
   const raw=await request.text();if(raw.length>10000)return json(400,{error:'invalid_client_metadata'});const b=JSON.parse(raw);
   if(!Array.isArray(b.redirect_uris)||!b.redirect_uris.length||b.redirect_uris.length>10||b.redirect_uris.some(value=>{try{const r=new URL(value);return r.protocol!=='https:'||r.username||r.password||r.hash}catch{return true}}))return json(400,{error:'invalid_redirect_uri'});
   const id=uuid();await store.setJSON('client/'+id,{redirect_uris:b.redirect_uris});return json(201,{client_id:id,client_id_issued_at:Math.floor(Date.now()/1000),redirect_uris:b.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']});
  }
  if(u.pathname==='/oauth/authorize'){
   const p=request.method==='POST'?new URLSearchParams(await request.text()):u.searchParams;
   const client=await store.get('client/'+p.get('client_id'),{type:'json'});
   if(!client||!client.redirect_uris.includes(p.get('redirect_uri'))||p.get('response_type')!=='code'||p.get('code_challenge_method')!=='S256'||!/^[\w-]{43}$/.test(p.get('code_challenge')||''))return json(400,{error:'invalid_request'});
   const hidden=Object.fromEntries(['client_id','redirect_uri','response_type','state','code_challenge','code_challenge_method','scope'].map(k=>[k,p.get(k)||'']));
   if(request.method==='GET'){
    const csrf=token();await store.setJSON('consent/'+hash(csrf),{expires:Date.now()+600000,clientId:p.get('client_id')});return page({...hidden,csrf});
   }
   const csrf=p.get('csrf')||'',consent=await store.get('consent/'+hash(csrf),{type:'json'});
   if(!consent||consent.expires<Date.now()||consent.clientId!==p.get('client_id'))return json(400,{error:'invalid_request'});
   const tvCode=(p.get('tv_code')||'').trim().toUpperCase(),pair=/^[A-F0-9]{8}$/.test(tvCode)?await store.get('connect-code/'+tvCode,{type:'json'}):null;
   if(!pair||pair.expires<Date.now())return page({...hidden,csrf},'Kod geçersiz veya süresi dolmuş. TV’deki güncel kodu kullan.');
   const device=await store.get('device/'+pair.deviceId,{type:'json'});if(!device?.paired)return json(400,{error:'invalid_request'});
   const code=token();await store.setJSON('authorization/'+hash(code),{clientId:p.get('client_id'),redirectUri:p.get('redirect_uri'),challenge:p.get('code_challenge'),expires:Date.now()+60000});
   await store.delete('connect-code/'+tvCode);await store.delete('connect/'+pair.deviceId);await store.delete('consent/'+hash(csrf));
   const redirect=new URL(p.get('redirect_uri'));redirect.searchParams.set('code',code);if(p.get('state'))redirect.searchParams.set('state',p.get('state'));
   return new Response(null,{status:302,headers:{...headers,Location:redirect.href}});
  }
  if(u.pathname==='/oauth/token'&&request.method==='POST'){
   const p=new URLSearchParams(await request.text());
   if(p.get('grant_type')==='authorization_code'){
    const key='authorization/'+hash(p.get('code')||''),authorization=await store.get(key,{type:'json'});
    const verifier=p.get('code_verifier')||'',challenge=Buffer.from(hash(verifier),'hex').toString('base64url');
    if(!authorization||authorization.expires<Date.now()||authorization.clientId!==p.get('client_id')||authorization.redirectUri!==p.get('redirect_uri')||challenge!==authorization.challenge)return json(400,{error:'invalid_grant'});
    await store.delete(key);return json(200,await grant());
   }
   if(p.get('grant_type')==='refresh_token'){
    const key='refresh/'+hash(p.get('refresh_token')||''),r=await store.get(key,{type:'json'});if(!r||r.expires<Date.now())return json(400,{error:'invalid_grant'});await store.delete(key);return json(200,await grant());
   }
   return json(400,{error:'unsupported_grant_type'});
  }
  if(u.pathname==='/oauth/revoke'&&request.method==='POST'){const p=new URLSearchParams(await request.text()),h=hash(p.get('token')||'');await Promise.all([store.delete('access/'+h),store.delete('refresh/'+h)]);return json(200,{})}
  return json(404,{error:'not_found'});
 }catch{return json(400,{error:'invalid_request'})}
}
export const config={path:['/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp','/oauth/*'],rateLimit:{windowSize:60,windowLimit:30,aggregateBy:['ip'],action:'rate_limit'}};
