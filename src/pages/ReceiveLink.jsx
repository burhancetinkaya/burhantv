import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { relayRequest } from '../linkRelay.js';
import { loadSentLinks, rememberSentLink, removeSentLink, restoreSentLink, sentPositionLabel } from '../sentLinkHistory.js';

export default function ReceiveLink() {
  const navigate = useNavigate();
  const [history,setHistory] = useState(loadSentLinks);
  const [removed,setRemoved] = useState(null);
  const [notice,setNotice] = useState('');
  const [pair,setPair] = useState(null);
  const [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let alive=true, timer;
    setError('');setPair(null);
    relayRequest('',{}).then(data=>{
      if(!alive)return;
      setPair(data);
      async function poll(){
        try {
          const message=await relayRequest('/'+data.token);
          if(!alive)return;
          if(message.sequence && message.url){
            const remembered=rememberSentLink(message.url);
            navigate('/external',{state:{url:message.url,token:data.token,sequence:message.sequence,historySaved:remembered.saved},replace:true});return;
          }
          setError('');
        }catch(err){if(alive)setError('Gönderme servisine ulaşılamadı. TV’nin internet bağlantısını kontrol et.');}
        if(alive)timer=setTimeout(poll,1500);
      }
      poll();
    }).catch(()=>{if(alive)setError('Gönderme servisine ulaşılamadı. TV’nin internet bağlantısını kontrol et.');});
    return()=>{alive=false;clearTimeout(timer);};
  },[navigate,attempt]);
  useEffect(()=>{
    setHistory(loadSentLinks());
    const timer=setTimeout(()=>{const first=document.querySelector('.sent-link-open');if(first)first.focus();},200);
    return()=>clearTimeout(timer);
  },[]);
  function showSender(){
    const panel=document.querySelector('.receive-card');
    if(panel)panel.scrollIntoView({block:'center'});
    const action=document.querySelector('.receive-actions button');if(action)action.focus();
  }
  function remove(item){
    const result=removeSentLink(item.id);
    if(!result.saved){setNotice('Kart silinemedi. Yeniden dene.');return;}
    setRemoved(result.item);setHistory(loadSentLinks());setNotice('Kart silindi.');
    setTimeout(()=>{const target=document.querySelector('.sent-links button')||document.querySelector('.receive-actions button');if(target)target.focus();},0);
  }
  function undo(){
    if(!removed||!restoreSentLink(removed)){setNotice('Kart geri alınamadı.');return;}
    setRemoved(null);setHistory(loadSentLinks());setNotice('Kart geri alındı.');
  }
  return <main className="page receive-link">
    <div className="receive-heading"><h1>Telefondan Gönder</h1><button className="btn btn-info" data-focusable onClick={showSender}>Yeni link gönder</button></div>
    <p>1. Telefonunu internete bağla. &nbsp; 2. QR kodu okut. &nbsp; 3. Video linkini yapıştırıp gönder.</p>
    <section className="sent-links" aria-labelledby="sent-links-title">
      <div className="sent-links-heading"><h2 id="sent-links-title">Gönderdiklerim</h2><span>{history.length} kayıt</span></div>
      <p className="sent-links-note">Kartı seçerek yeniden açabilirsin. Bağlantının süresi dolmuşsa yeni bir link göndermen gerekir.</p>
      {notice && <div className="sent-links-notice" role="status">{notice} {removed && <button data-focusable onClick={undo}>Geri al</button>}</div>}
      {history.length ? <div className="sent-links-grid">{history.map(item=><article className="sent-link-card" key={item.id}>
        <button className="sent-link-open" data-focusable aria-label={item.title + (item.position > 0 && !item.completed ? ' — Devam et' : ' — Oynat')} onClick={()=>navigate('/external',{state:{url:item.url},replace:true})}>
          <span className="sent-link-play" aria-hidden="true">▶</span><h3>{item.title}</h3><span className="sent-link-host">{new URL(item.url).hostname}</span><time dateTime={new Date(item.sentAt).toISOString()}>{new Date(item.sentAt).toLocaleDateString('tr-TR')}</time>{item.position > 0 && item.duration > 0 && !item.completed && <div className="sent-link-progress"><div style={{width:Math.min(100,item.position/item.duration*100)+'%'}} /></div>}
          <span className="sent-link-action">{item.position > 0 && !item.completed ? 'Devam et · '+sentPositionLabel(item.position) : 'Yeniden oynat'}</span>
        </button>
        <button className="sent-link-delete" data-focusable aria-label={item.title + ' — Sil'} onClick={()=>remove(item)}>Sil</button>
      </article>)}</div> : <div className="sent-links-empty">Henüz gönderilen bir video yok. İlk bağlantın burada kart olarak görünecek.</div>}
    </section>
    <div className="receive-card">
      {pair ? <><img src={pair.qr} width="300" height="300" alt="Telefondan video göndermek için QR kod"/><div><h2>MP4 veya M3U8 bağlantısı gönder</h2><p>Video bu TV’de açılır. Duraklatma ve ileri–geri sarma için TV kumandasını kullan.</p><p>Telefon ve TV internet üzerinden eşleşir. Bilgisayarın açık kalması gerekmez; gönderimden sonra telefonu kapatabilirsin.</p><details><summary>QR kodu okuyamıyorum</summary><p className="receive-address">{pair.sendUrl}</p></details><p className="receive-wait">Bağlantı bekleniyor…</p></div></> : <p>{error ? 'Bağlantı kurulamadı.' : 'QR kod hazırlanıyor…'}</p>}
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="receive-actions"><button className="btn btn-info" data-focusable onClick={()=>setAttempt(value=>value+1)}>Yeni QR kod</button><button className="btn btn-info" data-focusable onClick={()=>navigate('/')}>Ana sayfa</button></div>
  </main>;
}
