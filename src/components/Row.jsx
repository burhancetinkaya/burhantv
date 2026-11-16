import { useI18n } from '../i18n.js';
import React, { useRef } from 'react';
import Card from './Card.jsx';
import Icon from './Icons.jsx';
import { useTV } from '../hooks/useTv.js';

export default function Row({ title, items, poster, progressMap, onItem, onRemove, numbered }) {
  const { t } = useI18n();
  const trackRef = useRef(null);
  const { isTV } = useTV();
  if (!items || !items.length) return null;

  var displayItems = numbered ? items.slice(0, 10) : items;

  const scroll = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    const distance = dir * el.clientWidth * 0.85;
    // Older TV engines may expose no element scrollBy/options support.
    try {
      if (typeof el.scrollBy === 'function') {
        el.scrollBy({ left: distance, behavior: 'smooth' });
        return;
      }
    } catch (e) {}
    el.scrollLeft += distance;
  };

  return (
    <section className={'row' + (numbered && isTV ? ' row-top10' : '')}>
      <h2 className="row-title">{title}</h2>
      <div className="row-track-wrap">
        <button className="row-arrow left" onClick={() => scroll(-1)} aria-label={t('Scorri a sinistra')} tabIndex={-1}><Icon name="chevronLeft" size={28} /></button>
        <div className="row-track" ref={trackRef} data-focus-group>
          {displayItems.map((it, idx) => (
            <Card
              key={it.type + it.id}
              item={it}
              poster={poster}
              progress={progressMap && progressMap[`${it.type}:${it.id}`]}
              onClick={onItem}
              onRemove={onRemove}
              number={numbered && isTV ? idx + 1 : undefined}
            />
          ))}
        </div>
        <button className="row-arrow right" onClick={() => scroll(1)} aria-label={t('Scorri a destra')} tabIndex={-1}><Icon name="chevronRight" size={28} /></button>
      </div>
    </section>
  );
}
