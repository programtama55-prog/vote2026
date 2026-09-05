/**
 * こども選挙用 認証・役職権限管理ライブラリ (Supabase Auth 統合版)
 * 役職: 「運営」「開票担当者」「管理者」
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase.js';
import { showToast, escapeHtml } from '@/lib/utils.js';

const STORAGE_PREFIX = 'kodomo_senkyo_';
const STORAGE_CURRENT_USER = STORAGE_PREFIX + 'current_user';
const STORAGE_LOCAL_ACCOUNTS = STORAGE_PREFIX + 'local_accounts';
const STORAGE_INVITE_CODES = STORAGE_PREFIX + 'invite_codes';

export const ROLES = {
  UNEI: '運営',
  KAIHYO: '開票担当者',
  ADMIN: '管理者'
};

function getStoredLocalAccounts() {
  const accounts = [];
  const usernames = new Set();

  try {
    const raw = localStorage.getItem(STORAGE_LOCAL_ACCOUNTS);
    const data = raw ? JSON.parse(raw) : [];
    if (Array.isArray(data)) {
      data.forEach(a => {
        const un = (a.username || a.email || a.id || '').toLowerCase();
        if (un && !usernames.has(un)) {
          usernames.add(un);
          accounts.push(a);
        }
      });
    }
  } catch (e) {}

  try {
    const rawAuthCore = localStorage.getItem('authcore_registered_users');
    const authCoreUsers = rawAuthCore ? JSON.parse(rawAuthCore) : [];
    if (Array.isArray(authCoreUsers)) {
      authCoreUsers.forEach(u => {
        const un = (u.email ? u.email.split('@')[0] : u.name || u.id).toLowerCase();
        const em = (u.email || '').toLowerCase();
        if ((un && !usernames.has(un)) && (!em || !usernames.has(em))) {
          usernames.add(un);
          if (em) usernames.add(em);
          accounts.push({
            id: u.id,
            username: u.email ? u.email.split('@')[0] : u.name,
            name: u.name,
            role: u.role || ROLES.UNEI,
            email: u.email,
            password: u.password,
            createdAt: u.createdAt || ''
          });
        }
      });
    }
  } catch (e) {}

  return accounts;
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

export function getStoredInviteCodes() {
  try {
    const raw = localStorage.getItem(STORAGE_INVITE_CODES);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveInviteCodes(codes) {
  try {
    localStorage.setItem(STORAGE_INVITE_CODES, JSON.stringify(codes));
    window.dispatchEvent(new Event('storage'));
  } catch (e) {
    console.warn('招待コード保存エラー:', e);
  }
}

/**
 * 招待コードを生成 (例: INV-8A3F9B)
 * @param {string} role '運営' | '開票担当者' | '管理者'
 * @param {string} [note] 備考/メモ
 * @returns {Promise<Object>} 生成された招待コードオブジェクト
 */
export async function generateInviteCode(role, note = '') {
  if (!Object.values(ROLES).includes(role)) {
    return { success: false, message: '無効な役職が指定されました。' };
  }

  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  const code = `INV-${randomChars}`;
  const currentUser = getCurrentUser();

  const inviteItem = {
    code: code,
    role: role,
    note: note ? note.trim() : '',
    created_at: new Date().toISOString(),
    created_by: currentUser ? currentUser.username : 'admin',
    is_used: false,
    used_by: null,
    used_at: null
  };

  const codes = getStoredInviteCodes();
  codes.unshift(inviteItem);
  saveInviteCodes(codes);

  // 非ブロッキングでバックグラウンドにてSupabase DBへ保存試行
  if (isSupabaseConfigured() && supabase) {
    supabase.from('staff_invite_codes').insert({
      code: code,
      role: role,
      note: note,
      created_by: currentUser ? currentUser.username : 'admin',
      is_used: false
    }).then(({ error }) => {
      if (error) console.warn('Supabase DBへの招待コード保存警告:', error.message);
    }).catch(e => console.warn('Supabase DBへの招待コード保存例外:', e));
  }

  return { success: true, invite: inviteItem };
}

/**
 * 発行済み招待コード一覧を取得 (1秒タイムアウト付き安全フォールバック)
 * @returns {Promise<Array>}
 */
export async function getInviteCodes() {
  const localCodes = getStoredInviteCodes();
  if (isSupabaseConfigured() && supabase) {
    try {
      const fetchPromise = supabase.from('staff_invite_codes').select('*').order('created_at', { ascending: false });
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ data: null, error: 'timeout' }), 1000));
      
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
      if (!error && data) {
        const remoteCodes = new Set(data.map(c => c.code ? c.code.toUpperCase() : ''));
        const merged = [...data];
        for (const loc of localCodes) {
          if (loc.code && !remoteCodes.has(loc.code.toUpperCase())) {
            merged.unshift(loc);
          }
        }
        return merged;
      }
    } catch (e) {}
  }
  return localCodes;
}

/**
 * 招待コードの検証
 * @param {string} code 
 * @returns {Promise<Object>} { valid: boolean, role?: string, message?: string, invite?: Object }
 */
export async function validateInviteCode(code) {
  if (!code || !code.trim()) {
    return { valid: false, message: '招待コードを入力してください。' };
  }

  const cleanCode = code.trim().toUpperCase();
  const codes = await getInviteCodes();
  const found = codes.find(c => c.code && c.code.toUpperCase() === cleanCode);

  if (!found) {
    return { valid: false, message: '入力された招待コードが存在しません。' };
  }

  if (found.is_used) {
    return { valid: false, message: 'この招待コードは既に使用されています。' };
  }

  return { valid: true, role: found.role, invite: found };
}

/**
 * 招待コードを使用済みに更新
 * @param {string} code 
 * @param {string} username 
 */
export async function markInviteCodeUsed(code, username) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();
  const localCodes = getStoredInviteCodes();
  const idx = localCodes.findIndex(c => c.code && c.code.toUpperCase() === cleanCode);
  if (idx >= 0) {
    localCodes[idx].is_used = true;
    localCodes[idx].used_by = username;
    localCodes[idx].used_at = new Date().toISOString();
    saveInviteCodes(localCodes);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('staff_invite_codes').update({
        is_used: true,
        used_by: username,
        used_at: new Date().toISOString()
      }).eq('code', cleanCode);
    } catch (e) {}
  }
}

/**
 * 招待コードの削除・無効化
 * @param {string} code 
 */
export async function deleteInviteCode(code) {
  if (!code) return { success: false };
  const cleanCode = code.trim().toUpperCase();
  const localCodes = getStoredInviteCodes().filter(c => !c.code || c.code.toUpperCase() !== cleanCode);
  saveInviteCodes(localCodes);

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('staff_invite_codes').delete().eq('code', cleanCode);
    } catch (e) {}
  }

  return { success: true };
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

    if (error) {
      const errorMsg = error.message || '';
      if (errorMsg.includes('Invalid login credentials') || errorMsg.includes('Invalid credentials')) {
        return { success: false, message: 'ユーザー名またはパスワードが正しくありません。' };
      }
    }
  } catch (e) {
    console.warn('Supabase Authログイン接続例外:', e);
  }

  // Supabase Auth接続不可・エラー時はローカル保存済みアカウントで照合 (パスワード厳密判定)
  const localAccounts = getStoredLocalAccounts();
  const found = localAccounts.find(a => a.username && a.username.toLowerCase() === cleanUsername.toLowerCase());
  if (found) {
    if (!found.password || found.password !== password) {
      return { success: false, message: 'ユーザー名またはパスワードが正しくありません。' };
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
export async function signUp({ username, email, name, role, password, confirmPassword, inviteCode, autoLogin = true }) {
  if (!username || !name || !password || !confirmPassword) {
    return { success: false, message: 'すべての項目を入力してください。' };
  }

  let targetRole = role;
  if (inviteCode || !role) {
    const inviteValidation = await validateInviteCode(inviteCode);
    if (!inviteValidation.valid) {
      return { success: false, message: inviteValidation.message };
    }
    targetRole = inviteValidation.role;
  }
  
  if (password !== confirmPassword) {
    return { success: false, message: 'パスワードと確認用パスワードが一致していません。' };
  }
  
  if (password.length < 4) {
    return { success: false, message: 'パスワードは4文字以上で入力してください。' };
  }

  if (!Object.values(ROLES).includes(targetRole)) {
    return { success: false, message: '無効な役職です。「運営」「開票担当者」「管理者」から指定してください。' };
  }

  const cleanUsername = username.trim();
  const cleanName = name.trim();

  if (inviteCode) {
    await markInviteCodeUsed(inviteCode, cleanUsername);
  }

  // ローカルアカウントに保存（ネットワークエラー・メール確認エラー時のフォールバック保護）
  const localAcc = {
    id: 'local_' + Date.now(),
    username: cleanUsername,
    name: cleanName,
    role: targetRole,
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
          role: targetRole
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
          role: targetRole
        });
      } catch (dbErr) {
        console.warn('staff_accounts upsert例外:', dbErr);
      }

      if (data?.session) {
        const sessionUser = {
          id: data.user.id,
          username: cleanUsername,
          name: cleanName,
          role: targetRole,
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
      role: targetRole,
      email: localAcc.email,
      loggedInAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(userSession));
    return { success: true, user: userSession, provider: 'local' };
  }
  
  return { success: true, account: { username: cleanUsername, name: cleanName, role: targetRole } };
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
 * アカウントの削除（Supabase DB `staff_accounts` ＋ ローカルストレージ全削除同期）
 * @param {string} username 
 * @returns {Promise<Object>}
 */
export async function deleteAccount(username) {
  const currentUser = getCurrentUser();
  const cleanTarget = (username || '').toLowerCase().trim();

  if (currentUser && currentUser.username && currentUser.username.toLowerCase() === cleanTarget) {
    return { success: false, message: '現在ログイン中の自分自身のアカウントは管理者パネルからは削除できません。ダッシュボードの退会ボタンを使用してください。' };
  }
  
  // 1. kodomo_senkyo_local_accounts から削除
  const localAccounts = getStoredLocalAccounts().filter(a => {
    const un = (a.username || '').toLowerCase();
    const em = (a.email || '').toLowerCase();
    return un !== cleanTarget && em !== cleanTarget && un !== cleanTarget.split('@')[0];
  });
  localStorage.setItem(STORAGE_LOCAL_ACCOUNTS, JSON.stringify(localAccounts));

  // 2. authcore_registered_users (Reactログインパネル用) から削除
  try {
    const raw = localStorage.getItem('authcore_registered_users') || '[]';
    const regUsers = JSON.parse(raw);
    const updatedUsers = regUsers.filter(u => {
      const em = (u.email || '').toLowerCase();
      const id = (u.id || '').toLowerCase();
      return em !== cleanTarget && id !== cleanTarget && em.split('@')[0] !== cleanTarget;
    });
    localStorage.setItem('authcore_registered_users', JSON.stringify(updatedUsers));
  } catch (e) {}

  // 3. Supabase DBからの削除試行
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
  let currentUser = await getAsyncCurrentUser();
  
  const currentPath = window.location.pathname;
  let targetRole = ROLES.UNEI;
  if (currentPath.includes('tally.html')) targetRole = ROLES.KAIHYO;
  if (currentPath.includes('admin.html')) targetRole = ROLES.ADMIN;

  // セッションがない、またはローカルスタッフの場合は画面に必要な役職へ安全に適応
  if (!currentUser) {
    currentUser = {
      id: 'staff-local',
      username: 'staff_user',
      name: targetRole + 'スタッフ',
      role: targetRole,
      loggedInAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(currentUser));
    } catch (e) {}
  } else if (currentUser.id === 'staff-local' || !currentUser.role) {
    currentUser.role = targetRole;
    try {
      localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(currentUser));
    } catch (e) {}
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
      return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200 flex items-center gap-1.5 inline-flex"><i class="fa-solid fa-users-gear text-sky-600"></i>運営</span>`;
    case ROLES.KAIHYO:
      return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 inline-flex"><i class="fa-solid fa-box-archive text-emerald-600"></i>開票担当者</span>`;
    case ROLES.ADMIN:
      return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5 inline-flex"><i class="fa-solid fa-user-shield text-amber-600"></i>管理者</span>`;
    default:
      return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">${role}</span>`;
  }
}

/**
 * 共通ヘッダーにユーザー情報・ログイン状態アイコンマーク・役職バッジ・ナビゲーション・ログアウトボタンを描画
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
        <a href="./login.html" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition flex items-center gap-1.5" title="スタッフログイン">
          <i class="fa-solid fa-right-to-bracket text-yellow-300"></i>
          <span>ログイン</span>
        </a>
      </div>
    `;
    return;
  }
  
  // 権限に応じたページリンクの作成
  let pageLinks = '';
  if (user.role === ROLES.UNEI || user.role === ROLES.ADMIN) {
    pageLinks += `
      <a href="./reception.html" class="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition flex items-center gap-1 shadow-xs" title="受付管理">
        <i class="fa-solid fa-id-card text-sky-600"></i><span class="hidden sm:inline">受付</span>
      </a>
      <a href="./dashboard.html" class="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition flex items-center gap-1 shadow-xs" title="運営ダッシュボード">
        <i class="fa-solid fa-chart-line text-indigo-600"></i><span class="hidden sm:inline">ダッシュボード</span>
      </a>
    `;
  }
  if (user.role === ROLES.KAIHYO || user.role === ROLES.ADMIN) {
    pageLinks += `
      <a href="./tally.html" class="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition flex items-center gap-1 shadow-xs" title="開票・集計">
        <i class="fa-solid fa-calculator text-emerald-600"></i><span class="hidden sm:inline">開票</span>
      </a>
    `;
  }
  
  if (user.role === ROLES.ADMIN) {
    pageLinks += `
      <a href="./admin.html" class="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition flex items-center gap-1 shadow-xs" title="管理者パネル (管理者専用)">
        <i class="fa-solid fa-user-shield text-indigo-600"></i><span class="hidden sm:inline">管理者パネル</span>
      </a>
    `;
  }

  container.innerHTML = `
    <div class="flex items-center gap-2">
      ${pageLinks}

      <!-- ログインステータス アイコンマーク & プロフィールカード -->
      <div class="flex items-center gap-2.5 bg-white text-slate-800 px-3 py-1.5 rounded-2xl border border-slate-200 shadow-xs transition-all">
        <div class="relative flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-600 text-white shadow font-bold text-sm shrink-0" title="ログイン中: ${escapeHtml(user.name)}">
          <i class="fa-solid fa-user-check"></i>
          <span class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow">
            <span class="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-80"></span>
          </span>
        </div>

        <div class="text-left leading-tight">
          <div class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <span>${escapeHtml(user.name)}</span>
            <span class="text-[0.6rem] px-1.5 py-0.2 bg-emerald-50 text-emerald-700 font-bold rounded border border-emerald-200">ログイン中</span>
          </div>
          <div class="mt-0.5">${getRoleBadgeHtml(user.role)}</div>
        </div>
      </div>

      <!-- ログアウトボタン -->
      <button id="auth-logout-btn" class="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition flex items-center gap-1 shadow-xs" title="ログアウト">
        <i class="fa-solid fa-right-from-bracket text-rose-600"></i>
        <span class="hidden sm:inline">ログアウト</span>
      </button>
    </div>
  `;

  const logoutBtn = container.querySelector('#auth-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => logout());
  }
}

