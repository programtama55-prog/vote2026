import { 
  checkPageAccess, 
  renderAuthHeaderWidget, 
  getCurrentUser, 
  getAccounts, 
  addAccount, 
  updateAccountRole, 
  deleteAccount, 
  getRoleBadgeHtml, 
  generateInviteCode,
  getInviteCodes,
  deleteInviteCode,
  ROLES 
} from '@/lib/auth.js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase.js';
import { showToast, escapeHtml } from '@/lib/utils.js';

let currentUser = null;

async function init() {
  // 1. イベントリスナーおよびUI設定を即時実行 (フォーム送信時のページリロード防止)
  initAdminView();
  initEventListeners();

  // 2. 管理者アクセス権限チェック (管理者以外は自動リダイレクト)
  currentUser = await checkPageAccess([ROLES.ADMIN]);
  if (!currentUser) return; // 権限がない場合はリダイレクト処理が行われる

  // 3. ヘッダー描画およびデータロード
  renderAuthHeaderWidget('header-user-widget');
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

  window.addEventListener('storage', async () => {
    await updateStats();
    await renderInviteCodesTable();
  });
  window.addEventListener('focus', async () => {
    await updateStats();
    await renderInviteCodesTable();
  });

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
      if (btn) btn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white shadow-md flex items-center gap-2 shrink-0';
      if (panel) panel.classList.remove('hidden');
    } else {
      if (btn) btn.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition-all text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2 shrink-0';
      if (panel) panel.classList.add('hidden');
    }
  });
}

// グローバルおよびイベントハンドラ定義
export async function handleGenerateInviteClick(e) {
  if (e) e.preventDefault();
  try {
    const roleEl = document.getElementById('invite-role');
    const noteEl = document.getElementById('invite-note');
    const role = roleEl ? roleEl.value : '運営';
    const note = noteEl ? noteEl.value : '';

    const res = await generateInviteCode(role, note);
    if (res.success) {
      showToast(`役職【${role}】の招待コード「${res.invite.code}」を発行しました！`, 'success');
      addLog(`招待コード発行: ${res.invite.code} (役職: ${role} / メモ: ${note || 'なし'})`);
      const generateInviteForm = document.getElementById('admin-generate-invite-form');
      if (generateInviteForm) generateInviteForm.reset();
      await renderInviteCodesTable();
    } else {
      showToast(res.message || '招待コード発行エラー', 'error');
    }
  } catch (err) {
    console.error('招待コード発行例外:', err);
    showToast('エラーが発生しました', 'error');
  }
}
window.handleGenerateInviteClick = handleGenerateInviteClick;

// イベントリスナー
function initEventListeners() {
  // 招待コード発行フォーム & ボタン
  const generateInviteForm = document.getElementById('admin-generate-invite-form');
  if (generateInviteForm) {
    generateInviteForm.addEventListener('submit', handleGenerateInviteClick);
  }

  const generateInviteBtn = document.getElementById('btn-generate-invite-submit');
  if (generateInviteBtn) {
    generateInviteBtn.addEventListener('click', handleGenerateInviteClick);
  }

  // アカウント・招待コード更新ボタン
  document.getElementById('btn-refresh-accounts')?.addEventListener('click', async () => {
    await renderInviteCodesTable();
    await renderAccountsTable();
    showToast('アカウントおよび招待コード情報を再読み込みしました', 'info');
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
  await renderInviteCodesTable();
  await renderAccountsTable();
  await updateStats();
  renderLogs();
}

// 招待コード一覧テーブル描画
async function renderInviteCodesTable() {
  const tbody = document.getElementById('admin-invite-codes-table-body');
  const countBadge = document.getElementById('invite-code-count-badge');
  if (!tbody) return;

  const inviteCodes = await getInviteCodes();
  if (countBadge) countBadge.textContent = `${inviteCodes.length}件`;

  if (!inviteCodes || inviteCodes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-500 font-bold">発行済みの招待コードはありません</td></tr>`;
    return;
  }

  tbody.innerHTML = inviteCodes.map(inv => {
    const statusBadge = inv.is_used 
      ? `<span class="px-2 py-0.5 rounded text-[0.65rem] font-bold bg-slate-100 text-slate-600 border border-slate-200">使用済 (${escapeHtml(inv.used_by || '')})</span>`
      : `<span class="px-2 py-0.5 rounded text-[0.65rem] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse">未使用 (登録可能)</span>`;

    const dateStr = inv.created_at ? new Date(inv.created_at).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

    return `
      <tr class="hover:bg-indigo-50/50 transition border-b border-slate-100">
        <td class="py-3 px-4 font-mono font-bold text-indigo-600 text-sm select-all">
          ${escapeHtml(inv.code)}
        </td>
        <td class="py-3 px-4">${getRoleBadgeHtml(inv.role)}</td>
        <td class="py-3 px-4 text-slate-600 text-xs">${escapeHtml(inv.note || '-')}</td>
        <td class="py-3 px-4 text-slate-500 text-[0.7rem] font-mono">
          ${dateStr} <br><span class="text-slate-400">by ${escapeHtml(inv.created_by || 'admin')}</span>
        </td>
        <td class="py-3 px-4">${statusBadge}</td>
        <td class="py-3 px-4 text-right flex items-center justify-end gap-1.5 pt-3">
          <button data-code="${escapeHtml(inv.code)}" class="btn-copy-invite-code px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition text-xs font-bold flex items-center gap-1" title="コードをコピー">
            <i class="fa-solid fa-copy"></i> コピー
          </button>
          <button data-code="${escapeHtml(inv.code)}" class="btn-delete-invite-code px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition text-xs font-bold" title="招待コードを削除">
            <i class="fa-solid fa-trash"></i> 削除
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // コピーボタンイベント
  tbody.querySelectorAll('.btn-copy-invite-code').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const code = e.currentTarget.getAttribute('data-code');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code);
        showToast(`招待コード「${code}」をコピーしました`, 'success');
      } else {
        showToast(`招待コード: ${code}`, 'info');
      }
    });
  });

  // 削除ボタンイベント
  tbody.querySelectorAll('.btn-delete-invite-code').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const code = e.currentTarget.getAttribute('data-code');
      if (confirm(`招待コード 「${code}」 を無効化・削除しますか？`)) {
        await deleteInviteCode(code);
        showToast(`招待コード 「${code}」 を削除しました`, 'info');
        addLog(`招待コード削除: ${code}`);
        await renderInviteCodesTable();
      }
    });
  });
}

// アカウント一覧テーブル描画 (閲覧専用)
async function renderAccountsTable() {
  const tbody = document.getElementById('admin-accounts-table-body');
  if (!tbody) return;

  const accounts = await getAccounts();

  if (!accounts || accounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400 font-bold">アカウントが登録されていません</td></tr>`;
    return;
  }

  tbody.innerHTML = accounts.map(acc => {
    const isSelf = currentUser && (currentUser.username === acc.username || currentUser.email === acc.email);
    const dateStr = acc.createdAt || '-';

    return `
      <tr class="hover:bg-indigo-50/50 transition border-b border-slate-100">
        <td class="py-3 px-4 font-mono font-bold text-slate-800">
          ${escapeHtml(acc.username || acc.email)}
          ${isSelf ? '<span class="ml-1 text-[0.65rem] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">ログイン中(自分)</span>' : ''}
        </td>
        <td class="py-3 px-4 font-bold text-slate-900">${escapeHtml(acc.name || acc.username || acc.email)}</td>
        <td class="py-3 px-4">${getRoleBadgeHtml(acc.role)}</td>
        <td class="py-3 px-4 text-slate-500 font-mono text-xs">${escapeHtml(dateStr)}</td>
        <td class="py-3 px-4 text-right">
          <span class="px-2 py-0.5 rounded text-[0.65rem] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">登録済み</span>
        </td>
      </tr>
    `;
  }).join('');
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
