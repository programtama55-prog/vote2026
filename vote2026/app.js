import { supabase } from '@/lib/supabase.js';
import { parseFurigana, shuffleArray, showToast, escapeHtml } from '@/lib/utils.js';
import { renderAuthHeaderWidget } from '@/lib/auth.js';

// --- アプリケーションの状態管理 (State) ---
let state = {
  elections: [],
  selectedElectionId: '',
  candidates: [],
  questions: [],
  officialQuestions: [],
  candidateAnswers: [],
  workshops: [],
  issues: [],
  governorPosts: [],
  selectedIssueCategory: 'すべて',
  issueSearchKeyword: '',
  reactions: {}, // answerId -> { agree: count, difficult: count, more_info: count }
  currentQuestionId: '',
  
  // Tab Management (Requirements: 3 Main Tabs)
  activeMainTab: 'top', // 'top' | 'workshop' | 'candidates-answers'
  activeWorkshopSubtab: 'archive', // 'archive' | 'issues' | 'official' | 'quiz' | 'submit'
  activeCandidatesSubtab: 'comparison', // 'comparison' | 'profiles' | 'ideas'

  furiganaEnabled: true,
  isMockData: false,
  
  // P07 quiz state
  quizCandidates: [],
  quizSelectedId: null,
  
  // Rate limiting
  lastSubmitTime: 0
};

// --- モックデータ (Supabase接続未設定・失敗時の高度なフォールバック) ---
const MOCK_ELECTIONS = [
  { 
    id: 'ele-1', 
    title: '第1回 {こども選挙|こどもせんきょ}', 
    description: 'みんなのまちがもっと楽しくなるための選挙だよ。こどもたちの手で、まちの未来をかんがえよう！',
    status: '投票受付中' // 準備中 / 質問募集中 / 回答公開中 / 投票受付中 / 結果発表中
  }
];

const MOCK_WORKSHOPS = [
  {
    id: 'ws-1',
    election_id: 'ele-1',
    title: '第1回 {まち探検|まちたんけん}と「困りごと」さがし',
    date: '2026-06-15',
    content: 'みんなで実際にまちを歩いて、あぶない場所や「もっとこうなったらいいな」と思うところを探しました！{公園|こうえん}の遊具（ゆうぐ）が壊れていたり、{横断歩道|おうだんほどう}が少なくて道を渡るのがあぶない場所があることに気づきました。',
    image_url: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=600&h=350&q=80',
    status: 'approved'
  },
  {
    id: 'ws-2',
    election_id: 'ele-1',
    title: '第2回 {模造紙|もぞうし}マップづくり＆グループ発表',
    date: '2026-07-02',
    content: 'まち探検で見つけた課題をみんなで大きな地図にまとめました！「あそび場」「安全・道路」「学校・生活」の３つのグループに分かれて話し合い、まちの大人や立候補する人たちに聞いてみたい「しつもん」のアイデアを出し合いました。',
    image_url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=600&h=350&q=80',
    status: 'approved'
  }
];

const MOCK_ISSUES = [
  { id: 'iss-1', election_id: 'ele-1', category: 'あそび場', title: 'ボール遊びができる広い{公園|こうえん}が少ない', description: 'ボールが使える公園が少ないので、野球やサッカーをして遊べません。道路で遊ぶと危ないので、のびのび遊べる場所がもっとほしいです。', status: 'approved' },
  { id: 'iss-2', election_id: 'ele-1', category: '安全・道路', title: '{通学路|つうがくろ}の信号がない{横断歩道|おうだんほどう}が危ない', description: '学校にいく途中にある横断歩道に信号機がありません。車がたくさん通るので、一人で渡るのがとても怖いです。押しボタン式でもいいので信号がほしいです。', status: 'approved' },
  { id: 'iss-3', election_id: 'ele-1', category: '学校・教育', title: '学校のタブレットのアプリ制限がきびしすぎる', description: '授業でつかうタブレットで、使えるソフトがとても少ないです。もっと自主学習（じしゅがくしゅう）に役立つ調べものや、お絵かき・スライド作成ができるようにしてほしいです。', status: 'approved' },
  { id: 'iss-4', election_id: 'ele-1', category: 'あそび場', title: '{雨|あめ}の日でも遊べる無料の{施設|しせつ}がほしい', description: '雨の日は外で遊べず、図書館くらいしか行くところがありません。工作ができるプレイルームや、少し体を動かせる室内あそび場を駅前につくってほしいです。', status: 'approved' },
  { id: 'iss-5', election_id: 'ele-1', category: 'お店・街並み', title: 'こどもが安心して寄れるお店や{広場|ひろば}が少ない', description: '学校の帰りにみんなでおしゃべりしながら寄れる場所がありません。駄菓子屋さんや、放課後に自習したり友達とカードゲームができるこども食堂のような場所がほしいです。', status: 'approved' },
  { id: 'iss-6', election_id: 'ele-1', category: '安全・道路', title: '夜になると街灯（がいとう）が暗くて歩くのが怖い', description: '冬場など、塾（じゅく）の帰りに暗くなった道を歩くとき、街灯が少なくてとても暗い道があります。防犯（ぼうはん）のためにもっと明るいLEDライトを増やしてほしいです。', status: 'approved' }
];

const MOCK_OFFICIAL_QUESTIONS = [
  {
    id: 'oq-1',
    election_id: 'ele-1',
    title: '放課後（ほうかご）の安全な遊び場をどう増やしますか？',
    description: 'こどもたちが話し合い、「体を動かすのは大切」「雨の日も安心して集まれる場所がほしい」という意見が最も多く集まりました。',
    reason_selected: '「屋外・屋内の遊び場不足」が子どもたちの日常生活に一番大きな影響を与えているため、立候補者の考えを詳しく知る必要があると判断しました。',
    background: 'ワークショップに参加した全員の約60％が「放課後や休日に遊べる場所が少ない」とまとめたカードを出しました。「路上で遊んでいて叱られた」などの実体験も共有されました。',
    is_official: true,
    status: 'approved'
  },
  {
    id: 'oq-2',
    election_id: 'ele-1',
    title: '通学路（つうがくろ）の安全を守るためにどんな計画がありますか？',
    description: '「信号のない横断歩道」「暗い夜道」など、交通事故や防犯への不安に関するカードが多数あがりました。',
    reason_selected: '安全に関わる問題は「子どもの命を守る」ことに直結するため、全員一致で公式質問に選ばれました。',
    background: '小学校の通学路安全マップを元に議論し、「車がスピードを出して怖い」「押しボタン信号をつけてほしい」という切実な声がありました。',
    is_official: true,
    status: 'approved'
  }
];

const MOCK_QUESTIONS = [
  ...MOCK_OFFICIAL_QUESTIONS,
  {
    id: 'q-3',
    election_id: 'ele-1',
    title: '学校のタブレットをもっと楽しく活用するには？',
    description: '授業や自主学習でのタブレット制限緩和や、プログラミング教育について。',
    status: 'approved'
  }
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

const MOCK_ANSWERS = [
  { id: 'ans-a1', candidate_id: 'cand-a', question_id: 'oq-1', answer_text: '{車|くるま}が通らない{安全|あんぜん}な「どろんこ公園（こうえん）」を３つ新しくつくります。そこでは、ルールをなるべく少なくして、自由で冒険的な遊びができるようにします。', status: 'approved' },
  { id: 'ans-a2', candidate_id: 'cand-a', question_id: 'oq-2', answer_text: '通学路（つうがくろ）の危険（きけん）な交差点に、人感センサー付きのLED安全ライトと見守りカメラをすべて設置（せっち）します。', status: 'approved' },
  { id: 'ans-a3', candidate_id: 'cand-a', question_id: 'q-3', answer_text: '{教科書|きょうかしょ}を見るだけではなく、外の{自然|しぜん}をカメラで撮って{観察|かんさつ}する授業にタブレットを活用します。', status: 'approved' },
  { id: 'ans-b1', candidate_id: 'cand-b', question_id: 'oq-1', answer_text: '学校（がっこう）の校庭（こうてい）や体育館を放課後に開放して、{大学生|だいがくせい}のお兄さん・お姉さんと一緒に宿題（しゅくだい）やスポーツができる場をつくります。', status: 'approved' },
  { id: 'ans-b2', candidate_id: 'cand-b', question_id: 'oq-2', answer_text: 'すべての小学校周辺の通学路に、押しボタン式の信号機を増設（ぞうせつ）し、朝夕の登下校時にはボランティア見守り隊を増員します。', status: 'approved' },
  { id: 'ans-b3', candidate_id: 'cand-b', question_id: 'q-3', answer_text: '一人ひとりちがったドリルや、{対戦型|たいせんがた}の算数（さんすう）ゲームを導入（どうにゅう）して、遊ぶように学べる仕組みをつくります。', status: 'approved' },
  { id: 'ans-c1', candidate_id: 'cand-c', question_id: 'oq-1', answer_text: '駅前（えきまえ）の空きビルを改装して、{雨|あめ}の日でもトランポリンや工作ができる「室内（しつない）アドベンチャー広場」を完全無料で作ります。', status: 'approved' },
  { id: 'ans-c2', candidate_id: 'cand-c', question_id: 'oq-2', answer_text: '通学路全体の街灯（がいとう）を最新の明るいソーラーLEDに交換し、子どもが駆け込める「こども110番の家」を2倍に増やします。', status: 'approved' },
  { id: 'ans-c3', candidate_id: 'cand-c', question_id: 'q-3', answer_text: '{プログラミング|ぷろぐらみんぐ}や動画（どうが）編集を体験できるクラブ活動をすべての小中学校に用意します。', status: 'approved' }
];

const MOCK_GOVERNOR_POSTS = [
  { id: 'gov-1', nickname: 'ゆうき', title: '駅前に巨大なスケボーパークをつくる！', content: '安全な場所で自由にスケートボードやBMXが練習できる専用の公園をつくりたいです！', likes: 18, age_group: '小6' },
  { id: 'gov-2', nickname: 'あかり', title: '図書室にハンモックと漫画コーナーを置く！', content: '本を読むのが大好きなこどもが増えるように、リラックスして読書できる空間を作ります！', likes: 25, age_group: '中2' }
];

// --- 初期化処理 (Initialization) ---
async function initApp() {
  renderAuthHeaderWidget('index-auth-widget');
  initEventListeners();
  initGlobals();
  await loadElections();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// グローバル関数（HTML inline onclick用）
function initGlobals() {
  window.switchMainTab = switchMainTab;
  window.switchWorkshopSubtab = switchWorkshopSubtab;
  window.switchCandidatesSubtab = switchCandidatesSubtab;
  window.openCandidateDetail = openCandidateDetail;
  window.openQuestionDetail = openQuestionDetail;
  window.submitReaction = submitReaction;
}

// --- イベントリスナーの登録 ---
function initEventListeners() {
  // 1. ふりがな切り替えボタン
  const furiganaBtn = document.getElementById('furigana-toggle-btn');
  furiganaBtn.addEventListener('click', () => {
    state.furiganaEnabled = !state.furiganaEnabled;
    const btnText = document.getElementById('furigana-btn-text');
    
    if (state.furiganaEnabled) {
      document.body.classList.remove('hide-furigana');
      btnText.innerText = 'ふりがな ON';
    } else {
      document.body.classList.add('hide-furigana');
      btnText.innerText = 'ふりがな OFF';
    }
  });

  // 2. メインタブ (3 Main Tabs Navigation)
  document.getElementById('main-tab-top').addEventListener('click', () => switchMainTab('top'));
  document.getElementById('main-tab-workshop').addEventListener('click', () => switchMainTab('workshop'));
  document.getElementById('main-tab-candidates-answers').addEventListener('click', () => switchMainTab('candidates-answers'));

  // 3. ワークショップ サブタブ
  document.getElementById('ws-subtab-archive').addEventListener('click', () => switchWorkshopSubtab('archive'));
  document.getElementById('ws-subtab-issues').addEventListener('click', () => switchWorkshopSubtab('issues'));
  document.getElementById('ws-subtab-official').addEventListener('click', () => switchWorkshopSubtab('official'));
  document.getElementById('ws-subtab-quiz').addEventListener('click', () => switchWorkshopSubtab('quiz'));
  document.getElementById('ws-subtab-submit').addEventListener('click', () => switchWorkshopSubtab('submit'));

  // 4. 立候補者の回答 サブタブ
  document.getElementById('cand-subtab-comparison').addEventListener('click', () => switchCandidatesSubtab('comparison'));
  document.getElementById('cand-subtab-profiles').addEventListener('click', () => switchCandidatesSubtab('profiles'));
  document.getElementById('cand-subtab-ideas').addEventListener('click', () => switchCandidatesSubtab('ideas'));

  // 5. 選挙セレクター
  const electionSelect = document.getElementById('election-select');
  electionSelect.addEventListener('change', async (e) => {
    state.selectedElectionId = e.target.value;
    if (state.selectedElectionId) {
      await loadElectionData(state.selectedElectionId);
    } else {
      clearUI();
    }
  });

  // 6. モーダルイベント
  document.getElementById('candidate-modal-close').addEventListener('click', closeCandidateModal);
  document.getElementById('candidate-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('candidate-modal')) closeCandidateModal();
  });
  document.getElementById('question-modal-close').addEventListener('click', closeQuestionModal);
  document.getElementById('question-detail-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('question-detail-modal')) closeQuestionModal();
  });

  // 7. 課題検索
  const issueSearchInput = document.getElementById('issue-search-input');
  issueSearchInput.addEventListener('input', (e) => {
    state.issueSearchKeyword = e.target.value.trim().toLowerCase();
    renderIssues();
  });

  // 8. 「自分が知事なら」アイディア投稿フォーム
  setupGovernorIdeaForm();
}

// --- MAIN TAB SWITCHING (3 MAIN TABS) ---
// ボトムナビの各タブのカラー設定
const TAB_COLORS = {
  'top':                 { icon: '#4ea8de', bg: '#eff6ff', indicator: '#4ea8de' },
  'workshop':            { icon: '#06d6a0', bg: '#ecfdf5', indicator: '#06d6a0' },
  'candidates-answers':  { icon: '#f77f00', bg: '#fff7ed', indicator: '#f77f00' }
};

export function switchMainTab(tabName) {
  state.activeMainTab = tabName;

  const mainTabs = {
    'top': {
      btn: document.getElementById('main-tab-top'),
      sec: document.getElementById('section-top')
    },
    'workshop': {
      btn: document.getElementById('main-tab-workshop'),
      sec: document.getElementById('section-workshop')
    },
    'candidates-answers': {
      btn: document.getElementById('main-tab-candidates-answers'),
      sec: document.getElementById('section-candidates-answers')
    }
  };

  Object.keys(mainTabs).forEach(key => {
    const isTarget = key === tabName;
    const { btn, sec } = mainTabs[key];
    if (!btn || !sec) return;

    // --- セクション表示切り替え ---
    if (isTarget) {
      sec.style.display = 'block';
    } else {
      sec.style.display = 'none';
    }

    // --- ボトムナビ ビジュアル更新 ---
    const iconSpan      = btn.querySelector('.bottom-nav-icon');
    const labelSpan     = btn.querySelector('.bottom-nav-label');
    const indicatorSpan = btn.querySelector('.bottom-nav-indicator');

    if (isTarget) {
      const colors = TAB_COLORS[key];
      if (iconSpan) {
        iconSpan.style.backgroundColor = colors.bg;
        iconSpan.style.color           = colors.icon;
      }
      if (labelSpan) {
        labelSpan.style.color = colors.icon;
      }
      if (indicatorSpan) {
        indicatorSpan.style.width = '2rem';
        indicatorSpan.style.backgroundColor = colors.indicator;
      }
    } else {
      if (iconSpan) {
        iconSpan.style.backgroundColor = 'transparent';
        iconSpan.style.color           = '#94a3b8';
      }
      if (labelSpan) {
        labelSpan.style.color = '#94a3b8';
      }
      if (indicatorSpan) {
        indicatorSpan.style.width = '0';
      }
    }
  });

  // タブ切り替え時にページトップへスクロール（コンテンツが見えやすいように）
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Content render on activation
  if (tabName === 'top') renderTopSection();
  if (tabName === 'workshop') switchWorkshopSubtab(state.activeWorkshopSubtab);
  if (tabName === 'candidates-answers') switchCandidatesSubtab(state.activeCandidatesSubtab);
}

// --- WORKSHOP SUBTAB SWITCHING ---
export function switchWorkshopSubtab(subtabName) {
  state.activeWorkshopSubtab = subtabName;

  const subtabs = {
    'archive': { btn: document.getElementById('ws-subtab-archive'), panel: document.getElementById('ws-panel-archive') },
    'issues': { btn: document.getElementById('ws-subtab-issues'), panel: document.getElementById('ws-panel-issues') },
    'official': { btn: document.getElementById('ws-subtab-official'), panel: document.getElementById('ws-panel-official') },
    'quiz': { btn: document.getElementById('ws-subtab-quiz'), panel: document.getElementById('ws-panel-quiz') },
    'submit': { btn: document.getElementById('ws-subtab-submit'), panel: document.getElementById('ws-panel-submit') }
  };

  Object.keys(subtabs).forEach(key => {
    const isTarget = key === subtabName;
    const btn = subtabs[key].btn;
    const panel = subtabs[key].panel;

    if (isTarget) {
      btn.className = "px-4 py-2.5 rounded-xl border-2 border-slate-800 bg-kids-green text-slate-900 font-black text-xs sm:text-sm shadow-[2px_2px_0_#000] transition-all flex items-center gap-1.5";
      panel.style.display = 'block';
    } else {
      btn.className = "px-4 py-2.5 rounded-xl border-2 border-slate-800 bg-white text-slate-700 font-black text-xs sm:text-sm hover:bg-slate-100 transition-all flex items-center gap-1.5";
      panel.style.display = 'none';
    }
  });

  if (subtabName === 'archive') renderWorkshops();
  if (subtabName === 'issues') renderIssues();
  if (subtabName === 'official') renderOfficialQuestions();
  if (subtabName === 'quiz') renderQuiz();
  if (subtabName === 'submit') setupSubmitForm();
}

// --- CANDIDATES' ANSWERS SUBTAB SWITCHING ---
export function switchCandidatesSubtab(subtabName) {
  state.activeCandidatesSubtab = subtabName;

  const subtabs = {
    'comparison': { btn: document.getElementById('cand-subtab-comparison'), panel: document.getElementById('cand-panel-comparison') },
    'profiles': { btn: document.getElementById('cand-subtab-profiles'), panel: document.getElementById('cand-panel-profiles') },
    'ideas': { btn: document.getElementById('cand-subtab-ideas'), panel: document.getElementById('cand-panel-ideas') }
  };

  Object.keys(subtabs).forEach(key => {
    const isTarget = key === subtabName;
    const btn = subtabs[key].btn;
    const panel = subtabs[key].panel;

    if (isTarget) {
      btn.className = "px-5 py-2.5 rounded-xl border-2 border-slate-800 bg-kids-orange text-white font-black text-xs sm:text-sm shadow-[2px_2px_0_#000] transition-all flex items-center gap-1.5";
      panel.style.display = 'block';
    } else {
      btn.className = "px-5 py-2.5 rounded-xl border-2 border-slate-800 bg-white text-slate-700 font-black text-xs sm:text-sm hover:bg-slate-100 transition-all flex items-center gap-1.5";
      panel.style.display = 'none';
    }
  });

  if (subtabName === 'comparison') {
    renderComparisonQuestions();
    renderComparisonGrid();
  }
  if (subtabName === 'profiles') renderCandidates();
  if (subtabName === 'ideas') renderGovernorIdeas();
}

// --- データ読み込み処理 (Data Fetching via Supabase) ---
async function loadElections() {
  try {
    const { data, error } = await supabase
      .from('elections')
      .select('id, title, description, status')
      .order('id', { ascending: false });

    if (error) throw error;
    state.elections = data && data.length > 0 ? data : MOCK_ELECTIONS;
  } catch (err) {
    console.warn('Supabase DBフェッチエラー (デフォルト設定を使用):', err);
    state.elections = MOCK_ELECTIONS;
  }

  renderElectionSelect();
}

async function loadElectionData(electionId) {
  const loader = document.getElementById('section-loader');
  loader.classList.remove('hidden');

  try {
    const { data: candidates } = await supabase.from('candidates').select('*').eq('election_id', electionId);
    const { data: questions } = await supabase.from('questions').select('*').eq('election_id', electionId);
    const { data: workshops } = await supabase.from('workshops').select('*').eq('election_id', electionId);
    const { data: issues } = await supabase.from('issues').select('*').eq('election_id', electionId);

    state.candidates = (candidates && candidates.length > 0) ? candidates : MOCK_CANDIDATES.filter(c => c.election_id === electionId);
    state.questions = (questions && questions.length > 0) ? questions : MOCK_QUESTIONS.filter(q => q.election_id === electionId);
    state.officialQuestions = state.questions.filter(q => q.is_official);
    state.workshops = (workshops && workshops.length > 0) ? workshops : MOCK_WORKSHOPS.filter(w => w.election_id === electionId);
    state.issues = (issues && issues.length > 0) ? issues : MOCK_ISSUES.filter(i => i.election_id === electionId);

    const qIds = state.questions.map(q => q.id);
    if (qIds.length > 0) {
      const { data: answers } = await supabase.from('candidate_answers').select('*').in('question_id', qIds);
      state.candidateAnswers = (answers && answers.length > 0) ? answers : MOCK_ANSWERS;
      await fetchReactionCounts();
    } else {
      state.candidateAnswers = [];
      state.reactions = {};
    }

    loader.classList.add('hidden');
    switchMainTab(state.activeMainTab);

  } catch (err) {
    console.error('データ取得失敗:', err);
    showToast('データのよみこみにしっぱいしました。', 'error');
    loader.classList.add('hidden');
  }
}

async function fetchReactionCounts() {
  state.reactions = {};
  const ansIds = state.candidateAnswers.map(a => a.id);
  if (ansIds.length === 0) return;

  try {
    const { data } = await supabase.from('reactions').select('answer_id, type').in('answer_id', ansIds);
    ansIds.forEach(id => { state.reactions[id] = { agree: 0, difficult: 0, more_info: 0 }; });
    if (data) {
      data.forEach(item => {
        if (state.reactions[item.answer_id] && state.reactions[item.answer_id][item.type] !== undefined) {
          state.reactions[item.answer_id][item.type]++;
        }
      });
    }
  } catch (err) {
    console.warn('リアクション集計失敗:', err);
  }
}

function clearUI() {
  state.candidates = [];
  state.questions = [];
  state.candidateAnswers = [];
  state.workshops = [];
  state.issues = [];
  state.reactions = {};
  state.currentQuestionId = '';
  switchMainTab('top');
}

function renderElectionSelect() {
  const select = document.getElementById('election-select');
  select.innerHTML = '<option value="">-- 選挙をえらぶ --</option>';
  
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

// --- P01: TOP VIEW RENDER ---
function renderTopSection() {
  const selectedElection = state.elections.find(e => e.id === state.selectedElectionId);
  if (!selectedElection) return;

  document.getElementById('top-election-title').innerHTML = parseFurigana(selectedElection.title);
  document.getElementById('top-election-desc').innerHTML = parseFurigana(selectedElection.description);

  const status = selectedElection.status || '投票受付中';
  const badge = document.getElementById('top-status-badge');
  const statusText = document.getElementById('top-status-text');

  let badgeColor = 'bg-kids-mint';
  let desc = '投票がスタートしたよ！いいなと思う候補者を見つけて投票に行こう！';
  let activeStep = 4;

  if (status === '準備中') {
    badgeColor = 'bg-kids-orange';
    desc = '選挙のじゅんびをしているよ。まち探検や話し合いの記録を見てみよう！';
    activeStep = 1;
  } else if (status === '質問募集中') {
    badgeColor = 'bg-kids-yellow text-slate-800';
    desc = '候補者にききたい質問をあつめているよ！あなたも質問を投稿してみてね！';
    activeStep = 2;
  } else if (status === '回答公開中') {
    badgeColor = 'bg-kids-blue';
    desc = '候補者の回答（こたえ）が公開されたよ。意見くらべを見てみよう！';
    activeStep = 3;
  } else if (status === '結果発表中') {
    badgeColor = 'bg-kids-purple';
    desc = '投票の結果が発表されたよ！みんなの投票で選ばれた未来を見てみよう！';
    activeStep = 5;
  }

  badge.className = `px-4 py-2.5 rounded-2xl border-2 border-slate-800 text-white font-black text-base inline-block mb-3 ${badgeColor}`;
  badge.innerHTML = parseFurigana(`{${status}|${status}}`);
  statusText.innerText = desc;

  for (let i = 1; i <= 5; i++) {
    const card = document.getElementById(`step-card-${i}`);
    if (!card) continue;
    const numSpan = card.querySelector('span');
    if (i === activeStep) {
      card.className = "border-3 border-slate-800 rounded-2xl p-4 text-center bg-yellow-100 shadow-[2px_2px_0_#000] scale-105 transition-all space-y-2";
      numSpan.className = "w-7 h-7 rounded-full bg-kids-orange text-white font-black text-sm inline-flex items-center justify-center border border-slate-800";
    } else if (i < activeStep) {
      card.className = "border-2 border-slate-300 rounded-2xl p-4 text-center bg-emerald-50/50 opacity-80 transition-all space-y-2";
      numSpan.className = "w-7 h-7 rounded-full bg-kids-mint text-white font-black text-sm inline-flex items-center justify-center";
      numSpan.innerHTML = '<i class="fa-solid fa-check text-xs"></i>';
    } else {
      card.className = "border-2 border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50 opacity-60 transition-all space-y-2";
      numSpan.className = "w-7 h-7 rounded-full bg-slate-300 text-white font-black text-sm inline-flex items-center justify-center";
      numSpan.textContent = i;
    }
  }

  // Update stats summary
  document.getElementById('top-stat-issues').textContent = `${state.issues.length}件`;
  document.getElementById('top-stat-questions').textContent = `${state.officialQuestions.length || state.questions.length}問`;
  document.getElementById('top-stat-candidates').textContent = `${state.candidates.length}人`;
}

// --- P02: WORKSHOPS ARCHIVE RENDER ---
function renderWorkshops() {
  const container = document.getElementById('workshops-container');
  if (!container) return;
  container.innerHTML = '';

  if (state.workshops.length === 0) {
    container.innerHTML = `<div class="text-center py-12 bg-white border-2 border-dashed border-slate-300 rounded-3xl"><p class="text-sm font-bold text-slate-400">ワークショップのきろくはまだありません。</p></div>`;
    return;
  }

  state.workshops.forEach((ws, idx) => {
    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl overflow-hidden shadow-[4px_4px_0_#1e293b] flex flex-col md:flex-row gap-6 p-6 items-stretch";

    card.innerHTML = `
      <div class="md:w-1/3 min-h-[180px] rounded-2xl border-2 border-slate-800 overflow-hidden bg-slate-100 shrink-0">
        <img src="${ws.image_url}" alt="${ws.title}" class="w-full h-full object-cover">
      </div>
      <div class="flex-1 flex flex-col justify-between space-y-3">
        <div class="space-y-1.5">
          <div class="flex items-center gap-2">
            <span class="text-xs font-black px-2.5 py-1 rounded-full bg-kids-green border border-slate-800 text-slate-900">
              STEP ${idx + 1}
            </span>
            <span class="text-xs font-bold text-slate-400">📅 ${ws.date}</span>
          </div>
          <h3 class="text-lg sm:text-xl font-black text-slate-900">${parseFurigana(ws.title)}</h3>
          <p class="text-sm font-bold text-slate-600 leading-relaxed">${parseFurigana(ws.content)}</p>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// --- P03: ISSUES RENDER ---
function renderIssues() {
  const container = document.getElementById('issues-grid');
  const filterContainer = document.getElementById('issue-category-filters');
  if (!container || !filterContainer) return;
  
  if (filterContainer.children.length === 0) {
    const categories = ['すべて', ...new Set(state.issues.map(i => i.category).filter(Boolean))];
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `px-3.5 py-1.5 rounded-full text-xs font-black border-2 border-slate-800 shadow-[1px_2px_0_#000] active:translate-y-0.5 transition-all ${
        state.selectedIssueCategory === cat ? 'bg-kids-purple text-white' : 'bg-white text-slate-700 hover:bg-purple-50'
      }`;
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        state.selectedIssueCategory = cat;
        Array.from(filterContainer.children).forEach(b => {
          b.className = "px-3.5 py-1.5 rounded-full text-xs font-black border-2 border-slate-800 shadow-[1px_2px_0_#000] bg-white text-slate-700 hover:bg-purple-50 transition-all";
        });
        btn.className = "px-3.5 py-1.5 rounded-full text-xs font-black border-2 border-slate-800 shadow-[1px_2px_0_#000] bg-kids-purple text-white transition-all";
        renderIssues();
      });
      filterContainer.appendChild(btn);
    });
  }

  container.innerHTML = '';
  const filtered = state.issues.filter(iss => {
    const matchCategory = state.selectedIssueCategory === 'すべて' || iss.category === state.selectedIssueCategory;
    const matchKeyword = !state.issueSearchKeyword || 
      iss.title.toLowerCase().includes(state.issueSearchKeyword) || 
      iss.description.toLowerCase().includes(state.issueSearchKeyword);
    return matchCategory && matchKeyword;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center py-12 bg-white border-2 border-dashed border-slate-300 rounded-3xl"><p class="text-sm font-bold text-slate-400">該当する課題が見つかりませんでした。</p></div>`;
    return;
  }

  filtered.forEach(iss => {
    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0_#1e293b] hover:translate-y-[-2px] transition-all flex flex-col space-y-3";
    card.innerHTML = `
      <div>
        <span class="inline-block px-3 py-1 rounded-full text-xs font-black border-2 border-slate-800 bg-purple-100 text-purple-800">
          ${iss.category || 'その他'}
        </span>
      </div>
      <h3 class="text-base sm:text-lg font-black text-slate-900">${parseFurigana(iss.title)}</h3>
      <p class="text-xs sm:text-sm font-bold text-slate-500 leading-relaxed flex-1">${parseFurigana(iss.description)}</p>
    `;
    container.appendChild(card);
  });
}

// --- P05: OFFICIAL QUESTIONS RENDER ---
function renderOfficialQuestions() {
  const container = document.getElementById('official-questions-list');
  if (!container) return;
  container.innerHTML = '';

  const list = state.officialQuestions.length > 0 ? state.officialQuestions : state.questions;

  if (list.length === 0) {
    container.innerHTML = `<div class="text-center py-12 bg-white border-2 border-dashed border-slate-300 rounded-3xl"><p class="text-sm font-bold text-slate-400">公式質問はまだありません。</p></div>`;
    return;
  }

  list.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl overflow-hidden shadow-[4px_4px_0_#1e293b] space-y-4 p-6";

    card.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="px-3 py-1 rounded-full text-xs font-black bg-kids-yellow border-2 border-slate-800 text-slate-900">
          ⭐ 公式質問 No.${idx + 1}
        </span>
      </div>
      <h3 class="text-lg sm:text-xl font-black text-slate-900">${parseFurigana(q.title)}</h3>
      <p class="text-sm font-bold text-slate-600 leading-relaxed">${parseFurigana(q.description)}</p>
      <button onclick="openQuestionDetail('${q.id}')" class="px-5 py-2.5 rounded-2xl bg-white hover:bg-yellow-50 text-slate-800 font-black text-sm border-3 border-slate-800 shadow-[3px_3px_0_#000] active:translate-y-0.5 transition-all inline-flex items-center gap-2">
        <i class="fa-solid fa-magnifying-glass text-kids-yellow"></i> なぜこの質問になったの？ 詳しく見る
      </button>
    `;
    container.appendChild(card);
  });
}

// --- P06: QUESTION DETAIL MODAL ---
export function openQuestionDetail(questionId) {
  const q = state.questions.find(item => item.id === questionId) || state.officialQuestions.find(item => item.id === questionId);
  if (!q) return;

  const modalBody = document.getElementById('question-detail-modal-body');
  modalBody.innerHTML = `
    <div class="flex items-start gap-4 mb-6 pb-5 border-b-2 border-slate-100">
      <div class="w-12 h-12 rounded-2xl bg-kids-yellow border-2 border-slate-800 flex items-center justify-center text-2xl shrink-0">⭐</div>
      <div>
        <span class="text-xs font-black text-slate-400 uppercase tracking-widest">公式質問</span>
        <h3 class="text-xl sm:text-2xl font-black text-slate-900 mt-1">${parseFurigana(q.title)}</h3>
      </div>
    </div>
    <div class="space-y-4">
      <div class="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-5">
        <h4 class="text-sm font-black text-yellow-800 mb-2">💡 このしつもんのまとめ</h4>
        <p class="text-sm font-bold text-slate-700 leading-relaxed">${parseFurigana(q.description)}</p>
      </div>
      <div class="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
        <h4 class="text-sm font-black text-blue-800 mb-2">⭐ なぜこのしつもんを選んだの？</h4>
        <p class="text-sm font-bold text-slate-700 leading-relaxed">${parseFurigana(q.reason_selected || 'ワークショップで子どもたちが真剣に議論した結果選出されました。')}</p>
      </div>
    </div>
  `;

  const modal = document.getElementById('question-detail-modal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    document.getElementById('question-detail-modal-content').classList.remove('scale-95');
    document.getElementById('question-detail-modal-content').classList.add('scale-100');
  }, 10);
}

function closeQuestionModal() {
  const modal = document.getElementById('question-detail-modal');
  modal.classList.add('opacity-0');
  document.getElementById('question-detail-modal-content').classList.remove('scale-100');
  document.getElementById('question-detail-modal-content').classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

// --- P07: QUIZ SIMULATION ---
function renderQuiz() {
  const container = document.getElementById('quiz-container');
  const resultPanel = document.getElementById('quiz-result');
  if (!container || !resultPanel) return;

  resultPanel.classList.add('hidden');
  container.classList.remove('hidden');
  container.innerHTML = '';

  const pool = state.questions.length >= 2 ? state.questions : MOCK_QUESTIONS;
  const shuffled = shuffleArray(pool);
  state.quizCandidates = shuffled.slice(0, 2);

  const intro = document.createElement('div');
  intro.className = "bg-white border-3 border-slate-800 rounded-3xl p-6 text-center space-y-3 shadow-[4px_4px_0_#1e293b]";
  intro.innerHTML = `
    <div class="text-4xl">🧐</div>
    <h3 class="text-lg font-black text-slate-900">この2つの質問、どちらが大事だと思う？</h3>
    <p class="text-xs font-bold text-slate-500">あなたが重要だと思う方をタップしてみよう！</p>
  `;
  container.appendChild(intro);

  const grid = document.createElement('div');
  grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-6";

  state.quizCandidates.forEach(q => {
    const card = document.createElement('button');
    card.id = `quiz-card-${q.id}`;
    card.className = "bg-white border-3 border-slate-800 rounded-3xl p-6 text-left shadow-[4px_4px_0_#1e293b] hover:scale-[1.02] transition-all space-y-3 group cursor-pointer";
    card.innerHTML = `
      <div class="text-3xl">💡</div>
      <h4 class="text-base font-black text-slate-900">${parseFurigana(q.title)}</h4>
      <p class="text-xs font-bold text-slate-500">${parseFurigana(q.description || '')}</p>
      <div><span class="px-4 py-2 rounded-2xl bg-kids-yellow border-2 border-slate-800 text-xs font-black inline-block">✓ こっちを選ぶ</span></div>
    `;
    card.addEventListener('click', () => {
      document.getElementById('quiz-selected-question').innerHTML = parseFurigana(q.title);
      container.classList.add('hidden');
      resultPanel.classList.remove('hidden');
    });
    grid.appendChild(card);
  });

  container.appendChild(grid);
  document.getElementById('quiz-retry-btn').onclick = renderQuiz;
}

// --- P08: QUESTION FORM SETUP ---
let submitFormInitialized = false;
function setupSubmitForm() {
  if (submitFormInitialized) return;
  submitFormInitialized = true;

  const form = document.getElementById('question-submit-form');
  const contentTextarea = document.getElementById('submit-content');
  const contentCount = document.getElementById('submit-content-count');

  if (contentTextarea) {
    contentTextarea.addEventListener('input', () => {
      contentCount.textContent = `${contentTextarea.value.length} / 200`;
    });
  }

  document.getElementById('submit-another-btn').addEventListener('click', () => {
    document.getElementById('submit-success').classList.add('hidden');
    document.getElementById('submit-form-container').classList.remove('hidden');
    form.reset();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('submit-nickname').value.trim();
    const content = contentTextarea.value.trim();
    const reason = document.getElementById('submit-reason').value.trim();

    if (!nickname || !content || !reason) {
      showToast('必須項目をすべて入力してね！', 'error');
      return;
    }

    showToast('しつもんを送信しました！承認後に公開されるよ！', 'success');
    document.getElementById('submit-form-container').classList.add('hidden');
    document.getElementById('submit-success').classList.remove('hidden');
  });
}

// --- P09: CANDIDATES LIST RENDER ---
function renderCandidates() {
  const container = document.getElementById('candidates-grid');
  if (!container) return;
  container.innerHTML = '';

  const randomized = shuffleArray(state.candidates);

  randomized.forEach(cand => {
    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl overflow-hidden shadow-[4px_4px_0_#1e293b] flex flex-col p-6 items-center text-center space-y-4";

    card.innerHTML = `
      <div class="w-24 h-24 rounded-full border-3 border-slate-800 overflow-hidden bg-slate-100 shrink-0">
        <img src="${cand.avatar_url}" alt="${cand.name}" class="w-full h-full object-cover">
      </div>
      <div>
        <span class="inline-block px-3 py-1 rounded-full text-xs font-black bg-slate-100 border-2 border-slate-800 text-slate-700 mb-1">
          ${parseFurigana(cand.party)}
        </span>
        <h3 class="text-xl font-black text-slate-900">${parseFurigana(cand.name)}</h3>
      </div>
      <p class="text-xs sm:text-sm font-bold text-slate-600 leading-relaxed flex-1 text-left line-clamp-3">
        ${parseFurigana(cand.profile)}
      </p>
      <button onclick="openCandidateDetail('${cand.id}')" class="w-full py-3 rounded-2xl bg-kids-yellow hover:bg-yellow-400 text-slate-800 font-black text-sm border-3 border-slate-800 shadow-[3px_3px_0_#000] active:translate-y-0.5 transition-all">
        もっとくわしく見る！ 👀
      </button>
    `;
    container.appendChild(card);
  });
}

export function openCandidateDetail(candidateId) {
  const cand = state.candidates.find(c => c.id === candidateId);
  if (!cand) return;

  const modalBody = document.getElementById('candidate-modal-body');
  const answersHtml = state.questions.map(q => {
    const ans = state.candidateAnswers.find(a => a.candidate_id === cand.id && a.question_id === q.id);
    return `
      <div class="bg-orange-50/50 border-2 border-slate-800 rounded-2xl p-4 space-y-1.5">
        <h4 class="text-sm font-black text-slate-800">Q. ${parseFurigana(q.title)}</h4>
        <p class="text-xs sm:text-sm font-bold text-slate-700 leading-relaxed">${ans ? parseFurigana(ans.answer_text) : '回答準備中'}</p>
      </div>
    `;
  }).join('');

  modalBody.innerHTML = `
    <div class="flex items-center gap-4 pb-4 border-b-2 border-slate-100">
      <img src="${cand.avatar_url}" class="w-20 h-20 rounded-full border-2 border-slate-800 object-cover">
      <div>
        <span class="text-xs font-black bg-slate-100 border border-slate-800 px-2.5 py-0.5 rounded-full">${parseFurigana(cand.party)}</span>
        <h3 class="text-2xl font-black text-slate-900 mt-1">${parseFurigana(cand.name)}</h3>
      </div>
    </div>
    <div class="my-4 space-y-2">
      <h4 class="text-sm font-black text-slate-900">📢 プロフィール</h4>
      <p class="text-sm font-bold text-slate-600">${parseFurigana(cand.profile)}</p>
    </div>
    <div class="space-y-3">
      <h4 class="text-sm font-black text-slate-900">💬 しつもんへの回答</h4>
      ${answersHtml}
    </div>
  `;

  const modal = document.getElementById('candidate-modal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    document.getElementById('candidate-modal-content').classList.remove('scale-95');
    document.getElementById('candidate-modal-content').classList.add('scale-100');
  }, 10);
}

function closeCandidateModal() {
  const modal = document.getElementById('candidate-modal');
  modal.classList.add('opacity-0');
  document.getElementById('candidate-modal-content').classList.remove('scale-100');
  document.getElementById('candidate-modal-content').classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

// --- P10 & P11: COMPARISON & REACTION RENDER ---
function renderComparisonQuestions() {
  const container = document.getElementById('comparison-questions-container');
  if (!container) return;
  container.innerHTML = '';

  state.questions.forEach((q, idx) => {
    const btn = document.createElement('button');
    const isActive = state.currentQuestionId === q.id;
    btn.className = `px-4 py-2.5 rounded-2xl font-black text-xs sm:text-sm border-3 border-slate-800 shadow-[2px_2px_0_#000] active:translate-y-0.5 transition-all flex items-center gap-2 ${
      isActive ? 'bg-kids-orange text-white' : 'bg-white text-slate-800 hover:bg-orange-50'
    }`;
    btn.innerHTML = `<span class="w-5 h-5 rounded-full bg-white text-slate-800 text-xs flex items-center justify-center font-bold border border-slate-800">${idx + 1}</span> ${parseFurigana(q.title)}`;
    btn.addEventListener('click', () => {
      state.currentQuestionId = q.id;
      renderComparisonQuestions();
      renderComparisonGrid();
    });
    container.appendChild(btn);
  });

  if (!state.currentQuestionId && state.questions.length > 0) {
    state.currentQuestionId = state.questions[0].id;
    renderComparisonQuestions();
    renderComparisonGrid();
  }
}

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

  const relevant = state.candidateAnswers.filter(a => a.question_id === state.currentQuestionId);
  document.getElementById('answers-count').innerText = `回答: ${relevant.length}件`;
  grid.innerHTML = '';

  const randomized = shuffleArray(state.candidates);

  randomized.forEach(cand => {
    const ans = relevant.find(a => a.candidate_id === cand.id);
    if (!ans) return;
    const rStats = state.reactions[ans.id] || { agree: 0, difficult: 0, more_info: 0 };

    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0_#1e293b] flex flex-col space-y-4 relative";
    card.innerHTML = `
      <div class="flex items-center gap-3 border-b-2 border-slate-100 pb-3">
        <img src="${cand.avatar_url}" class="w-12 h-12 rounded-full border-2 border-slate-800 object-cover">
        <div>
          <span class="text-[0.65rem] font-black text-slate-400 block">${parseFurigana(cand.party)}</span>
          <h4 class="text-base font-black text-slate-900">${parseFurigana(cand.name)}</h4>
        </div>
      </div>
      <p class="text-xs sm:text-sm font-bold text-slate-700 leading-relaxed flex-1 whitespace-pre-wrap">${parseFurigana(ans.answer_text)}</p>
      <div class="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 space-y-2">
        <h5 class="text-[0.7rem] font-black text-slate-500 text-center uppercase">ワンタップでリアクション！</h5>
        <div class="grid grid-cols-3 gap-1.5">
          <button onclick="submitReaction('${ans.id}', 'agree', this)" class="flex flex-col items-center py-2 bg-white hover:bg-emerald-50 border-2 border-slate-800 rounded-xl active:scale-95 transition-all">
            <span class="text-base">なるほど💡</span>
            <span class="text-xs font-black mt-0.5" id="count-agree-${ans.id}">${rStats.agree}</span>
          </button>
          <button onclick="submitReaction('${ans.id}', 'difficult', this)" class="flex flex-col items-center py-2 bg-white hover:bg-yellow-50 border-2 border-slate-800 rounded-xl active:scale-95 transition-all">
            <span class="text-base">むずかしい🤔</span>
            <span class="text-xs font-black mt-0.5" id="count-difficult-${ans.id}">${rStats.difficult}</span>
          </button>
          <button onclick="submitReaction('${ans.id}', 'more_info', this)" class="flex flex-col items-center py-2 bg-white hover:bg-blue-50 border-2 border-slate-800 rounded-xl active:scale-95 transition-all">
            <span class="text-base">もっと知りたい✨</span>
            <span class="text-xs font-black mt-0.5" id="count-more_info-${ans.id}">${rStats.more_info}</span>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

export function submitReaction(answerId, type, btnElement) {
  const bubble = document.createElement('span');
  bubble.innerText = type === 'agree' ? '💡' : type === 'difficult' ? '🤔' : '✨';
  bubble.className = "absolute text-2xl pointer-events-none select-none z-50 animate-float-emoji";
  
  const rect = btnElement.getBoundingClientRect();
  const cardRect = btnElement.closest('.relative').getBoundingClientRect();
  bubble.style.left = `${rect.left - cardRect.left + (rect.width / 2) - 12}px`;
  bubble.style.top = `${rect.top - cardRect.top - 10}px`;
  btnElement.closest('.relative').appendChild(bubble);
  setTimeout(() => bubble.remove(), 800);

  if (!state.reactions[answerId]) state.reactions[answerId] = { agree: 0, difficult: 0, more_info: 0 };
  state.reactions[answerId][type]++;

  const counterSpan = document.getElementById(`count-${type}-${answerId}`);
  if (counterSpan) counterSpan.innerText = state.reactions[answerId][type];

  showToast('リアクションを送ったよ！', 'success');
}

// --- MY GOVERNOR IDEAS ---
function setupGovernorIdeaForm() {
  const form = document.getElementById('governor-idea-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nickname = document.getElementById('idea-nickname').value.trim();
    const title = document.getElementById('idea-title').value.trim();
    const content = document.getElementById('idea-content').value.trim();

    if (!nickname || !title || !content) return;

    state.governorPosts.unshift({
      id: `gov-${Date.now()}`,
      nickname,
      title,
      content,
      likes: 1,
      age_group: 'こども'
    });

    form.reset();
    showToast('アイディアを投稿しました！', 'success');
    renderGovernorIdeas();
  });
}

function renderGovernorIdeas() {
  const feed = document.getElementById('governor-ideas-feed');
  if (!feed) return;
  feed.innerHTML = '';

  state.governorPosts.forEach(post => {
    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl p-5 shadow-[3px_3px_0_#1e293b] space-y-2";
    card.innerHTML = `
      <div class="flex justify-between items-center">
        <span class="text-xs font-black px-2.5 py-0.5 rounded-full bg-purple-100 border border-slate-800 text-purple-800">${post.nickname} (${post.age_group || 'こども'})</span>
        <button onclick="this.querySelector('.like-count').innerText = parseInt(this.querySelector('.like-count').innerText)+1" class="text-xs font-black text-rose-500 bg-rose-50 border border-rose-200 px-3 py-1 rounded-full active:scale-95 transition-all">
          ❤️ いいね！ <span class="like-count">${post.likes}</span>
        </button>
      </div>
      <h4 class="text-base font-black text-slate-900">${escapeHtml(post.title)}</h4>
      <p class="text-xs sm:text-sm font-bold text-slate-600 leading-relaxed">${escapeHtml(post.content)}</p>
    `;
    feed.appendChild(card);
  });
}
