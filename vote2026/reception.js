import { supabase } from '@/lib/supabase.js';
import { showToast, escapeHtml } from '@/lib/utils.js';

// --- アプリケーションの状態管理 (State) ---
let state = {
  activeRegistration: null, // 現在操作中の参加者オブジェクト
  stats: {
    advanceRegistered: 0,
    samedayRegistered: 0,
    ballotsIssued: 0,
    ballotsRevoked: 0
  },
  logs: [], // 最近の受付履歴
  isMockData: false
};

// --- モック用のインメモリデータベース (Supabase接続失敗時のフォールバック用) ---
let mockDatabase = {
  registrations: [
    { id: 'mock-reg-1', reg_number: 'ADV-1001', is_advance: true, age_group: '小学高学年', municipality: 'つくば市', status: 'registered' },
    { id: 'mock-reg-2', reg_number: 'ADV-1002', is_advance: true, age_group: '中学生', municipality: '土浦市', status: 'ballot_issued' },
    { id: 'mock-reg-3', reg_number: 'ADV-1003', is_advance: true, age_group: '小学低学年', municipality: '水戸市', status: 'registered' },
    { id: 'mock-reg-4', reg_number: 'ADV-1004', is_advance: true, age_group: '高校生', municipality: 'つくば市', status: 'registered' }
  ],
  ballot_issues: [
    { id: 'mock-bi-1', registration_id: 'mock-reg-2', issued_at: new Date(Date.now() - 30 * 60000).toISOString(), staff_id: 'staff-01', is_revoked: false, revoke_reason: null }
  ]
};

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', async () => {
  checkSupabaseConnection();
  initEventListeners();
  await refreshData();
});

// Supabase接続確認とモード切替
function checkSupabaseConnection() {
  const modeBadge = document.getElementById('mode-badge');
  const isDefaultConfig = window.SUPABASE_URL && window.SUPABASE_URL.includes('your-supabase-project');
  
  if (isDefaultConfig || !supabase) {
    state.isMockData = true;
    modeBadge.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300';
    modeBadge.innerHTML = '<i class="fa-solid fa-circle-nodes mr-1"></i>デモモード (Mock)';
    console.log('こども選挙: デモ用モックデータモードで実行します。');
    document.getElementById('btn-clear-demo').classList.remove('hidden');
  } else {
    state.isMockData = false;
    modeBadge.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300';
    modeBadge.innerHTML = '<i class="fa-solid fa-server mr-1"></i>データベース接続中';
  }
}

// イベントリスナー登録
function initEventListeners() {
  // S02: 事前申込検索フォーム
  const searchForm = document.getElementById('search-form');
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const regNumber = document.getElementById('search-reg-number').value.trim();
    if (!regNumber) {
      showToast('受付番号を入力してください。', 'info');
      return;
    }
    await searchAdvanceParticipant(regNumber);
  });

  // S03: 当日登録フォーム
  const registerForm = document.getElementById('register-form');
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ageGroup = document.getElementById('register-age-group').value;
    const municipality = document.getElementById('register-municipality').value.trim();
    
    if (!ageGroup || !municipality) {
      showToast('年齢区分と市町村を入力してください。', 'info');
      return;
    }
    await registerSameDayParticipant(ageGroup, municipality);
  });

  // S04: 投票用紙交付ボタン
  const btnIssueBallot = document.getElementById('btn-issue-ballot');
  btnIssueBallot.addEventListener('click', async () => {
    if (!state.activeRegistration) return;
    await issueBallot(state.activeRegistration);
  });

  // S05: 交付取消フォーム
  const revokeForm = document.getElementById('revoke-form');
  revokeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeRegistration) return;
    const reason = document.getElementById('revoke-reason').value.trim();
    if (!reason) {
      showToast('取消理由を入力してください。', 'info');
      return;
    }
    await revokeBallot(state.activeRegistration.id, reason);
  });

  // S06: 履歴更新ボタン
  const btnRefreshLogs = document.getElementById('btn-refresh-logs');
  btnRefreshLogs.addEventListener('click', async () => {
    const icon = btnRefreshLogs.querySelector('i');
    icon.classList.add('fa-spin');
    await refreshData();
    setTimeout(() => {
      icon.classList.remove('fa-spin');
    }, 600);
  });

  // デモデータ初期化ボタン
  const btnClearDemo = document.getElementById('btn-clear-demo');
  btnClearDemo.addEventListener('click', () => {
    if (confirm('デモ用登録・交付データをリセットしますか？')) {
      mockDatabase.registrations = [
        { id: 'mock-reg-1', reg_number: 'ADV-1001', is_advance: true, age_group: '小学高学年', municipality: 'つくば市', status: 'registered' },
        { id: 'mock-reg-2', reg_number: 'ADV-1002', is_advance: true, age_group: '中学生', municipality: '土浦市', status: 'ballot_issued' },
        { id: 'mock-reg-3', reg_number: 'ADV-1003', is_advance: true, age_group: '小学低学年', municipality: '水戸市', status: 'registered' },
        { id: 'mock-reg-4', reg_number: 'ADV-1004', is_advance: true, age_group: '高校生', municipality: 'つくば市', status: 'registered' }
      ];
      mockDatabase.ballot_issues = [
        { id: 'mock-bi-1', registration_id: 'mock-reg-2', issued_at: new Date(Date.now() - 30 * 60000).toISOString(), staff_id: 'staff-01', is_revoked: false, revoke_reason: null }
      ];
      state.activeRegistration = null;
      renderActivePanel();
      refreshData();
      showToast('デモデータを初期化しました。', 'success');
    }
  });
}

// データリフレッシュ
async function refreshData() {
  await loadStats();
  await loadLogs();
}

// --- 統計情報の読み込み (S01) ---
async function loadStats() {
  if (state.isMockData) {
    const advance = mockDatabase.registrations.filter(r => r.is_advance).length;
    const sameday = mockDatabase.registrations.filter(r => !r.is_advance).length;
    const issued = mockDatabase.registrations.filter(r => r.status === 'ballot_issued').length;
    const revoked = mockDatabase.ballot_issues.filter(bi => bi.is_revoked).length;

    state.stats = {
      advanceRegistered: advance,
      samedayRegistered: sameday,
      ballotsIssued: issued,
      ballotsRevoked: revoked
    };
    renderStats();
    return;
  }

  try {
    const { count: advanceCount, error: err1 } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('is_advance', true);
    if (err1) throw err1;

    const { count: samedayCount, error: err2 } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('is_advance', false);
    if (err2) throw err2;

    const { count: issuedCount, error: err3 } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ballot_issued');
    if (err3) throw err3;

    const { count: revokedCount, error: err4 } = await supabase
      .from('ballot_issues')
      .select('*', { count: 'exact', head: true })
      .eq('is_revoked', true);
    if (err4) throw err4;

    state.stats = {
      advanceRegistered: advanceCount || 0,
      samedayRegistered: samedayCount || 0,
      ballotsIssued: issuedCount || 0,
      ballotsRevoked: revokedCount || 0
    };
    renderStats();
  } catch (err) {
    console.error('統計データの読み込みに失敗しました:', err);
  }
}

function renderStats() {
  document.getElementById('stat-advance-registered').innerText = `${state.stats.advanceRegistered}人`;
  document.getElementById('stat-sameday-registered').innerText = `${state.stats.samedayRegistered}人`;
  document.getElementById('stat-ballots-issued').innerText = `${state.stats.ballotsIssued}人`;
  document.getElementById('stat-ballots-revoked').innerText = `${state.stats.ballotsRevoked}人`;
}

// --- 事前申込者検索 (S02) ---
async function searchAdvanceParticipant(regNumber) {
  if (state.isMockData) {
    const match = mockDatabase.registrations.find(
      r => r.reg_number.toUpperCase() === regNumber.toUpperCase() && r.is_advance
    );
    
    if (match) {
      state.activeRegistration = { ...match };
      renderActivePanel();
      showToast(`「${regNumber}」が見つかりました。`, 'success');
    } else {
      showToast(`「${regNumber}」に該当する事前登録者は見つかりません。`, 'error');
    }
    return;
  }

  try {
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('reg_number', regNumber)
      .eq('is_advance', true)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      state.activeRegistration = data;
      renderActivePanel();
      showToast(`「${regNumber}」が見つかりました。`, 'success');
    } else {
      showToast(`「${regNumber}」に該当する事前登録者は見つかりません。`, 'error');
    }
  } catch (err) {
    console.error('事前申込者検索エラー:', err);
    showToast('検索中にエラーが発生しました。', 'error');
  }
}

// --- 当日参加者登録 (S03) ---
async function registerSameDayParticipant(ageGroup, municipality) {
  const regNumber = `DAY-${Math.floor(1000 + Math.random() * 9000)}`;

  if (state.isMockData) {
    const newReg = {
      id: `mock-reg-${Date.now()}`,
      reg_number: regNumber,
      is_advance: false,
      age_group: ageGroup,
      municipality: municipality,
      status: 'registered'
    };

    mockDatabase.registrations.push(newReg);
    state.activeRegistration = { ...newReg };
    
    document.getElementById('register-form').reset();
    renderActivePanel();
    await refreshData();
    showToast(`当日登録に成功しました。受付番号: ${regNumber}`, 'success');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('registrations')
      .insert({
        reg_number: regNumber,
        is_advance: false,
        age_group: ageGroup,
        municipality: municipality,
        status: 'registered'
      })
      .select()
      .single();

    if (error) throw error;

    state.activeRegistration = data;
    document.getElementById('register-form').reset();
    renderActivePanel();
    await refreshData();
    showToast(`当日登録に成功しました。受付番号: ${regNumber}`, 'success');
  } catch (err) {
    console.error('当日登録エラー:', err);
    showToast('登録に失敗しました。', 'error');
  }
}

// --- 投票用紙交付 (S04) ---
async function issueBallot(registration) {
  // 【最重要】二重交付防止ロジック
  if (registration.status === 'ballot_issued') {
    alert('【警告】この参加者はすでに投票用紙が交付されています！二重交付は固く禁止されています。');
    showToast('交付処理はブロックされました。', 'error');
    return;
  }

  if (state.isMockData) {
    // mockDatabase の登録情報を更新
    const regIdx = mockDatabase.registrations.findIndex(r => r.id === registration.id);
    if (regIdx !== -1) {
      mockDatabase.registrations[regIdx].status = 'ballot_issued';
      state.activeRegistration = { ...mockDatabase.registrations[regIdx] };
    }

    // ballot_issues への挿入
    const newIssue = {
      id: `mock-bi-${Date.now()}`,
      registration_id: registration.id,
      issued_at: new Date().toISOString(),
      staff_id: 'staff-01',
      is_revoked: false,
      revoke_reason: null
    };
    mockDatabase.ballot_issues.push(newIssue);

    renderActivePanel();
    await refreshData();
    showToast('投票用紙を交付しました。', 'success');
    return;
  }

  try {
    // 1. ballot_issues にインサート
    const { error: issueErr } = await supabase
      .from('ballot_issues')
      .insert({
        registration_id: registration.id,
        issued_at: new Date().toISOString(),
        staff_id: 'staff-default',
        is_revoked: false
      });

    if (issueErr) throw issueErr;

    // 2. registrations のステータスを更新
    const { data: updatedReg, error: regErr } = await supabase
      .from('registrations')
      .update({ status: 'ballot_issued' })
      .eq('id', registration.id)
      .select()
      .single();

    if (regErr) throw regErr;

    state.activeRegistration = updatedReg;
    renderActivePanel();
    await refreshData();
    showToast('投票用紙を交付しました。', 'success');
  } catch (err) {
    console.error('交付処理エラー:', err);
    showToast('交付処理に失敗しました。', 'error');
  }
}

// --- 誤操作による交付取消 (S05) ---
async function revokeBallot(registrationId, reason) {
  if (state.isMockData) {
    // registrations の更新
    const regIdx = mockDatabase.registrations.findIndex(r => r.id === registrationId);
    if (regIdx !== -1) {
      mockDatabase.registrations[regIdx].status = 'registered';
      state.activeRegistration = { ...mockDatabase.registrations[regIdx] };
    }

    // ballot_issues の取消更新
    const issueIdx = mockDatabase.ballot_issues.findIndex(
      bi => bi.registration_id === registrationId && !bi.is_revoked
    );
    if (issueIdx !== -1) {
      mockDatabase.ballot_issues[issueIdx].is_revoked = true;
      mockDatabase.ballot_issues[issueIdx].revoke_reason = reason;
    }

    document.getElementById('revoke-reason').value = '';
    renderActivePanel();
    await refreshData();
    showToast('交付を取り消しました。', 'success');
    return;
  }

  try {
    // 1. ballot_issues の is_revoked, revoke_reason を更新
    const { error: issueErr } = await supabase
      .from('ballot_issues')
      .update({ is_revoked: true, revoke_reason: reason })
      .eq('registration_id', registrationId)
      .eq('is_revoked', false);

    if (issueErr) throw issueErr;

    // 2. registrations を status = 'registered' に戻す
    const { data: updatedReg, error: regErr } = await supabase
      .from('registrations')
      .update({ status: 'registered' })
      .eq('id', registrationId)
      .select()
      .single();

    if (regErr) throw regErr;

    state.activeRegistration = updatedReg;
    document.getElementById('revoke-reason').value = '';
    renderActivePanel();
    await refreshData();
    showToast('交付を取り消しました。', 'success');
  } catch (err) {
    console.error('交付取消エラー:', err);
    showToast('交付取消処理に失敗しました。', 'error');
  }
}

// --- 操作パネルの描画 ---
function renderActivePanel() {
  const emptyState = document.getElementById('action-empty-state');
  const content = document.getElementById('action-content');
  
  if (!state.activeRegistration) {
    emptyState.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  content.classList.remove('hidden');

  const reg = state.activeRegistration;

  // 各種表示項目への値セット
  document.getElementById('panel-reg-number').innerText = reg.reg_number;
  document.getElementById('panel-is-advance').innerText = reg.is_advance ? '事前申込者' : '当日参加者';
  document.getElementById('panel-age-group').innerText = reg.age_group;
  document.getElementById('panel-municipality').innerText = reg.municipality;

  const badge = document.getElementById('active-status-badge');
  const btnIssue = document.getElementById('btn-issue-ballot');
  const warningPanel = document.getElementById('double-issue-warning');
  const revokeBox = document.getElementById('revoke-action-box');

  badge.classList.remove('hidden');

  if (reg.status === 'ballot_issued') {
    // 交付済みステータス
    badge.innerText = '交付済み';
    badge.className = 'px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300';
    
    // 交付ボタンの無効化と警告表示
    btnIssue.disabled = true;
    warningPanel.classList.remove('hidden');
    revokeBox.classList.remove('hidden');
  } else {
    // 未交付ステータス
    badge.innerText = '未交付';
    badge.className = 'px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300';
    
    // 交付ボタンの有効化と警告非表示
    btnIssue.disabled = false;
    warningPanel.classList.add('hidden');
    revokeBox.classList.add('hidden');
  }
}

// --- 受付履歴ログのロード & 描画 (S06) ---
async function loadLogs() {
  const tbody = document.getElementById('logs-tbody');

  if (state.isMockData) {
    // mockのログ結合処理
    const joinedLogs = mockDatabase.registrations.map(reg => {
      const issue = mockDatabase.ballot_issues.find(bi => bi.registration_id === reg.id);
      return {
        ...reg,
        issued_at: issue ? issue.issued_at : null,
        is_revoked: issue ? issue.is_revoked : false,
        revoke_reason: issue ? issue.revoke_reason : null
      };
    }).sort((a, b) => {
      // 交付日時またはid順でソート
      const dateA = a.issued_at || '';
      const dateB = b.issued_at || '';
      return dateB.localeCompare(dateA);
    });

    state.logs = joinedLogs;
    renderLogs();
    return;
  }

  try {
    // registrations と ballot_issues を結合して直近20件を取得
    const { data, error } = await supabase
      .from('registrations')
      .select('id, reg_number, is_advance, age_group, municipality, status, ballot_issues(issued_at, is_revoked, revoke_reason)')
      .order('id', { ascending: false })
      .limit(20);

    if (error) throw error;

    // データ平坦化
    state.logs = data.map(item => {
      // ballot_issues は配列で返ってくるため、最新のものを取得
      const issues = item.ballot_issues || [];
      const latestIssue = issues.length > 0 ? issues[issues.length - 1] : null;
      return {
        id: item.id,
        reg_number: item.reg_number,
        is_advance: item.is_advance,
        age_group: item.age_group,
        municipality: item.municipality,
        status: item.status,
        issued_at: latestIssue ? latestIssue.issued_at : null,
        is_revoked: latestIssue ? latestIssue.is_revoked : false,
        revoke_reason: latestIssue ? latestIssue.revoke_reason : null
      };
    });

    renderLogs();
  } catch (err) {
    console.error('履歴ログのロードエラー:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="p-8 text-center text-rose-500 text-xs">
          履歴の取得に失敗しました。
        </td>
      </tr>
    `;
  }
}

function renderLogs() {
  const tbody = document.getElementById('logs-tbody');
  tbody.innerHTML = '';

  if (state.logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="p-8 text-center text-slate-400 text-xs">
          受付された履歴はありません。
        </td>
      </tr>
    `;
    return;
  }

  state.logs.forEach(log => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50/80 transition-colors border-b border-slate-100";
    
    // 日付フォーマット
    const timeStr = log.issued_at 
      ? new Date(log.issued_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '-';

    // 区分バッジ
    const typeBadge = log.is_advance
      ? '<span class="px-2 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">事前</span>'
      : '<span class="px-2 py-0.5 text-xs rounded-full bg-sky-50 text-sky-700 border border-sky-200">当日</span>';

    // ステータスバッジ & 取消理由
    let statusBadge = '';
    if (log.is_revoked) {
      statusBadge = `
        <div class="space-y-1">
          <span class="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-500 border border-slate-300">交付取消</span>
          <p class="text-[0.65rem] text-rose-600 max-w-xs truncate" title="${escapeHtml(log.revoke_reason)}">
            理由: ${escapeHtml(log.revoke_reason)}
          </p>
        </div>
      `;
    } else if (log.status === 'ballot_issued') {
      statusBadge = '<span class="px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">交付済</span>';
    } else {
      statusBadge = '<span class="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-400 border border-slate-200">未交付</span>';
    }

    // 操作ボタン (履歴から選択して操作パネルに表示)
    const selectBtn = `
      <button onclick="selectLogParticipant('${log.id}')"
              class="px-3.5 py-1.5 rounded-lg text-xs bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-800 transition-all font-bold">
        詳細・操作
      </button>
    `;

    tr.innerHTML = `
      <td class="p-3 text-xs text-slate-400 font-mono">${timeStr}</td>
      <td class="p-3 font-mono">${log.reg_number}</td>
      <td class="p-3">${typeBadge}</td>
      <td class="p-3 text-xs">${escapeHtml(log.age_group)}</td>
      <td class="p-3 text-xs">${escapeHtml(log.municipality)}</td>
      <td class="p-3">${statusBadge}</td>
      <td class="p-3 text-right">${selectBtn}</td>
    `;

    tbody.appendChild(tr);
  });
}

// 履歴一覧から選択
window.selectLogParticipant = function(id) {
  const match = state.logs.find(l => l.id === id);
  if (match) {
    // ログからアクティブな状態を再構成
    state.activeRegistration = {
      id: match.id,
      reg_number: match.reg_number,
      is_advance: match.is_advance,
      age_group: match.age_group,
      municipality: match.municipality,
      status: match.status
    };
    renderActivePanel();
    showToast(`受付番号「${match.reg_number}」を選択しました。`, 'info');
    
    // スムーズスクロール
    document.getElementById('action-panel').scrollIntoView({ behavior: 'smooth' });
  }
};
