import { supabase } from '@/lib/supabase.js';
import { showToast, escapeHtml } from '@/lib/utils.js';

// --- アプリケーションの状態管理 (State) ---
let state = {
  elections: [],
  selectedElectionId: '',
  candidates: [],
  currentTab: 'staff1', // 'staff1' | 'staff2' | 'compare'
  staff1Data: { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0 },
  staff2Data: { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0 },
  isMockData: false,
  electionStatus: 'active' // 該当選挙のステータス
};

// --- モックデータ (Supabase未接続用) ---
const MOCK_ELECTIONS = [
  { id: 'ele-1', title: '第1回 {こども選挙|こどもせんきょ}', status: 'active' }
];

const MOCK_CANDIDATES = [
  { id: 'cand-a', election_id: 'ele-1', name: '{青空|あおぞら} {健太|けんた}', party: 'おひさま{党|とう}' },
  { id: 'cand-b', election_id: 'ele-1', name: '{緑川|みどりかわ} さくら', party: 'みらいの{風党|かぜとう}' },
  { id: 'cand-c', election_id: 'ele-1', name: '{未来|みらい} まなぶ', party: 'わくわくクラブ' }
];

// メモリ内のモック vote_inputs
let mockVoteInputs = [
  // 担当者1の初期データ
  { election_id: 'ele-1', input_session: 'staff_1', candidate_id: 'cand-a', vote_count: 50, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_1', candidate_id: 'cand-b', vote_count: 32, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_1', candidate_id: 'cand-c', vote_count: 18, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_1', candidate_id: null, vote_count: 105, blank_votes: 3, invalid_votes: 2 }, // 投票用紙総数105, 白票3, 無効2

  // 担当者2の初期データ (あえてbの得票数を間違えた設定にする)
  { election_id: 'ele-1', input_session: 'staff_2', candidate_id: 'cand-a', vote_count: 50, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_2', candidate_id: 'cand-b', vote_count: 30, blank_votes: null, invalid_votes: null }, // 担当者2は30票と入力
  { election_id: 'ele-1', input_session: 'staff_2', candidate_id: 'cand-c', vote_count: 18, blank_votes: null, invalid_votes: null },
  { election_id: 'ele-1', input_session: 'staff_2', candidate_id: null, vote_count: 105, blank_votes: 3, invalid_votes: 2 }
];

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', async () => {
  checkSupabaseConnection();
  initEventListeners();
  await loadElections();
});

// Supabase接続確認
function checkSupabaseConnection() {
  const modeBadge = document.getElementById('mode-badge');
  const isDefaultConfig = window.SUPABASE_URL && window.SUPABASE_URL.includes('your-supabase-project');
  
  if (isDefaultConfig || !supabase) {
    state.isMockData = true;
    modeBadge.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300';
    modeBadge.innerHTML = '<i class="fa-solid fa-circle-nodes mr-1"></i>デモモード (Mock)';
  } else {
    state.isMockData = false;
    modeBadge.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300';
    modeBadge.innerHTML = '<i class="fa-solid fa-server mr-1"></i>データベース接続中';
  }
}

// イベントリスナーのセットアップ
function initEventListeners() {
  const tabStaff1 = document.getElementById('tab-staff1');
  const tabStaff2 = document.getElementById('tab-staff2');
  const tabCompare = document.getElementById('tab-compare');

  tabStaff1.addEventListener('click', () => switchTab('staff1'));
  tabStaff2.addEventListener('click', () => switchTab('staff2'));
  tabCompare.addEventListener('click', () => switchTab('compare'));

  // 選挙変更イベント
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

  // 確定ボタン
  const btnFinalize = document.getElementById('btn-finalize-tally');
  btnFinalize.addEventListener('click', async () => {
    if (!state.selectedElectionId) return;
    await finalizeTally();
  });

  // モック用入力リセットボタン
  const btnReset = document.getElementById('btn-reset-tally');
  btnReset.addEventListener('click', () => {
    if (confirm('開票データを初期化しますか？')) {
      if (state.isMockData) {
        mockVoteInputs = [];
        state.electionStatus = 'active';
      }
      refreshTallyData();
      showToast('入力を初期化しました。', 'info');
    }
  });
}

// タブ切り替え
function switchTab(tabName) {
  state.currentTab = tabName;
  
  const tabStaff1 = document.getElementById('tab-staff1');
  const tabStaff2 = document.getElementById('tab-staff2');
  const tabCompare = document.getElementById('tab-compare');

  const secInput = document.getElementById('section-input');
  const secCompare = document.getElementById('section-compare');

  // タブボタンのアクティブスタイル制御
  const activeClass = 'bg-white text-slate-900 shadow-sm border border-slate-200';
  const inactiveClass = 'text-slate-600 hover:text-slate-900';

  [tabStaff1, tabStaff2, tabCompare].forEach(t => t.className = t.className.replace(activeClass, '').trim() + ' ' + inactiveClass);

  const activeTabBtn = tabName === 'staff1' ? tabStaff1 : tabName === 'staff2' ? tabStaff2 : tabCompare;
  activeTabBtn.className = activeTabBtn.className.replace(inactiveClass, '').trim() + ' ' + activeClass;

  if (tabName === 'compare') {
    secInput.classList.add('hidden');
    secCompare.classList.remove('hidden');
    renderCompareScreen();
  } else {
    secInput.classList.remove('hidden');
    secCompare.classList.add('hidden');
    
    // 入力フォーム切り替え
    const badge = document.getElementById('session-badge');
    const title = document.getElementById('session-title');

    if (tabName === 'staff1') {
      badge.className = 'w-2.5 h-2.5 rounded-full bg-sky-500';
      title.innerText = '担当者1 開票結果入力フォーム';
    } else {
      badge.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
      title.innerText = '担当者2 開票結果入力フォーム';
    }

    fillInputFormValues();
  }
}

// 選挙リストのロード
async function loadElections() {
  try {
    if (state.isMockData) {
      state.elections = MOCK_ELECTIONS;
    } else {
      const { data, error } = await supabase
        .from('elections')
        .select('id, title, status')
        .order('id', { ascending: false });

      if (error) throw error;
      state.elections = data;
    }

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
    opt.textContent = ele.title.replace(/\{([^|]+)\|[^}]+\}/g, '$1');
    select.appendChild(opt);
  });

  if (state.elections.length > 0) {
    select.value = state.elections[0].id;
    select.dispatchEvent(new Event('change'));
  }
}

// 該当選挙の全詳細情報ロード
async function loadElectionData(electionId) {
  const loader = document.getElementById('input-loader');
  const form = document.getElementById('tally-input-form');
  loader.classList.remove('hidden');
  form.classList.add('hidden');

  // 選挙ステータスの保持
  const selectedEle = state.elections.find(e => e.id === electionId);
  state.electionStatus = selectedEle ? selectedEle.status : 'active';

  if (state.isMockData) {
    state.candidates = MOCK_CANDIDATES.filter(c => c.election_id === electionId);
    setTimeout(() => {
      loader.classList.add('hidden');
      form.classList.remove('hidden');
      refreshTallyData();
    }, 350);
    return;
  }

  try {
    // 候補者取得
    const { data: candidates, error: candErr } = await supabase
      .from('candidates')
      .select('id, name, party')
      .eq('election_id', electionId)
      .eq('status', 'approved');

    if (candErr) throw candErr;
    state.candidates = candidates;

    loader.classList.add('hidden');
    form.classList.remove('hidden');
    
    await refreshTallyData();
  } catch (err) {
    console.error('開票データの取得エラー:', err);
    showToast('データの取得に失敗しました。', 'error');
    loader.classList.add('hidden');
  }
}

// 開票結果のDB再ロードとデータ変換
async function refreshTallyData() {
  // 初期化
  state.staff1Data = { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0 };
  state.staff2Data = { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0 };

  state.candidates.forEach(cand => {
    state.staff1Data.candidates[cand.id] = 0;
    state.staff2Data.candidates[cand.id] = 0;
  });

  if (state.isMockData) {
    parseVoteInputs(mockVoteInputs.filter(vi => vi.election_id === state.selectedElectionId));
    updateStatusBanner();
    buildCandidatesInputs();
    fillInputFormValues();
    return;
  }

  try {
    const { data: inputs, error } = await supabase
      .from('vote_inputs')
      .select('*')
      .eq('election_id', state.selectedElectionId);

    if (error) throw error;

    parseVoteInputs(inputs);
    updateStatusBanner();
    buildCandidatesInputs();
    fillInputFormValues();
  } catch (err) {
    console.error('集計データの取得エラー:', err);
  }
}

// 取得したレコード群をSessionごとの構造体にパース
function parseVoteInputs(inputs) {
  inputs.forEach(row => {
    const target = row.input_session === 'staff_1' ? state.staff1Data : state.staff2Data;
    
    if (row.candidate_id) {
      // 候補者ごとの得票数
      target.candidates[row.candidate_id] = row.vote_count || 0;
    } else {
      // 総投票用紙数、白票、無効票
      target.total_box_votes = row.vote_count || 0;
      target.blank_votes = row.blank_votes || 0;
      target.invalid_votes = row.invalid_votes || 0;
    }
  });
}

// ステータスバナー更新
function updateStatusBanner() {
  const banner = document.getElementById('tally-status-banner');
  const text = document.getElementById('tally-status-text');
  const btnReset = document.getElementById('btn-reset-tally');

  banner.classList.remove('hidden');
  
  if (state.electionStatus === 'tally_verified') {
    text.innerHTML = '現在の状況: <span class="text-emerald-600 font-black">【照合完了・確定待ち】</span>';
    btnReset.classList.remove('hidden');
  } else {
    text.innerHTML = '現在の状況: <span class="text-amber-600 font-black">【開票結果入力中】</span>';
    btnReset.classList.add('hidden');
  }
}

// 候補者入力フィールドの動的生成
function buildCandidatesInputs() {
  const container = document.getElementById('candidates-input-grid');
  container.innerHTML = '';

  state.candidates.forEach(cand => {
    const div = document.createElement('div');
    div.className = "bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2";
    
    // ふりがな表示のクリーンアップ（プレーンテキスト化）
    const cleanName = cand.name.replace(/\{([^|]+)\|[^}]+\}/g, '$1');
    const cleanParty = cand.party.replace(/\{([^|]+)\|[^}]+\}/g, '$1');

    div.innerHTML = `
      <div class="flex justify-between items-center text-xs font-bold text-slate-500">
        <span>${cleanParty}</span>
        <span class="text-slate-400">ID: ${cand.id.substring(0, 6)}</span>
      </div>
      <label for="input-cand-${cand.id}" class="text-base font-black text-slate-900 block truncate">
        ${cleanName}
      </label>
      <input type="number" id="input-cand-${cand.id}" required min="0" placeholder="0"
             class="w-full px-4 py-3 border border-slate-300 rounded-xl font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 tablet-input">
    `;

    container.appendChild(div);
  });
}

// 現在のセッションの値をフォームに流し込む
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

  // 一時保存ボタンのテキスト変更
  const btnText = document.getElementById('btn-save-text');
  btnText.innerText = `${state.currentTab === 'staff1' ? '担当者1' : '担当者2'} として保存する`;
}

// フォームからセッションデータの保存
async function saveCurrentSessionData() {
  const session = state.currentTab === 'staff1' ? 'staff_1' : 'staff_2';
  
  const totalBoxVotes = parseInt(document.getElementById('input-total-box-votes').value) || 0;
  const blankVotes = parseInt(document.getElementById('input-blank-votes').value) || 0;
  const invalidVotes = parseInt(document.getElementById('input-invalid-votes').value) || 0;

  // 候補者の得票数収集
  const candidatesVotes = {};
  state.candidates.forEach(cand => {
    candidatesVotes[cand.id] = parseInt(document.getElementById(`input-cand-${cand.id}`).value) || 0;
  });

  // DB挿入用行配列の作成
  const rows = [];
  
  // 候補者ごとの行
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

  // 総投票数・その他分類の行 (candidate_id = null)
  rows.push({
    election_id: state.selectedElectionId,
    input_session: session,
    candidate_id: null,
    vote_count: totalBoxVotes, // 総投票用紙数
    blank_votes: blankVotes,
    invalid_votes: invalidVotes,
    staff_id: session
  });

  if (state.isMockData) {
    // mockデータを更新（既存の当該セッション行を削除して再挿入）
    mockVoteInputs = mockVoteInputs.filter(
      vi => !(vi.election_id === state.selectedElectionId && vi.input_session === session)
    );
    mockVoteInputs.push(...rows);
    
    showToast(`${session === 'staff_1' ? '担当者1' : '担当2'} のデータを一時保存しました。`, 'success');
    await refreshTallyData();
    return;
  }

  try {
    // 1. 既存のセッションデータを削除
    const { error: delErr } = await supabase
      .from('vote_inputs')
      .delete()
      .eq('election_id', state.selectedElectionId)
      .eq('input_session', session);

    if (delErr) throw delErr;

    // 2. 新規挿入
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
  
  // 1. 総投票数の比較行
  const totalRow = createCompareRow(
    '総投票数 (総投票用紙数)', 
    state.staff1Data.total_box_votes, 
    state.staff2Data.total_box_votes
  );
  if (state.staff1Data.total_box_votes !== state.staff2Data.total_box_votes) hasMismatch = true;
  tbody.appendChild(totalRow);

  // 2. 候補者別の比較行
  state.candidates.forEach(cand => {
    const cleanName = cand.name.replace(/\{([^|]+)\|[^}]+\}/g, '$1');
    const v1 = state.staff1Data.candidates[cand.id] || 0;
    const v2 = state.staff2Data.candidates[cand.id] || 0;
    
    const row = createCompareRow(cleanName, v1, v2);
    if (v1 !== v2) hasMismatch = true;
    tbody.appendChild(row);
  });

  // 3. 白票・無効票
  const blankRow = createCompareRow('白票数', state.staff1Data.blank_votes, state.staff2Data.blank_votes);
  if (state.staff1Data.blank_votes !== state.staff2Data.blank_votes) hasMismatch = true;
  tbody.appendChild(blankRow);

  const invalidRow = createCompareRow('無効票数', state.staff1Data.invalid_votes, state.staff2Data.invalid_votes);
  if (state.staff1Data.invalid_votes !== state.staff2Data.invalid_votes) hasMismatch = true;
  tbody.appendChild(invalidRow);

  // --- 警告バナーの制御 ---
  const mismatchWarning = document.getElementById('mismatch-warning');
  if (hasMismatch) {
    mismatchWarning.classList.remove('hidden');
  } else {
    mismatchWarning.classList.add('hidden');
  }

  // --- 数学的整合性チェック ---
  // 総投票数 ＝ 各候補者得票数の合計 ＋ 白票 ＋ 無効票
  const sum1 = calculateSum(state.staff1Data);
  const sum2 = calculateSum(state.staff2Data);
  
  const intError1 = state.staff1Data.total_box_votes !== sum1;
  const intError2 = state.staff2Data.total_box_votes !== sum2;

  const integrityWarning = document.getElementById('integrity-warning');
  const valBox = document.getElementById('val-box-total');
  const valSum = document.getElementById('val-sum-total');
  const valDiff = document.getElementById('val-diff-total');

  if (intError1 || intError2) {
    integrityWarning.classList.remove('hidden');
    // 代表して担当者1のデータを表示
    valBox.innerText = state.staff1Data.total_box_votes;
    valSum.innerText = sum1;
    valDiff.innerText = Math.abs(state.staff1Data.total_box_votes - sum1);
  } else {
    integrityWarning.classList.add('hidden');
  }

  // --- バッジと確定ボタンの活性化判定 ---
  const badge = document.getElementById('compare-status-badge');
  const btnFinalize = document.getElementById('btn-finalize-tally');

  const isTallyInputsEmpty = state.staff1Data.total_box_votes === 0 && state.staff2Data.total_box_votes === 0;

  if (isTallyInputsEmpty) {
    badge.innerText = 'データ未入力';
    badge.className = 'px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-500 border border-slate-300';
    btnFinalize.disabled = true;
  } else if (hasMismatch) {
    badge.innerText = '不一致あり';
    badge.className = 'px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200';
    btnFinalize.disabled = true;
  } else if (intError1 || intError2) {
    badge.innerText = '整合性エラー';
    badge.className = 'px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200';
    btnFinalize.disabled = true;
  } else {
    badge.innerText = '完全一致 (整合クリア)';
    badge.className = 'px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200';
    
    // すでに確定済みの場合は無効化
    if (state.electionStatus === 'tally_verified') {
      btnFinalize.disabled = true;
      btnFinalize.innerText = 'すでに確定済みです';
    } else {
      btnFinalize.disabled = false;
      btnFinalize.innerText = '照合完了・確定待ちにする';
    }
  }
}

// 1行ずつの照合用レコード描画
function createCompareRow(itemName, val1, val2) {
  const tr = document.createElement('tr');
  const isMatch = val1 === val2;

  if (!isMatch) {
    tr.className = 'bg-rose-50 border-b border-slate-200';
  } else {
    tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-200';
  }

  const diff = val1 - val2;
  let diffStr = '';
  
  if (isMatch) {
    diffStr = '<span class="text-emerald-600 flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> 一致</span>';
  } else {
    diffStr = `<span class="text-rose-600 font-extrabold flex items-center gap-1">
      <i class="fa-solid fa-circle-exclamation"></i> 不一致 (${diff > 0 ? '+' : ''}${diff})
    </span>`;
  }

  tr.innerHTML = `
    <td class="p-3.5 border-r border-slate-200 font-bold">${escapeHtml(itemName)}</td>
    <td class="p-3.5 border-r border-slate-200 bg-sky-50/20 text-slate-800 font-mono text-base">${val1}票</td>
    <td class="p-3.5 border-r border-slate-200 bg-amber-50/20 text-slate-800 font-mono text-base">${val2}票</td>
    <td class="p-3.5 text-xs">${diffStr}</td>
  `;

  return tr;
}

// 合計の計算用ヘルパー
function calculateSum(data) {
  let sum = data.blank_votes + data.invalid_votes;
  Object.values(data.candidates).forEach(count => {
    sum += count;
  });
  return sum;
}

// --- 最終確定処理 ---
async function finalizeTally() {
  if (state.isMockData) {
    state.electionStatus = 'tally_verified';
    // electionsのモック状態更新
    const idx = MOCK_ELECTIONS.findIndex(e => e.id === state.selectedElectionId);
    if (idx !== -1) MOCK_ELECTIONS[idx].status = 'tally_verified';

    showToast('照合を完了し、確定待ち状態にしました。', 'success');
    updateStatusBanner();
    renderCompareScreen();
    return;
  }

  try {
    const { error } = await supabase
      .from('elections')
      .update({ status: 'tally_verified' })
      .eq('id', state.selectedElectionId);

    if (error) throw error;

    state.electionStatus = 'tally_verified';
    showToast('照合を完了し、確定待ち状態にしました。', 'success');
    updateStatusBanner();
    renderCompareScreen();
  } catch (err) {
    console.error('最終確定エラー:', err);
    showToast('確定処理に失敗しました。', 'error');
  }
}

// UIリセット
function clearUI() {
  document.getElementById('candidates-input-grid').innerHTML = '';
  document.getElementById('compare-tbody').innerHTML = '';
  document.getElementById('tally-status-banner').classList.add('hidden');
  state.candidates = [];
  state.staff1Data = { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0 };
  state.staff2Data = { total_box_votes: 0, candidates: {}, blank_votes: 0, invalid_votes: 0 };
}
