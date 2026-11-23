// QR kod yaratish (ISO/IEC 18004): bayt rejimi, 1-40 versiya, L/M/Q/H xato tuzatish darajasi.
// Tashqi xizmat va kutubxonasiz: stikerlar internetsiz ham chiziladi, stol havolasi
// begona serverga yuborilmaydi.
//
//   encodeQr(text, { ecc: 'M' }) -> { version, size, modules: boolean[][] } (modules[y][x], true = qora)
//   qrSvgPath(qr, margin) -> { d, viewSize } (SVG <path d> qora kataklar uchun)

const ECC_LEVELS = Object.freeze({
  L: { ordinal: 0, formatBits: 1 },
  M: { ordinal: 1, formatBits: 0 },
  Q: { ordinal: 2, formatBits: 3 },
  H: { ordinal: 3, formatBits: 2 }
});

// [daraja][versiya]: har bir blokdagi xato tuzatish baytlari soni
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
];

// [daraja][versiya]: xato tuzatish bloklari soni
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];

const MIN_VERSION = 1;
const MAX_VERSION = 40;

// Versiyadagi ma'lumot uchun kataklar soni (funksional naqshlardan tashqari)
const numRawDataModules = (ver) => {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
};

const numDataCodewords = (ver, ecl) =>
  Math.floor(numRawDataModules(ver) / 8) -
  ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];

// Bayt rejimida belgilar sonini yozish uchun bitlar
const charCountBits = (ver) => (ver <= 9 ? 8 : 16);

// ---------- Reed-Solomon (GF(256), 0x11D) ----------
const gfMultiply = (x, y) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
};

const reedSolomonDivisor = (degree) => {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
};

const reedSolomonRemainder = (data, divisor) => {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
};

// Ma'lumot baytlarini bloklarga bo'lib, xato tuzatish baytlarini qo'shib, aralashtiradi
const addEccAndInterleave = (data, ver, ecl) => {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks = [];
  const divisor = reedSolomonDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = reedSolomonRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0); // qisqa blok: aralashtirishda tashlab ketiladi
    blocks.push(dat.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
};

// ---------- Matritsa ----------
const alignmentPositions = (ver, size) => {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
};

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];

const buildMatrix = (ver, ecl, codewords) => {
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFunction = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  // Vaqt chiziqlari
  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  // Uchta katta burchak naqshi (oq hoshiya bilan)
  const drawFinder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Kichik tekislash naqshlari
  const align = alignmentPositions(ver, size);
  const n = align.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunction(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  const drawFormatBits = (mask) => {
    const data = (ecl.formatBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) !== 0;

    for (let i = 0; i <= 5; i++) setFunction(8, i, bit(i));
    setFunction(8, 7, bit(6));
    setFunction(8, 8, bit(7));
    setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(i));

    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(i));
    setFunction(8, size - 8, true); // doim qora katak
  };

  // Joyni band qilish (haqiqiy qiymat niqob tanlangach yoziladi)
  drawFormatBits(0);

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }

  // Ma'lumot baytlarini ilonsimon tartibda joylash
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < totalBits) {
          modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
      }
    }
  }

  const applyMask = (mask) => {
    const fn = MASKS[mask];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!isFunction[y][x] && fn(x, y)) modules[y][x] = !modules[y][x];
      }
    }
  };

  // Eng kam jarima balli niqobni tanlash (skanerlash oson bo'lishi uchun)
  let bestMask = 0;
  let minPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormatBits(mask);
    const penalty = penaltyScore(modules, size);
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = mask;
    }
    applyMask(mask); // XOR: qaytadan qo'llash niqobni olib tashlaydi
  }
  applyMask(bestMask);
  drawFormatBits(bestMask);

  return { size, modules };
};

// Standartdagi 4 qoida: uzun bir xil qator, 2x2 blok, burchak naqshiga o'xshash ketma-ketlik, qora ulushi
const penaltyScore = (modules, size) => {
  let result = 0;
  const finderLike = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true]
  ];
  const lineAt = (i, k, horizontal) => (horizontal ? modules[i][k] : modules[k][i]);

  for (const horizontal of [true, false]) {
    for (let i = 0; i < size; i++) {
      let runColor = lineAt(i, 0, horizontal);
      let runLen = 1;
      for (let k = 1; k < size; k++) {
        const c = lineAt(i, k, horizontal);
        if (c === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) result += 3 + (runLen - 5);
          runColor = c;
          runLen = 1;
        }
      }
      if (runLen >= 5) result += 3 + (runLen - 5);

      for (let k = 0; k + 11 <= size; k++) {
        for (const pattern of finderLike) {
          if (pattern.every((v, p) => lineAt(i, k + p, horizontal) === v)) result += 40;
        }
      }
    }
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += 3;
    }
  }

  let dark = 0;
  modules.forEach(row => row.forEach(c => { if (c) dark++; }));
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += Math.max(0, k) * 10;
  return result;
};

const toUtf8Bytes = (text) => {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
  return Array.from(unescape(encodeURIComponent(text)), ch => ch.charCodeAt(0));
};

export function encodeQr(text, { ecc = 'M' } = {}) {
  const ecl = ECC_LEVELS[ecc] || ECC_LEVELS.M;
  const bytes = toUtf8Bytes(String(text ?? ''));

  let ver = MIN_VERSION;
  for (; ver <= MAX_VERSION; ver++) {
    const usedBits = 4 + charCountBits(ver) + bytes.length * 8;
    if (usedBits <= numDataCodewords(ver, ecl) * 8) break;
  }
  if (ver > MAX_VERSION) throw new Error('QR kod uchun matn juda uzun');

  const capacityBits = numDataCodewords(ver, ecl) * 8;
  const bits = [];
  const appendBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  appendBits(0x4, 4); // bayt rejimi
  appendBits(bytes.length, charCountBits(ver));
  bytes.forEach(b => appendBits(b, 8));
  appendBits(0, Math.min(4, capacityBits - bits.length)); // tugatuvchi
  appendBits(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }

  const { size, modules } = buildMatrix(ver, ecl, addEccAndInterleave(data, ver, ecl));
  return { version: ver, size, modules };
}

// Qora kataklarni bitta SVG yo'liga yig'adi (yonma-yon kataklar bitta to'rtburchak)
export function qrSvgPath(qr, margin = 4) {
  const parts = [];
  qr.modules.forEach((row, y) => {
    let x = 0;
    while (x < qr.size) {
      if (!row[x]) {
        x++;
        continue;
      }
      let len = 1;
      while (x + len < qr.size && row[x + len]) len++;
      parts.push(`M${x + margin} ${y + margin}h${len}v1h-${len}z`);
      x += len;
    }
  });
  return { d: parts.join(''), viewSize: qr.size + margin * 2 };
}
