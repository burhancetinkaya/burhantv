import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SAMPLE = '';

export default function WebTest() {
  const navigate = useNavigate();
  const frame = useRef(null);
  const [input, setInput] = useState(SAMPLE);
  const [url, setUrl] = useState('');
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('Bağlantıyı açarak denemeyi başlat.');

  useEffect(() => {
    if (!url) return;
    const timer = setTimeout(() => setStatus('İçerik görünmüyorsa site gömülmeyi engellemiş veya doğrulama istiyor olabilir. Yükleme bildirimi oynatmanın çalıştığını doğrulamaz.'), 12000);
    return () => clearTimeout(timer);
  }, [url, revision]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.keyCode !== 10009 && event.key !== 'Escape') return;
      event.preventDefault();
      event._tvHandled = true;
      if (url) { setUrl(''); setStatus('Sayfa kapatıldı.'); }
      else navigate('/');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [url, navigate]);

  function open(event) {
    event.preventDefault();
    try {
      const parsed = new URL(input.trim());
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
      if (parsed.username || parsed.password) throw new Error();
      setUrl(parsed.href);
      setRevision(value => value + 1);
      setStatus('Sayfa yükleniyor…');
    } catch (_) { setStatus('Geçerli bir HTTP veya HTTPS bağlantısı gir.'); }
  }

  return <main className="web-test">
    <div className="web-test-heading"><h1>Web’den İzle <small>Deneme</small></h1><button className="btn btn-info" data-focusable onClick={() => navigate('/')}>Ana sayfa</button></div>
    <form className="web-test-form" onSubmit={open}>
      <label htmlFor="web-url">Film sayfası bağlantısı</label>
      <div><input id="web-url" type="url" value={input} onChange={event => setInput(event.target.value)} spellCheck={false} autoComplete="off" required data-focusable /><button className="btn btn-play" data-focusable type="submit">Sayfayı aç</button></div>
    </form>
    <div className="web-test-tools">
      <button className="btn btn-info" data-focusable disabled={!url} onClick={() => { frame.current?.focus(); }}>Sayfaya odaklan</button>
      <button className="btn btn-info" data-focusable disabled={!url} onClick={() => { setRevision(value => value + 1); setStatus('Sayfa yeniden yükleniyor…'); }}>Yenile</button>
      <button className="btn btn-info" data-focusable disabled={!url} onClick={() => { setUrl(''); setStatus('Sayfa kapatıldı.'); }}>Sayfayı kapat</button>
    </div>
    <p className="web-test-status" role="status">{status}</p>
    <p className="web-test-note">Bu deneme sitenin kendi oynatıcısını kullanır. Kontroller, reklamlar ve kumanda uyumu siteye bağlıdır. Açılır pencereler engellenir. Sayfanın içine odaklanınca Geri/Esc tuşu uygulamaya ulaşmayabilir; üstteki kapatma düğmesini kullan.</p>
    <div className="web-test-stage">
      {url ? <iframe ref={frame} key={revision} src={url} title="Film sitesi deneme ekranı" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen onLoad={() => setStatus('Çerçeveden yükleme bildirimi alındı. Sayfanın ve videonun görünmesini kontrol et.')} /> : <div className="web-test-empty">Film sayfası burada açılacak.</div>}
    </div>
  </main>;
}
