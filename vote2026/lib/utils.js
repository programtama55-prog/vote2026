/**
 * こども選挙用 共通ユーティリティライブラリ
 */

/**
 * データベース内の `{漢字|かんじ}` という形式の文字列を、
 * HTMLの `<ruby>漢字<rt>かんじ</rt></ruby>` タグに変換します。
 * 
 * @param {string} text - 変換前テキスト
 * @returns {string} HTMLセーフなルビ付きテキスト
 */
export function parseFurigana(text) {
  if (!text) return '';
  // HTMLエスケープ処理をしてからルビ化（XSS対策）
  const escaped = escapeHtml(text);
  return escaped.replace(/\{([^|]+)\|([^}]+)\}/g, '<ruby>$1<rt class="text-[0.6em] text-slate-500 font-normal select-none">$2</rt></ruby>');
}

/**
 * HTMLの特殊文字をエスケープします。
 * @param {string} unsafe 
 * @returns {string}
 */
export function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 配列の要素を公平にランダムシャッフルします（Fisher-Yatesアルゴリズム）
 * 候補者の並び順を毎回ランダムにすることで、特定の候補者に有利・不利が出ないようにします。
 * 
 * @param {Array} array 
 * @returns {Array} シャッフルされた新しい配列
 */
export function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

/**
 * 子ども向けに最適化されたトースト通知を表示します。
 * 
 * @param {string} message - メッセージ（ふりがな対応可能）
 * @param {'success' | 'error' | 'info'} type - 通知の種類
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  // ふりがな表示に対応させるため、parseFuriganaを通す
  const formattedMsg = parseFurigana(message);

  let bgClass = 'bg-white border-blue-200';
  let iconClass = 'fa-circle-info text-blue-500';
  
  if (type === 'success') {
    bgClass = 'bg-emerald-50 border-emerald-200 text-emerald-800';
    iconClass = 'fa-circle-check text-emerald-500 animate-bounce';
  } else if (type === 'error') {
    bgClass = 'bg-rose-50 border-rose-200 text-rose-800';
    iconClass = 'fa-circle-exclamation text-rose-500';
  } else if (type === 'info') {
    bgClass = 'bg-blue-50 border-blue-200 text-blue-800';
    iconClass = 'fa-circle-info text-blue-500';
  }

  toast.className = `flex items-center gap-3 px-5 py-4 rounded-2xl border shadow-lg max-w-sm w-full pointer-events-auto transition-all duration-300 transform translate-y-4 opacity-0 ${bgClass}`;
  toast.innerHTML = `
    <i class="fa-solid ${iconClass} text-xl shrink-0"></i>
    <div class="text-sm font-bold tracking-wide">${formattedMsg}</div>
  `;

  container.appendChild(toast);

  // 表示アニメーション
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  // 4秒後に自動消去
  setTimeout(() => {
    toast.classList.add('translate-y-[-10px]', 'opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}
