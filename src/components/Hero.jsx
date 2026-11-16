import FinishTime from './FinishTime.jsx';
import React, { useEffect, useState } from 'react';
import { titleMetadata } from '../titleMetadata.js';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n.js';
import Icon from './Icons.jsx';

const TYPE_LABEL = { movie: 'Film', series: 'Serie TV', live: 'Live TV' };

export default function Hero({ item: originalItem, onMore }) {
  const [enriched,setEnriched]=useState(null);
  useEffect(()=>{let alive=true;setEnriched(null);if(originalItem)titleMetadata(originalItem).then(data=>{if(alive)setEnriched(data)});return()=>{alive=false}},[originalItem]);
  const item=enriched||originalItem;
  const { t } = useI18n();
  const navigate = useNavigate();
  if (!item) return null;
  // Use the wide backdrop only (never a portrait poster). If it's missing/slow,
  // the .hero-bg CSS gradient shows through — we never blank it to black.
  const bg = item.backdrop || '';

  const play = () => {
    if (item.type === 'series') onMore(item);
    else navigate(`/watch/${item.type}/${item.id}`);
  };

  return (
    <div className="hero">
      <div className="hero-bg" style={bg ? { backgroundImage: `url("${bg}")` } : undefined} />
      <div className="hero-content">
        <h1 className="hero-title">{item.name}</h1>
        <div className="hero-meta">
          {item.imdbRating > 0 && <span className="imdb-pill">IMDb {item.imdbRating.toFixed(1)}/10</span>}
          {item.year && <span>{item.year}</span>}
          <span style={{ textTransform: 'capitalize' }}>{t(TYPE_LABEL[item.type] || item.type)}</span>
          {item.genre && <span>{item.genre}</span>}
        </div>
        {item.plot && <p className="hero-plot">{item.plot}</p>}
        <FinishTime item={item} />
        <div className="hero-actions">
          <button className="btn btn-play" onClick={play} data-focusable><Icon name="play" size={18} /> {t('Riproduci')}</button>
          <button className="btn btn-info" onClick={() => onMore(item)} data-focusable><Icon name="info" size={18} /> {t('Altre info')}</button>
        </div>
      </div>
    </div>
  );
}
