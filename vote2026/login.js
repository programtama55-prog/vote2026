import { 
  login, 
  signUp,
  loginAsRole, 
  getCurrentUser, 
  logout, 
  getAccounts, 
  addAccount, 
  updateAccountRole, 
  deleteAccount, 
  renderAuthHeaderWidget, 
  getRoleBadgeHtml, 
  ROLES 
} from '@/lib/auth.js';
import { showToast, escapeHtml } from '@/lib/utils.js';

document.addEventListener('DOMContentLoaded', () => {
  renderAuthHeaderWidget('header-user-widget');
  checkUrlParams();
  refreshSessionBanner();
  initEventListeners();
  renderAccountsTable();
});

// URLパラメータに基づく通知アラートの制御
function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason');
  const required = urlParams.get('required');
  const redirect = urlParams.get('redirect');
  const mode = urlParams.get('mode');

  const alertEl = document.getElementById('redirect-alert');
  const alertTitle = document.getElementById('alert-title');
  const alertMsg = document.getElementById('alert-message');

  if (mode === 'signup') {
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
    tabLogin.className = 'flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all text-slate-400 hover:text-slate-200 flex items-center justify-center gap-2';
    tabSignup.className = 'flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all bg-emerald-600 text-white shadow-md flex items-center justify-center gap-2';
    containerLogin.classList.add('hidden');
    containerSignup.classList.remove('hidden');
  } else {
    tabLogin.className = 'flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all bg-indigo-600 text-white shadow-md flex items-center justify-center gap-2';
    tabSignup.className = 'flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all text-slate-400 hover:text-slate-200 flex items-center justify-center gap-2';
    containerLogin.classList.remove('hidden');
    containerSignup.classList.add('hidden');
  }
}

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

  // 通常ログインフォーム
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember-me').checked;

    const res = login(username, password, remember);
    if (res.success) {
      showToast(`ようこそ、${res.user.name}さん (${res.user.role})`, 'success');
      redirectAfterLogin(res.user.role);
    } else {
      showToast(res.message, 'error');
    }
  });

  // サインアップ (新規アカウント登録) フォーム
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('signup-username').value;
      const name = document.getElementById('signup-name').value;
      const role = document.getElementById('signup-role').value;
      const password = document.getElementById('signup-password').value;
      const confirmPassword = document.getElementById('signup-confirm-password').value;

      const res = signUp({ username, name, role, password, confirmPassword, autoLogin: true });
      if (res.success) {
        showToast(`アカウント「${name}」を登録しました。役職【${role}】でログイン中。`, 'success');
        renderAccountsTable();
        redirectAfterLogin(role);
      } else {
        showToast(res.message, 'error');
      }
    });
  }

  // デモ 1クリックログインボタン
  document.getElementById('demo-btn-unei').addEventListener('click', () => {
    const res = loginAsRole(ROLES.UNEI);
    showToast('運営アカウントとしてログインしました', 'success');
    redirectAfterLogin(ROLES.UNEI);
  });

  document.getElementById('demo-btn-kaihyo').addEventListener('click', () => {
    const res = loginAsRole(ROLES.KAIHYO);
    showToast('開票担当者アカウントとしてログインしました', 'success');
    redirectAfterLogin(ROLES.KAIHYO);
  });

  document.getElementById('demo-btn-admin').addEventListener('click', () => {
    const res = loginAsRole(ROLES.ADMIN);
    showToast('管理者アカウントとしてログインしました', 'success');
    redirectAfterLogin(ROLES.ADMIN);
  });

  // アカウント追加フォーム (管理者機能)
  const addForm = document.getElementById('add-account-form');
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('new-username').value;
    const name = document.getElementById('new-name').value;
    const role = document.getElementById('new-role').value;
    const password = document.getElementById('new-password').value;

    const res = addAccount({ username, name, role, password });
    if (res.success) {
      showToast(`アカウント 「${name}」 に役職【${role}】を付与して追加しました。`, 'success');
      addForm.reset();
      renderAccountsTable();
    } else {
      showToast(res.message, 'error');
    }
  });
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
        window.location.href = './dashboard.html';
        break;
      default:
        window.location.href = './index.html';
        break;
    }
  }, 500);
}

// アカウント＆役職管理テーブルの描画
function renderAccountsTable() {
  const tbody = document.getElementById('accounts-table-body');
  if (!tbody) return;

  const accounts = getAccounts();
  const currentUser = getCurrentUser();

  if (accounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">アカウントが登録されていません</td></tr>`;
    return;
  }

  tbody.innerHTML = accounts.map(account => {
    const isSelf = currentUser && currentUser.username === account.username;
    
    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-3 px-4 font-mono font-bold text-slate-200">
          ${escapeHtml(account.username)}
          ${isSelf ? '<span class="ml-1 text-[0.65rem] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-normal">自分</span>' : ''}
        </td>
        <td class="py-3 px-4 font-medium text-slate-100">${escapeHtml(account.name)}</td>
        <td class="py-3 px-4">${getRoleBadgeHtml(account.role)}</td>
        <td class="py-3 px-4">
          <select data-username="${escapeHtml(account.username)}" 
                  class="role-select bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="運営" ${account.role === ROLES.UNEI ? 'selected' : ''}>運営</option>
            <option value="開票担当者" ${account.role === ROLES.KAIHYO ? 'selected' : ''}>開票担当者</option>
            <option value="管理者" ${account.role === ROLES.ADMIN ? 'selected' : ''}>管理者</option>
          </select>
        </td>
        <td class="py-3 px-4 text-right">
          ${isSelf ? `
            <span class="text-xs text-slate-500 italic">削除不可</span>
          ` : `
            <button data-username="${escapeHtml(account.username)}" class="btn-delete-account px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg transition text-xs font-bold">
              <i class="fa-solid fa-trash"></i> 削除
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');

  // 役職変更イベント付与
  tbody.querySelectorAll('.role-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const username = e.target.getAttribute('data-username');
      const newRole = e.target.value;
      const res = updateAccountRole(username, newRole);
      if (res.success) {
        showToast(`ユーザー ${username} の役職を【${newRole}】に変更しました。`, 'success');
        renderAccountsTable();
        refreshSessionBanner();
        renderAuthHeaderWidget('header-user-widget');
      } else {
        showToast(res.message, 'error');
      }
    });
  });

  // 削除イベント付与
  tbody.querySelectorAll('.btn-delete-account').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const username = e.currentTarget.getAttribute('data-username');
      if (confirm(`本当にアカウント 「${username}」 を削除しますか？`)) {
        const res = deleteAccount(username);
        if (res.success) {
          showToast(`アカウント ${username} を削除しました。`, 'info');
          renderAccountsTable();
        } else {
          showToast(res.message, 'error');
        }
      }
    });
  });
}
