import React, { useRef, useState } from 'react';
import DishImage from './DishImage';

// Taom rasmlari galereyasi (mijoz oynasi, keyinchalik kiosk): barmoq bilan surib ko'riladi,
// pastdagi nuqtalar qaysi rasm ochiqligini ko'rsatadi. images: getMenuImages(item)
export default function DishGallery({ images, alt = '', className = '' }) {
  const list = Array.isArray(images) ? images : [];
  const [active, setActive] = useState(0);
  const scrollerRef = useRef(null);

  if (list.length === 0) return null;

  const handleScroll = (e) => {
    const el = e.currentTarget;
    if (!el.clientWidth) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== active) setActive(idx);
  };

  const goTo = (idx) => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className={`relative rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 ${className}`}>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar"
      >
        {list.map((img, idx) => (
          <div key={img.id || idx} className="w-full shrink-0 snap-center aspect-[4/3]">
            <DishImage
              src={img.src}
              alt={list.length > 1 ? `${alt} (${idx + 1}/${list.length})` : alt}
              loading={idx === 0 ? 'eager' : 'lazy'}
              className="w-full h-full object-cover"
              fallback={<div className="w-full h-full" />}
            />
          </div>
        ))}
      </div>

      {list.length > 1 && (
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
          {list.map((img, idx) => (
            <button
              key={img.id || idx}
              type="button"
              onClick={() => goTo(idx)}
              aria-label={`${idx + 1}-rasm`}
              className={`h-2 rounded-full shadow transition-all ${idx === active ? 'w-5 bg-white' : 'w-2 bg-white/55'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
