const { execSync } = require('child_process');

console.log('🚀 GitHub Avtopilot ishga tushdi! Har 5 soniyada o\'zgarishlar tekshiriladi...');

setInterval(() => {
  try {
    // 1. O'zgargan fayllar bor-yo'qligini tekshiramiz
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();

    if (status.length > 0) {
      // 2. Barcha fayllarni yig'amiz, commit qilamiz va GitHub'ga yuboramiz
      execSync('git add -A', { stdio: 'ignore' });
      execSync('git commit -m "Auto-sync"', { stdio: 'ignore' });
      execSync('git push origin master', { stdio: 'ignore' });
      
      console.log(`✅ [${new Date().toLocaleTimeString()}] O'zgarishlar avtomatik GitHub'ga yuborildi!`);
    }
  } catch (err) {
    // Internet uzilsa yoki xato bo'lsa to'xtab qolmaydi, keyingi 5 soniyada qayta urinadi
  }
}, 5000);