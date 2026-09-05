import { 
  login, 
  signUp,
  getCurrentUser, 
  logout, 
  renderAuthHeaderWidget, 
  getRoleBadgeHtml, 
  ROLES 
} from '@/lib/auth.js';
import { setSupabaseConfig, clearSupabaseConfig, getSupabaseUrl, getSupabaseAnonKey, isSupabaseConfigured } from '@/lib/supabase.js';
import { showToast, escapeHtml } from '@/lib/utils.js';

document.addEventListener('DOMContentLoaded', () => {
  renderAuthHeaderWidget('header-user-widget');
  checkUrlParams();
  refreshSessionBanner();
  initEventListeners();
});

// URLパラメータ・ハッシュに基づく通知アラートおよびタブ切り替え制御
function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');
  const required = urlParams.get('required');
  const redirect = urlParams.get('redirect');
  const mode = urlParams.get('mode');

  const alertEl = document.getElementById('redirect-alert');
  const alertTitle = document.getElementById('alert-title');
  const alertMsg = document.getElementById('alert-message');

  if (mode === 'signup' || window.location.hash === '#signup') {
    switchFormTab('signup');
  }

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

// フォームタブ切り替え（ログイン / サインアップ）
function switchFormTab(tab) {
  const tabLogin = document.getElementById('tab-btn-login');
  const tabSignup = document.getElementById('tab-btn-signup');
  const containerLogin = document.getElementById('login-form-container');
  const containerSignup = document.getElementById('signup-form-container');

  if (tab === 'signup') {
    if (tabLogin) tabLogin.className = 'flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all text-slate-400 hover:text-slate-200 flex items-center justify-center gap-2';
    if (tabSignup) tabSignup.className = 'flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all bg-emerald-600 text-white shadow-md flex items-center justify-center gap-2';
    if (containerLogin) containerLogin.classList.add('hidden');
    if (containerSignup) containerSignup.classList.remove('hidden');
  } else {
    if (tabLogin) tabLogin.className = 'flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all bg-indigo-600 text-white shadow-md flex items-center justify-center gap-2';
    if (tabSignup) tabSignup.className = 'flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all text-slate-400 hover:text-slate-200 flex items-center justify-center gap-2';
    if (containerLogin) containerLogin.classList.remove('hidden');
    if (containerSignup) containerSignup.classList.add('hidden');
  }
}
window.switchFormTab = switchFormTab;

// 現在のセッションバナーの更新
function refreshSessionBanner() {
  const currentUser = getCurrentUser();
  const banner = document.getElementById('current-session-banner');
  if (!banner) return;

  if (currentUser) {
    banner.classList.remove('hidden');
    document.getElementById('session-user-name').textContent = currentUser.name;
    document.getElementById('session-user-role-badge').innerHTML = getRoleBadgeHtml(currentUser.role);
    document.getElementById('session-username').textContent = currentUser.username;

    const logoutBtn = document.getElementById('btn-session-logout');
    if (logoutBtn) {
      logoutBtn.onclick = () => logout();
    }
  } else {
    banner.classList.add('hidden');
  }
}

// イベントリスナーのセットアップ
function initEventListeners() {
  // タブ切替ボタン
  document.getElementById('tab-btn-login')?.addEventListener('click', () => switchFormTab('login'));
  document.getElementById('tab-btn-signup')?.addEventListener('click', () => switchFormTab('signup'));
  document.getElementById('link-to-signup')?.addEventListener('click', () => switchFormTab('signup'));
  document.getElementById('link-to-login')?.addEventListener('click', () => switchFormTab('login'));

  // Supabase設定モーダル
  const modal = document.getElementById('supabase-config-modal');
  const btnOpenModal = document.getElementById('btn-open-supabase-config');
  const btnCloseModal = document.getElementById('btn-close-supabase-config');
  const cfgForm = document.getElementById('supabase-config-form');
  const btnClearConfig = document.getElementById('btn-clear-supabase-config');

  if (btnOpenModal && modal) {
    btnOpenModal.addEventListener('click', () => {
      document.getElementById('cfg-supabase-url').value = isSupabaseConfigured() ? getSupabaseUrl() : '';
      document.getElementById('cfg-supabase-key').value = isSupabaseConfigured() ? getSupabaseAnonKey() : '';
      modal.classList.remove('hidden');
    });
  }

  if (btnCloseModal && modal) {
    btnCloseModal.addEventListener('click', () => modal.classList.add('hidden'));
  }

  if (cfgForm) {
    cfgForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = document.getElementById('cfg-supabase-url').value;
      const key = document.getElementById('cfg-supabase-key').value;
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

  // 通常ログインフォーム
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const remember = document.getElementById('remember-me').checked;

      const submitBtn = document.getElementById('btn-submit-login');
      const errorAlert = document.getElementById('login-error-alert');
      const errorText = document.getElementById('login-error-text');
      const successAlert = document.getElementById('login-success-alert');
      const successText = document.getElementById('login-success-text');

      // UI初期化・ローディング状態
      if (errorAlert) errorAlert.classList.add('hidden');
      if (successAlert) successAlert.classList.add('hidden');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> 認証確認中...`;
      }

      const res = await login(username, password, remember);

      if (res.success) {
        if (successAlert && successText) {
          successText.textContent = `ようこそ、${res.user.name}さん (${res.user.role})！画面を切り替えています...`;
          successAlert.classList.remove('hidden');
        }
        showToast(`ようこそ、${res.user.name}さん (${res.user.role})`, 'success');
        refreshSessionBanner();
        renderAuthHeaderWidget('header-user-widget');
        redirectAfterLogin(res.user.role);
      } else {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> ログインする`;
        }
        if (errorAlert && errorText) {
          errorText.textContent = res.message || 'ユーザー名またはパスワードが正しくありません。';
          errorAlert.classList.remove('hidden');
        }
        showToast(res.message || 'ログインに失敗しました', 'error');
      }
    });
  }

  // サインアップ (新規アカウント登録) フォーム
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('signup-username').value;
      const name = document.getElementById('signup-name').value;
      const email = document.getElementById('signup-email')?.value || '';
      const role = document.getElementById('signup-role').value;
      const password = document.getElementById('signup-password').value;
      const confirmPassword = document.getElementById('signup-confirm-password').value;

      const submitBtn = signupForm.querySelector('button[type="submit"]');
      const errorAlert = document.getElementById('signup-error-alert');
      const errorText = document.getElementById('signup-error-text');
      const successAlert = document.getElementById('signup-success-alert');
      const successText = document.getElementById('signup-success-text');

      if (errorAlert) errorAlert.classList.add('hidden');
      if (successAlert) successAlert.classList.add('hidden');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> 登録処理中...`;
      }

      const res = await signUp({ username, email, name, role, password, confirmPassword, autoLogin: true });

      if (res.success) {
        const user = res.user || { name, role };
        if (successAlert && successText) {
          successText.textContent = `アカウント「${name}」を登録しました！役職【${role}】でログイン中。転送しています...`;
          successAlert.classList.remove('hidden');
        }
        showToast(`アカウント「${name}」を登録しました。役職【${role}】でログイン中。`, 'success');
        refreshSessionBanner();
        renderAuthHeaderWidget('header-user-widget');
        redirectAfterLogin(role);
      } else {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i class="fa-solid fa-user-plus"></i> アカウントを作成してログイン`;
        }
        if (errorAlert && errorText) {
          errorText.textContent = res.message || '登録中にエラーが発生しました。';
          errorAlert.classList.remove('hidden');
        }
        showToast(res.message || 'サインアップに失敗しました', 'error');
      }
    });
  }
}

// ログイン成功後の適正画面への遷移制御
function redirectAfterLogin(role) {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectTarget = urlParams.get('redirect');

  setTimeout(() => {
    if (redirectTarget && redirectTarget !== 'login.html') {
      window.location.href = `./${redirectTarget}`;
      return;
    }

    // 役職デフォルト遷移先
    switch (role) {
      case ROLES.UNEI:
        window.location.href = './reception.html';
        break;
      case ROLES.KAIHYO:
        window.location.href = './tally.html';
        break;
      case ROLES.ADMIN:
        window.location.href = './admin.html';
        break;
      default:
        window.location.href = './index.html';
        break;
    }
  }, 500);
}

