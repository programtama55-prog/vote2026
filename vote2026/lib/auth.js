/**
 * こども選挙用 認証・役職権限管理ライブラリ (Supabase Auth 統合版)
 * 役職: 「運営」「開票担当者」「管理者」
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase.js';
import { showToast } from '@/lib/utils.js';

const STORAGE_PREFIX = 'kodomo_senkyo_';
const STORAGE_CURRENT_USER = STORAGE_PREFIX + 'current_user';
const STORAGE_ACCOUNTS = STORAGE_PREFIX + 'staff_accounts';

export const ROLES = {
  UNEI: '運営',
  KAIHYO: '開票担当者',
  ADMIN: '管理者'
};

// 初期デフォルトアカウント定義（デモ・モック実行用）
const INITIAL_ACCOUNTS = [
  {
    username: 'staff_unei',
    name: '運営 スタッフ',
    role: ROLES.UNEI,
    password: 'password123',
    createdAt: new Date().toISOString()
  },
  {
    username: 'staff_kaihyo',
    name: '開票 担当者',
    role: ROLES.KAIHYO,
    password: 'password123',
    createdAt: new Date().toISOString()
  },
  {
    username: 'admin',
    name: '全体 管理者',
    role: ROLES.ADMIN,
    password: 'admin123',
    createdAt: new Date().toISOString()
  }
];

/**
 * ユーザー名をSupabase用メールアドレス形式に変換
 * @param {string} username 
 * @returns {string} メールアドレス
 */
function toEmail(username) {
  const clean = username.trim().toLowerCase();
  if (clean.includes('@')) return clean;
  return `${clean}@kodomosenkyo.local`;
}

/**
 * ローカルストレージのアカウント一覧を取得
 * @returns {Array} アカウントの配列
 */
export function getAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_ACCOUNTS);
    if (!raw) {
      localStorage.setItem(STORAGE_ACCOUNTS, JSON.stringify(INITIAL_ACCOUNTS));
      return INITIAL_ACCOUNTS;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('アカウント情報の取得に失敗しました:', e);
    return INITIAL_ACCOUNTS;
  }
}

/**
 * アカウント一覧を保存
 * @param {Array} accounts 
 */
export function saveAccounts(accounts) {
  try {
    localStorage.setItem(STORAGE_ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.error('アカウント情報の保存に失敗しました:', e);
  }
}

/**
 * 現在ログイン中のユーザーを同期取得 (キャッシュ参照)
 * @returns {Object|null} ログインユーザーオブジェクト
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_CURRENT_USER) || sessionStorage.getItem(STORAGE_CURRENT_USER);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Supabase Authから非同期で最新セッション・ユーザーを取得
 * @returns {Promise<Object|null>}
 */
export async function getAsyncCurrentUser() {
  if (isSupabaseConfigured()) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user && !error) {
        const sessionUser = {
          id: user.id,
          username: user.user_metadata?.username || user.email.split('@')[0],
          name: user.user_metadata?.name || user.email.split('@')[0],
          role: user.user_metadata?.role || ROLES.UNEI,
          email: user.email,
          loggedInAt: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(sessionUser));
        return sessionUser;
      }
    } catch (e) {
      console.warn('Supabase Authユーザー取得エラー (フォールバック参照):', e);
    }
  }
  return getCurrentUser();
}

/**
 * Supabase Auth / ローカルアカウントでのログイン
 * @param {string} username 
 * @param {string} password 
 * @param {boolean} remember 
 * @returns {Promise<Object>} { success: boolean, user?: Object, message?: string }
 */
export async function login(username, password, remember = true) {
  if (!username || !password) {
    return { success: false, message: 'ユーザー名とパスワードを入力してください。' };
  }

  // Supabase Auth 接続試行
  if (isSupabaseConfigured()) {
    try {
      const email = toEmail(username);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (!error && data?.user) {
        const user = data.user;
        const userSession = {
          id: user.id,
          username: user.user_metadata?.username || username,
          name: user.user_metadata?.name || username,
          role: user.user_metadata?.role || ROLES.UNEI,
          email: user.email,
          loggedInAt: new Date().toISOString()
        };
        
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem(STORAGE_CURRENT_USER, JSON.stringify(userSession));
        return { success: true, user: userSession, provider: 'supabase' };
      } else if (error && error.message && !error.message.includes('FetchError')) {
        // Supabaseからの明確な認証エラー（例: Wrong password）
        console.warn('Supabase Authログイン失敗:', error.message);
      }
    } catch (e) {
      console.warn('Supabase Auth接続例外 (ローカルフォールバック実行):', e);
    }
  }

  // ローカル・デモアカウントのフォールバックチェック
  const accounts = getAccounts();
  const target = accounts.find(a => a.username.trim().toLowerCase() === username.trim().toLowerCase());
  
  if (!target || target.password !== password) {
    return { success: false, message: 'ユーザー名またはパスワードが正しくありません。' };
  }
  
  const userSession = {
    username: target.username,
    name: target.name,
    role: target.role,
    loggedInAt: new Date().toISOString()
  };
  
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(STORAGE_CURRENT_USER, JSON.stringify(userSession));
  
  return { success: true, user: userSession, provider: 'local' };
}

/**
 * 新規ユーザーサインアップ（Supabase Auth & ローカル登録）
 * @param {Object} param0 { username, name, role, password, confirmPassword, autoLogin }
 * @returns {Promise<Object>} { success: boolean, message?: string, user?: Object }
 */
export async function signUp({ username, name, role, password, confirmPassword, autoLogin = true }) {
  if (!username || !name || !role || !password || !confirmPassword) {
    return { success: false, message: 'すべての項目を入力してください。' };
  }
  
  if (password !== confirmPassword) {
    return { success: false, message: 'パスワードと確認用パスワードが一致していません。' };
  }
  
  if (password.length < 4) {
    return { success: false, message: 'パスワードは4文字以上で入力してください。' };
  }

  if (!Object.values(ROLES).includes(role)) {
    return { success: false, message: '無効な役職です。「運営」「開票担当者」「管理者」から指定してください。' };
  }

  const accounts = getAccounts();
  if (accounts.some(a => a.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, message: 'このユーザー名は既に使用されています。' };
  }

  // Supabase Auth でのサインアップ実行
  if (isSupabaseConfigured()) {
    try {
      const email = toEmail(username);
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: username.trim(),
            name: name.trim(),
            role: role
          }
        }
      });

      if (error) {
        return { success: false, message: `Supabase認証エラー: ${error.message}` };
      }

      // Supabaseのデータベース `staff_accounts` が存在する場合は保存を試行
      if (data?.user) {
        try {
          await supabase.from('staff_accounts').upsert({
            id: data.user.id,
            username: username.trim(),
            name: name.trim(),
            role: role
          });
        } catch (dbErr) {
          // テーブルが無くてもAuthメタデータがあるため無視可能
        }
      }
    } catch (e) {
      console.warn('Supabase Authサインアップ例外 (ローカルフォールバック継続):', e);
    }
  }

  // ローカルDBにも保存（フォールバックと一覧表示用）
  const addRes = addAccount({ username, name, role, password });
  if (!addRes.success && !isSupabaseConfigured()) {
    return addRes;
  }
  
  if (autoLogin) {
    return await login(username, password, true);
  }
  
  return { success: true, account: addRes.account };
}

/**
 * 役職指定でワンクリックログイン（デモ・テスト用）
 * @param {'運営' | '開票担当者' | '管理者'} role 
 * @returns {Object} { success: boolean, user: Object }
 */
export function loginAsRole(role) {
  const accounts = getAccounts();
  let user = accounts.find(a => a.role === role);
  
  if (!user) {
    user = {
      username: `demo_${role}`,
      name: `${role}デモ`,
      role: role,
      password: 'password123',
      createdAt: new Date().toISOString()
    };
    accounts.push(user);
    saveAccounts(accounts);
  }
  
  const userSession = {
    username: user.username,
    name: user.name,
    role: user.role,
    loggedInAt: new Date().toISOString()
  };
  
  localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(userSession));
  return { success: true, user: userSession };
}

/**
 * ログアウト処理 (Supabase Auth & ローカルセッションの破棄)
 */
export async function logout() {
  if (isSupabaseConfigured()) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase Authログアウトエラー:', e);
    }
  }

  localStorage.removeItem(STORAGE_CURRENT_USER);
  sessionStorage.removeItem(STORAGE_CURRENT_USER);
  showToast('ログアウトしました', 'info');
  setTimeout(() => {
    window.location.href = './login.html';
  }, 400);
}

/**
 * 新規アカウントの追加（管理者操作用）
 * @param {Object} param0 { username, name, role, password }
 * @returns {Object} { success: boolean, message?: string }
 */
export function addAccount({ username, name, role, password }) {
  if (!username || !name || !role || !password) {
    return { success: false, message: 'すべての項目を入力してください。' };
  }
  
  if (!Object.values(ROLES).includes(role)) {
    return { success: false, message: '無効な役職です。「運営」「開票担当者」「管理者」のいずれかを指定してください。' };
  }
  
  const accounts = getAccounts();
  if (accounts.some(a => a.username === username)) {
    return { success: false, message: 'このユーザー名は既に使用されています。' };
  }
  
  const newAccount = {
    username: username.trim(),
    name: name.trim(),
    role: role,
    password: password,
    createdAt: new Date().toISOString()
  };
  
  accounts.push(newAccount);
  saveAccounts(accounts);
  return { success: true, account: newAccount };
}

/**
 * アカウントの役職更新 (Supabase & ローカル同期)
 * @param {string} username 
 * @param {'運営' | '開票担当者' | '管理者'} newRole 
 * @returns {Promise<Object>} { success: boolean, message?: string }
 */
export async function updateAccountRole(username, newRole) {
  if (!Object.values(ROLES).includes(newRole)) {
    return { success: false, message: '無効な役職です。' };
  }
  
  const accounts = getAccounts();
  const index = accounts.findIndex(a => a.username === username);
  if (index !== -1) {
    accounts[index].role = newRole;
    saveAccounts(accounts);
  }
  
  // 現在ログイン中ユーザーならセッションも更新
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.username === username) {
    currentUser.role = newRole;
    localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(currentUser));
  }
  
  // Supabase User Metadata の更新（ログイン中であれば）
  if (isSupabaseConfigured() && currentUser) {
    try {
      await supabase.auth.updateUser({
        data: { role: newRole }
      });
    } catch (e) {
      console.warn('Supabase Authロール更新エラー:', e);
    }
  }

  return { success: true };
}

/**
 * アカウントの削除
 * @param {string} username 
 * @returns {Object}
 */
export function deleteAccount(username) {
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.username === username) {
    return { success: false, message: '現在ログイン中の自分自身のアカウントは削除できません。' };
  }
  
  let accounts = getAccounts();
  accounts = accounts.filter(a => a.username !== username);
  saveAccounts(accounts);
  return { success: true };
}

/**
 * ページアクセス権限チェック（アクセス不可の場合はリダイレクト）
 * @param {Array<string>} allowedRoles 許可される役職の配列
 * @returns {Promise<Object|null>} 認証済みユーザーオブジェクト
 */
export async function checkPageAccess(allowedRoles = []) {
  const currentUser = await getAsyncCurrentUser();
  const currentPath = window.location.pathname;
  const pageName = currentPath.substring(currentPath.lastIndexOf('/') + 1) || 'index.html';
  
  if (!currentUser) {
    const redirectUrl = `./login.html?redirect=${encodeURIComponent(pageName)}&reason=unauthenticated`;
    window.location.href = redirectUrl;
    return null;
  }
  
  if (allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
    const redirectUrl = `./login.html?redirect=${encodeURIComponent(pageName)}&reason=unauthorized&required=${encodeURIComponent(allowedRoles.join(','))}`;
    window.location.href = redirectUrl;
    return null;
  }
  
  return currentUser;
}

/**
 * 役職に応じたバッジのHTML文字列を生成
 * @param {string} role 
 * @returns {string} HTML
 */
export function getRoleBadgeHtml(role) {
  switch (role) {
    case ROLES.UNEI:
      return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30 flex items-center gap-1.5 inline-flex"><i class="fa-solid fa-users-gear"></i>運営</span>`;
    case ROLES.KAIHYO:
      return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 inline-flex"><i class="fa-solid fa-box-archive"></i>開票担当者</span>`;
    case ROLES.ADMIN:
      return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 inline-flex"><i class="fa-solid fa-user-shield"></i>管理者</span>`;
    default:
      return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-400 border border-slate-500/30">${role}</span>`;
  }
}

/**
 * 共通ヘッダーにユーザー情報・役職バッジ・ナビゲーション・ログアウトボタンを描画
 * @param {string|HTMLElement} containerIdOrElement 
 */
export function renderAuthHeaderWidget(containerIdOrElement) {
  const container = typeof containerIdOrElement === 'string' 
    ? document.getElementById(containerIdOrElement)
    : containerIdOrElement;
    
  if (!container) return;
  
  const user = getCurrentUser();
  if (!user) {
    container.innerHTML = `
      <a href="./login.html" class="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow transition flex items-center gap-2">
        <i class="fa-solid fa-right-to-bracket"></i>
        <span>スタッフログイン</span>
      </a>
    `;
    return;
  }
  
  // 権限に応じたページリンクの作成
  let pageLinks = '';
  if (user.role === ROLES.UNEI || user.role === ROLES.ADMIN) {
    pageLinks += `
      <a href="./reception.html" class="px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-700/50 transition flex items-center gap-1.5 text-slate-300 hover:text-white" title="受付管理">
        <i class="fa-solid fa-id-card text-sky-400"></i><span class="hidden sm:inline">受付</span>
      </a>
      <a href="./dashboard.html" class="px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-700/50 transition flex items-center gap-1.5 text-slate-300 hover:text-white" title="運営ダッシュボード">
        <i class="fa-solid fa-chart-line text-indigo-400"></i><span class="hidden sm:inline">ダッシュボード</span>
      </a>
    `;
  }
  if (user.role === ROLES.KAIHYO || user.role === ROLES.ADMIN) {
    pageLinks += `
      <a href="./tally.html" class="px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-700/50 transition flex items-center gap-1.5 text-slate-300 hover:text-white" title="開票・集計">
        <i class="fa-solid fa-calculator text-emerald-400"></i><span class="hidden sm:inline">開票</span>
      </a>
    `;
  }
  
  if (user.role === ROLES.ADMIN) {
    pageLinks += `
      <a href="./login.html#manage-accounts" class="px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-700/50 transition flex items-center gap-1.5 text-slate-300 hover:text-white" title="アカウント・役職管理">
        <i class="fa-solid fa-users-gear text-amber-400"></i><span class="hidden sm:inline">アカウント管理</span>
      </a>
    `;
  }

  container.innerHTML = `
    <div class="flex items-center gap-3">
      <!-- ページ切り替えナビ -->
      <div class="flex items-center gap-1 border-r border-slate-700/60 pr-3 mr-1">
        ${pageLinks}
      </div>

      <!-- ユーザープロフィール & 役職バッジ -->
      <div class="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60 shadow-sm">
        <div class="text-left">
          <div class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <span>${user.name}</span>
          </div>
          <div class="mt-0.5">${getRoleBadgeHtml(user.role)}</div>
        </div>
      </div>

      <!-- ログアウトボタン -->
      <button id="auth-logout-btn" class="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-rose-600/20 text-slate-300 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/40 transition flex items-center gap-1.5" title="ログアウト">
        <i class="fa-solid fa-right-from-bracket"></i>
        <span class="hidden sm:inline">ログアウト</span>
      </button>
    </div>
  `;

  const logoutBtn = container.querySelector('#auth-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => logout());
  }
}
