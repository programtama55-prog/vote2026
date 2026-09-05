/**
 * こども選挙用 認証・役職権限管理ライブラリ (Supabase Auth 統合版)
 * 役職: 「運営」「開票担当者」「管理者」
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase.js';
import { showToast, escapeHtml } from '@/lib/utils.js';

const STORAGE_PREFIX = 'kodomo_senkyo_';
const STORAGE_CURRENT_USER = STORAGE_PREFIX + 'current_user';
const STORAGE_LOCAL_ACCOUNTS = STORAGE_PREFIX + 'local_accounts';

export const ROLES = {
  UNEI: '運営',
  KAIHYO: '開票担当者',
  ADMIN: '管理者'
};

function getStoredLocalAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_LOCAL_ACCOUNTS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalAccount(account) {
  try {
    const accounts = getStoredLocalAccounts();
    const idx = accounts.findIndex(a => a.username && a.username.toLowerCase() === account.username.toLowerCase());
    if (idx >= 0) {
      accounts[idx] = { ...accounts[idx], ...account };
    } else {
      accounts.push(account);
    }
    localStorage.setItem(STORAGE_LOCAL_ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.warn('ローカルアカウント保存エラー:', e);
  }
}

/**
 * ユーザー名をSupabase用メールアドレス形式に変換
 * @param {string} username 
 * @param {string} [optionalEmail]
 * @returns {string} メールアドレス
 */
function toEmail(username, optionalEmail) {
  if (optionalEmail && optionalEmail.trim().includes('@')) {
    return optionalEmail.trim().toLowerCase();
  }
  const clean = username.trim().toLowerCase();
  if (clean.includes('@')) return clean;
  
  // 非ASCII文字 (日本語など) を安全なASCII表現に変換
  const asciiSafe = clean.replace(/[^a-z0-9_.-]/g, (char) => {
    return 'u' + char.charCodeAt(0).toString(16);
  });
  const prefix = asciiSafe || 'user_' + Date.now();
  return `${prefix}@example.com`;
}

/**
 * Supabase DB `staff_accounts` およびローカルキャッシュからアカウント一覧を取得
 * @returns {Promise<Array>} アカウントの配列
 */
export async function getAccounts() {
  const localAccs = getStoredLocalAccounts();
  try {
    const { data, error } = await supabase.from('staff_accounts').select('*');
    if (!error && data) {
      const remoteUsernames = new Set(data.map(a => a.username ? a.username.toLowerCase() : ''));
      const merged = [...data];
      for (const loc of localAccs) {
        if (loc.username && !remoteUsernames.has(loc.username.toLowerCase())) {
          merged.push(loc);
        }
      }
      return merged;
    }
  } catch (e) {
    console.warn('Supabase DBからのアカウント一覧取得例外:', e);
  }
  return localAccs;
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
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user && !error) {
      let role = user.user_metadata?.role || ROLES.UNEI;
      let name = user.user_metadata?.name || user.email.split('@')[0];
      
      // DB側のstaff_accountsから最新情報を照合
      try {
        const username = user.user_metadata?.username || user.email.split('@')[0];
        const { data: dbAccount } = await supabase
          .from('staff_accounts')
          .select('role, name')
          .eq('username', username)
          .maybeSingle();
        if (dbAccount) {
          if (dbAccount.role) role = dbAccount.role;
          if (dbAccount.name) name = dbAccount.name;
        }
      } catch (dbErr) {}

      const sessionUser = {
        id: user.id,
        username: user.user_metadata?.username || user.email.split('@')[0],
        name: name,
        role: role,
        email: user.email,
        loggedInAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(sessionUser));
      return sessionUser;
    }
  } catch (e) {
    console.warn('Supabase Authユーザー取得例外:', e);
  }
  return getCurrentUser();
}

/**
 * ログイン処理 (Supabase Auth ＋ Supabase DB ＋ ローカルフォールバック)
 * @param {string} username 
 * @param {string} password 
 * @param {boolean} remember 
 * @returns {Promise<Object>} { success: boolean, user?: Object, message?: string, provider?: string }
 */
export async function login(username, password, remember = true) {
  if (!username || !password) {
    return { success: false, message: 'ユーザー名とパスワードを入力してください。' };
  }

  const cleanUsername = username.trim();

  try {
    const email = toEmail(cleanUsername);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (!error && data?.user) {
      const user = data.user;
      
      let role = user.user_metadata?.role || ROLES.UNEI;
      let name = user.user_metadata?.name || cleanUsername;

      // Supabase DB (staff_accounts) から最新情報を取得
      try {
        const { data: dbAccount } = await supabase
          .from('staff_accounts')
          .select('role, name')
          .eq('username', cleanUsername)
          .maybeSingle();
        if (dbAccount) {
          if (dbAccount.role) role = dbAccount.role;
          if (dbAccount.name) name = dbAccount.name;
        }
      } catch (dbErr) {
        console.warn('staff_accounts からの情報取得例外:', dbErr);
      }

      const userSession = {
        id: user.id,
        username: user.user_metadata?.username || cleanUsername,
        name: name,
        role: role,
        email: user.email,
        loggedInAt: new Date().toISOString()
      };
      
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem(STORAGE_CURRENT_USER, JSON.stringify(userSession));
      saveLocalAccount({ id: user.id, username: cleanUsername, name: name, role: role, password: password });
      return { success: true, user: userSession, provider: 'supabase' };
    }
  } catch (e) {
    console.warn('Supabase Authログイン接続例外:', e);
  }

  // Supabase Auth接続不可・エラー時はローカル保存済みアカウントで照合
  const localAccounts = getStoredLocalAccounts();
  const found = localAccounts.find(a => a.username && a.username.toLowerCase() === cleanUsername.toLowerCase());
  if (found) {
    if (found.password && found.password !== password) {
      return { success: false, message: 'パスワードが正しくありません。' };
    }
    const userSession = {
      id: found.id || 'local_' + Date.now(),
      username: found.username,
      name: found.name || found.username,
      role: found.role || ROLES.UNEI,
      email: found.email || toEmail(found.username),
      loggedInAt: new Date().toISOString()
    };
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(STORAGE_CURRENT_USER, JSON.stringify(userSession));
    return { success: true, user: userSession, provider: 'local' };
  }

  return { success: false, message: 'ユーザー名またはパスワードが正しくありません。' };
}

/**
 * 新規ユーザーサインアップ（Supabase Auth ＋ Supabase DB `staff_accounts` ＋ ローカル保存）
 * @param {Object} param0 { username, email, name, role, password, confirmPassword, autoLogin }
 * @returns {Promise<Object>} { success: boolean, message?: string, user?: Object }
 */
export async function signUp({ username, email, name, role, password, confirmPassword, autoLogin = true }) {
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

  const cleanUsername = username.trim();
  const cleanName = name.trim();

  // ローカルアカウントに保存（ネットワークエラー・メール確認エラー時のフォールバック保護）
  const localAcc = {
    id: 'local_' + Date.now(),
    username: cleanUsername,
    name: cleanName,
    role: role,
    email: email || toEmail(cleanUsername, email),
    password: password,
    createdAt: new Date().toISOString()
  };
  saveLocalAccount(localAcc);

  try {
    const targetEmail = toEmail(cleanUsername, email);
    const { data, error } = await supabase.auth.signUp({
      email: targetEmail,
      password: password,
      options: {
        data: {
          username: cleanUsername,
          name: cleanName,
          role: role
        }
      }
    });

    if (!error && data?.user) {
      localAcc.id = data.user.id;
      saveLocalAccount(localAcc);

      try {
        await supabase.from('staff_accounts').upsert({
          id: data.user.id,
          username: cleanUsername,
          name: cleanName,
          role: role
        });
      } catch (dbErr) {
        console.warn('staff_accounts upsert例外:', dbErr);
      }

      if (data?.session) {
        const sessionUser = {
          id: data.user.id,
          username: cleanUsername,
          name: cleanName,
          role: role,
          email: data.user.email,
          loggedInAt: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(sessionUser));
        return { success: true, user: sessionUser, provider: 'supabase' };
      }
    }
  } catch (e) {
    console.warn('Supabase Authサインアップ通信エラー (ローカル登録モードへフォールバック):', e);
  }

  // Supabaseエラーまたはメール未確認等の場合でもローカルセッションで即時ログイン
  if (autoLogin) {
    const userSession = {
      id: localAcc.id,
      username: cleanUsername,
      name: cleanName,
      role: role,
      email: localAcc.email,
      loggedInAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(userSession));
    return { success: true, user: userSession, provider: 'local' };
  }
  
  return { success: true, account: { username: cleanUsername, name: cleanName, role } };
}

/**
 * 役職指定でログイン（デモ機能・無効化）
 * @param {'運営' | '開票担当者' | '管理者'} role 
 * @returns {Object}
 */
export function loginAsRole(role) {
  return { success: false, message: 'デモログイン機能は無効化されています。登録済みアカウントでログインしてください。' };
}

/**
 * ログアウト処理 (Supabase Auth ログアウト)
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
 * 新規アカウントの追加（管理者操作・Supabase Auth ＋ Supabase DB `staff_accounts` 保存）
 * @param {Object} param0 { username, name, role, password }
 * @returns {Promise<Object>} { success: boolean, message?: string }
 */
export async function addAccount({ username, name, role, password }) {
  if (!username || !name || !role || !password) {
    return { success: false, message: 'すべての項目を入力してください。' };
  }
  
  if (!Object.values(ROLES).includes(role)) {
    return { success: false, message: '無効な役職です。「運営」「開票担当者」「管理者」のいずれかを指定してください。' };
  }

  const cleanUsername = username.trim();
  const cleanName = name.trim();

  return await signUp({
    username: cleanUsername,
    name: cleanName,
    role: role,
    password: password,
    confirmPassword: password,
    autoLogin: false
  });
}

/**
 * アカウントの役職更新 (Supabase DB `staff_accounts` ＋ ローカル更新)
 * @param {string} username 
 * @param {'運営' | '開票担当者' | '管理者'} newRole 
 * @returns {Promise<Object>} { success: boolean, message?: string }
 */
export async function updateAccountRole(username, newRole) {
  if (!Object.values(ROLES).includes(newRole)) {
    return { success: false, message: '無効な役職です。' };
  }
  
  const localAccounts = getStoredLocalAccounts();
  const idx = localAccounts.findIndex(a => a.username && a.username.toLowerCase() === username.toLowerCase());
  if (idx >= 0) {
    localAccounts[idx].role = newRole;
    localStorage.setItem(STORAGE_LOCAL_ACCOUNTS, JSON.stringify(localAccounts));
  }

  try {
    await supabase.from('staff_accounts').update({ role: newRole }).eq('username', username);
  } catch (e) {
    console.warn('Supabase DB役職更新例外:', e);
  }

  // 現在ログイン中ユーザーならセッションも更新
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.username && currentUser.username.toLowerCase() === username.toLowerCase()) {
    currentUser.role = newRole;
    localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(currentUser));
  }
  
  try {
    await supabase.auth.updateUser({
      data: { role: newRole }
    });
  } catch (e) {
    // ログイン中でない等の場合は無視
  }

  return { success: true };
}

/**
 * アカウントの削除（Supabase DB `staff_accounts` ＋ ローカル削除）
 * @param {string} username 
 * @returns {Promise<Object>}
 */
export async function deleteAccount(username) {
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.username && currentUser.username.toLowerCase() === username.toLowerCase()) {
    return { success: false, message: '現在ログイン中の自分自身のアカウントは削除できません。' };
  }
  
  const localAccounts = getStoredLocalAccounts().filter(a => !a.username || a.username.toLowerCase() !== username.toLowerCase());
  localStorage.setItem(STORAGE_LOCAL_ACCOUNTS, JSON.stringify(localAccounts));

  try {
    await supabase.from('staff_accounts').delete().eq('username', username);
  } catch (e) {
    console.warn('Supabase DBアカウント削除例外:', e);
  }

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
      <div class="flex items-center gap-2">
        <a href="./login.html" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow transition flex items-center gap-1.5" title="スタッフログイン">
          <i class="fa-solid fa-right-to-bracket"></i>
          <span>ログイン</span>
        </a>
        <a href="./login.html?mode=signup" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow transition flex items-center gap-1.5" title="新規スタッフ登録">
          <i class="fa-solid fa-user-plus"></i>
          <span>サインアップ</span>
        </a>
      </div>
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
      <a href="./admin.html" class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition flex items-center gap-1.5" title="管理者パネル (管理者専用)">
        <i class="fa-solid fa-user-shield text-amber-400"></i><span class="hidden sm:inline">管理者パネル</span>
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
            <span>${escapeHtml(user.name)}</span>
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
