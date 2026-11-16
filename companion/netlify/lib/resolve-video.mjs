import { lookup } from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import { isIP } from 'node:net';
function publicIP(ip){
 if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)))}
 if(isIP(ip)===6){const lower=ip.toLowerCase();return /^(2|3)/.test(lower)&&!lower.startsWith('2001:db8:')}
 return false;
}
async function read(raw,redirects=0){
 const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||(!['','80','443'].includes(u.port)))throw new Error('Yalnız genel HTTP(S) adresleri kullanılabilir.');
 const addresses=await lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicIP(a.address)))throw new Error('Yerel ağ adresleri desteklenmiyor.');
 const address=addresses[0];
 return new Promise((resolve,reject)=>{
  const req=(u.protocol==='https:'?https:http).get(u,{headers:{'User-Agent':'BurhanTv-LinkResolver/1.0','Range':'bytes=0-2097151','Accept':'text/html,video/*,application/vnd.apple.mpegurl;q=0.9,*/*;q=0.5'},lookup:(name,options,cb)=>options?.all?cb(null,[address]):cb(null,address.address,address.family)},res=>{
   if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.destroy();if(redirects>=4)return reject(new Error('Çok fazla yönlendirme.'));read(new URL(res.headers.location,u).href,redirects+1).then(resolve,reject);return}
   if(res.statusCode>=400){res.destroy();resolve({url:u.href,status:res.statusCode});return}
   const type=String(res.headers['content-type']||'');if(/video\/|mpegurl/.test(type)||/\.(mp4|m3u8)$/i.test(u.pathname)){res.destroy();resolve({url:u.href,media:true,type});return}
   let size=0,chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>2097152){res.destroy();reject(new Error('Sayfa çok büyük.'));return}chunks.push(chunk)});res.on('end',()=>resolve({url:u.href,status:res.statusCode,html:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
  });req.setTimeout(7000,()=>req.destroy(new Error('Sayfa yanıt vermedi.')));req.on('error',reject);
 });
}
const decode=s=>s.replace(/&amp;/g,'&').replace(/&#(?:x([a-f0-9]+)|(\d+));/gi,(_,h,n)=>String.fromCharCode(parseInt(h||n,h?16:10))).replace(/\\\//g,'/');
export async function resolveVideo(url){
 try{
  const queue=[String(url||'')],seen=new Set();let blocked=false;
  while(queue.length&&seen.size<6){const current=queue.shift();if(seen.has(current))continue;seen.add(current);const data=await read(current);
   if(data.media)return {status:'candidate',url:data.url,verifiedOnTV:false,message:'Medya bağlantısı bulundu; oynatılabilirliği TV durumu ile doğrulayın.'};
   if(data.status>=400){blocked=true;continue}
   const html=data.html||'',links=[];
   for(const m of html.matchAll(/(?:src|href|content)\s*=\s*["']([^"']+)["']/gi)){const value=decode(m[1]);if(/\.(mp4|m3u8)(?:[?#]|$)/i.test(value))links.unshift(value)}
   for(const m of html.matchAll(/["'](?:contentUrl|file|source)["']\s*:\s*["']([^"']+)["']/gi)){const value=decode(m[1]);if(/\.(mp4|m3u8)(?:[?#]|$)/i.test(value))links.push(value)}
   for(const m of html.matchAll(/<iframe[^>]*src\s*=\s*["']([^"']+)["']/gi))links.push(decode(m[1]));
   for(const link of links.slice(0,6)){try{queue.push(new URL(link,data.url).href)}catch{}}
  }
  return {status:'needs_direct_link',message:blocked?'Site otomatik erişimi reddetti. Doğrudan MP4/M3U8 bağlantısı gerekli.':'Açık bir MP4/M3U8 bağlantısı bulunamadı. Doğrudan medya bağlantısı gerekli.'};
 }catch{return {status:'needs_direct_link',message:'Bağlantı çözülemedi. Doğrudan MP4/M3U8 bağlantısı gerekli.'}}
}
