import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import WatchTV from './WatchTV.jsx';
export default function ExternalPlayer() {
  const location=useLocation(), navigate=useNavigate();
  const source=location.state;
  let title='Gönderilen video';
  try {
    const url=new URL(source.url);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error();
    title=decodeURIComponent(url.pathname.split('/').pop()).replace(/\.(mp4|m3u8)$/i,'').slice(0,140);
  } catch (_) { return <div className="page"><h1>Video bağlantısı yok</h1><button className="btn btn-play" onClick={()=>navigate('/send-to-tv')}>Yeni bağlantı gönder</button></div>; }
  return <WatchTV externalSource={{...source,title}} onExternalClose={()=>navigate('/send-to-tv',{replace:true})} />;
}
