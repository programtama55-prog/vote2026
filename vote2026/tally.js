import { supabase } from '@/lib/supabase.js';
import { showToast, escapeHtml, isUuid } from '@/lib/utils.js';
import { checkPageAccess, renderAuthHeaderWidget, ROLES } from '@/lib/auth.js';

// --- LocalStorage Keys ---
const STORAGE_PREFIX = 'kodomo_senkyo_';
const STORAGE_VOTE_INPUTS = STORAGE_PREFIX + 'vote_inputs';
const STORAGE_RESULTS = STORAGE_PREFIX + 'results';
const STORAGE_ELECTIONS = STORAGE_PREFIX + 'elections';

// --- アプリケーションの状態管理 (State) ---
let state = {
  elections: [],
  selectedElectionId: '',
  candidates: [],
  currentTab: 'staff1', // 'staff1' | 'staff2' | 'compare' | 'report'
  staff1Data: { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0, saved: false },
  staff2Data: { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0, saved: false },
  isMockData: false,
  electionStatus: 'active'
};

// --- 初期モックデータ ---
const MOCK_ELECTIONS = [
  { id: 'ele-1', title: '第1回 {こども選挙|こどもせんきょ}', status: 'active', event_date: '2026-08-08' },
  { id: 'ele-2', title: '第2回 {未来の街|みらいのまち}づくり選挙', status: 'active', event_date: '2026-09-15' }
];

const MOCK_CANDIDATES = [
  { id: 'cand-a', election_id: 'ele-1', name: '{青空|あおぞら} {健太|けんた}', party: 'おひさま{党|とう}' },
  { id: 'cand-b', election_id: 'ele-1', name: '{緑川|みどりかわ} さくら', party: 'みらいの{風党|かぜとう}' },
  { id: 'cand-c', election_id: 'ele-1', name: '{未来|みらい} まなぶ', party: 'わくわくクラブ' }
];

// 初期モック入力データ
const INITIAL_MOCK_INPUTS = [
  { election_id: 'ele-1', input_session: 'staff_1', candidate_id: 'cand-a', vote_count: 50, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_1', candidate_id: 'cand-b', vote_count: 32, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_1', candidate_id: 'cand-c', vote_count: 18, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_1', candidate_id: null, vote_count: 105, blank_votes: 3, invalid_votes: 2 },

  { election_id: 'ele-1', input_session: 'staff_2', candidate_id: 'cand-a', vote_count: 50, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_2', candidate_id: 'cand-b', vote_count: 32, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_2', candidate_id: 'cand-c', vote_count: 18, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_2', candidate_id: null, vote_count: 105, blank_votes: 3, invalid_votes: 2 }
];

let mockVoteInputs = getLocalData(STORAGE_VOTE_INPUTS, INITIAL_MOCK_INPUTS);

// --- ヘルパー: LocalStorage入出力 ---
function getLocalData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function setLocalData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('LocalStorage保存失敗:', e);
  }
}

// --- 初期化処理 ---
async function init() {
  const user = await checkPageAccess([ROLES.KAIHYO, ROLES.ADMIN]);
  if (!user) return;

  renderAuthHeaderWidget('header-user-widget');

  updateConnectionStatusUI();
  initEventListeners();
  await loadElections();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Supabase接続状況のUI表示
function updateConnectionStatusUI() {
  const modeBadge = document.getElementById('mode-badge');
  if (modeBadge) {
    modeBadge.href = './login.html';
    modeBadge.title = 'スタッフポータルを開く';
  }
}

// イベントリスナーの登録
function initEventListeners() {
  const tabStaff1 = document.getElementById('tab-staff1');
  const tabStaff2 = document.getElementById('tab-staff2');
  const tabCompare = document.getElementById('tab-compare');
  const tabReport = document.getElementById('tab-report');

  tabStaff1.addEventListener('click', () => switchTab('staff1'));
  tabStaff2.addEventListener('click', () => switchTab('staff2'));
  tabCompare.addEventListener('click', () => switchTab('compare'));
  tabReport.addEventListener('click', () => switchTab('report'));

  // 選挙切替
  const select = document.getElementById('election-select');
  select.addEventListener('change', async (e) => {
    state.selectedElectionId = e.target.value;
    if (state.selectedElectionId) {
      await loadElectionData(state.selectedElectionId);
    } else {
      clearUI();
    }
  });

  // 開票入力保存フォーム
  const form = document.getElementById('tally-input-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.selectedElectionId) return;
    await saveCurrentSessionData();
  });

  // フォーム入力変更時のリアルタイム整合性計算
  form.addEventListener('input', () => {
    updateLiveVerifBar();
  });

  // クイック加算ボタン（Delegation）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-btn');
    if (!btn) return;

    const parentContainer = btn.closest('[data-target]');
    if (!parentContainer) return;

    const targetId = parentContainer.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (!input) return;

    let currentVal = parseInt(input.value) || 0;
    if (btn.dataset.delta) {
      const delta = parseInt(btn.dataset.delta);
      currentVal = Math.max(0, currentVal + delta);
    } else if (btn.dataset.set !== undefined) {
      currentVal = parseInt(btn.dataset.set) || 0;
    }

    input.value = currentVal;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // 確定ボタン (K05)
  const btnFinalize = document.getElementById('btn-finalize-tally');
  btnFinalize.addEventListener('click', async () => {
    if (!state.selectedElectionId) return;
    await finalizeTally();
  });

  // 監査レポートボタン
  const btnOpenReport = document.getElementById('btn-open-report');
  if (btnOpenReport) {
    btnOpenReport.addEventListener('click', () => switchTab('report'));
  }

  const btnPrintReport = document.getElementById('btn-print-report');
  if (btnPrintReport) {
    btnPrintReport.addEventListener('click', () => window.print());
  }

  const btnExportJson = document.getElementById('btn-export-json');
  if (btnExportJson) {
    btnExportJson.addEventListener('click', () => exportTallyJson());
  }

  // データ初期化ボタン
  const btnReset = document.getElementById('btn-reset-tally');
  btnReset.addEventListener('click', () => {
    if (confirm('開票入力データを初期化しますか？')) {
      mockVoteInputs = mockVoteInputs.filter(vi => vi.election_id !== state.selectedElectionId);
      setLocalData(STORAGE_VOTE_INPUTS, mockVoteInputs);

      // ステータスもリセット
      const savedElections = getLocalData(STORAGE_ELECTIONS, MOCK_ELECTIONS);
      const idx = savedElections.findIndex(e => e.id === state.selectedElectionId);
      if (idx !== -1) {
        savedElections[idx].status = 'active';
        setLocalData(STORAGE_ELECTIONS, savedElections);
      }
      state.electionStatus = 'active';

      refreshTallyData();
      showToast('入力を初期化しました。', 'info');
    }
  });
}

// タブ切り替え制御
function switchTab(tabName) {
  state.currentTab = tabName;

  const tabStaff1 = document.getElementById('tab-staff1');
  const tabStaff2 = document.getElementById('tab-staff2');
  const tabCompare = document.getElementById('tab-compare');
  const tabReport = document.getElementById('tab-report');

  const secInput = document.getElementById('section-input');
  const secCompare = document.getElementById('section-compare');
  const secReport = document.getElementById('section-report');

  const activeClass = 'bg-white text-slate-900 shadow-sm border border-slate-200';
  const inactiveClass = 'text-slate-600 hover:text-slate-900';

  [tabStaff1, tabStaff2, tabCompare, tabReport].forEach(t => {
    if (t) t.className = t.className.replace(activeClass, '').trim() + ' ' + inactiveClass;
  });

  const activeTabBtn = tabName === 'staff1' ? tabStaff1 : tabName === 'staff2' ? tabStaff2 : tabName === 'compare' ? tabCompare : tabReport;
  if (activeTabBtn) {
    activeTabBtn.className = activeTabBtn.className.replace(inactiveClass, '').trim() + ' ' + activeClass;
  }

  secInput.classList.add('hidden');
  secCompare.classList.add('hidden');
  secReport.classList.add('hidden');

  if (tabName === 'compare') {
    secCompare.classList.remove('hidden');
    renderCompareScreen();
  } else if (tabName === 'report') {
    secReport.classList.remove('hidden');
    renderReportScreen();
  } else {
    secInput.classList.remove('hidden');

    const badge = document.getElementById('session-badge');
    const title = document.getElementById('session-title');

    if (tabName === 'staff1') {
      badge.className = 'w-3 h-3 rounded-full bg-sky-500 shadow-sm';
      title.innerText = '担当者1 開票結果入力フォーム';
    } else {
      badge.className = 'w-3 h-3 rounded-full bg-amber-500 shadow-sm';
      title.innerText = '担当者2 開票結果入力フォーム';
    }

    fillInputFormValues();
    updateLiveVerifBar();
  }
}

// 選挙マスターロード
async function loadElections() {
  try {
    const { data, error } = await supabase
      .from('elections')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;
    state.elections = data || [];
    renderElectionSelect();
  } catch (err) {
    console.error('選挙データの取得に失敗しました:', err);
    state.elections = MOCK_ELECTIONS;
    renderElectionSelect();
  }
}

function renderElectionSelect() {
  const select = document.getElementById('election-select');
  select.innerHTML = '<option value="">-- 選挙を選択してください --</option>';

  state.elections.forEach(ele => {
    const opt = document.createElement('option');
    opt.value = ele.id;
    const cleanTitle = ele.title.replace(/\{([^|]+)\|[^}]+\}/g, '$1');
    opt.textContent = `${cleanTitle} (${ele.status === 'tally_verified' ? '確定済み' : '進行中'})`;
    select.appendChild(opt);
  });

  if (state.elections.length > 0) {
    select.value = state.elections[0].id;
    select.dispatchEvent(new Event('change'));
  }
}

// 選挙詳細ロード
async function loadElectionData(electionId) {
  const loader = document.getElementById('input-loader');
  const form = document.getElementById('tally-input-form');
  loader.classList.remove('hidden');
  form.classList.add('hidden');

  const selectedEle = state.elections.find(e => e.id === electionId);
  state.electionStatus = selectedEle ? selectedEle.status : 'active';

  if (!isUuid(electionId)) {
    state.candidates = MOCK_CANDIDATES.filter(c => c.election_id === electionId);
    loader.classList.add('hidden');
    form.classList.remove('hidden');
    await refreshTallyData();
    return;
  }

  try {
    const { data: candidates, error: candErr } = await supabase
      .from('candidates')
      .select('id, name, party')
      .eq('election_id', electionId);

    if (candErr) throw candErr;
    state.candidates = (candidates && candidates.length > 0) ? candidates : MOCK_CANDIDATES.filter(c => c.election_id === electionId);

    loader.classList.add('hidden');
    form.classList.remove('hidden');

    await refreshTallyData();
  } catch (err) {
    console.error('開票データの取得エラー:', err);
    state.candidates = MOCK_CANDIDATES.filter(c => c.election_id === electionId);
    loader.classList.add('hidden');
    form.classList.remove('hidden');
    await refreshTallyData();
  }
}

// 開票結果データ再ロード
async function refreshTallyData() {
  state.staff1Data = { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0, saved: false };
  state.staff2Data = { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0, saved: false };

  state.candidates.forEach(cand => {
    state.staff1Data.candidates[cand.id] = 0;
    state.staff2Data.candidates[cand.id] = 0;
  });

  try {
    const { data: inputs, error } = await supabase
      .from('vote_inputs')
      .select('*')
      .eq('election_id', state.selectedElectionId);

    if (error) throw error;

    parseVoteInputs(inputs || []);
    updateStatusBanner();
    updateSessionBadges();
    buildCandidatesInputs();
    fillInputFormValues();
    updateLiveVerifBar();
  } catch (err) {
    console.error('集計データの取得エラー:', err);
  }
}

// 取得レコードをStaff構造体にパース
function parseVoteInputs(inputs) {
  let hasStaff1 = false;
  let hasStaff2 = false;

  inputs.forEach(row => {
    const isStaff1 = row.input_session === 'staff_1';
    const target = isStaff1 ? state.staff1Data : state.staff2Data;

    if (isStaff1) hasStaff1 = true;
    else hasStaff2 = true;

    if (row.candidate_id) {
      target.candidates[row.candidate_id] = row.vote_count || 0;
    } else {
      target.total_box_votes = row.vote_count || 0;
      target.blank_votes = row.blank_votes || 0;
      target.invalid_votes = row.invalid_votes || 0;
    }
  });

  state.staff1Data.saved = hasStaff1;
  state.staff2Data.saved = hasStaff2;
}

// バッジ更新
function updateSessionBadges() {
  const b1 = document.getElementById('status-staff1-badge');
  const b2 = document.getElementById('status-staff2-badge');

  if (state.staff1Data.saved) {
    b1.className = 'px-3 py-2 rounded-xl bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1.5 font-black';
    b1.innerHTML = '<span class="w-2 h-2 rounded-full bg-sky-500"></span><span>担当者1: 保存済み ✓</span>';
  } else {
    b1.className = 'px-3 py-2 rounded-xl bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1.5';
    b1.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span><span>担当者1: 未入力</span>';
  }

  if (state.staff2Data.saved) {
    b2.className = 'px-3 py-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5 font-black';
    b2.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span><span>担当者2: 保存済み ✓</span>';
  } else {
    b2.className = 'px-3 py-2 rounded-xl bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1.5';
    b2.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span><span>担当者2: 未入力</span>';
  }
}

// ステータスバナー更新
function updateStatusBanner() {
  const banner = document.getElementById('tally-status-banner');
  const text = document.getElementById('tally-status-text');
  const btnReset = document.getElementById('btn-reset-tally');

  banner.classList.remove('hidden');

  if (state.electionStatus === 'tally_verified') {
    text.innerHTML = '現在の状況: <span class="text-emerald-600 font-black">【開票結果 確定・照合完了】</span>';
    btnReset.classList.remove('hidden');
  } else {
    text.innerHTML = '現在の状況: <span class="text-amber-600 font-black">【開票結果 二重入力・照合中】</span>';
    btnReset.classList.add('hidden');
  }
}

// 候補者入力フィールドの動的構築
function buildCandidatesInputs() {
  const container = document.getElementById('candidates-input-grid');
  container.innerHTML = '';

  state.candidates.forEach(cand => {
    const div = document.createElement('div');
    div.className = 'bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3';

    const cleanName = cand.name.replace(/\{([^|]+)\|[^}]+\}/g, '$1');
    const cleanParty = cand.party.replace(/\{([^|]+)\|[^}]+\}/g, '$1');

    div.innerHTML = `
      <div class="flex justify-between items-center text-xs font-bold text-slate-500">
        <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-black">${escapeHtml(cleanParty)}</span>
        <span class="text-slate-400">候補者ID: ${cand.id.substring(0, 6)}</span>
      </div>
      <label for="input-cand-${cand.id}" class="text-base font-black text-slate-900 block truncate">
        ${escapeHtml(cleanName)}
      </label>
      <div class="flex items-center gap-2">
        <input type="number" id="input-cand-${cand.id}" required min="0" placeholder="0"
               class="w-full px-4 py-3 border border-slate-300 rounded-xl font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 tablet-input text-left">
        
        <!-- Quick increment buttons per candidate -->
        <div class="flex items-center gap-1 shrink-0" data-target="input-cand-${cand.id}">
          <button type="button" class="quick-btn px-2.5 py-2 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 border border-slate-300 text-slate-700 font-extrabold text-xs rounded-lg shadow-2xs" data-delta="1">+1</button>
          <button type="button" class="quick-btn px-2.5 py-2 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 border border-slate-300 text-slate-700 font-extrabold text-xs rounded-lg shadow-2xs" data-delta="5">+5</button>
          <button type="button" class="quick-btn px-2.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-rose-600 font-extrabold text-xs rounded-lg shadow-2xs" data-delta="-1">-1</button>
        </div>
      </div>
    `;

    container.appendChild(div);
  });
}

// フォーム値の流し込み
function fillInputFormValues() {
  const data = state.currentTab === 'staff1' ? state.staff1Data : state.staff2Data;

  const totalInput = document.getElementById('input-total-box-votes');
  const blankInput = document.getElementById('input-blank-votes');
  const invalidInput = document.getElementById('input-invalid-votes');

  if (totalInput) totalInput.value = data.total_box_votes || '';
  if (blankInput) blankInput.value = data.blank_votes || '';
  if (invalidInput) invalidInput.value = data.invalid_votes || '';

  state.candidates.forEach(cand => {
    const candInput = document.getElementById(`input-cand-${cand.id}`);
    if (candInput) {
      candInput.value = data.candidates[cand.id] || '';
    }
  });

  const btnText = document.getElementById('btn-save-text');
  btnText.innerText = `${state.currentTab === 'staff1' ? '担当者1' : '担当者2'} のデータとして保存する`;
}

// フォーム内のリアルタイム計算バー
function updateLiveVerifBar() {
  const boxVotes = parseInt(document.getElementById('input-total-box-votes')?.value) || 0;
  const blankVotes = parseInt(document.getElementById('input-blank-votes')?.value) || 0;
  const invalidVotes = parseInt(document.getElementById('input-invalid-votes')?.value) || 0;

  let candSum = 0;
  state.candidates.forEach(cand => {
    const input = document.getElementById(`input-cand-${cand.id}`);
    if (input) candSum += parseInt(input.value) || 0;
  });

  const totalSum = candSum + blankVotes + invalidVotes;
  const diff = boxVotes - totalSum;

  const sumEl = document.getElementById('live-sum-val');
  const boxEl = document.getElementById('live-box-val');
  const badgeEl = document.getElementById('live-diff-badge');

  if (sumEl) sumEl.innerText = totalSum;
  if (boxEl) boxEl.innerText = boxVotes;

  if (badgeEl) {
    if (diff === 0 && boxVotes > 0) {
      badgeEl.className = 'px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black';
      badgeEl.innerText = '一致 (内訳整合 ✓)';
    } else if (diff === 0) {
      badgeEl.className = 'px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-black';
      badgeEl.innerText = '入力中 (0)';
    } else {
      badgeEl.className = 'px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-black';
      badgeEl.innerText = `差分あり (${diff > 0 ? '+' : ''}${diff}票)`;
    }
  }
}

// フォームデータ保存
async function saveCurrentSessionData() {
  const session = state.currentTab === 'staff1' ? 'staff_1' : 'staff_2';

  const totalBoxVotes = parseInt(document.getElementById('input-total-box-votes').value) || 0;
  const blankVotes = parseInt(document.getElementById('input-blank-votes').value) || 0;
  const invalidVotes = parseInt(document.getElementById('input-invalid-votes').value) || 0;

  const candidatesVotes = {};
  state.candidates.forEach(cand => {
    candidatesVotes[cand.id] = parseInt(document.getElementById(`input-cand-${cand.id}`).value) || 0;
  });

  const rows = [];
  state.candidates.forEach(cand => {
    rows.push({
      election_id: state.selectedElectionId,
      input_session: session,
      candidate_id: cand.id,
      vote_count: candidatesVotes[cand.id],
      blank_votes: null,
      invalid_votes: null,
      staff_id: session
    });
  });

  rows.push({
    election_id: state.selectedElectionId,
    input_session: session,
    candidate_id: null,
    vote_count: totalBoxVotes,
    blank_votes: blankVotes,
    invalid_votes: invalidVotes,
    staff_id: session
  });

  try {
    const { error: delErr } = await supabase
      .from('vote_inputs')
      .delete()
      .eq('election_id', state.selectedElectionId)
      .eq('input_session', session);

    if (delErr) throw delErr;

    const { error: insErr } = await supabase
      .from('vote_inputs')
      .insert(rows);

    if (insErr) throw insErr;

    showToast(`${session === 'staff_1' ? '担当者1' : '担当者2'} のデータを保存しました。`, 'success');
    await refreshTallyData();
  } catch (err) {
    console.error('開票データの保存に失敗しました:', err);
    showToast('データの保存に失敗しました。', 'error');
  }
}

// --- 照合画面のレンダリング (K04 & K05) ---
function renderCompareScreen() {
  const tbody = document.getElementById('compare-tbody');
  tbody.innerHTML = '';

  let hasMismatch = false;

  // カードステータス
  const staff1Card = document.getElementById('card-staff1-status');
  const staff2Card = document.getElementById('card-staff2-status');
  const integrityCard = document.getElementById('card-integrity-status');

  if (staff1Card) staff1Card.innerText = state.staff1Data.saved ? '入力完了 ✓' : '未保存 ⏳';
  if (staff2Card) staff2Card.innerText = state.staff2Data.saved ? '入力完了 ✓' : '未保存 ⏳';

  // 1. 総投票数
  const totalRow = createCompareRow(
    '【箱内総数】総投票用紙数',
    state.staff1Data.total_box_votes,
    state.staff2Data.total_box_votes
  );
  if (state.staff1Data.total_box_votes !== state.staff2Data.total_box_votes) hasMismatch = true;
  tbody.appendChild(totalRow);

  // 2. 候補者別
  state.candidates.forEach(cand => {
    const cleanName = cand.name.replace(/\{([^|]+)\|[^}]+\}/g, '$1');
    const v1 = state.staff1Data.candidates[cand.id] || 0;
    const v2 = state.staff2Data.candidates[cand.id] || 0;

    const row = createCompareRow(cleanName, v1, v2);
    if (v1 !== v2) hasMismatch = true;
    tbody.appendChild(row);
  });

  // 3. 白票・無効票
  const blankRow = createCompareRow('白票数 (Blank)', state.staff1Data.blank_votes, state.staff2Data.blank_votes);
  if (state.staff1Data.blank_votes !== state.staff2Data.blank_votes) hasMismatch = true;
  tbody.appendChild(blankRow);

  const invalidRow = createCompareRow('無効票数 (Invalid)', state.staff1Data.invalid_votes, state.staff2Data.invalid_votes);
  if (state.staff1Data.invalid_votes !== state.staff2Data.invalid_votes) hasMismatch = true;
  tbody.appendChild(invalidRow);

  // 警告バナー制御
  const mismatchWarning = document.getElementById('mismatch-warning');
  if (mismatchWarning) {
    if (hasMismatch && (state.staff1Data.saved || state.staff2Data.saved)) {
      mismatchWarning.classList.remove('hidden');
    } else {
      mismatchWarning.classList.add('hidden');
    }
  }

  // 数学的整合性チェック (K05)
  const sum1 = calculateSum(state.staff1Data);
  const sum2 = calculateSum(state.staff2Data);

  const intError1 = state.staff1Data.total_box_votes !== sum1;
  const intError2 = state.staff2Data.total_box_votes !== sum2;

  const integrityWarning = document.getElementById('integrity-warning');
  const valBox = document.getElementById('val-box-total');
  const valSum = document.getElementById('val-sum-total');
  const valDiff = document.getElementById('val-diff-total');

  if (intError1 || intError2) {
    if (integrityWarning) integrityWarning.classList.remove('hidden');
    if (valBox) valBox.innerText = state.staff1Data.total_box_votes;
    if (valSum) valSum.innerText = sum1;
    if (valDiff) valDiff.innerText = Math.abs(state.staff1Data.total_box_votes - sum1);
    if (integrityCard) integrityCard.innerText = '内訳不一致 ❌';
  } else {
    if (integrityWarning) integrityWarning.classList.add('hidden');
    if (integrityCard) integrityCard.innerText = '数式整合クリア ✓';
  }

  // 得票率プレビューバー
  renderShareBars(sum1);

  // バッジとボタンの活性化判定
  const badge = document.getElementById('compare-status-badge');
  const btnFinalize = document.getElementById('btn-finalize-tally');

  const isBothSaved = state.staff1Data.saved && state.staff2Data.saved;
  const isInputsEmpty = state.staff1Data.total_box_votes === 0 && state.staff2Data.total_box_votes === 0;

  if (!isBothSaved || isInputsEmpty) {
    if (badge) {
      badge.innerText = '入力待ち';
      badge.className = 'px-3 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-500 border border-slate-300';
    }
    if (btnFinalize) btnFinalize.disabled = true;
  } else if (hasMismatch) {
    if (badge) {
      badge.innerText = '入力不一致 (K04)';
      badge.className = 'px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200';
    }
    if (btnFinalize) btnFinalize.disabled = true;
  } else if (intError1 || intError2) {
    if (badge) {
      badge.innerText = '数式整合エラー (K05)';
      badge.className = 'px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200';
    }
    if (btnFinalize) btnFinalize.disabled = true;
  } else {
    if (badge) {
      badge.innerText = '完全一致・整合クリア ✓';
      badge.className = 'px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200';
    }

    if (state.electionStatus === 'tally_verified') {
      if (btnFinalize) {
        btnFinalize.disabled = true;
        btnFinalize.innerHTML = '<i class="fa-solid fa-circle-check"></i> 照合完了・確定済み';
      }
    } else {
      if (btnFinalize) {
        btnFinalize.disabled = false;
        btnFinalize.innerHTML = '<i class="fa-solid fa-circle-check"></i> 照合完了・確定待ちにする';
      }
    }
  }
}

// 照合用1行作成
function createCompareRow(itemName, val1, val2) {
  const tr = document.createElement('tr');
  const isMatch = val1 === val2;

  tr.className = isMatch
    ? 'hover:bg-slate-50 transition-colors border-b border-slate-200'
    : 'bg-rose-50/80 border-b border-rose-200';

  const diff = val1 - val2;
  const diffStr = isMatch
    ? '<span class="text-emerald-700 font-extrabold flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> 一致</span>'
    : `<span class="text-rose-700 font-black flex items-center gap-1"><i class="fa-solid fa-circle-exclamation"></i> 不一致 (${diff > 0 ? '+' : ''}${diff})</span>`;

  tr.innerHTML = `
    <td class="p-3.5 border-r border-slate-200 font-bold">${escapeHtml(itemName)}</td>
    <td class="p-3.5 border-r border-slate-200 bg-sky-50/30 text-slate-900 font-black text-base">${val1}票</td>
    <td class="p-3.5 border-r border-slate-200 bg-amber-50/30 text-slate-900 font-black text-base">${val2}票</td>
    <td class="p-3.5 text-xs">${diffStr}</td>
  `;

  return tr;
}

// 概算得票率バー描画
function renderShareBars(totalVotes) {
  const container = document.getElementById('compare-share-container');
  const list = document.getElementById('compare-share-bars');

  if (!container || !list) return;
  if (totalVotes <= 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  list.innerHTML = '';

  const validVotes = totalVotes - (state.staff1Data.blank_votes + state.staff1Data.invalid_votes);

  state.candidates.forEach(cand => {
    const votes = state.staff1Data.candidates[cand.id] || 0;
    const share = validVotes > 0 ? Math.round((votes / validVotes) * 1000) / 10 : 0;
    const cleanName = cand.name.replace(/\{([^|]+)\|[^}]+\}/g, '$1');

    const div = document.createElement('div');
    div.className = 'space-y-1';
    div.innerHTML = `
      <div class="flex justify-between text-xs font-bold text-slate-700">
        <span>${escapeHtml(cleanName)}</span>
        <span>${votes}票 (${share}%)</span>
      </div>
      <div class="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
        <div class="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style="width: ${share}%"></div>
      </div>
    `;
    list.appendChild(div);
  });
}

function calculateSum(data) {
  let sum = (data.blank_votes || 0) + (data.invalid_votes || 0);
  Object.values(data.candidates || {}).forEach(c => { sum += (c || 0); });
  return sum;
}

// --- K05: 開票結果確定処理 ---
async function finalizeTally() {
  const validTotal = calculateSum(state.staff1Data) - (state.staff1Data.blank_votes + state.staff1Data.invalid_votes);

  // 確定結果レコード群作成 (`election_results`)
  const resultRows = state.candidates.map(cand => {
    const votes = state.staff1Data.candidates[cand.id] || 0;
    const share = validTotal > 0 ? Math.round((votes / validTotal) * 1000) / 10 : 0;
    return {
      election_id: state.selectedElectionId,
      candidate_id: cand.id,
      vote_count: votes,
      vote_share: share,
      confirmed_at: new Date().toISOString(),
      is_published: false
    };
  });

  try {
    // 1. 既存の確定結果をクリアして挿入
    const { error: delErr } = await supabase
      .from('election_results')
      .delete()
      .eq('election_id', state.selectedElectionId);

    if (delErr) console.warn('既存の結果削除警告:', delErr);

    const { error: resErr } = await supabase
      .from('election_results')
      .insert(resultRows);

    if (resErr) throw resErr;

    // 2. 選挙ステータス更新
    const { error: eleErr } = await supabase
      .from('elections')
      .update({ status: 'tally_verified' })
      .eq('id', state.selectedElectionId);

    if (eleErr) throw eleErr;

    state.electionStatus = 'tally_verified';
    showToast('照合を完了し、開票結果を確定登録しました！ (K05)', 'success');
    updateStatusBanner();
    renderCompareScreen();
    switchTab('report');
  } catch (err) {
    console.error('確定処理エラー:', err);
    showToast('確定処理に失敗しました。', 'error');
  }
}

// --- 監査レポート画面レンダリング ---
function renderReportScreen() {
  const titleEl = document.getElementById('report-election-title');
  const timeEl = document.getElementById('report-timestamp');
  const totalBoxEl = document.getElementById('report-total-box');
  const validTotalEl = document.getElementById('report-valid-total');
  const blankTotalEl = document.getElementById('report-blank-total');
  const invalidTotalEl = document.getElementById('report-invalid-total');
  const tbody = document.getElementById('report-tbody');

  const selectedEle = state.elections.find(e => e.id === state.selectedElectionId);
  const cleanTitle = selectedEle ? selectedEle.title.replace(/\{([^|]+)\|[^}]+\}/g, '$1') : '第1回 こども選挙';

  if (titleEl) titleEl.innerText = cleanTitle;
  if (timeEl) timeEl.innerText = new Date().toLocaleString('ja-JP');

  const boxTotal = state.staff1Data.total_box_votes;
  const blankVotes = state.staff1Data.blank_votes;
  const invalidVotes = state.staff1Data.invalid_votes;

  let candTotal = 0;
  const candList = state.candidates.map(cand => {
    const v = state.staff1Data.candidates[cand.id] || 0;
    candTotal += v;
    return {
      ...cand,
      votes: v,
      cleanName: cand.name.replace(/\{([^|]+)\|[^}]+\}/g, '$1'),
      cleanParty: cand.party.replace(/\{([^|]+)\|[^}]+\}/g, '$1')
    };
  });

  // 得票順にソート
  candList.sort((a, b) => b.votes - a.votes);

  if (totalBoxEl) totalBoxEl.innerText = `${boxTotal}票`;
  if (validTotalEl) validTotalEl.innerText = `${candTotal}票`;
  if (blankTotalEl) blankTotalEl.innerText = `${blankVotes}票`;
  if (invalidTotalEl) invalidTotalEl.innerText = `${invalidVotes}票`;

  if (tbody) {
    tbody.innerHTML = '';
    candList.forEach((c, idx) => {
      const share = candTotal > 0 ? Math.round((c.votes / candTotal) * 1000) / 10 : 0;
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 border-b border-slate-200';
      tr.innerHTML = `
        <td class="p-2.5 border-r border-slate-200 text-center font-black">${idx + 1}位</td>
        <td class="p-2.5 border-r border-slate-200 font-bold">${escapeHtml(c.cleanName)}</td>
        <td class="p-2.5 border-r border-slate-200 text-slate-600">${escapeHtml(c.cleanParty)}</td>
        <td class="p-2.5 border-r border-slate-200 text-right font-mono font-black">${c.votes}票</td>
        <td class="p-2.5 text-right font-mono font-black">${share}%</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// JSONエクスポート
function exportTallyJson() {
  const data = {
    election_id: state.selectedElectionId,
    election_status: state.electionStatus,
    timestamp: new Date().toISOString(),
    staff1_data: state.staff1Data,
    staff2_data: state.staff2Data,
    candidates: state.candidates
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tally_report_${state.selectedElectionId}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// UIクリア
function clearUI() {
  document.getElementById('candidates-input-grid').innerHTML = '';
  document.getElementById('compare-tbody').innerHTML = '';
  document.getElementById('tally-status-banner').classList.add('hidden');
  state.candidates = [];
  state.staff1Data = { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0, saved: false };
  state.staff2Data = { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0, saved: false };
}
