import { titleMetadata } from '../titleMetadata.js';
import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../i18n.js';
import Icon from './Icons.jsx';

var SEVEN_DAYS = 7 * 24 * 3600;

export default function Card({ item, poster, progress, onClick, onRemove, number }) {
  const { t } = useI18n();
  const cardRef = useRef(null);
  const [metadata,setMetadata] = useState(null);
  useEffect(()=>{
    let alive=true,observer;
    setMetadata(null);
    const load=()=>titleMetadata(item).then(data=>{if(alive)setMetadata(data)});
    if(item.type!=='live'){
      if(typeof IntersectionObserver==='function'){
        observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load()}},{rootMargin:'100px'});
        if(cardRef.current)observer.observe(cardRef.current);
      }else load();
    }
    return()=>{alive=false;if(observer)observer.disconnect()};
  },[item.type,item.id,item.name]);
  const imdb=metadata||item;
  const [err, setErr] = useState(false);
  const pct = progress && progress.duration > 0
    ? Math.min(100, (progress.position / progress.duration) * 100)
    : 0;

  const src = poster ? (item.icon || item.backdrop) : (item.backdrop || item.icon);
  var isNew = item.added && (Math.floor(Date.now() / 1000) - Number(item.added)) < SEVEN_DAYS;

  return (
    <div className={'card-wrap' + (number ? ' numbered' : '')}>
      {number && <div className="card-number">{number}</div>}
      <div
        ref={cardRef}
        className={'card' + (poster ? ' poster' : '')}
        onClick={() => onClick(item)}
        title={item.name}
        tabIndex={0}
        data-focusable
        onKeyDown={(e) => { if (e.key === 'Enter' || (e.keyCode || e.which) === 13) { e.preventDefault(); onClick(item); } }}
      >
        {imdb.imdbRating > 0 && <span className="card-imdb" title={'IMDb · '+imdb.imdbVotes+' oy · '+imdb.imdbUpdated}>IMDb {imdb.imdbRating.toFixed(1)}</span>}
        {item.type === 'live' && <span className="card-badge">{t('Live')}</span>}
        {isNew && item.type !== 'live' && <span className="card-badge card-badge-new">{t('NUOVO')}</span>}
        {onRemove && (
          <button
            className="card-remove"
            aria-label={t('Rimuovi da Continua a guardare')}
            onClick={(e) => { e.stopPropagation(); onRemove(item); }}
          >
            <Icon name="close" size={16} />
          </button>
        )}
        {!err && src ? (
          <img src={src} alt={item.name} loading="lazy" onError={() => setErr(true)} />
        ) : (
          <div className="card-fallback">{item.name}</div>
        )}
        <div className="card-playhint" aria-hidden><Icon name="play" size={20} /></div>
        <div className="card-hovercap">{item.name}</div>
        {pct > 0 && <div className="card-progress"><i style={{ width: pct + '%' }} /></div>}
        <div className="card-focus-info">
          {item.year && <span>{item.year}</span>}
          {imdb.imdbRating > 0 && <span>IMDb {imdb.imdbRating.toFixed(1)}</span>}
          {item.genre && <span>{item.genre}</span>}
        </div>
      </div>
    </div>
  );
}
