import React, { useEffect, useState } from 'react';

// Taom rasmi. Rasm yo'q yoki yuklanmasa (internet yo'q, havola buzilgan) - fallback chiqadi.
// Bulutdagi rasm crossOrigin bilan so'raladi: service worker uni keshlab, internetsiz ham ko'rsatadi
// (src/pwa/sw-template.js).
export default function DishImage({ src, alt = '', className = '', fallback = null, loading = 'lazy' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return fallback;

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      draggable={false}
      crossOrigin={String(src).startsWith('https://') ? 'anonymous' : undefined}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
