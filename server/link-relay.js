// LAN-only companion service. Videos stream directly to the TV, never through this server.
import './env.js';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import QRCode from 'qrcode';

const sessions = new Map();
const TTL = 2 * 60 * 60 * 1000;
const PORT = Number(process.env.LINK_PORT || 8796);
const HOST = process.env.LINK_HOST || '0.0.0.0';
const networkIp = Object.values(os.networkInterfaces()).flat().find(n => n.family === 'IPv4' && !n.internal)?.address;
const PUBLIC_URL = process.env.LINK_PUBLIC_URL || `http://${networkIp || '127.0.0.1'}:${PORT}`;
const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
function json(res, status, data) { res.writeHead(status, {...headers, 'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 12000) throw new Error('İstek çok uzun.'); }
  return JSON.parse(raw || '{}');
}
function validUrl(raw) {
  const url = new URL(String(raw || '').trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Geçerli bir HTTP(S) video bağlantısı gir.');
  return url.href;
}
const page = `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BurhanTv’ye Gönder</title><style>
*{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#141414;color:#fff;margin:0;padding:28px 20px}main{max-width:520px;margin:30px auto}.brand{display:inline-block;background:#e50914;font-size:26px;font-weight:bold;padding:10px 16px;border-radius:6px}h1{font-size:28px;line-height:1.2;margin-top:32px}p{color:#bbb;line-height:1.6}label{display:block;margin:28px 0 10px}input{width:100%;font-size:17px;padding:16px;border:1px solid #777;border-radius:6px;background:#242424;color:#fff}button{width:100%;padding:17px;background:#e50914;color:#fff;border:0;border-radius:6px;font-size:19px;font-weight:bold;margin-top:18px}button:disabled{opacity:.5}#result{min-height:55px;color:#fff}small{color:#999}</style><main><div class="brand">BurhanTv</div><h1>Bağlantıyı gönder.<br>Kumandayla izle.</h1><p>TV’de “Telefondan Gönder” ekranı açık olsun. Doğrudan MP4 veya M3U8 video bağlantısını yapıştır.</p><form id="form"><label for="url">Video bağlantısı</label><input id="url" type="url" placeholder="https://…/film.mp4" required autocomplete="off"><button id="send">TV’de oynat</button></form><p id="result" role="status"></p><small>Film sayfası bağlantıları desteklenmez. Telefonu gönderdikten sonra kapatabilirsin.</small></main><script>
const token=location.pathname.split('/').pop(), button=document.getElementById('send'), result=document.getElementById('result');
document.getElementById('form').onsubmit=async e=>{e.preventDefault();button.disabled=true;result.textContent='TV’ye gönderiliyor…';try{const r=await fetch('/api/pairs/'+token+'/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:document.getElementById('url').value})});const data=await r.json();if(!r.ok)throw new Error(data.error);result.textContent='Bağlantı gönderildi. TV’nin yanıtı bekleniyor…';let count=0;const timer=setInterval(async()=>{try{const response=await fetch('/api/pairs/'+token+'/status');if(!response.ok)throw new Error();const s=await response.json();if(s.sequence!==data.sequence||++count>20){clearInterval(timer);result.textContent='Gönderildi. Oynatma durumunu TV’den kontrol et.';button.disabled=false;return;}if(['playing','error','closed'].includes(s.state)){clearInterval(timer);result.textContent=s.state==='playing'?'TV’de oynatma başladı. Kumandayı kullanabilirsin.':s.state==='error'?'TV videoyu açamadı: '+s.message:'TV bağlantıyı aldı. Kumandayla devam edebilirsin.';button.disabled=false;}}catch(_){clearInterval(timer);result.textContent='Bağlantı gönderildi; TV durumuna ulaşılamadı.';button.disabled=false;}},1000);}catch(err){result.textContent=err.message||'Bağlantı kurulamadı.';button.disabled=false;}};
</script></html>`;

http.createServer(async (req, res) => {
  if(req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if(req.method === 'POST' && path === '/api/pairs') {
      if(sessions.size >= 100) { json(res,429,{error:'Çok fazla oturum. Biraz sonra dene.'}); return; }
      const token = crypto.randomBytes(18).toString('hex');
      sessions.set(token,{created:Date.now(),sequence:0,url:'',state:'waiting',message:''});
      const sendUrl = PUBLIC_URL+'/send/'+token;
      json(res,201,{token,sendUrl,qr:await QRCode.toDataURL(sendUrl,{width:300,margin:2}),expiresIn:TTL}); return;
    }
    const match = path.match(/^\/api\/pairs\/([a-f0-9]{36})(?:\/(send|status))?$/);
    if(match) {
      const s = sessions.get(match[1]);
      if(!s || Date.now()-s.created>TTL) { json(res,404,{error:'Eşleşme süresi doldu. TV’den yeni QR kod aç.'}); return; }
      if(req.method === 'POST' && match[2] === 'send') {
        const data = await body(req); s.url=validUrl(data.url); s.sequence++; s.state='pending';s.message='';
        json(res,200,{sequence:s.sequence}); return;
      }
      if(req.method === 'POST' && match[2] === 'status') {
        const data=await body(req);
        if(data.sequence===s.sequence && ['received','playing','error','closed'].includes(data.state)){s.state=data.state;s.message=String(data.message||'').slice(0,200);}
        json(res,200,{ok:true});return;
      }
      if(req.method === 'GET') { json(res,200,{sequence:s.sequence,url:match[2] === 'status' ? undefined : s.url,state:s.state,message:s.message});return; }
    }
    if(req.method==='GET' && /^\/send\/[a-f0-9]{36}$/.test(path)) {
      res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'"});res.end(page);return;
    }
    json(res,404,{error:'TV’de Telefondan Gönder ekranını açıp QR kodu okut.'});
  } catch(error) { json(res,400,{error:error.message || 'İstek işlenemedi.'}); }
}).listen(PORT, HOST, () => console.log(`BurhanTv bağlantı servisi: ${PUBLIC_URL}`));
setInterval(()=>{for(const [key,s] of sessions)if(Date.now()-s.created>TTL)sessions.delete(key);},60000).unref();
