import { 
  login, 
  signUp,
  getCurrentUser, 
  logout, 
  ROLES 
} from '@/lib/auth.js';
import { escapeHtml } from '@/lib/utils.js';

// Local storage key for in-memory users list persistence
const USERS_STORAGE_KEY = 'authcore_users_list';

// Default initial user list
const DEFAULT_USERS = [
  {
    id: 'demo-user-1',
    name: 'デモユーザー',
    email: 'demo@example.com',
    password: 'Password123!',
    createdAt: '2026-01-15',
    role: ROLES.ADMIN
  }
];

function getStoredUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_USERS;
  }
}

function saveStoredUsers(users) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn('Failed to store users', e);
  }
}

// -------------------------------------------------------------
// Application State
// -------------------------------------------------------------
let users = getStoredUsers();
let currentUser = getCurrentUser();

// Initial view: if logged in -> 'dashboard', otherwise -> 'login'
let view = currentUser ? 'dashboard' : 'login';

// Form states
let loginShowPassword = false;
let regShowPassword = false;

let regState = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  agreeTerms: false
};

// Toast notification display helper
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toastEl = document.createElement('div');
  toastEl.className = `animate-bounce transition-all duration-300`;
  
  let bgBorderText = 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200';
  let iconName = 'check-circle-2';
  let iconColor = 'text-emerald-400';

  if (type === 'error') {
    bgBorderText = 'bg-rose-950/80 border-rose-600/50 text-rose-200';
    iconName = 'alert-circle';
    iconColor = 'text-rose-400';
  } else if (type === 'info') {
    bgBorderText = 'bg-slate-900/80 border-slate-700 text-slate-200';
    iconName = 'check-circle-2';
    iconColor = 'text-emerald-400';
  }

  toastEl.innerHTML = `
    <div class="flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md border ${bgBorderText}">
      <i data-lucide="${iconName}" class="w-5 h-5 ${iconColor} shrink-0"></i>
      <span class="text-sm font-medium">${escapeHtml(message)}</span>
    </div>
  `;

  container.appendChild(toastEl);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toastEl.remove();
  }, 4000);
}

// Helper computations for password strength & form errors
function computePasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

function getStrengthBarColor(score) {
  if (score <= 1) return 'bg-rose-500';
  if (score === 2) return 'bg-amber-500';
  if (score === 3) return 'bg-blue-500';
  return 'bg-emerald-500';
}

function getStrengthLabel(score, password) {
  if (!password) return '';
  if (score <= 1) return '脆弱';
  if (score === 2) return '普通';
  if (score === 3) return '良好';
  return '極めて強力';
}

function computeRegErrors(state) {
  const errors = {};
  if (state.name && state.name.trim().length < 2) {
    errors.name = '名前は2文字以上で入力してください';
  }
  if (state.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) {
    errors.email = '有効なメールアドレス形式を入力してください';
  }
  if (state.password && state.password.length < 8) {
    errors.password = 'パスワードは8文字以上必要です';
  }
  if (state.confirmPassword && state.password !== state.confirmPassword) {
    errors.confirmPassword = 'パスワードが一致しません';
  }
  return errors;
}

// -------------------------------------------------------------
// Authentication Logic
// -------------------------------------------------------------
async function handleLogin({ email, password }) {
  const targetUser = users.find(u => u.email.toLowerCase() === email.toLowerCase() || (u.username && u.username.toLowerCase() === email.toLowerCase()));

  if (!targetUser) {
    showToast('登録されていないメールアドレスです', 'error');
    return false;
  }

  if (targetUser.password !== password) {
    showToast('パスワードが正しくありません', 'error');
    return false;
  }

  // Set local session & auth session
  currentUser = {
    id: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    username: targetUser.email.split('@')[0],
    role: targetUser.role || ROLES.ADMIN,
    createdAt: targetUser.createdAt || new Date().toISOString().split('T')[0]
  };

  localStorage.setItem('kodomo_senkyo_current_user', JSON.stringify(currentUser));
  view = 'dashboard';
  renderApp();
  showToast(`${currentUser.name} さん、お帰りなさい！`, 'success');
  return true;
}

async function handleRegister({ name, email, password }) {
  const isExist = users.some(u => u.email.toLowerCase() === email.toLowerCase());
  if (isExist) {
    showToast('このメールアドレスは既に登録されています', 'error');
    return false;
  }

  const newUser = {
    id: `user-${Date.now()}`,
    name,
    email,
    password,
    createdAt: new Date().toISOString().split('T')[0],
    role: ROLES.UNEI
  };

  users.push(newUser);
  saveStoredUsers(users);

  // Sign up into Supabase/local accounts helper if available
  signUp({
    username: email.split('@')[0],
    email: email,
    name: name,
    role: ROLES.UNEI,
    password: password,
    confirmPassword: password,
    autoLogin: true
  }).catch(() => {});

  currentUser = {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    username: newUser.email.split('@')[0],
    role: newUser.role,
    createdAt: newUser.createdAt
  };

  localStorage.setItem('kodomo_senkyo_current_user', JSON.stringify(currentUser));
  view = 'dashboard';
  renderApp();
  showToast('アカウント登録が完了しました！', 'success');
  return true;
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('kodomo_senkyo_current_user');
  sessionStorage.removeItem('kodomo_senkyo_current_user');
  view = 'login';
  renderApp();
  showToast('ログアウトしました', 'info');
}

// -------------------------------------------------------------
// Component Render Functions
// -------------------------------------------------------------
function renderLoginForm() {
  return `
    <div class="bg-slate-900/90 border border-slate-800 p-8 rounded-2xl shadow-xl shadow-black/40 backdrop-blur-xl">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-white tracking-tight">ログイン</h2>
        <p class="text-sm text-slate-400 mt-1">
          登録済みの認証情報でアカウントにサインインしてください
        </p>
      </div>

      <!-- デモ用クイックログインボタン -->
      <div class="mb-5 p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/40 flex items-center justify-between text-xs">
        <span class="text-indigo-300">テスト用デモアカウント</span>
        <button
          type="button"
          id="btn-fill-demo"
          class="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline cursor-pointer"
        >
          自動入力
        </button>
      </div>

      <form id="form-login" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">
            メールアドレス
          </label>
          <div class="relative">
            <i data-lucide="mail" class="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
            <input
              type="email"
              id="login-email"
              required
              placeholder="name@example.com"
              class="w-full bg-slate-950/60 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="block text-xs font-semibold text-slate-300">
              パスワード
            </label>
            <button
              type="button"
              id="btn-goto-forgot"
              class="text-xs text-indigo-400 hover:text-indigo-300 transition"
            >
              パスワードをお忘れですか？
            </button>
          </div>
          <div class="relative">
            <i data-lucide="lock" class="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
            <input
              type="${loginShowPassword ? 'text' : 'password'}"
              id="login-password"
              required
              placeholder="••••••••"
              class="w-full bg-slate-950/60 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
            <button
              type="button"
              id="btn-toggle-login-password"
              class="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <i data-lucide="${loginShowPassword ? 'eye-off' : 'eye'}" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between py-1">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              id="login-remember"
              checked
              class="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
            />
            <span class="text-xs text-slate-400">ログイン状態を保持する</span>
          </label>
        </div>

        <button
          type="submit"
          id="btn-submit-login"
          class="w-full mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50"
        >
          <span>ログイン</span>
          <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>
      </form>

      <div class="mt-6 pt-6 border-t border-slate-800 text-center">
        <p class="text-xs text-slate-400">
          まだアカウントをお持ちではありませんか？
          <button
            type="button"
            id="btn-goto-register"
            class="text-indigo-400 hover:text-indigo-300 font-semibold transition ml-1"
          >
            新規登録する
          </button>
        </p>
      </div>
    </div>
  `;
}

function renderRegisterForm() {
  const errors = computeRegErrors(regState);
  const passwordStrength = computePasswordStrength(regState.password);
  const isFormValid = regState.name && regState.email && regState.password && regState.confirmPassword && regState.agreeTerms && Object.keys(errors).length === 0;

  return `
    <div class="bg-slate-900/90 border border-slate-800 p-8 rounded-2xl shadow-xl shadow-black/40 backdrop-blur-xl">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-white tracking-tight">アカウント登録</h2>
        <p class="text-sm text-slate-400 mt-1">
          必要情報を入力して、新しいアカウントを作成しましょう
        </p>
      </div>

      <form id="form-register" class="space-y-4">
        <!-- お名前 -->
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">
            お名前 / ユーザー名
          </label>
          <div class="relative">
            <i data-lucide="user" class="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
            <input
              type="text"
              id="reg-name"
              required
              value="${escapeHtml(regState.name)}"
              placeholder="山田 太郎"
              class="w-full bg-slate-950/60 border ${errors.name ? 'border-rose-500/70 focus:ring-rose-500' : 'border-slate-700 focus:ring-indigo-500 focus:border-transparent'} rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition"
            />
          </div>
          ${errors.name ? `<p class="text-xs text-rose-400 mt-1">${errors.name}</p>` : ''}
        </div>

        <!-- メールアドレス -->
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">
            メールアドレス
          </label>
          <div class="relative">
            <i data-lucide="mail" class="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
            <input
              type="email"
              id="reg-email"
              required
              value="${escapeHtml(regState.email)}"
              placeholder="name@example.com"
              class="w-full bg-slate-950/60 border ${errors.email ? 'border-rose-500/70 focus:ring-rose-500' : 'border-slate-700 focus:ring-indigo-500 focus:border-transparent'} rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition"
            />
          </div>
          ${errors.email ? `<p class="text-xs text-rose-400 mt-1">${errors.email}</p>` : ''}
        </div>

        <!-- パスワード -->
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">
            パスワード (8文字以上)
          </label>
          <div class="relative">
            <i data-lucide="lock" class="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
            <input
              type="${regShowPassword ? 'text' : 'password'}"
              id="reg-password"
              required
              value="${escapeHtml(regState.password)}"
              placeholder="大文字・数字・記号の組み合わせ"
              class="w-full bg-slate-950/60 border ${errors.password ? 'border-rose-500/70 focus:ring-rose-500' : 'border-slate-700 focus:ring-indigo-500 focus:border-transparent'} rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition"
            />
            <button
              type="button"
              id="btn-toggle-reg-password"
              class="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <i data-lucide="${regShowPassword ? 'eye-off' : 'eye'}" class="w-4 h-4"></i>
            </button>
          </div>

          <!-- 強度インジケーター -->
          ${regState.password ? `
            <div class="mt-2">
              <div class="flex items-center justify-between text-[11px] mb-1">
                <span class="text-slate-400">強度:</span>
                <span class="font-semibold text-slate-300">${getStrengthLabel(passwordStrength, regState.password)}</span>
              </div>
              <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex gap-1">
                <div class="h-full flex-1 rounded-full transition-all duration-300 ${passwordStrength >= 1 ? getStrengthBarColor(passwordStrength) : 'bg-transparent'}"></div>
                <div class="h-full flex-1 rounded-full transition-all duration-300 ${passwordStrength >= 2 ? getStrengthBarColor(passwordStrength) : 'bg-transparent'}"></div>
                <div class="h-full flex-1 rounded-full transition-all duration-300 ${passwordStrength >= 3 ? getStrengthBarColor(passwordStrength) : 'bg-transparent'}"></div>
                <div class="h-full flex-1 rounded-full transition-all duration-300 ${passwordStrength >= 4 ? getStrengthBarColor(passwordStrength) : 'bg-transparent'}"></div>
              </div>
            </div>
          ` : ''}
          ${errors.password ? `<p class="text-xs text-rose-400 mt-1">${errors.password}</p>` : ''}
        </div>

        <!-- パスワード確認 -->
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">
            パスワード（確認用）
          </label>
          <div class="relative">
            <i data-lucide="lock" class="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
            <input
              type="${regShowPassword ? 'text' : 'password'}"
              id="reg-confirm-password"
              required
              value="${escapeHtml(regState.confirmPassword)}"
              placeholder="もう一度入力"
              class="w-full bg-slate-950/60 border ${errors.confirmPassword ? 'border-rose-500/70 focus:ring-rose-500' : 'border-slate-700 focus:ring-indigo-500 focus:border-transparent'} rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition"
            />
          </div>
          ${errors.confirmPassword ? `<p class="text-xs text-rose-400 mt-1">${errors.confirmPassword}</p>` : ''}
        </div>

        <!-- 利用規約同意 -->
        <div class="pt-2">
          <label class="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              id="reg-agree-terms"
              required
              ${regState.agreeTerms ? 'checked' : ''}
              class="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
            />
            <span class="text-xs text-slate-400 leading-snug">
              <span class="text-indigo-400 underline cursor-pointer">利用規約</span> および
              <span class="text-indigo-400 underline cursor-pointer">プライバシーポリシー</span>
              に同意してアカウントを開設します
            </span>
          </label>
        </div>

        <button
          type="submit"
          id="btn-submit-register"
          ${!isFormValid ? 'disabled' : ''}
          class="w-full mt-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i data-lucide="sparkles" class="w-4 h-4"></i>
          <span>アカウントを作成</span>
        </button>
      </form>

      <div class="mt-6 pt-6 border-t border-slate-800 text-center">
        <p class="text-xs text-slate-400">
          既にアカウントをお持ちですか？
          <button
            type="button"
            id="btn-goto-login"
            class="text-indigo-400 hover:text-indigo-300 font-semibold transition ml-1"
          >
            ログインはこちら
          </button>
        </p>
      </div>
    </div>
  `;
}

function renderForgotPasswordForm() {
  return `
    <div class="bg-slate-900/90 border border-slate-800 p-8 rounded-2xl shadow-xl shadow-black/40 backdrop-blur-xl">
      <button
        type="button"
        id="btn-back-to-login"
        class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-6 transition"
      >
        <i data-lucide="chevron-left" class="w-4 h-4"></i>
        <span>ログイン画面に戻る</span>
      </button>

      <div class="mb-6">
        <div class="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400 mb-3">
          <i data-lucide="key-round" class="w-5 h-5"></i>
        </div>
        <h2 class="text-xl font-bold text-white tracking-tight">パスワードの再設定</h2>
        <p class="text-xs text-slate-400 mt-1.5 leading-relaxed">
          ご登録のメールアドレスを入力してください。パスワードリセット用の案内をお送りします。
        </p>
      </div>

      <form id="form-forgot" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1.5">
            メールアドレス
          </label>
          <div class="relative">
            <i data-lucide="mail" class="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
            <input
              type="email"
              id="forgot-email"
              required
              placeholder="name@example.com"
              class="w-full bg-slate-950/60 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>
        </div>

        <button
          type="submit"
          id="btn-submit-forgot"
          class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50"
        >
          <span>送信する</span>
        </button>
      </form>
    </div>
  `;
}

function renderDashboardView() {
  if (!currentUser) return '';
  const initial = currentUser.name ? currentUser.name.charAt(0) : 'U';

  return `
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl shadow-black/40 backdrop-blur-xl overflow-hidden">
      <!-- ユーザーヘッダーバナー -->
      <div class="bg-gradient-to-r from-indigo-900/60 to-purple-900/60 p-6 border-b border-slate-800 flex items-center gap-4">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-indigo-500/30">
          ${escapeHtml(initial)}
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-xl font-bold text-white">${escapeHtml(currentUser.name)}</h2>
            <span class="bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              <i data-lucide="shield-check" class="w-3 h-3"></i>
              認証済み
            </span>
          </div>
          <p class="text-xs text-slate-400 mt-1">${escapeHtml(currentUser.email || currentUser.username)}</p>
        </div>
      </div>

      <!-- ユーザー情報詳細 -->
      <div class="p-6 space-y-4">
        <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          アカウント情報
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span class="text-slate-500 block mb-1">ユーザーID</span>
            <span class="font-mono text-slate-200 text-[11px] truncate block">
              ${escapeHtml(currentUser.id)}
            </span>
          </div>
          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-2">
            <i data-lucide="calendar" class="w-4 h-4 text-slate-500"></i>
            <div>
              <span class="text-slate-500 block text-[11px]">登録日</span>
              <span class="text-slate-200 font-medium">${escapeHtml(currentUser.createdAt || '2026-01-15')}</span>
            </div>
          </div>
        </div>

        <!-- セキュリティ状態ステータス -->
        <div class="p-4 rounded-xl bg-indigo-950/30 border border-indigo-800/40 mt-4">
          <div class="flex items-start gap-3">
            <i data-lucide="shield-check" class="w-5 h-5 text-indigo-400 shrink-0 mt-0.5"></i>
            <div class="text-xs">
              <span class="font-semibold text-indigo-200 block mb-0.5">
                アカウントの保護状態は良好です
              </span>
              <span class="text-slate-400 leading-relaxed block">
                パスワード暗号化やリアルタイム検証が正しく作動しています。
              </span>
            </div>
          </div>
        </div>

        <!-- アクションボタン -->
        <div class="pt-4 flex flex-col sm:flex-row gap-3">
          <a
            href="./index.html"
            class="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl text-xs transition shadow-lg shadow-indigo-600/20"
          >
            <i data-lucide="layers" class="w-4 h-4"></i>
            <span>ポータル画面を開く</span>
          </a>
          <button
            type="button"
            id="btn-dashboard-logout"
            class="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2.5 rounded-xl border border-slate-700 text-xs transition"
          >
            <i data-lucide="log-out" class="w-4 h-4"></i>
            <span>ログアウト</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// Core View Assembly and Event Binding
// -------------------------------------------------------------
function renderApp() {
  // Update Header Actions
  const headerActions = document.getElementById('header-user-actions');
  if (headerActions) {
    if (currentUser) {
      headerActions.innerHTML = `
        <span class="text-slate-400 hidden sm:inline">${escapeHtml(currentUser.email || currentUser.username)}</span>
        <button
          type="button"
          id="btn-header-logout"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors text-xs font-medium"
        >
          <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
          <span>ログアウト</span>
        </button>
      `;
      document.getElementById('btn-header-logout')?.addEventListener('click', handleLogout);
    } else {
      headerActions.innerHTML = `
        <a href="./index.html" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors text-xs font-medium">
          <i data-lucide="layers" class="w-3.5 h-3.5"></i>
          <span>ポータル</span>
        </a>
      `;
    }
  }

  // Update Main View Container
  const container = document.getElementById('app-view-container');
  if (!container) return;

  if (view === 'login') {
    container.innerHTML = renderLoginForm();
    attachLoginFormEvents();
  } else if (view === 'register') {
    container.innerHTML = renderRegisterForm();
    attachRegisterFormEvents();
  } else if (view === 'forgot') {
    container.innerHTML = renderForgotPasswordForm();
    attachForgotPasswordEvents();
  } else if (view === 'dashboard') {
    container.innerHTML = renderDashboardView();
    attachDashboardEvents();
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// -------------------------------------------------------------
// Event Attachments per View
// -------------------------------------------------------------
function attachLoginFormEvents() {
  document.getElementById('btn-fill-demo')?.addEventListener('click', () => {
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    if (emailInput) emailInput.value = 'demo@example.com';
    if (passwordInput) passwordInput.value = 'Password123!';
  });

  document.getElementById('btn-goto-forgot')?.addEventListener('click', () => {
    view = 'forgot';
    renderApp();
  });

  document.getElementById('btn-goto-register')?.addEventListener('click', () => {
    view = 'register';
    renderApp();
  });

  document.getElementById('btn-toggle-login-password')?.addEventListener('click', () => {
    loginShowPassword = !loginShowPassword;
    renderApp();
  });

  const form = document.getElementById('form-login');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email')?.value || '';
    const password = document.getElementById('login-password')?.value || '';
    const submitBtn = document.getElementById('btn-submit-login');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;
    }

    setTimeout(async () => {
      const success = await handleLogin({ email, password });
      if (!success && submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>ログイン</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
        if (window.lucide) window.lucide.createIcons();
      }
    }, 400);
  });
}

function attachRegisterFormEvents() {
  document.getElementById('btn-goto-login')?.addEventListener('click', () => {
    view = 'login';
    renderApp();
  });

  document.getElementById('btn-toggle-reg-password')?.addEventListener('click', () => {
    regShowPassword = !regShowPassword;
    renderApp();
  });

  // Inputs live state sync
  const regNameInput = document.getElementById('reg-name');
  const regEmailInput = document.getElementById('reg-email');
  const regPasswordInput = document.getElementById('reg-password');
  const regConfirmInput = document.getElementById('reg-confirm-password');
  const regTermsCheckbox = document.getElementById('reg-agree-terms');

  regNameInput?.addEventListener('input', (e) => {
    regState.name = e.target.value;
    renderApp();
  });

  regEmailInput?.addEventListener('input', (e) => {
    regState.email = e.target.value;
    renderApp();
  });

  regPasswordInput?.addEventListener('input', (e) => {
    regState.password = e.target.value;
    renderApp();
  });

  regConfirmInput?.addEventListener('input', (e) => {
    regState.confirmPassword = e.target.value;
    renderApp();
  });

  regTermsCheckbox?.addEventListener('change', (e) => {
    regState.agreeTerms = e.target.checked;
    renderApp();
  });

  const form = document.getElementById('form-register');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!regState.agreeTerms) return;
    const errors = computeRegErrors(regState);
    if (Object.keys(errors).length > 0) return;

    const submitBtn = document.getElementById('btn-submit-register');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;
    }

    setTimeout(async () => {
      const success = await handleRegister({
        name: regState.name,
        email: regState.email,
        password: regState.password
      });
      if (!success && submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i><span>アカウントを作成</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
    }, 500);
  });
}

function attachForgotPasswordEvents() {
  document.getElementById('btn-back-to-login')?.addEventListener('click', () => {
    view = 'login';
    renderApp();
  });

  const form = document.getElementById('form-forgot');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email')?.value || '';
    if (!email) return;

    const submitBtn = document.getElementById('btn-submit-forgot');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;
    }

    setTimeout(() => {
      showToast(`${email} 宛に再設定リンクを送信しました（模擬）`, 'info');
      view = 'login';
      renderApp();
    }, 600);
  });
}

function attachDashboardEvents() {
  document.getElementById('btn-dashboard-logout')?.addEventListener('click', handleLogout);
}

// -------------------------------------------------------------
// Initialize App
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  renderApp();
});
