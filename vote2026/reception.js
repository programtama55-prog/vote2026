import { showToast, escapeHtml } from '@/lib/utils.js';
import { checkPageAccess, renderAuthHeaderWidget, getCurrentUser, ROLES } from '@/lib/auth.js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase.js';

const STORAGE_VOTERS = 'kodomo_senkyo_voters';

// --- State ---
let state = {
  activeRegistration: null,
  voters: []
};

// --- Storage Helpers ---
function loadVoters() {
  try {
    const raw = localStorage.getItem(STORAGE_VOTERS);
    const data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (e) {
    return [];
  }
}

function saveVoters(voters) {
  try {
    localStorage.setItem(STORAGE_VOTERS, JSON.stringify(voters));
    window.dispatchEvent(new Event('storage'));
  } catch (e) {
    console.error('Failed to save voters:', e);
  }
}

function addOrUpdateVoter(voter) {
  const voters = loadVoters();
  if (!voter.timestamp) voter.timestamp = Date.now();

  const idx = voters.findIndex(v => 
    (voter.id && v.id === voter.id) || 
    (voter.reg_number && v.reg_number === voter.reg_number)
  );

  if (idx >= 0) {
    voters[idx] = { ...voters[idx], ...voter };
  } else {
    voters.unshift(voter);
  }

  voters.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  saveVoters(voters);
  state.voters = voters;
  return voters;
}

// --- Initialization ---
async function init() {
  // イベントリスナーを即時設定（フォーム送信によるページリロードを最優先で防止）
  setupEventListeners();
  renderAll();

  let user = await checkPageAccess([ROLES.UNEI, ROLES.ADMIN]);
  if (!user) return;

  renderAuthHeaderWidget('header-user-widget');

  updateModeBadge();
  renderAll();

  window.addEventListener('storage', renderAll);
  window.addEventListener('focus', renderAll);

  // Background Supabase Sync
  syncFromSupabase();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function updateModeBadge() {
  const modeBadge = document.getElementById('mode-badge');
  if (!modeBadge) return;
  modeBadge.href = './login.html';
  modeBadge.title = 'スタッフポータルを開く';
}

function setupEventListeners() {
  // 1. 参加者受付フォーム
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const ageGroup = document.getElementById('register-age-group').value;
      const municipality = document.getElementById('register-municipality').value.trim();

      if (!ageGroup || !municipality) {
        showToast('年齢区分と市町村を入力してください。', 'info');
        return;
      }
      registerParticipant(ageGroup, municipality);
    });
  }

  // 2. 履歴更新ボタン
  const btnRefreshLogs = document.getElementById('btn-refresh-logs');
  if (btnRefreshLogs) {
    btnRefreshLogs.addEventListener('click', (e) => {
      e.preventDefault();
      renderAll();
      syncFromSupabase();
      showToast('最新データに更新しました。', 'info');
    });
  }
}

// --- Main Render Function ---
function renderAll() {
  state.voters = loadVoters();
  renderStats();
  renderLogs();
}

function renderStats() {
  const total = state.voters.length;
  const issued = state.voters.filter(v => v.status === 'ballot_issued').length;

  const regEl = document.getElementById('stat-participant-registered') || document.getElementById('stat-sameday-registered');
  if (regEl) regEl.innerText = `${total}人`;
  const issueEl = document.getElementById('stat-ballots-issued');
  if (issueEl) issueEl.innerText = `${issued}人`;
}

// --- Actions ---

// 1. 参加者登録
function registerParticipant(ageGroup, municipality) {
  const regNumber = `REG-${Math.floor(1000 + Math.random() * 9000)}`;
  const nowTs = Date.now();
  const nowIso = new Date(nowTs).toISOString();

  const newVoter = {
    id: `voter_${nowTs}_${Math.random().toString(36).substring(2, 6)}`,
    reg_number: regNumber,
    age_group: ageGroup,
    municipality: municipality,
    status: 'ballot_issued',
    is_revoked: false,
    revoke_reason: null,
    created_at: nowIso,
    issued_at: nowIso,
    timestamp: nowTs
  };

  addOrUpdateVoter(newVoter);

  const form = document.getElementById('register-form');
  if (form) form.reset();

  renderAll();

  showToast(`参加者「${regNumber}」の受付登録が完了しました！`, 'success');

  // Sync to Supabase in background
  if (isSupabaseConfigured()) {
    supabase.from('registrations').insert({
      reg_number: regNumber,
      is_advance: false,
      age_group: ageGroup,
      municipality: municipality,
      status: 'ballot_issued'
    }).select().then(({ data }) => {
      if (data && data[0]) {
        supabase.from('ballot_issues').insert({
          registration_id: data[0].id,
          issued_at: nowIso,
          staff_id: 'staff-default',
          is_revoked: false
        }).then(() => {}).catch(() => {});
      }
    }).catch(() => {});
  }
}

// --- Reception Logs Table UI Render ---
function renderLogs() {
  const tbody = document.getElementById('logs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (state.voters.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center text-slate-400 text-xs">
          受付された履歴はありません。
        </td>
      </tr>
    `;
    return;
  }

  state.voters.forEach(log => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-indigo-50/50 transition-colors border-b border-slate-100';

    let timeStr = '-';
    if (log.created_at || log.issued_at) {
      try {
        const val = log.issued_at || log.created_at;
        const norm = String(val).replace(' ', 'T');
        timeStr = new Date(norm).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (timeStr === 'Invalid Date') timeStr = '-';
      } catch (e) {
        timeStr = '-';
      }
    }

    const statusBadge = '<span class="px-2.5 py-1 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">受付済</span>';

    tr.innerHTML = `
      <td class="p-3 text-xs text-slate-400 font-mono">${timeStr}</td>
      <td class="p-3 font-mono">${escapeHtml(log.reg_number || '')}</td>
      <td class="p-3 text-xs">${escapeHtml(log.age_group || '')}</td>
      <td class="p-3 text-xs">${escapeHtml(log.municipality || '')}</td>
      <td class="p-3">${statusBadge}</td>
    `;

    tbody.appendChild(tr);
  });
}


// --- Silent Background Supabase Sync ---
async function syncFromSupabase() {
  if (!isSupabaseConfigured()) return;
  try {
    const { data, error } = await supabase
      .from('registrations')
      .select('id, reg_number, is_advance, age_group, municipality, status, created_at, ballot_issues(issued_at, is_revoked, revoke_reason)')
      .order('id', { ascending: false })
      .limit(50);

    if (!error && data && data.length > 0) {
      const currentVoters = loadVoters();
      let hasNewData = false;

      data.forEach(remote => {
        const issues = remote.ballot_issues || [];
        const latestIssue = issues.length > 0 ? issues[issues.length - 1] : null;

        const match = currentVoters.find(v => 
          (v.id && v.id === remote.id) || (v.reg_number && v.reg_number === remote.reg_number)
        );

        if (!match) {
          currentVoters.push({
            id: remote.id,
            reg_number: remote.reg_number,
            age_group: remote.age_group,
            municipality: remote.municipality,
            status: remote.status,
            is_revoked: latestIssue ? latestIssue.is_revoked : false,
            revoke_reason: latestIssue ? latestIssue.revoke_reason : null,
            created_at: remote.created_at || new Date().toISOString(),
            issued_at: latestIssue ? latestIssue.issued_at : null,
            timestamp: Date.now() - 10000000
          });
          hasNewData = true;
        }
      });

      if (hasNewData) {
        saveVoters(currentVoters);
        renderAll();
      }
    }
  } catch (e) {
    console.warn('syncFromSupabase catch:', e);
  }
}
