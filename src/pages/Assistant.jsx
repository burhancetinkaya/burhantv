import React,{useEffect,useState} from 'react';
import { assistantView,observeAssistant } from '../assistantConnection.js';
export default function Assistant(){
 const [state,setState]=useState(assistantView);useEffect(()=>observeAssistant(setState),[]);
 return <main className="page assistant-page"><h1>Bu akşam ne izlesek?</h1><p>ChatGPT ile film seç, istediğin TV’de aç.</p>
 <section className="assistant-card"><h2>{state.connected?state.name:'TV’yi eşleştir'}</h2>
 {!state.connected?<><p>İlk kurulum için eşleştirme kodu:</p><strong className="assistant-code">{state.code||'Hazırlanıyor…'}</strong></>:<><p>ChatGPT eklentisindeki Bağlan ekranında bu kodu kullan:</p><strong className="assistant-code">{state.connectCode||'Hazırlanıyor…'}</strong><p>{state.catalogCount?state.catalogCount.toLocaleString('tr-TR')+' yapım arşivi hazır.':'Arşiv hazırlanıyor…'}</p></>}
 <p>“Eşimle gerilim izleyelim; 2 saati geçmesin, IMDb 7 üstü olsun.”</p><p>Seçtikten sonra: “Bunu salon TV’de aç.”</p>
 <p className="assistant-note">BurhanTv açıkken komutları alır. Film açıldıktan sonra kumandanla duraklatabilir, sarabilir ve altyazıyı seçebilirsin. Erişim engelli sayfalarda doğrudan MP4/M3U8 bağlantısı gerekebilir.</p>
 {state.error&&<p role="alert">{state.error}</p>}</section></main>
}
