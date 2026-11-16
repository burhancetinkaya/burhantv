import assistant from './assistant.mjs';
import { controller } from '../lib/assistant-store.mjs';
import { publicOrigin } from '../lib/public-origin.mjs';
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const str=description=>({type:'string',description});
const deviceId=str('devices aracından dönen TV kimliği.');
const item=object({id:str('Arşiv yapım kimliği.'),type:{type:'string',enum:['movie','series']}},['id','type']);
const tools=[
 {name:'list_tvs',description:'Eşleştirilmiş TV adlarını, çevrimiçi durumunu ve arşiv sayısını getirir.',inputSchema:object({}),path:'/devices',method:'GET'},
 {name:'pair_tv',description:'TV ChatGPT Asistan ekranındaki ilk eşleştirme koduyla yeni TV ekler. Bağlantı kodu OAuth kodundan ayrıdır.',inputSchema:object({code:str('TV’deki ilk eşleştirme kodu.'),name:str('Salon TV gibi kullanıcıya ait ad.')},['code','name']),path:'/pair',method:'POST'},
 {name:'search_library',description:'Seçilen TV arşivinde başlık arar veya doğrulanmış IMDb puanı/süre/tür filtreleriyle öneri adayları bulur. Eksik bilgili adayları inspect_library ile doğrulayın. Sağlayıcı şifresi/oynatma URL’si döndürmez.',inputSchema:object({deviceId,query:str('Film adı veya adın bir bölümü. Boş bırakılabilir.'),genre:str('Tür sözcüğü. Yalnız tür bilgisi olanları eşleştirir.'),minRating:{type:'number',minimum:0,maximum:10},maxMinutes:{type:'integer',minimum:1,maximum:500},unwatched:{type:'boolean'}},['deviceId']),path:'/search',method:'GET'},
 {name:'inspect_library',description:'Arşivdeki 1–5 yapımın doğru IMDb puanı, süresi ve türünü TV üzerinden doğrulatır. Asenkron sonuç için action_status çağırın.',inputSchema:object({deviceId,items:{type:'array',items:item,minItems:1,maxItems:5},requestId:str('Aynı isteğin tekrarında aynı, yeni istekte yeni 8–100 karakterli harf/rakam/tire kimliği.')},['deviceId','items','requestId']),path:'/inspect',method:'POST'},
 {name:'resolve_video_link',description:'Verilen genel film sayfasındaki açık MP4/M3U8 veya iframe kaynaklarını bulmayı dener. CAPTCHA, DRM veya erişim engeli aşmaz. Çalıştığı ancak TV durumuyla doğrulanabilir. needs_direct_link durumunda kullanıcıdan doğrudan medya bağlantısı isteyin.',inputSchema:object({url:str('Kullanıcının verdiği veya web aramasında gerçekten görülen sayfa/medya adresi.')},['url']),path:'/resolve',method:'POST'},
 {name:'play_on_tv',description:'Kullanıcı belirli filmi seçip TV’de açılmasını istediğinde çağırın. Arşiv için id/type veya doğrudan video için url verin. Komutun gönderilmesi oynatıldığı anlamına gelmez; action_status ile playing durumunu doğrulayın.',inputSchema:object({deviceId,id:str('Arşiv yapım kimliği.'),type:{type:'string',enum:['movie','series']},url:str('Doğrudan MP4/M3U8 bağlantısı. Arşiv id/type ile birlikte vermeyin.'),title:str('Gönderilen videonun adı.'),requestId:str('Aynı açma isteğinin tekrarında aynı, yeni kullanıcı isteğinde yeni 8–100 karakterli kimlik.')},['deviceId','requestId']),path:'/play',method:'POST'},
 {name:'action_status',description:'inspect veya play komutunun gerçek TV sonucunu getirir. pending/opened oynuyor demek değildir. playing oynatmanın başladığını doğrular. inspect için complete ile doğrulanmış yapım bilgileri döner.',inputSchema:object({deviceId,sequence:str('Komutun döndürdüğü sequence.')},['deviceId','sequence']),path:'/status',method:'GET'}
];
export default async function(request){
 const base=publicOrigin();
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type,MCP-Protocol-Version,Mcp-Session-Id','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!await controller(request))return new Response(JSON.stringify({error:'Authentication required'}),{status:401,headers:{...headers,'WWW-Authenticate':'Bearer resource_metadata="'+base+'/.well-known/oauth-protected-resource/mcp"'}});
 if(request.method!=='POST')return new Response(null,{status:405,headers});
 let b;try{const text=await request.text();if(text.length>25000)throw Error();b=JSON.parse(text)}catch{return new Response(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}}),{status:400,headers})}
 if(b.id===undefined)return new Response(null,{status:202,headers});
 const response=result=>new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,result}),{headers});
 if(b.method==='initialize')return response({protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'burhantv-assistant',version:'1.0.0'},instructions:'Türkçe konuş. Önce arşivde doğrula, puan/süre uydurma. Yalnız kullanıcı seçtiği filmi açmanı istediğinde oynat. playing doğrulanmadan açıldı deme.'});
 if(b.method==='ping')return response({});
 if(b.method==='tools/list')return response({tools:tools.map(({path,method,...t})=>({...t,annotations:{readOnlyHint:method==='GET'||t.name==='resolve_video_link',destructiveHint:false,idempotentHint:true,openWorldHint:t.name==='resolve_video_link'||t.name==='play_on_tv'}}))});
 if(b.method==='tools/call'){
  const tool=tools.find(t=>t.name===b.params?.name);if(!tool)return new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,error:{code:-32602,message:'Unknown tool'}}),{headers});
  const args=b.params.arguments||{},url=new URL(base+'/api/assistant'+tool.path),options={method:tool.method,headers:{authorization:request.headers.get('authorization'),'Content-Type':'application/json'}};
  if(tool.method==='GET')for(const [k,v]of Object.entries(args)){if(v!==undefined)url.searchParams.set(k,String(v))}else options.body=JSON.stringify(args);
  const result=await assistant(new Request(url,options));const data=await result.json();return response({content:[{type:'text',text:JSON.stringify(data)}],isError:!result.ok});
 }
 return new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,error:{code:-32601,message:'Method not found'}}),{headers});
}
export const config={path:'/mcp',rateLimit:{windowSize:60,windowLimit:120,aggregateBy:['ip'],action:'rate_limit'}};
