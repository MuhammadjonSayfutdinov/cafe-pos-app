import React from 'react';

// Biror komponent xato bersa, butun ekran oq bo'lib qolmasligi uchun.
// Foydalanuvchiga xabar, qayta yuklash va ma'lumotlarni yuklab olish imkoni beriladi.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Ilovada xato:', error, info?.componentStack);
  }

  handleDownloadData = () => {
    // Faqat pos_ kalitlari; PIN va token bo'lsa ham bu fayl faqat egasining qurilmasida qoladi
    const dump = {};
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('pos_')) dump[key] = window.localStorage.getItem(key);
      }
    } catch {
      // ignore
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pos-favqulodda-nusxa-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-900">
        <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-3xl p-6 sm:p-8 shadow-xl border border-red-100 dark:border-red-900/50 text-center">
          <div className="text-5xl mb-3">⚠️</div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">Dasturda kutilmagan xato yuz berdi</h1>
          <p className="mt-2 text-sm font-bold text-gray-500 dark:text-gray-400">
            Ma'lumotlaringiz qurilmada saqlangan. Sahifani qayta yuklang. Xato takrorlansa,
            ma'lumotlarni yuklab olib, dasturchiga yuboring.
          </p>
          <pre className="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 text-left text-xs text-red-600 dark:text-red-300 overflow-auto max-h-32 whitespace-pre-wrap">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-black text-sm"
            >
              🔄 Qayta yuklash
            </button>
            <button
              type="button"
              onClick={this.handleDownloadData}
              className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-black text-sm"
            >
              💾 Ma'lumotlarni yuklab olish
            </button>
          </div>
        </div>
      </div>
    );
  }
}
