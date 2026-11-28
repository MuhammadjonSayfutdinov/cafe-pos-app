// Tekshiruvlar (Vitest): npm test. Faqat mantiq (src/utils, src/sync, src/qr) tekshiriladi, brauzer kerak emas.
// Asosiy vite.config.js ishlatilmaydi: undagi PWA va versiya plaginlari faqat build uchun.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node'
  }
});
