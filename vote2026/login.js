import { 
  login, 
  signUp,
  getCurrentUser, 
  logout, 
  renderAuthHeaderWidget,
  getRoleBadgeHtml,
  ROLES 
} from './lib/auth.js';
import { setSupabaseConfig, clearSupabaseConfig, getSupabaseUrl, getSupabaseAnonKey, isSupabaseConfigured } from './lib/supabase.js';

window.refreshSessionBanner = function() {
  const user = getCurrentUser();
  const banner = document.getElementById('current-session-banner');
  if (!banner) return;

  if (user) {
    banner.classList.remove('hidden');
    const nameEl = document.getElementById('session-user-name');
    const badgeEl = document.getElementById('session-user-role-badge');
    const usernameEl = document.getElementById('session-username');

    if (nameEl) nameEl.textContent = user.name;
    if (badgeEl) badgeEl.innerHTML = getRoleBadgeHtml(user.role);
    if (usernameEl) usernameEl.textContent = user.username || user.email;

    const logoutBtn = document.getElementById('btn-session-logout');
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        logout();
        window.location.reload();
      };
    }
  } else {
    banner.classList.add('hidden');
  }
};

window.renderAuthHeaderWidget = renderAuthHeaderWidget;

function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');
  const required = urlParams.get('required');
  const redirect = urlParams.get('redirect');

  const alertEl = document.getElementById('redirect-alert');
  const alertTitle = document.getElementById('alert-title');
  const alertMsg = document.getElementById('alert-message');

  if (alertEl && alertTitle && alertMsg) {
    if (reason === 'unauthenticated') {
      alertEl.classList.remove('hidden');
      alertTitle.textContent = '🔒 ログインが必要です';
      alertMsg.textContent = `「${redirect || 'この画面'}」を表示するにはスタッフアカウントでログインしてください。`;
    } else if (reason === 'unauthorized') {
      alertEl.classList.remove('hidden');
      alertTitle.textContent = '⚠️ 閲覧・操作権限がありません';
      alertMsg.textContent = `アクセスしようとした画面への権限がありません。必要な役職: 【${required || '制限あり'}】`;
    }
  }
}

function initSupabaseModal() {
  const modal = document.getElementById('supabase-config-modal');
  const btnOpenModal = document.getElementById('btn-open-supabase-config');
  const btnCloseModal = document.getElementById('btn-close-supabase-config');
  const cfgForm = document.getElementById('supabase-config-form');
  const btnClearConfig = document.getElementById('btn-clear-supabase-config');

  if (btnOpenModal && modal) {
    btnOpenModal.addEventListener('click', () => {
      const urlInput = document.getElementById('cfg-supabase-url');
      const keyInput = document.getElementById('cfg-supabase-key');
      if (urlInput) urlInput.value = isSupabaseConfigured() ? getSupabaseUrl() : '';
      if (keyInput) keyInput.value = isSupabaseConfigured() ? getSupabaseAnonKey() : '';
      modal.classList.remove('hidden');
    });
  }

  if (btnCloseModal && modal) {
    btnCloseModal.addEventListener('click', () => modal.classList.add('hidden'));
  }

  if (cfgForm) {
    cfgForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = document.getElementById('cfg-supabase-url')?.value;
      const key = document.getElementById('cfg-supabase-key')?.value;
      setSupabaseConfig(url, key);
    });
  }

  if (btnClearConfig) {
    btnClearConfig.addEventListener('click', () => {
      if (confirm('Supabase接続設定をクリアしてデモ表示モードに戻しますか？')) {
        clearSupabaseConfig();
      }
    });
  }
}

function init() {
  renderAuthHeaderWidget('header-user-widget');
  checkUrlParams();
  window.refreshSessionBanner();
  initSupabaseModal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
