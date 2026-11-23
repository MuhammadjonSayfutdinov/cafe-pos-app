import React, { useMemo } from 'react';
import { encodeQr, qrSvgPath } from './qrEncode';

// QR kod rasmi (SVG). Tungi rejimda ham doim oq fonda qora: aks holda kamera o'qimaydi.
// margin - QR atrofidagi oq hoshiya (kataklar soni, standart bo'yicha 4).
export default function QrCodeSvg({ value, ecc = 'M', margin = 4, className = '', style, title }) {
  const path = useMemo(() => {
    try {
      return qrSvgPath(encodeQr(String(value || ''), { ecc }), margin);
    } catch {
      return null;
    }
  }, [value, ecc, margin]);

  if (!path) {
    return (
      <div className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: '#b91c1c', fontSize: 10, fontWeight: 700, textAlign: 'center' }}>
        Havola juda uzun
      </div>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${path.viewSize} ${path.viewSize}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title || 'QR kod'}
      className={className}
      style={style}
    >
      <rect width={path.viewSize} height={path.viewSize} fill="#ffffff" />
      <path d={path.d} fill="#000000" />
    </svg>
  );
}
