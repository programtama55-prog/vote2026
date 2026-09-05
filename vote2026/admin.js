import { 
  checkPageAccess, 
  renderAuthHeaderWidget, 
  getCurrentUser, 
  getAccounts, 
  addAccount, 
  updateAccountRole, 
  deleteAccount, 
  getRoleBadgeHtml, 
  ROLES 
} from '@/lib/auth.js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase.js';
import { showToast, escapeHtml } from '@/lib/utils.js';

let currentUser = null;

async function init() {
  // 1. 管理者アクセス権限チェック (管理者以外は自動リダイレクト)
  currentUser = await checkPageAccess([ROLES.ADMIN]);
  if (!currentUser) return; // 権限がない場合はリダイレクト処理が行われる

  // 2. ヘッダー描画
  renderAuthHeaderWidget('header-user-widget');

  // 3. UIの初期設定
  initAdminView();
  initEventListeners();
  await loadDashboardData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 管理者パネルの初期表示設定
function initAdminView() {
  const userNameEl = document.getElementById('admin-user-name');
  if (userNameEl && currentUser) {
    userNameEl.textContent = currentUser.name;
  }

  window.switchAdminTab = switchAdminTab;

  window.addEventListener('storage', updateStats);
  window.addEventListener('focus', updateStats);

  // 定期自動更新 (2秒ごとに最新受付人数を集計・同期)
  setInterval(updateStats, 2000);
}

// タブ切り替え制御
export function switchAdminTab(tabName) {
  const tabs = ['accounts', 'election', 'logs', 'backup'];
  tabs.forEach(t => {
    const btn = document.getElementById(`admin-tab-btn-${t}`);
    const panel = document.getElementById(`admin-panel-${t}`);
    
    if (t === tabName) {
      if (btn) btn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition-all bg-amber-500 text-slate-950 shadow-md flex items-center gap-2 shrink-0';
      if (panel) panel.classList.remove('hidden');
    } else {
      if (btn) btn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center gap-2 shrink-0';
      if (panel) panel.classList.add('hidden');
    }
  });
}

// イベントリスナー
function initEventListeners() {
  // アカウント更新ボタン
  document.getElementById('btn-refresh-accounts')?.addEventListener('click', () => {
    renderAccountsTable();
    showToast('アカウント情報を再読み込みしました', 'info');
  });

  // 新規スタッフ追加フォーム
  const addForm = document.getElementById('admin-add-staff-form');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('new-username').value;
      const name = document.getElementById('new-name').value;
      const role = document.getElementById('new-role').value;
      const password = document.getElementById('new-password').value;

      const res = await addAccount({ username, name, role, password });
      if (res.success) {
        showToast(`スタッフ「${name}」に役職【${role}】を付与して追加しました。`, 'success');
        addLog(`新規スタッフ登録: ${username} (${name} / ${role})`);
        addForm.reset();
        await renderAccountsTable();
        await updateStats();
      } else {
        showToast(res.message, 'error');
      }
    });
  }

  // 選挙設定フォーム
  const settingsForm = document.getElementById('admin-election-settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('cfg-election-title').value;
      const status = document.getElementById('cfg-election-status').value;

      localStorage.setItem('kodomo_senkyo_title', title);
      localStorage.setItem('kodomo_senkyo_status', status);

      const statusEl = document.getElementById('stat-election-status');
      if (statusEl) statusEl.textContent = status;

      addLog(`選挙設定変更: タイトル「${title}」 / ステータス「${status}」`);
      showToast('選挙設定を保存して反映しました', 'success');
    });
  }

  // ログ削除ボタン
  document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
    if (confirm('監査ログを全消去しますか？')) {
      localStorage.removeItem('kodomo_senkyo_admin_logs');
      renderLogs();
      showToast('ログを消去しました', 'info');
    }
  });

  // CSV全データ出力
  document.getElementById('btn-export-admin-csv')?.addEventListener('click', exportFullCsv);

  // キャッシュクリア
  document.getElementById('btn-reset-cache')?.addEventListener('click', () => {
    if (confirm('ローカルキャッシュをリセットしますか？ (ログアウトされます)')) {
      localStorage.clear();
      showToast('キャッシュを消去しました。再読み込みします。', 'info');
      setTimeout(() => {
        window.location.href = './login.html';
      }, 500);
    }
  });
}

// データ読み込み
async function loadDashboardData() {
  await renderAccountsTable();
  await updateStats();
  renderLogs();
}

// アカウント一覧テーブル描画
async function renderAccountsTable() {
  const tbody = document.getElementById('admin-accounts-table-body');
  if (!tbody) return;

  const accounts = await getAccounts();

  if (!accounts || accounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500 font-bold">アカウントが登録されていません</td></tr>`;
    return;
  }

  tbody.innerHTML = accounts.map(acc => {
    const isSelf = currentUser && currentUser.username === acc.username;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-3 px-4 font-mono font-bold text-slate-200">
          ${escapeHtml(acc.username)}
          ${isSelf ? '<span class="ml-1 text-[0.65rem] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-normal">ログイン中(自分)</span>' : ''}
        </td>
        <td class="py-3 px-4 font-medium text-slate-100">${escapeHtml(acc.name || acc.username)}</td>
        <td class="py-3 px-4">${getRoleBadgeHtml(acc.role)}</td>
        <td class="py-3 px-4">
          <select data-username="${escapeHtml(acc.username)}" 
                  class="admin-role-select bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500">
            <option value="運営" ${acc.role === ROLES.UNEI ? 'selected' : ''}>運営</option>
            <option value="開票担当者" ${acc.role === ROLES.KAIHYO ? 'selected' : ''}>開票担当者</option>
            <option value="管理者" ${acc.role === ROLES.ADMIN ? 'selected' : ''}>管理者</option>
          </select>
        </td>
        <td class="py-3 px-4 text-right">
          ${isSelf ? `
            <span class="text-xs text-slate-500 italic font-bold">削除不可</span>
          ` : `
            <button data-username="${escapeHtml(acc.username)}" class="btn-admin-delete-account px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg transition text-xs font-bold">
              <i class="fa-solid fa-trash"></i> 削除
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');

  // 役職変更イベントリスナー
  tbody.querySelectorAll('.admin-role-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const username = e.target.getAttribute('data-username');
      const newRole = e.target.value;
      const res = await updateAccountRole(username, newRole);
      if (res.success) {
        showToast(`ユーザー ${username} の役職を【${newRole}】に変更しました`, 'success');
        addLog(`役職変更: ユーザー ${username} -> ${newRole}`);
        await renderAccountsTable();
        await updateStats();
        renderAuthHeaderWidget('header-user-widget');
      } else {
        showToast(res.message, 'error');
      }
    });
  });

  // アカウント削除イベントリスナー
  tbody.querySelectorAll('.btn-admin-delete-account').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const username = e.currentTarget.getAttribute('data-username');
      if (confirm(`本当にアカウント 「${username}」 を削除しますか？`)) {
        const res = await deleteAccount(username);
        if (res.success) {
          showToast(`アカウント ${username} を削除しました`, 'info');
          addLog(`アカウント削除: ${username}`);
          await renderAccountsTable();
          await updateStats();
        } else {
          showToast(res.message, 'error');
        }
      }
    });
  });
}

// システム統計更新
async function updateStats() {
  const accounts = await getAccounts();
  const staffCountEl = document.getElementById('stat-staff-count');
  if (staffCountEl) staffCountEl.textContent = `${accounts.length}名`;

  const statusEl = document.getElementById('stat-election-status');
  if (statusEl) {
    statusEl.textContent = localStorage.getItem('kodomo_senkyo_status') || '投票受付中';
  }

  // 受付人数の取得 (localStorage / Supabase の統計)
  let localCount = 0;
  try {
    const raw = localStorage.getItem('kodomo_senkyo_voters') || '[]';
    const voters = JSON.parse(raw);
    if (Array.isArray(voters)) {
      localCount = voters.length;
    }
  } catch (e) {}

  let remoteCount = 0;
  if (isSupabaseConfigured() && supabase) {
    try {
      const { count, error } = await supabase.from('registrations').select('*', { count: 'exact', head: true });
      if (!error && count !== null) {
        remoteCount = count;
      }
    } catch (e) {}
  }

  const totalVisitors = Math.max(localCount, remoteCount);

  const visitorEl = document.getElementById('stat-total-visitors');
  if (visitorEl) visitorEl.textContent = `${totalVisitors}名`;
}

// 監査ログの読み込みと追記
function renderLogs() {
  const container = document.getElementById('admin-logs-container');
  if (!container) return;

  const logs = JSON.parse(localStorage.getItem('kodomo_senkyo_admin_logs') || '[]');
  if (logs.length === 0) {
    container.innerHTML = `<div class="text-slate-500 italic">記録されている監査ログはありません</div>`;
    return;
  }

  container.innerHTML = logs.map(l => `
    <div class="flex items-start gap-2 border-b border-slate-800/80 pb-1.5">
      <span class="text-slate-500 shrink-0">[${l.time}]</span>
      <span class="text-amber-400 font-bold shrink-0">${escapeHtml(l.user)}:</span>
      <span class="text-slate-200">${escapeHtml(l.action)}</span>
    </div>
  `).join('');
}

function addLog(action) {
  const logs = JSON.parse(localStorage.getItem('kodomo_senkyo_admin_logs') || '[]');
  const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logs.unshift({
    time: now,
    user: currentUser ? currentUser.username : 'admin',
    action: action
  });
  localStorage.setItem('kodomo_senkyo_admin_logs', JSON.stringify(logs.slice(0, 50)));
  renderLogs();
}

// CSV全出力機能
function exportFullCsv() {
  const accounts = JSON.parse(localStorage.getItem('kodomo_senkyo_local_accounts') || '[]');
  let csvContent = 'データ種別,ユーザーID/識別子,名前,役職/ステータス,作成日時\n';

  accounts.forEach(a => {
    csvContent += `スタッフアカウント,"${a.username}","${a.name}","${a.role}","${a.createdAt || ''}"\n`;
  });

  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kodomo_senkyo_admin_backup_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('管理者フルバックアップCSVを出力しました', 'success');
}
