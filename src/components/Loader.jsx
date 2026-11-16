import BrandLogo from './BrandLogo';
import React from 'react';

export default function Loader({ full, label }) {
  return (
    <div className={'loader' + (full ? ' full' : '')}>
      {full && <div className="brand-flicker"><BrandLogo /></div>}
      <div className="spinner" />
      {label && <span className="loader-label">{label}</span>}
    </div>
  );
}
