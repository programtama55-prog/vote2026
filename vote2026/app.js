import { supabase } from '@/lib/supabase.js';
import { parseFurigana, shuffleArray, showToast, escapeHtml } from '@/lib/utils.js';

// --- アプリケーションの状態管理 (State) ---
let state = {
  elections: [],
  selectedElectionId: '',
  candidates: [],
  questions: [],
  candidateAnswers: [],
  reactions: {}, // answerId -> { agree: count, difficult: count, more_info: count }
  currentQuestionId: '',
  furiganaEnabled: true,
  isMockData: false
};

// --- モックデータ (Supabase接続が未設定・失敗した場合のフォールバック) ---
const MOCK_ELECTIONS = [
  { id: 'ele-1', title: '第1回 {こども選挙|こどもせんきょ}', description: 'みんなのまちがもっと楽しくなるための選挙だよ。' }
];

const MOCK_CANDIDATES = [
  {
    id: 'cand-a',
    election_id: 'ele-1',
    name: '{青空|あおぞら} {健太|けんた}',
    party: 'おひさま{党|とう}',
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=facearea&facepad=3&w=300&h=300&q=80',
    profile: '{自然|しぜん}ゆたかな{公園|こうえん}を増やし、子どもたちが{安全|あんぜん}にのびのび遊べるまちを目指します。毎週土曜日にどろんこ遊びまつりを{開催|かいさい}したいです！',
    status: 'approved'
  },
  {
    id: 'cand-b',
    election_id: 'ele-1',
    name: '{緑川|みどりかわ} さくら',
    party: 'みらいの{風党|かぜとう}',
    avatar_url: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=facearea&facepad=3&w=300&h=300&q=80',
    profile: '学校（がっこう）のパソコンやタブレットを増やし、もっと楽しい授業づくりをすすめます。放課後（ほうかご）に誰でも使える無料塾（むりょうじゅく）をつくります！',
    status: 'approved'
  },
  {
    id: 'cand-c',
    election_id: 'ele-1',
    name: '{未来|みらい} まなぶ',
    party: 'わくわくクラブ',
    avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=3&w=300&h=300&q=80',
    profile: '駄菓子屋（だがしや）さんや室内（しつない）あそび場を駅前につくって、多世代（たせたい）が交流（こうりゅう）できるにぎやかなまちをつくります！',
    status: 'approved'
  }
];

const MOCK_QUESTIONS = [
  {
    id: 'q-1',
    election_id: 'ele-1',
    title: '放課後（ほうかご）の遊び場をどうしますか？',
    description: 'もっと遊べる場所を増やしてほしいという声について、どう考えますか。',
    status: 'approved'
  },
  {
    id: 'q-2',
    election_id: 'ele-1',
    title: '学校（がっこう）のタブレットやパソコンについて',
    description: 'タブレットをつかった授業（じゅぎょう）をもっと楽しくする方法について。',
    status: 'approved'
  }
];

const MOCK_ANSWERS = [
  // cand-a
  { id: 'ans-a1', candidate_id: 'cand-a', question_id: 'q-1', answer_text: '{車|くるま}が通らない{安全|あんぜん}な「どろんこ公園（こうえん）」を３つ新しくつくります。そこでは、ルールをなるべく少なくして、自由に遊べるようにします。', status: 'approved' },
  { id: 'ans-a2', candidate_id: 'cand-a', question_id: 'q-2', answer_text: '{教科書|きょうかしょ}を見るだけではなく、外の{自然|しぜん}をカメラで撮って{観察|かんさつ}する授業にタブレットを活用します。', status: 'approved' },
  // cand-b
  { id: 'ans-b1', candidate_id: 'cand-b', question_id: 'q-1', answer_text: '学校（がっこう）の校庭（こうてい）を放課後に開放して、{大学生|だいがくせい}のボランティアのお兄さん・お姉さんと一緒に宿題（しゅくだい）やスポーツができる場をつくります。', status: 'approved' },
  { id: 'ans-b2', candidate_id: 'cand-b', question_id: 'q-2', answer_text: '一人ひとりちがったドリルや、{対戦型|たいせんがた}の算数（さんすう）ゲームを導入（どうにゅう）して、遊ぶように学べる仕組みをつくります。', status: 'approved' },
  // cand-c
  { id: 'ans-c1', candidate_id: 'cand-c', question_id: 'q-1', answer_text: '駅前（えきまえ）の空きビルを改装して、{雨|あめ}の日でもトランポリンや工作ができる「室内（しつない）アドベンチャー広場」をつくります。', status: 'approved' },
  { id: 'ans-c2', candidate_id: 'cand-c', question_id: 'q-2', answer_text: '{プログラミング|ぷろぐらみんぐ}や動画（どうが）編集を体験できるクラブ活動をすべての小中学校に用意します。', status: 'approved' }
];

// --- 初期化処理 (Initialization) ---
document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  await loadElections();
});

// --- イベントリスナーの登録 ---
function initEventListeners() {
  // 1. ふりがな切り替えボタン (P09-P11の共通アクセシビリティ要件)
  const furiganaBtn = document.getElementById('furigana-toggle-btn');
  furiganaBtn.addEventListener('click', () => {
    state.furiganaEnabled = !state.furiganaEnabled;
    const btnText = document.getElementById('furigana-btn-text');
    
    if (state.furiganaEnabled) {
      document.body.classList.remove('hide-furigana');
      btnText.innerText = 'ふりがな を はずす';
      showToast('ふりがな を つけました！', 'info');
    } else {
      document.body.classList.add('hide-furigana');
      btnText.innerText = 'ふりがな を つける';
      showToast('ふりがな を はずしました！', 'info');
    }
  });

  // 2. 画面切り替えタブ
  const tabCandidates = document.getElementById('tab-candidates');
  const tabComparison = document.getElementById('tab-comparison');
  const secCandidates = document.getElementById('section-candidates');
  const secComparison = document.getElementById('section-comparison');

  tabCandidates.addEventListener('click', () => {
    // アクティブ表示の調整
    tabCandidates.className = "px-6 py-4 sm:px-8 rounded-2xl border-3 border-slate-800 bg-kids-blue text-base sm:text-lg font-black text-white shadow-[4px_4px_0_#1e293b] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center gap-2";
    tabComparison.className = "px-6 py-4 sm:px-8 rounded-2xl border-3 border-slate-800 bg-white text-base sm:text-lg font-black text-slate-800 shadow-[4px_4px_0_#1e293b] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center gap-2";
    
    secCandidates.classList.remove('hidden');
    secComparison.classList.add('hidden');
    
    renderCandidates();
  });

  tabComparison.addEventListener('click', () => {
    tabCandidates.className = "px-6 py-4 sm:px-8 rounded-2xl border-3 border-slate-800 bg-white text-base sm:text-lg font-black text-slate-800 shadow-[4px_4px_0_#1e293b] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center gap-2";
    tabComparison.className = "px-6 py-4 sm:px-8 rounded-2xl border-3 border-slate-800 bg-kids-orange text-base sm:text-lg font-black text-white shadow-[4px_4px_0_#1e293b] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center gap-2";
    
    secCandidates.classList.add('hidden');
    secComparison.classList.remove('hidden');
    
    renderComparisonQuestions();
  });

  // デフォルトタブアクティブ設定 (候補者リスト)
  tabCandidates.click();

  // 3. 選挙セレクターの変更イベント
  const electionSelect = document.getElementById('election-select');
  electionSelect.addEventListener('change', async (e) => {
    state.selectedElectionId = e.target.value;
    if (state.selectedElectionId) {
      await loadElectionData(state.selectedElectionId);
    } else {
      clearUI();
    }
  });

  // 4. モーダルの閉じるボタンイベント
  const modalClose = document.getElementById('candidate-modal-close');
  modalClose.addEventListener('click', closeCandidateModal);
  
  const modal = document.getElementById('candidate-modal');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCandidateModal();
  });
}

// --- データ読み込み処理 (Data Fetching via Supabase) ---

// すべての選挙をロード
async function loadElections() {
  try {
    // 承認された選挙のみ取得 (RLS対応)
    const { data, error } = await supabase
      .from('elections')
      .select('id, title, description')
      .order('id', { ascending: false });

    if (error) throw error;

    state.elections = data;
    state.isMockData = false;
  } catch (err) {
    console.error('Supabaseからの選挙情報の取得に失敗しました。モックデータを使用します:', err);
    state.elections = MOCK_ELECTIONS;
    state.isMockData = true;
  }

  renderElectionSelect();
}

// 選択された選挙のすべての詳細データを取得
async function loadElectionData(electionId) {
  // ローダー表示
  const loader = document.getElementById('candidates-loader');
  const grid = document.getElementById('candidates-grid');
  loader.classList.remove('hidden');
  grid.classList.add('hidden');

  const selectedElection = state.elections.find(e => e.id === electionId);
  const infoCard = document.getElementById('election-info-card');
  const infoTitle = document.getElementById('election-info-title');
  const infoDesc = document.getElementById('election-info-desc');

  if (selectedElection) {
    infoTitle.innerHTML = parseFurigana(selectedElection.title);
    infoDesc.innerHTML = parseFurigana(selectedElection.description);
    infoCard.classList.remove('hidden');
  }

  if (state.isMockData) {
    // モックデータ読み込み
    state.candidates = MOCK_CANDIDATES.filter(c => c.election_id === electionId);
    state.questions = MOCK_QUESTIONS.filter(q => q.election_id === electionId);
    
    const qIds = state.questions.map(q => q.id);
    state.candidateAnswers = MOCK_ANSWERS.filter(a => qIds.includes(a.question_id));
    
    // モック用のリアクション数初期化
    state.reactions = {};
    state.candidateAnswers.forEach(ans => {
      state.reactions[ans.id] = {
        agree: Math.floor(Math.random() * 20) + 5,
        difficult: Math.floor(Math.random() * 5),
        more_info: Math.floor(Math.random() * 10) + 2
      };
    });

    setTimeout(() => {
      loader.classList.add('hidden');
      grid.classList.remove('hidden');
      renderCandidates();
      renderComparisonQuestions();
    }, 400); // 親しみやすい短い遅延演出
    return;
  }

  try {
    // 1. 候補者（status = 'approved'）を取得
    const { data: candidates, error: candErr } = await supabase
      .from('candidates')
      .select('id, name, party, avatar_url, profile')
      .eq('election_id', electionId)
      .eq('status', 'approved');

    if (candErr) throw candErr;
    state.candidates = candidates;

    // 2. 質問（status = 'approved'）を取得
    const { data: questions, error: qErr } = await supabase
      .from('questions')
      .select('id, title, description')
      .eq('election_id', electionId)
      .eq('status', 'approved');

    if (qErr) throw qErr;
    state.questions = questions;

    // 3. 回答（status = 'approved'）を取得
    const qIds = questions.map(q => q.id);
    if (qIds.length > 0) {
      const { data: answers, error: ansErr } = await supabase
        .from('candidate_answers')
        .select('id, candidate_id, question_id, answer_text')
        .in('question_id', qIds)
        .eq('status', 'approved');

      if (ansErr) throw ansErr;
      state.candidateAnswers = answers;

      // 4. リアクション数の集計を取得 (INSERTされたものをカウント)
      await fetchReactionCounts();
    } else {
      state.candidateAnswers = [];
      state.reactions = {};
    }

    loader.classList.add('hidden');
    grid.classList.remove('hidden');
    
    // レンダリング実行
    renderCandidates();
    renderComparisonQuestions();

  } catch (err) {
    console.error('データのロード中にエラーが発生しました:', err);
    showToast('データのよみこみにしっぱいしました。', 'error');
    loader.classList.add('hidden');
  }
}

// Supabaseからリアクション数を集計する処理
async function fetchReactionCounts() {
  state.reactions = {};
  const ansIds = state.candidateAnswers.map(a => a.id);
  if (ansIds.length === 0) return;

  try {
    // 簡易的に全件取得してJSでカウント（小規模前提）
    // 大規模の場合はDB側でグループ化またはカウンターキャッシュテーブルの使用が推奨されますが、一般公開エリアの軽量実装として以下で行います。
    const { data, error } = await supabase
      .from('reactions')
      .select('answer_id, type')
      .in('answer_id', ansIds);

    if (error) throw error;

    // 初期化
    ansIds.forEach(id => {
      state.reactions[id] = { agree: 0, difficult: 0, more_info: 0 };
    });

    // カウント集計
    data.forEach(item => {
      if (state.reactions[item.answer_id] && state.reactions[item.answer_id][item.type] !== undefined) {
        state.reactions[item.answer_id][item.type]++;
      }
    });

  } catch (err) {
    console.warn('リアクション数のカウントに失敗しました（初期値を0にします）:', err);
    ansIds.forEach(id => {
      state.reactions[id] = { agree: 0, difficult: 0, more_info: 0 };
    });
  }
}

// UIのリセット
function clearUI() {
  document.getElementById('election-info-card').classList.add('hidden');
  document.getElementById('candidates-grid').innerHTML = '';
  document.getElementById('comparison-questions-container').innerHTML = '';
  document.getElementById('comparison-answers-section').classList.add('hidden');
  document.getElementById('comparison-empty-state').classList.remove('hidden');
  
  state.candidates = [];
  state.questions = [];
  state.candidateAnswers = [];
  state.reactions = {};
  state.currentQuestionId = '';
}

// --- レンダリング処理 (Rendering) ---

// 選挙の選択肢をプルダウンに表示
function renderElectionSelect() {
  const select = document.getElementById('election-select');
  select.innerHTML = '<option value="">-- 選挙をえらぶ --</option>';
  
  state.elections.forEach(ele => {
    const opt = document.createElement('option');
    opt.value = ele.id;
    // セレクター内のふりがな表記は `{}` を除去したプレーンテキスト
    opt.textContent = ele.title.replace(/\{([^|]+)\|[^}]+\}/g, '$1');
    select.appendChild(opt);
  });

  // デフォルトで最初の選挙を選択
  if (state.elections.length > 0) {
    select.value = state.elections[0].id;
    select.dispatchEvent(new Event('change'));
  }
}

// P09: 候補者一覧のレンダリング
function renderCandidates() {
  const container = document.getElementById('candidates-grid');
  container.innerHTML = '';

  if (state.candidates.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <p class="text-sm font-bold text-slate-400">候補者（こうほしゃ）がまだ登録されていません。</p>
      </div>
    `;
    return;
  }

  // 毎回公平にランダムシャッフルして表示（UI要件）
  const randomizedCandidates = shuffleArray(state.candidates);

  randomizedCandidates.forEach(cand => {
    const card = document.createElement('div');
    // 子ども向けの大きな丸みと太線枠線
    card.className = "bg-white border-3 border-slate-800 rounded-3xl overflow-hidden shadow-[4px_4px_0_#1e293b] hover:translate-y-[-4px] hover:shadow-[6px_6px_0_#1e293b] transition-all flex flex-col";
    
    // 政党に応じたカラフルなアクセントバー
    const accentColors = ['bg-kids-blue', 'bg-kids-orange', 'bg-kids-green', 'bg-kids-red', 'bg-kids-purple'];
    const accentClass = accentColors[Math.abs(cand.name.length) % accentColors.length];

    card.innerHTML = `
      <div class="h-4 ${accentClass} border-b-2 border-slate-800"></div>
      
      <div class="p-6 flex-1 flex flex-col items-center text-center space-y-4">
        <!-- アバター写真 -->
        <div class="w-28 h-28 rounded-full border-3 border-slate-800 overflow-hidden bg-slate-100 shadow-sm relative">
          <img src="${cand.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}" 
               alt="${cand.name}" 
               class="w-full h-full object-cover">
        </div>

        <div>
          <!-- 政党 -->
          <span class="inline-block px-3 py-1 rounded-full text-xs font-black bg-slate-100 border-2 border-slate-800 text-slate-700 mb-1">
            ${parseFurigana(cand.party)}
          </span>
          <!-- 名前（ルビ付） -->
          <h3 class="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            ${parseFurigana(cand.name)}
          </h3>
        </div>

        <!-- 自己紹介抜粋 -->
        <p class="text-sm font-bold text-slate-600 leading-relaxed text-left flex-1 line-clamp-3">
          ${parseFurigana(cand.profile)}
        </p>
        
        <!-- 詳細ボタン (大きなタップエリア) -->
        <button onclick="openCandidateDetail('${cand.id}')" 
                class="w-full py-3.5 px-6 rounded-2xl bg-kids-yellow hover:bg-yellow-400 text-slate-800 font-black text-base border-3 border-slate-800 shadow-[3px_3px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0_#000] transition-all">
          もっとくわしく見る！ 👀
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

// 候補者詳細モーダルの表示 (P09詳細)
window.openCandidateDetail = function(candidateId) {
  const cand = state.candidates.find(c => c.id === candidateId);
  if (!cand) return;

  const modalBody = document.getElementById('candidate-modal-body');
  
  // この候補者の回答リストを作成
  const answersHtml = state.questions.map(q => {
    const ans = state.candidateAnswers.find(a => a.candidate_id === cand.id && a.question_id === q.id);
    return `
      <div class="bg-orange-50/50 border-2 border-slate-800 rounded-2xl p-4 space-y-2">
        <h4 class="text-sm font-black text-slate-800 flex items-center gap-1.5">
          <span class="w-5 h-5 rounded-full bg-kids-orange text-white text-xs flex items-center justify-center font-mono">Q</span>
          ${parseFurigana(q.title)}
        </h4>
        <p class="text-sm font-bold text-slate-700 leading-relaxed">
          ${ans ? parseFurigana(ans.answer_text) : '{回答|かいとう}はまだありません。'}
        </p>
      </div>
    `;
  }).join('');

  modalBody.innerHTML = `
    <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6 border-b-3 border-slate-100 pb-6 mb-6">
      <div class="w-32 h-32 rounded-full border-3 border-slate-800 overflow-hidden bg-slate-100 shrink-0">
        <img src="${cand.avatar_url}" alt="${cand.name}" class="w-full h-full object-cover">
      </div>
      <div class="text-center sm:text-left space-y-3">
        <span class="inline-block px-3 py-1 rounded-full text-xs font-black bg-slate-100 border-2 border-slate-800 text-slate-700">
          ${parseFurigana(cand.party)}
        </span>
        <h3 class="text-2xl sm:text-3xl font-black text-slate-900">
          ${parseFurigana(cand.name)}
        </h3>
        <div class="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-bold text-slate-600 leading-relaxed text-left">
          <h4 class="font-black text-slate-800 mb-1">どんなひと？</h4>
          ${parseFurigana(cand.profile)}
        </div>
      </div>
    </div>
    
    <div class="space-y-4">
      <h3 class="text-lg font-black text-slate-900 flex items-center gap-2">
        📢 しつもんへのこたえ
      </h3>
      <div class="grid grid-cols-1 gap-4">
        ${answersHtml}
      </div>
    </div>
  `;

  // モーダルオープンアニメーション
  const modal = document.getElementById('candidate-modal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    document.getElementById('candidate-modal-content').classList.remove('scale-95');
    document.getElementById('candidate-modal-content').classList.add('scale-100');
  }, 10);
};

function closeCandidateModal() {
  const modal = document.getElementById('candidate-modal');
  modal.classList.add('opacity-0');
  document.getElementById('candidate-modal-content').classList.remove('scale-100');
  document.getElementById('candidate-modal-content').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
}

// P10: 比較画面用しつもん選択ボタンのレンダリング
function renderComparisonQuestions() {
  const container = document.getElementById('comparison-questions-container');
  container.innerHTML = '';

  if (state.questions.length === 0) {
    container.innerHTML = '<p class="text-sm font-bold text-slate-400">しつもんがまだ登録されていません。</p>';
    return;
  }

  state.questions.forEach((q, idx) => {
    const btn = document.createElement('button');
    // 子どもが押しやすい大きめのクエスチョンボタン
    const isActive = state.currentQuestionId === q.id;
    
    btn.className = `px-5 py-3 rounded-2xl font-black text-sm border-3 border-slate-800 shadow-[3px_3px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0_#000] transition-all flex items-center gap-2 ${
      isActive 
        ? 'bg-kids-orange text-white' 
        : 'bg-white text-slate-800 hover:bg-orange-50'
    }`;
    
    btn.innerHTML = `
      <span class="w-6 h-6 rounded-full bg-white text-slate-800 text-xs flex items-center justify-center font-bold border border-slate-800">${idx + 1}</span>
      ${parseFurigana(q.title)}
    `;
    
    btn.addEventListener('click', () => {
      state.currentQuestionId = q.id;
      // ボタン群再描画
      renderComparisonQuestions();
      // 回答比較一覧を描画
      renderComparisonGrid();
    });

    container.appendChild(btn);
  });

  // 初期値として1番目の質問を自動選択
  if (!state.currentQuestionId && state.questions.length > 0) {
    state.currentQuestionId = state.questions[0].id;
    renderComparisonQuestions();
    renderComparisonGrid();
  }
}

// P10 & P11: 質問回答比較グリッドのレンダリング
function renderComparisonGrid() {
  const emptyState = document.getElementById('comparison-empty-state');
  const answersSection = document.getElementById('comparison-answers-section');
  const grid = document.getElementById('comparison-grid');

  if (!state.currentQuestionId) {
    emptyState.classList.remove('hidden');
    answersSection.classList.add('hidden');
    return;
  }

  const selectedQuestion = state.questions.find(q => q.id === state.currentQuestionId);
  if (!selectedQuestion) return;

  emptyState.classList.add('hidden');
  answersSection.classList.remove('hidden');

  document.getElementById('current-question-title').innerHTML = parseFurigana(selectedQuestion.title);
  
  // 該当質問に対する全回答
  const relevantAnswers = state.candidateAnswers.filter(a => a.question_id === state.currentQuestionId);
  document.getElementById('answers-count').innerText = `回答: ${relevantAnswers.length}件`;

  grid.innerHTML = '';

  if (relevantAnswers.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-white border-2 border-slate-200 p-8 rounded-2xl text-center">
        <p class="text-sm font-bold text-slate-400">このしつもんに対する候補者の回答（かいとう）はまだありません。</p>
      </div>
    `;
    return;
  }

  // 候補者の表示順も公平性の観点からシャッフルしてループ
  const randomizedCandidates = shuffleArray(state.candidates);

  randomizedCandidates.forEach(cand => {
    const ans = relevantAnswers.find(a => a.candidate_id === cand.id);
    if (!ans) return; // 回答がない場合は除外

    const rStats = state.reactions[ans.id] || { agree: 0, difficult: 0, more_info: 0 };

    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl p-6 shadow-[4px_4px_0_#1e293b] flex flex-col space-y-4 hover:shadow-[6px_6px_0_#1e293b] hover:translate-y-[-2px] transition-all relative";
    
    card.innerHTML = `
      <!-- 候補者ミニヘッダー -->
      <div class="flex items-center gap-3 border-b-2 border-slate-100 pb-3">
        <div class="w-12 h-12 rounded-full border-2 border-slate-800 overflow-hidden bg-slate-100 shrink-0">
          <img src="${cand.avatar_url}" alt="${cand.name}" class="w-full h-full object-cover">
        </div>
        <div>
          <span class="text-[0.65rem] font-black text-slate-400 block">${parseFurigana(cand.party)}</span>
          <h4 class="text-base font-black text-slate-900">${parseFurigana(cand.name)}</h4>
        </div>
      </div>

      <!-- 回答本文 -->
      <p class="text-sm font-bold text-slate-700 leading-relaxed flex-1 whitespace-pre-wrap">
        ${parseFurigana(ans.answer_text)}
      </p>

      <!-- P11: リアクション送信モジュール -->
      <div class="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 space-y-2">
        <h5 class="text-[0.7rem] font-black text-slate-500 text-center uppercase tracking-wider">
          読んでどう思った？（１タップでおうえん！）
        </h5>
        
        <div class="grid grid-cols-3 gap-1.5">
          <!-- 納得したリアクション (agree) -->
          <button onclick="submitReaction('${ans.id}', 'agree', this)" 
                  class="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-emerald-50 border-2 border-slate-800 text-slate-800 active:scale-[0.95] transition-all shadow-[1px_2px_0_#000]">
            <span class="text-lg">なるほど💡</span>
            <span class="text-xs font-black text-slate-600 mt-1" id="count-agree-${ans.id}">${rStats.agree}</span>
          </button>

          <!-- 難しかったリアクション (difficult) -->
          <button onclick="submitReaction('${ans.id}', 'difficult', this)" 
                  class="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-yellow-50 border-2 border-slate-800 text-slate-800 active:scale-[0.95] transition-all shadow-[1px_2px_0_#000]">
            <span class="text-lg">むずかしい🤔</span>
            <span class="text-xs font-black text-slate-600 mt-1" id="count-difficult-${ans.id}">${rStats.difficult}</span>
          </button>

          <!-- もっと知りたいリアクション (more_info) -->
          <button onclick="submitReaction('${ans.id}', 'more_info', this)" 
                  class="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-blue-50 border-2 border-slate-800 text-slate-800 active:scale-[0.95] transition-all shadow-[1px_2px_0_#000]">
            <span class="text-lg">もっと知りたい✨</span>
            <span class="text-xs font-black text-slate-600 mt-1" id="count-more_info-${ans.id}">${rStats.more_info}</span>
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// P11: リアクション送信処理
window.submitReaction = async function(answerId, type, btnElement) {
  // エフェクト演出
  createBubbleEffect(btnElement, type);

  // ローカルステートを即時更新（オプティミスティックUIアップデート）
  if (state.reactions[answerId]) {
    state.reactions[answerId][type]++;
  } else {
    state.reactions[answerId] = { agree: 0, difficult: 0, more_info: 0 };
    state.reactions[answerId][type] = 1;
  }

  // UI上の数値表示を瞬時に更新
  const counterSpan = document.getElementById(`count-${type}-${answerId}`);
  if (counterSpan) {
    counterSpan.innerText = state.reactions[answerId][type];
  }

  const reactionEmojis = {
    agree: '💡「なるほど」',
    difficult: '🤔「むずかしい」',
    more_info: '✨「もっと知りたい」'
  };

  showToast(`${reactionEmojis[type]} のきもちを 送（おく）ったよ！`, 'success');

  if (state.isMockData) {
    // デモモード時はDB保存をスキップ
    return;
  }

  // Supabaseにインサート
  try {
    const { error } = await supabase
      .from('reactions')
      .insert({
        answer_id: answerId,
        type: type
      });

    if (error) throw error;
  } catch (err) {
    console.error('リアクションの送信に失敗しました:', err);
    // 失敗してもオプティミスティックに増えた表示は戻さずエラーだけログに記録
  }
};

// リアクションクリック時のバブルポップアップ演出
function createBubbleEffect(element, type) {
  const emojis = {
    agree: '💡',
    difficult: '🤔',
    more_info: '✨'
  };

  const bubble = document.createElement('span');
  bubble.innerText = emojis[type] || '👍';
  bubble.className = "absolute text-2xl pointer-events-none select-none z-50 animate-float-emoji";
  
  // ボタンの中心付近にポップアップさせるための位置計算
  const rect = element.getBoundingClientRect();
  const cardRect = element.closest('.relative').getBoundingClientRect();
  
  const left = rect.left - cardRect.left + (rect.width / 2) - 12;
  const top = rect.top - cardRect.top - 10;

  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;

  element.closest('.relative').appendChild(bubble);

  // アニメーション完了後に要素を削除
  setTimeout(() => {
    bubble.remove();
  }, 800);
}
