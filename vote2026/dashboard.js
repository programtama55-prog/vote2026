import { supabase } from '@/lib/supabase.js';
import { showToast } from '@/lib/utils.js';
import { checkPageAccess, renderAuthHeaderWidget, ROLES } from '@/lib/auth.js';

// --- アプリケーションの状態管理 (State) ---
let state = {
  registrations: [],
  isMockData: false,
  updateInterval: 5000, // 5 seconds default
  intervalId: null
};

// --- モックデータ (Supabase接続なし・失敗時のフォールバック用) ---
const MOCK_REGISTRATIONS = [
  { id: 'mock-1', reg_number: 'ADV-1001', is_advance: true, age_group: '小学高学年', municipality: 'つくば市', status: 'registered' },
  { id: 'mock-2', reg_number: 'ADV-1002', is_advance: true, age_group: '中学生', municipality: '土浦市', status: 'ballot_issued' },
  { id: 'mock-3', reg_number: 'ADV-1003', is_advance: true, age_group: '小学低学年', municipality: '水戸市', status: 'registered' },
  { id: 'mock-4', reg_number: 'ADV-1004', is_advance: true, age_group: '高校生', municipality: 'つくば市', status: 'ballot_issued' },
  { id: 'mock-5', reg_number: 'ADV-1005', is_advance: true, age_group: '小学高学年', municipality: 'つくば市', status: 'ballot_issued' },
  { id: 'mock-6', reg_number: 'DAY-8742', is_advance: false, age_group: '小学低学年', municipality: '牛久市', status: 'ballot_issued' },
  { id: 'mock-7', reg_number: 'DAY-2931', is_advance: false, age_group: '未就学児・その他', municipality: 'つくば市', status: 'registered' },
  { id: 'mock-8', reg_number: 'DAY-5110', is_advance: false, age_group: '中学生', municipality: '土浦市', status: 'ballot_issued' },
  { id: 'mock-9', reg_number: 'DAY-3392', is_advance: false, age_group: '小学中学年', municipality: 'つくば市', status: 'ballot_issued' }
];

// --- 初期化処理 ---
async function init() {
  const user = await checkPageAccess([ROLES.UNEI, ROLES.ADMIN]);
  if (!user) return;

  renderAuthHeaderWidget('header-user-widget');

  updateConnectionStatusUI();
  initEventListeners();
  await refreshDashboard();
  startAutoUpdate();
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

// イベントリスナー登録
function initEventListeners() {
  // 自動更新間隔の変更
  const selectInterval = document.getElementById('update-interval');
  selectInterval.addEventListener('change', (e) => {
    state.updateInterval = parseInt(e.target.value);
    startAutoUpdate();
  });

  // 手動更新ボタン
  const btnRefresh = document.getElementById('btn-refresh');
  btnRefresh.addEventListener('click', async () => {
    const icon = btnRefresh.querySelector('i');
    icon.classList.add('fa-spin');
    await refreshDashboard();
    setTimeout(() => {
      icon.classList.remove('fa-spin');
    }, 600);
  });

  // CSVダウンロードボタン
  const btnCsv = document.getElementById('btn-download-csv');
  btnCsv.addEventListener('click', () => {
    downloadCSV();
  });
}

// 自動更新タイマー開始
function startAutoUpdate() {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  if (state.updateInterval > 0) {
    state.intervalId = setInterval(async () => {
      await refreshDashboard();
    }, state.updateInterval);
  }
}

// ダッシュボード更新処理
async function refreshDashboard() {
  await fetchRegistrations();
  renderStats();
  renderDistributions();
  
  // 最終更新時刻表示
  const now = new Date();
  document.getElementById('last-update-time').innerText = now.toLocaleTimeString('ja-JP');
}

// 受付データのフェッチ
async function fetchRegistrations() {
  try {
    const { data, error } = await supabase
      .from('registrations')
      .select('id, reg_number, is_advance, age_group, municipality, status, created_at');

    if (error) throw error;

    if (data && data.length > 0) {
      state.registrations = data;
    } else {
      const raw = localStorage.getItem('kodomo_senkyo_voters');
      state.registrations = raw ? JSON.parse(raw) : [];
    }
  } catch (err) {
    const raw = localStorage.getItem('kodomo_senkyo_voters');
    state.registrations = raw ? JSON.parse(raw) : [];
  }
}

// 各種統計数値の描画
function renderStats() {
  const total = state.registrations.length;
  const advance = state.registrations.filter(r => r.is_advance).length;
  const sameday = state.registrations.filter(r => !r.is_advance).length;
  const issued = state.registrations.filter(r => r.status === 'ballot_issued').length;

  document.getElementById('stat-total-registered').innerText = `${total}人`;
  document.getElementById('stat-advance').innerText = `${advance}人`;
  document.getElementById('stat-sameday').innerText = `${sameday}人`;
  document.getElementById('stat-issued').innerText = `${issued}人`;

  const percent = total > 0 ? Math.round((issued / total) * 100) : 0;
  document.getElementById('stat-issued-percent').innerText = `(${percent}%)`;
}

// 年齢別・市町村別の割合（プログレスバー）描画
function renderDistributions() {
  const total = state.registrations.length;
  
  // 1. 年齢区分の集計
  const ageGroupCounts = {};
  state.registrations.forEach(r => {
    const key = r.age_group || 'その他';
    ageGroupCounts[key] = (ageGroupCounts[key] || 0) + 1;
  });

  const ageContainer = document.getElementById('age-group-bars');
  renderBarSection(ageContainer, ageGroupCounts, total, 'bg-indigo-500');

  // 2. 市町村の集計
  const municipalityCounts = {};
  state.registrations.forEach(r => {
    const key = r.municipality || '不明';
    municipalityCounts[key] = (municipalityCounts[key] || 0) + 1;
  });

  const munContainer = document.getElementById('municipality-bars');
  renderBarSection(munContainer, municipalityCounts, total, 'bg-sky-500');
}

// 割合プログレスバーセクション生成汎用関数
function renderBarSection(container, counts, total, barBgClass) {
  container.innerHTML = '';
  
  if (total === 0) {
    container.innerHTML = '<div class="text-slate-500 text-center py-8">データが存在しません。</div>';
    return;
  }

  // 降順にソートして並べる
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  sorted.forEach(([label, count]) => {
    const percent = Math.round((count / total) * 100);
    const div = document.createElement('div');
    div.className = 'space-y-1.5';
    
    div.innerHTML = `
      <div class="flex justify-between items-center text-slate-300">
        <span class="font-bold text-sm">${label}</span>
        <div class="space-x-1.5">
          <span class="font-bold text-slate-100">${count}人</span>
          <span class="text-slate-400">(${percent}%)</span>
        </div>
      </div>
      <div class="w-full bg-slate-700/60 rounded-full h-3.5 overflow-hidden">
        <div class="${barBgClass} h-full rounded-full transition-all duration-500" style="width: ${percent}%"></div>
      </div>
    `;
    
    container.appendChild(div);
  });
}

// CSVダウンロード
function downloadCSV() {
  if (state.registrations.length === 0) {
    showToast('エクスポートするデータがありません。', 'info');
    return;
  }

  // ヘッダー行
  let csvContent = '\uFEFF'; // Excel等での文字化け防止用BOM
  csvContent += 'ID,受付番号,事前申込区分,年齢区分,市町村,ステータス,受付日時\n';

  // データ行追加
  state.registrations.forEach(r => {
    const isAdvanceText = r.is_advance ? '事前申込' : '当日登録';
    const statusText = r.status === 'ballot_issued' ? '受付済み' : '未受付';
    
    // 日付フォーマット
    const timeStr = r.created_at ? new Date(r.created_at).toLocaleString('ja-JP') : '-';

    const row = [
      r.id,
      r.reg_number,
      isAdvanceText,
      r.age_group,
      r.municipality,
      statusText,
      `"${timeStr}"` // カンマ等が含まれる可能性があるためダブルクォートで包む
    ];
    csvContent += row.join(',') + '\n';
  });

  // Blobオブジェクト作成
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  // ダウンロード処理
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  link.setAttribute('download', `vote2026_registrations_backup_${dateStr}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('状況CSVバックアップをダウンロードしました。', 'success');
}
