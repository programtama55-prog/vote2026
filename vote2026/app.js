import { supabase } from '@/lib/supabase.js';
import { parseFurigana, shuffleArray, showToast, escapeHtml } from '@/lib/utils.js';

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
  selectedIssueCategory: 'すべて',
  issueSearchKeyword: '',
  reactions: {}, // answerId -> { agree: count, difficult: count, more_info: count }
  currentQuestionId: '',
  activeTab: 'top',
  furiganaEnabled: true,
  isMockData: false,
  // P07 quiz state
  quizCandidates: [],   // 2 randomly chosen questions for a round
  quizSelectedId: null, // user's choice
  // P08 submission rate limit
  lastSubmitTime: 0
};

// --- モックデータ (Supabase接続が未設定・失敗した場合のフォールバック) ---
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
  },
  {
    id: 'q-3',
    election_id: 'ele-1',
    title: '夜の街灯（がいとう）や{\u901a\u5b66\u8def|\u3064\u3046\u304c\u304f\u308d}の{\u5b89\u5168|\u3042\u3093\u305c\u3093}について',
    description: '子どもたちが{\u5b89\u5168|\u3042\u3093\u305c\u3093}に{\u904e\u3054|\u3059\u3054}せるまちの{\u5b89\u5168|\u3042\u3093\u305c\u3093}対策について。',
    status: 'approved'
  }
];

// P05用公式質問モックデータ（is_official = true）
const MOCK_OFFICIAL_QUESTIONS = [
  {
    id: 'oq-1',
    election_id: 'ele-1',
    title: '放課後（ほうかご）の遊び場をどうしますか？',
    description: 'こどもたちが话し合い、「体を卒動すのは年齢にかかわらず大事」「体を動かす内容なら笑いあうながら学べる」という意見が小学生から多くあがりました。',
    reason_selected: '「屋外での遊び場」が全体のテーマの中で最も多くの議論を集めたため、こうほしゃに詳しく意見をたずねるべきだと判断しました。',
    background: 'ワークショップに参加した全勠の約60％が「放課後や休日に遊べる屋外の場所が少ない」とまとめたカードを上げました。「路上で頑張って遭球をしていて「危ない」と怎るられる」「がっかり屋外に出れない」という具体的な体験談も共有されました。',
    is_official: true,
    status: 'approved'
  },
  {
    id: 'oq-2',
    election_id: 'ele-1',
    title: '子どもたちが安全に{\u8857|\u307e\u3061}を歩けるようにするためにどんな小開計画がありますか？',
    description: '小学中学年から「夜道が暗い」「横断歩道が少ない」という危険に面した体験に関するカードが多数あがりました。',
    reason_selected: '安全に関わる議論は「こどものいのちを守る」ことに直結することから、選定質問の中に必ず入れるべきだと結論づけました。',
    background: '小学校の通学路安全マップを元に議論し、「一人で歩くとき退屈を強いられそうになる場所」「車が濃いてひとりで歩けない」など具体的な容誎が出ました。小中学生の自身の安全を兑る本質的な問題として手を上げる動きが強い質問でした。',
    is_official: true,
    status: 'approved'
  }
];

const MOCK_ANSWERS = [
  { id: 'ans-a1', candidate_id: 'cand-a', question_id: 'q-1', answer_text: '{車|くるま}が通らない{安全|あんぜん}な「どろんこ公園（こうえん）」を３つ新しくつくります。そこでは、ルールをなるべく少なくして、自由に遊べるようにします。', status: 'approved' },
  { id: 'ans-a2', candidate_id: 'cand-a', question_id: 'q-2', answer_text: '{教科書|きょうかしょ}を見るだけではなく、外の{自然|しぜん}をカメラで撮って{観察|かんさつ}する授業にタブレットを活用します。', status: 'approved' },
  { id: 'ans-b1', candidate_id: 'cand-b', question_id: 'q-1', answer_text: '学校（がっこう）の校庭（こうてい）を放課後に開放して、{大学生|だいがくせい}のボランティアのお兄さん・お姉さんと一緒に宿題（しゅくだい）やスポーツができる場をつくります。', status: 'approved' },
  { id: 'ans-b2', candidate_id: 'cand-b', question_id: 'q-2', answer_text: '一人ひとりちがったドリルや、{対戦型|たいせんがた}の算数（さんすう）ゲームを導入（どうにゅう）して、遊ぶように学べる仕組みをつくります。', status: 'approved' },
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
  // 1. ふりがな切り替えボタン
  const furiganaBtn = document.getElementById('furigana-toggle-btn');
  furiganaBtn.addEventListener('click', () => {
    state.furiganaEnabled = !state.furiganaEnabled;
    const btnText = document.getElementById('furigana-btn-text');
    
    if (state.furiganaEnabled) {
      document.body.classList.remove('hide-furigana');
      btnText.innerText = 'ふりがな を はずす';
    } else {
      document.body.classList.add('hide-furigana');
      btnText.innerText = 'ふりがな を つける';
    }
  });

  // 2. 画面切り替えタブ (P01-P08, P09-P11のフルバインド)
  const tabs = {
    'top':               { btn: document.getElementById('tab-top'),                sec: document.getElementById('section-top'),                color: 'bg-kids-blue' },
    'workshops':         { btn: document.getElementById('tab-workshops'),          sec: document.getElementById('section-workshops'),          color: 'bg-kids-green' },
    'issues':            { btn: document.getElementById('tab-issues'),             sec: document.getElementById('section-issues'),             color: 'bg-kids-purple' },
    'official-questions':{ btn: document.getElementById('tab-official-questions'), sec: document.getElementById('section-official-questions'), color: 'bg-kids-yellow' },
    'quiz':              { btn: document.getElementById('tab-quiz'),               sec: document.getElementById('section-quiz'),               color: 'bg-kids-red' },
    'submit':            { btn: document.getElementById('tab-submit'),             sec: document.getElementById('section-submit'),             color: 'bg-kids-mint' },
    'candidates':        { btn: document.getElementById('tab-candidates'),         sec: document.getElementById('section-candidates'),         color: 'bg-kids-blue' },
    'comparison':        { btn: document.getElementById('tab-comparison'),         sec: document.getElementById('section-comparison'),         color: 'bg-kids-orange' }
  };

  Object.keys(tabs).forEach(tabKey => {
    tabs[tabKey].btn.addEventListener('click', () => {
      state.activeTab = tabKey;
      
      // 全タブのアクティブクラス解除
      Object.keys(tabs).forEach(k => {
        tabs[k].btn.className = "px-5 py-3.5 rounded-2xl border-3 border-slate-800 bg-white text-sm sm:text-base font-black text-slate-800 shadow-[3px_3px_0_#1e293b] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center gap-2";
        tabs[k].sec.classList.add('hidden');
      });

      // アクティブタブのスタイル設定
      tabs[tabKey].btn.className = `px-5 py-3.5 rounded-2xl border-3 border-slate-800 ${tabs[tabKey].color} text-white text-sm sm:text-base font-black shadow-[3px_3px_0_#1e293b] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center gap-2`;
      tabs[tabKey].sec.classList.remove('hidden');

      // 必要に応じた遅延読み込み/レンダリング
      if (tabKey === 'top') renderTopSection();
      if (tabKey === 'workshops') renderWorkshops();
      if (tabKey === 'issues') renderIssues();
      if (tabKey === 'official-questions') renderOfficialQuestions();
      if (tabKey === 'quiz') renderQuiz();
      if (tabKey === 'submit') setupSubmitForm();
      if (tabKey === 'candidates') renderCandidates();
      if (tabKey === 'comparison') {
        renderComparisonQuestions();
        renderComparisonGrid();
      }
    });
  });

  // 初期タブアクティブ
  tabs['top'].btn.click();

  // 3. 選挙セレクター
  const electionSelect = document.getElementById('election-select');
  electionSelect.addEventListener('change', async (e) => {
    state.selectedElectionId = e.target.value;
    if (state.selectedElectionId) {
      await loadElectionData(state.selectedElectionId);
    } else {
      clearUI();
    }
  });

  // 4. モーダル
  const modalClose = document.getElementById('candidate-modal-close');
  modalClose.addEventListener('click', closeCandidateModal);
  const modal = document.getElementById('candidate-modal');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCandidateModal();
  });

  // 5. 課題検索・フィルターイベント
  const issueSearchInput = document.getElementById('issue-search-input');
  issueSearchInput.addEventListener('input', (e) => {
    state.issueSearchKeyword = e.target.value.trim().toLowerCase();
    renderIssues();
  });

  // 6. 質問詳細モーダルの閉じるボタン (P06)
  const questionModalClose = document.getElementById('question-modal-close');
  questionModalClose.addEventListener('click', closeQuestionModal);
  const questionModal = document.getElementById('question-detail-modal');
  questionModal.addEventListener('click', (e) => {
    if (e.target === questionModal) closeQuestionModal();
  });
}

// --- データ読み込み処理 (Data Fetching via Supabase) ---

// すべての選挙をロード
async function loadElections() {
  try {
    const { data, error } = await supabase
      .from('elections')
      .select('id, title, description, status')
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

// 選挙詳細データの取得 (P01-P03 & P09-P11の全取得)
async function loadElectionData(electionId) {
  // セクションローダーを表示
  const loader = document.getElementById('section-loader');
  loader.classList.remove('hidden');

  if (state.isMockData) {
    state.candidates = MOCK_CANDIDATES.filter(c => c.election_id === electionId);
    state.questions = MOCK_QUESTIONS.filter(q => q.election_id === electionId);
    state.officialQuestions = MOCK_OFFICIAL_QUESTIONS.filter(oq => oq.election_id === electionId);
    state.workshops = MOCK_WORKSHOPS.filter(w => w.election_id === electionId);
    state.issues = MOCK_ISSUES.filter(i => i.election_id === electionId);
    
    const qIds = state.questions.map(q => q.id);
    state.candidateAnswers = MOCK_ANSWERS.filter(a => qIds.includes(a.question_id));
    
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
      // アクティブタブのコンテンツを描画
      tabsTriggerActive();
    }, 400);
    return;
  }

  try {
    // 1. 候補者
    const { data: candidates, error: candErr } = await supabase
      .from('candidates')
      .select('id, name, party, avatar_url, profile')
      .eq('election_id', electionId)
      .eq('status', 'approved');
    if (candErr) throw candErr;
    state.candidates = candidates;

    // 2. 質問
    const { data: questions, error: qErr } = await supabase
      .from('questions')
      .select('id, title, description')
      .eq('election_id', electionId)
      .eq('status', 'approved');
    if (qErr) throw qErr;
    state.questions = questions;

    // 3. ワークショップ (workshops)
    const { data: workshops, error: wsErr } = await supabase
      .from('workshops')
      .select('id, title, date, content, image_url')
      .eq('election_id', electionId)
      .eq('status', 'approved')
      .order('date', { ascending: true });
    if (wsErr) throw wsErr;
    state.workshops = workshops;

    // 4. 地域課題 (issues)
    const { data: issues, error: issErr } = await supabase
      .from('issues')
      .select('id, category, title, description')
      .eq('election_id', electionId)
      .eq('status', 'approved');
    if (issErr) throw issErr;
    state.issues = issues;

    // 5. 回答 & リアクション
    const qIds = questions.map(q => q.id);
    if (qIds.length > 0) {
      const { data: answers, error: ansErr } = await supabase
        .from('candidate_answers')
        .select('id, candidate_id, question_id, answer_text')
        .in('question_id', qIds)
        .eq('status', 'approved');
      if (ansErr) throw ansErr;
      state.candidateAnswers = answers;
      await fetchReactionCounts();
    } else {
      state.candidateAnswers = [];
      state.reactions = {};
    }

    loader.classList.add('hidden');
    tabsTriggerActive();

  } catch (err) {
    console.error('データの取得に失敗しました:', err);
    showToast('データのよみこみにしっぱいしました。', 'error');
    loader.classList.add('hidden');
  }
}

// 選択中のアクティブタブを再レンダリングするヘルパー
function tabsTriggerActive() {
  const tabBtn = document.getElementById(`tab-${state.activeTab}`);
  if (tabBtn) tabBtn.click();
}

async function fetchReactionCounts() {
  state.reactions = {};
  const ansIds = state.candidateAnswers.map(a => a.id);
  if (ansIds.length === 0) return;

  try {
    const { data, error } = await supabase
      .from('reactions')
      .select('answer_id, type')
      .in('answer_id', ansIds);

    if (error) throw error;

    ansIds.forEach(id => {
      state.reactions[id] = { agree: 0, difficult: 0, more_info: 0 };
    });

    data.forEach(item => {
      if (state.reactions[item.answer_id] && state.reactions[item.answer_id][item.type] !== undefined) {
        state.reactions[item.answer_id][item.type]++;
      }
    });
  } catch (err) {
    console.warn('リアクション数の集計に失敗しました:', err);
    ansIds.forEach(id => {
      state.reactions[id] = { agree: 0, difficult: 0, more_info: 0 };
    });
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
  tabsTriggerActive();
}

// --- レンダリング処理 (Rendering) ---

// 選挙の選択肢を表示
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

// P01: トップ画面のレンダリング
function renderTopSection() {
  const selectedElection = state.elections.find(e => e.id === state.selectedElectionId);
  if (!selectedElection) return;

  document.getElementById('top-election-title').innerHTML = parseFurigana(selectedElection.title);
  document.getElementById('top-election-desc').innerHTML = parseFurigana(selectedElection.description);

  // ステータスバッジの設定 (準備中 / 質問募集中 / 回答公開中 / 投票受付中 / 結果発表中)
  const status = selectedElection.status || '準備中';
  const badge = document.getElementById('top-status-badge');
  const statusText = document.getElementById('top-status-text');

  let badgeColor = 'bg-slate-500';
  let desc = '準備中（じゅんびちゅう）です。';
  let activeStep = 1;

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
  } else if (status === '投票受付中') {
    badgeColor = 'bg-kids-mint';
    desc = '投票がスタートしたよ！いいなと思う候補者を見つけて投票に行こう！';
    activeStep = 4;
  } else if (status === '結果発表中') {
    badgeColor = 'bg-kids-purple';
    desc = '投票の結果が発表されたよ！みんなの投票で選ばれた未来を見てみよう！';
    activeStep = 5;
  }

  badge.className = `px-4 py-2.5 rounded-2xl border-2 border-slate-800 text-white font-black text-base inline-block mb-3 ${badgeColor}`;
  badge.innerHTML = parseFurigana(`{${status}|${status.replace(/ /g, '')}}`);
  statusText.innerText = desc;

  // 進捗ステップのハイライト表示
  for (let i = 1; i <= 5; i++) {
    const card = document.getElementById(`step-card-${i}`);
    const numSpan = card.querySelector('span');
    
    if (i === activeStep) {
      // アクティブステップ
      card.className = "border-3 border-slate-800 rounded-2xl p-4 text-center bg-yellow-100 shadow-[2px_2px_0_#000] scale-105 transition-all space-y-2";
      numSpan.className = "w-7 h-7 rounded-full bg-kids-orange text-white font-black text-sm inline-flex items-center justify-center border border-slate-800";
    } else if (i < activeStep) {
      // 完了済みステップ
      card.className = "border-2 border-slate-300 rounded-2xl p-4 text-center bg-emerald-50/50 opacity-80 transition-all space-y-2";
      numSpan.className = "w-7 h-7 rounded-full bg-kids-mint text-white font-black text-sm inline-flex items-center justify-center";
      numSpan.innerHTML = '<i class="fa-solid fa-check text-xs"></i>';
    } else {
      // 未到達ステップ
      card.className = "border-2 border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50 opacity-60 transition-all space-y-2";
      numSpan.className = "w-7 h-7 rounded-full bg-slate-300 text-white font-black text-sm inline-flex items-center justify-center";
      numSpan.textContent = i;
    }
  }
}

// P02: ワークショップアーカイブのレンダリング
function renderWorkshops() {
  const container = document.getElementById('workshops-container');
  container.innerHTML = '';

  if (state.workshops.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 bg-white border-2 border-dashed border-slate-300 rounded-3xl">
        <p class="text-sm font-bold text-slate-400">ワークショップ（会議）のきろくはまだありません。</p>
      </div>
    `;
    return;
  }

  state.workshops.forEach((ws, idx) => {
    const card = document.createElement('div');
    // 子ども向けのタイムライン形式
    card.className = "bg-white border-3 border-slate-800 rounded-3xl overflow-hidden shadow-[4px_4px_0_#1e293b] flex flex-col md:flex-row gap-6 p-6 items-stretch relative";

    const formattedDate = new Date(ws.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

    card.innerHTML = `
      <!-- 会議写真（Unsplash等のモックまたはDB画像のURL） -->
      <div class="md:w-1/3 min-h-[180px] rounded-2xl border-2 border-slate-800 overflow-hidden bg-slate-100 relative shrink-0">
        <img src="${ws.image_url || 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=300'}" 
             alt="${ws.title}" 
             class="w-full h-full object-cover">
      </div>

      <!-- 会議情報 -->
      <div class="flex-1 flex flex-col justify-between space-y-3">
        <div class="space-y-1.5">
          <div class="flex items-center gap-2">
            <span class="text-xs font-black px-2.5 py-1 rounded-full bg-kids-green border border-slate-800 text-slate-800">
              STEP ${idx + 1}
            </span>
            <span class="text-xs font-bold text-slate-400">📅 ${formattedDate}</span>
          </div>
          <h3 class="text-lg sm:text-xl font-black text-slate-900">
            ${parseFurigana(ws.title)}
          </h3>
          <p class="text-sm font-bold text-slate-600 leading-relaxed">
            ${parseFurigana(ws.content)}
          </p>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// P03: まちの課題一覧のレンダリング
function renderIssues() {
  const container = document.getElementById('issues-grid');
  const filterContainer = document.getElementById('issue-category-filters');
  
  // 1. カテゴリーフィルターボタン群のレンダリング (初回のみ、またはカテゴリーリストが空の時)
  if (filterContainer.children.length === 0) {
    const categories = ['すべて', ...new Set(state.issues.map(i => i.category).filter(Boolean))];
    
    categories.forEach(cat => {
      const btn = document.createElement('button');
      const isActive = state.selectedIssueCategory === cat;
      btn.className = `px-3.5 py-1.5 rounded-full text-xs font-black border-2 border-slate-800 shadow-[1px_2px_0_#000] active:translate-y-0.5 active:shadow-[0_0_0_#000] transition-all ${
        isActive ? 'bg-kids-purple text-white' : 'bg-white text-slate-700 hover:bg-purple-50'
      }`;
      btn.textContent = cat;
      
      btn.addEventListener('click', () => {
        state.selectedIssueCategory = cat;
        // フィルター再描画
        Array.from(filterContainer.children).forEach(b => {
          b.className = "px-3.5 py-1.5 rounded-full text-xs font-black border-2 border-slate-800 shadow-[1px_2px_0_#000] bg-white text-slate-700 hover:bg-purple-50 transition-all";
        });
        btn.className = "px-3.5 py-1.5 rounded-full text-xs font-black border-2 border-slate-800 shadow-[1px_2px_0_#000] bg-kids-purple text-white transition-all";
        renderIssues();
      });
      filterContainer.appendChild(btn);
    });
  }

  // 2. 課題カードのレンダリング
  container.innerHTML = '';

  // 検索とカテゴリーでフィルタリング
  const filtered = state.issues.filter(iss => {
    const matchCategory = state.selectedIssueCategory === 'すべて' || iss.category === state.selectedIssueCategory;
    const matchKeyword = !state.issueSearchKeyword || 
      iss.title.toLowerCase().includes(state.issueSearchKeyword) || 
      iss.description.toLowerCase().includes(state.issueSearchKeyword);
    return matchCategory && matchKeyword;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-white border-2 border-dashed border-slate-300 rounded-3xl">
        <p class="text-sm font-bold text-slate-400">該当する課題（かだい）が見つかりませんでした。</p>
      </div>
    `;
    return;
  }

  filtered.forEach(iss => {
    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl p-5 shadow-[4px_4px_0_#1e293b] hover:translate-y-[-2px] transition-all flex flex-col space-y-3";

    // カテゴリー別のアクセントカラー
    let catColor = 'bg-slate-100 text-slate-700';
    if (iss.category === 'あそび場') catColor = 'bg-kids-blue/20 text-blue-800 border-kids-blue/30';
    else if (iss.category === '安全・道路') catColor = 'bg-kids-orange/20 text-orange-800 border-kids-orange/30';
    else if (iss.category === '学校・教育') catColor = 'bg-kids-green/20 text-emerald-800 border-kids-green/30';
    else if (iss.category === 'お店・街並み') catColor = 'bg-kids-purple/20 text-purple-800 border-kids-purple/30';

    card.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="inline-block px-3 py-1 rounded-full text-xs font-black border-2 border-slate-800 ${catColor}">
          ${iss.category || 'その他'}
        </span>
      </div>
      <h3 class="text-base sm:text-lg font-black text-slate-900">
        ${parseFurigana(iss.title)}
      </h3>
      <p class="text-xs sm:text-sm font-bold text-slate-500 leading-relaxed flex-1">
        ${parseFurigana(iss.description)}
      </p>
    `;
    container.appendChild(card);
  });
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

  const randomizedCandidates = shuffleArray(state.candidates);

  randomizedCandidates.forEach(cand => {
    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl overflow-hidden shadow-[4px_4px_0_#1e293b] hover:translate-y-[-4px] hover:shadow-[6px_6px_0_#1e293b] transition-all flex flex-col";
    
    const accentColors = ['bg-kids-blue', 'bg-kids-orange', 'bg-kids-green', 'bg-kids-red', 'bg-kids-purple'];
    const accentClass = accentColors[Math.abs(cand.name.length) % accentColors.length];

    card.innerHTML = `
      <div class="h-4 ${accentClass} border-b-2 border-slate-800"></div>
      
      <div class="p-6 flex-1 flex flex-col items-center text-center space-y-4">
        <div class="w-28 h-28 rounded-full border-3 border-slate-800 overflow-hidden bg-slate-100 shadow-sm relative">
          <img src="${cand.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}" 
               alt="${cand.name}" 
               class="w-full h-full object-cover">
        </div>

        <div>
          <span class="inline-block px-3 py-1 rounded-full text-xs font-black bg-slate-100 border-2 border-slate-800 text-slate-700 mb-1">
            ${parseFurigana(cand.party)}
          </span>
          <h3 class="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            ${parseFurigana(cand.name)}
          </h3>
        </div>

        <p class="text-sm font-bold text-slate-600 leading-relaxed text-left flex-1 line-clamp-3">
          ${parseFurigana(cand.profile)}
        </p>
        
        <button onclick="openCandidateDetail('${cand.id}')" 
                class="w-full py-3.5 px-6 rounded-2xl bg-kids-yellow hover:bg-yellow-400 text-slate-800 font-black text-base border-3 border-slate-800 shadow-[3px_3px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0_#000] transition-all">
          もっとくわしく見る！ 👀
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

// 候補者詳細モーダルの表示
window.openCandidateDetail = function(candidateId) {
  const cand = state.candidates.find(c => c.id === candidateId);
  if (!cand) return;

  const modalBody = document.getElementById('candidate-modal-body');
  
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

// P10: しつもん選択ボタンのレンダリング
function renderComparisonQuestions() {
  const container = document.getElementById('comparison-questions-container');
  container.innerHTML = '';

  if (state.questions.length === 0) {
    container.innerHTML = '<p class="text-sm font-bold text-slate-400">しつもんがまだ登録されていません。</p>';
    return;
  }

  state.questions.forEach((q, idx) => {
    const btn = document.createElement('button');
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

// P10 & P11: 回答比較グリッドのレンダリング
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

  const randomizedCandidates = shuffleArray(state.candidates);

  randomizedCandidates.forEach(cand => {
    const ans = relevantAnswers.find(a => a.candidate_id === cand.id);
    if (!ans) return;

    const rStats = state.reactions[ans.id] || { agree: 0, difficult: 0, more_info: 0 };

    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl p-6 shadow-[4px_4px_0_#1e293b] flex flex-col space-y-4 hover:shadow-[6px_6px_0_#1e293b] hover:translate-y-[-2px] transition-all relative";
    
    card.innerHTML = `
      <div class="flex items-center gap-3 border-b-2 border-slate-100 pb-3">
        <div class="w-12 h-12 rounded-full border-2 border-slate-800 overflow-hidden bg-slate-100 shrink-0">
          <img src="${cand.avatar_url}" alt="${cand.name}" class="w-full h-full object-cover">
        </div>
        <div>
          <span class="text-[0.65rem] font-black text-slate-400 block">${parseFurigana(cand.party)}</span>
          <h4 class="text-base font-black text-slate-900">${parseFurigana(cand.name)}</h4>
        </div>
      </div>

      <p class="text-sm font-bold text-slate-700 leading-relaxed flex-1 whitespace-pre-wrap">
        ${parseFurigana(ans.answer_text)}
      </p>

      <div class="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 space-y-2">
        <h5 class="text-[0.7rem] font-black text-slate-500 text-center uppercase tracking-wider">
          読んでどう思った？（１タップでおうえん！）
        </h5>
        
        <div class="grid grid-cols-3 gap-1.5">
          <button onclick="submitReaction('${ans.id}', 'agree', this)" 
                  class="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-emerald-50 border-2 border-slate-800 text-slate-800 active:scale-[0.95] transition-all shadow-[1px_2px_0_#000]">
            <span class="text-lg">なるほど💡</span>
            <span class="text-xs font-black text-slate-600 mt-1" id="count-agree-${ans.id}">${rStats.agree}</span>
          </button>

          <button onclick="submitReaction('${ans.id}', 'difficult', this)" 
                  class="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-yellow-50 border-2 border-slate-800 text-slate-800 active:scale-[0.95] transition-all shadow-[1px_2px_0_#000]">
            <span class="text-lg">むずかしい🤔</span>
            <span class="text-xs font-black text-slate-600 mt-1" id="count-difficult-${ans.id}">${rStats.difficult}</span>
          </button>

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
  createBubbleEffect(btnElement, type);

  if (state.reactions[answerId]) {
    state.reactions[answerId][type]++;
  } else {
    state.reactions[answerId] = { agree: 0, difficult: 0, more_info: 0 };
    state.reactions[answerId][type] = 1;
  }

  const counterSpan = document.getElementById(`count-${type}-${answerId}`);
  if (counterSpan) {
    counterSpan.innerText = state.reactions[answerId][type];
  }

  if (state.isMockData) return;

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
  }
};

function createBubbleEffect(element, type) {
  const emojis = { agree: '💡', difficult: '🤔', more_info: '✨' };
  const bubble = document.createElement('span');
  bubble.innerText = emojis[type] || '👍';
  bubble.className = "absolute text-2xl pointer-events-none select-none z-50 animate-float-emoji";
  
  const rect = element.getBoundingClientRect();
  const cardRect = element.closest('.relative').getBoundingClientRect();
  
  const left = rect.left - cardRect.left + (rect.width / 2) - 12;
  const top = rect.top - cardRect.top - 10;

  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;

  element.closest('.relative').appendChild(bubble);

  setTimeout(() => {
    bubble.remove();
  }, 800);
}

// ====================================================
// P05: 公式質問一覧のレンダリング
// ====================================================
function renderOfficialQuestions() {
  const container = document.getElementById('official-questions-list');
  container.innerHTML = '';

  if (state.officialQuestions.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 bg-white border-2 border-dashed border-slate-300 rounded-3xl">
        <p class="text-sm font-bold text-slate-400">公式質問がまだ登録されていません。</p>
      </div>
    `;
    return;
  }

  state.officialQuestions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = "bg-white border-3 border-slate-800 rounded-3xl overflow-hidden shadow-[4px_4px_0_#1e293b] hover:shadow-[6px_6px_0_#1e293b] hover:translate-y-[-2px] transition-all";

    card.innerHTML = `
      <!-- カラーアクセントバー -->
      <div class="h-3 bg-kids-yellow border-b-2 border-slate-800"></div>

      <div class="p-6 space-y-4">
        <!-- バッジ -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="px-3 py-1 rounded-full text-xs font-black bg-kids-yellow border-2 border-slate-800 text-slate-800">
            ⭐ 公式質問 No.${idx + 1}
          </span>
        </div>

        <!-- 質問タイトル -->
        <h3 class="text-lg sm:text-xl font-black text-slate-900">
          ${parseFurigana(q.title)}
        </h3>

        <!-- 質問の背景 -->
        <p class="text-sm font-bold text-slate-600 leading-relaxed">
          ${parseFurigana(q.description)}
        </p>

        <!-- 詳細ボタン -->
        <button onclick="openQuestionDetail('${q.id}')"
                class="w-full sm:w-auto px-6 py-3 rounded-2xl bg-white hover:bg-yellow-50 text-slate-800 font-black text-sm border-3 border-slate-800 shadow-[3px_3px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2">
          <i class="fa-solid fa-magnifying-glass text-kids-yellow"></i>
          なぜこのしつもんになったの？ 詳しく見る
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// P06: 質問詳細モーダルの表示
window.openQuestionDetail = function(questionId) {
  const q = state.officialQuestions.find(oq => oq.id === questionId);
  if (!q) return;

  const modalBody = document.getElementById('question-detail-modal-body');

  modalBody.innerHTML = `
    <!-- ヘッダー -->
    <div class="flex items-start gap-4 mb-6 pb-5 border-b-2 border-slate-100">
      <div class="w-12 h-12 rounded-2xl bg-kids-yellow border-2 border-slate-800 flex items-center justify-center text-2xl shrink-0">⭐</div>
      <div>
        <span class="text-xs font-black text-slate-400 uppercase tracking-widest">公式質問</span>
        <h3 class="text-xl sm:text-2xl font-black text-slate-900 mt-1">${parseFurigana(q.title)}</h3>
      </div>
    </div>

    <!-- 質問の詳細説明 -->
    <div class="space-y-5">
      <div class="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-5">
        <h4 class="text-sm font-black text-yellow-800 flex items-center gap-1.5 mb-2">
          <i class="fa-solid fa-circle-question text-yellow-600"></i>このしつもんのまとめ
        </h4>
        <p class="text-sm font-bold text-slate-700 leading-relaxed">${parseFurigana(q.description)}</p>
      </div>

      <div class="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
        <h4 class="text-sm font-black text-blue-800 flex items-center gap-1.5 mb-2">
          <i class="fa-solid fa-star text-blue-500"></i>なぜこのしつもんを選んだの？
        </h4>
        <p class="text-sm font-bold text-slate-700 leading-relaxed">${parseFurigana(q.reason_selected || '理由の詳細はこれから追記される予定です。')}</p>
      </div>

      ${q.background ? `
      <div class="bg-slate-50 border-2 border-slate-200 rounded-2xl p-5">
        <h4 class="text-sm font-black text-slate-700 flex items-center gap-1.5 mb-2">
          <i class="fa-solid fa-book-open text-slate-500"></i>話し合いのプロセス（背景）
        </h4>
        <p class="text-sm font-bold text-slate-700 leading-relaxed">${parseFurigana(q.background)}</p>
      </div>
      ` : ''}
    </div>
  `;

  const modal = document.getElementById('question-detail-modal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    document.getElementById('question-detail-modal-content').classList.remove('scale-95');
    document.getElementById('question-detail-modal-content').classList.add('scale-100');
  }, 10);
};

function closeQuestionModal() {
  const modal = document.getElementById('question-detail-modal');
  modal.classList.add('opacity-0');
  document.getElementById('question-detail-modal-content').classList.remove('scale-100');
  document.getElementById('question-detail-modal-content').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
}

// ====================================================
// P07: 質問選び追体験クイズのレンダリング
// ====================================================
function renderQuiz() {
  const container = document.getElementById('quiz-container');
  const resultPanel = document.getElementById('quiz-result');

  // 結果パネル非表示 / クイズコンテナ表示
  resultPanel.classList.add('hidden');
  container.classList.remove('hidden');
  container.innerHTML = '';

  // question pool: official + general の混合からランダムに2選
  const pool = [
    ...state.officialQuestions.map(q => ({ ...q, _isOfficial: true })),
    ...state.questions.map(q => ({ ...q, _isOfficial: false }))
  ];

  if (pool.length < 2) {
    container.innerHTML = `<div class="text-center py-12 bg-white border-2 border-dashed border-slate-300 rounded-3xl"><p class="text-sm font-bold text-slate-400">クイズに展示するしつもんが少なすぎます。</p></div>`;
    return;
  }

  // ランダムに2つ選抜
  const shuffled = shuffleArray(pool);
  state.quizCandidates = shuffled.slice(0, 2);
  state.quizSelectedId = null;

  // タイトルブロック
  const intro = document.createElement('div');
  intro.className = "bg-white border-3 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-[4px_4px_0_#1e293b] space-y-4 text-center";
  intro.innerHTML = `
    <div class="text-4xl">🧐</div>
    <h3 class="text-lg sm:text-xl font-black text-slate-900">
      この2つのしつもん、どちらがより大事だと思う？
    </h3>
    <p class="text-xs sm:text-sm font-bold text-slate-500">
      こどもたちは実際にたくさんのしつもんからこのようにディスカッションを繰り返して小さくしていったよ。あなたあならどちらを選ぶ？
    </p>
  `;
  container.appendChild(intro);

  // 2つの選抜カード
  const grid = document.createElement('div');
  grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-6";

  state.quizCandidates.forEach((q) => {
    const card = document.createElement('button');
    card.id = `quiz-card-${q.id}`;
    card.className = "bg-white border-3 border-slate-800 rounded-3xl p-6 text-left shadow-[4px_4px_0_#1e293b] hover:shadow-[6px_6px_0_#1e293b] hover:scale-[1.02] transition-all space-y-3 group cursor-pointer";
    card.innerHTML = `
      <div class="text-3xl group-hover:scale-110 transition-transform">💡</div>
      <h4 class="text-base sm:text-lg font-black text-slate-900 leading-snug">${parseFurigana(q.title)}</h4>
      <p class="text-xs sm:text-sm font-bold text-slate-500 leading-relaxed">${parseFurigana(q.description || '')}</p>
      <div class="pt-2">
        <span class="px-4 py-2 rounded-2xl bg-kids-yellow border-2 border-slate-800 text-slate-800 text-xs font-black shadow-[2px_2px_0_#000] group-hover:bg-yellow-400 transition-all inline-block">
          ✓ こっちを選ぶ
        </span>
      </div>
    `;
    card.addEventListener('click', () => selectQuizAnswer(q));
    grid.appendChild(card);
  });

  container.appendChild(grid);

  // リトライボタンのイベントバインド
  document.getElementById('quiz-retry-btn').onclick = renderQuiz;
}

// P07: 選抜時の処理
function selectQuizAnswer(selectedQ) {
  state.quizSelectedId = selectedQ.id;

  const container = document.getElementById('quiz-container');
  const resultPanel = document.getElementById('quiz-result');

  // カードに選抜エフェクト
  state.quizCandidates.forEach(q => {
    const card = document.getElementById(`quiz-card-${q.id}`);
    if (!card) return;
    if (q.id === selectedQ.id) {
      card.className = card.className + " ring-4 ring-kids-yellow scale-105 border-kids-yellow bg-yellow-50";
    } else {
      card.className = "bg-white border-3 border-slate-200 rounded-3xl p-6 text-left shadow-sm transition-all space-y-3 opacity-40 cursor-default";
    }
    card.disabled = true;
  });

  // 小持ち間を置いて結果を表示
  setTimeout(() => {
    container.classList.add('hidden');
    resultPanel.classList.remove('hidden');

    document.getElementById('quiz-selected-question').innerHTML = parseFurigana(selectedQ.title);
  }, 700);
}

// ====================================================
// P08: 質問投稿フォームのセットアップ（初回マウント時のみ実行）
// ====================================================
let submitFormInitialized = false;

function setupSubmitForm() {
  if (submitFormInitialized) return; // 重複バインド防止
  submitFormInitialized = true;

  const form = document.getElementById('question-submit-form');
  const contentTextarea = document.getElementById('submit-content');
  const contentCount = document.getElementById('submit-content-count');

  // 文字数カウンター
  contentTextarea.addEventListener('input', () => {
    const len = contentTextarea.value.length;
    contentCount.textContent = `${len} / 200`;
    contentCount.className = len > 180
      ? 'text-xs font-black text-rose-500 mt-1'
      : 'text-xs font-bold text-slate-400';
  });

  // もう1つ送るボタン
  const anotherBtn = document.getElementById('submit-another-btn');
  anotherBtn.addEventListener('click', () => {
    document.getElementById('submit-success').classList.add('hidden');
    document.getElementById('submit-form-container').classList.remove('hidden');
    form.reset();
    contentCount.textContent = '0 / 200';
  });

  // フォーム送信処理
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nickname = document.getElementById('submit-nickname').value.trim();
    const grade = document.getElementById('submit-grade').value;
    const content = contentTextarea.value.trim();
    const reason = document.getElementById('submit-reason').value.trim();
    const errorDiv = document.getElementById('submit-error');
    const errorText = document.getElementById('submit-error-text');
    const submitBtn = document.getElementById('submit-btn');

    // クライアントサイドレートリミット (最後の送信から悠’30秒間は再送不可)
    const now = Date.now();
    const RATE_LIMIT_MS = 30000;
    if (now - state.lastSubmitTime < RATE_LIMIT_MS) {
      const remaining = Math.ceil((RATE_LIMIT_MS - (now - state.lastSubmitTime)) / 1000);
      errorDiv.classList.remove('hidden');
      errorText.textContent = `もう少し待ってね！${remaining}秒後に送れるよ。`;
      return;
    }

    // バリデーション
    if (!nickname) {
      errorDiv.classList.remove('hidden');
      errorText.textContent = 'ニックネームを入れてね！';
      document.getElementById('submit-nickname').focus();
      return;
    }
    if (!content) {
      errorDiv.classList.remove('hidden');
      errorText.textContent = 'しつもんの内容を入れてね！';
      contentTextarea.focus();
      return;
    }
    if (!reason) {
      errorDiv.classList.remove('hidden');
      errorText.textContent = 'どうしてそのしつもんがしたいかも書いてね！';
      document.getElementById('submit-reason').focus();
      return;
    }

    // エラー非表示 / ボタンのローディング化
    errorDiv.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> 送信中...';

    if (state.isMockData) {
      // デモ時は実際にDBに送信せず、成功画面をシミュレート
      await new Promise(r => setTimeout(r, 800));
      state.lastSubmitTime = Date.now();
      showSuccessUI(submitBtn);
      return;
    }

    try {
      const { error } = await supabase
        .from('user_questions')
        .insert({
          election_id: state.selectedElectionId,
          nickname: nickname,
          grade: grade || null,
          content: content,
          reason: reason,
          status: 'pending' // 承認待ちとして登録（セキュリティ要件）
        });

      if (error) throw error;

      state.lastSubmitTime = Date.now();
      showSuccessUI(submitBtn);

    } catch (err) {
      console.error('質問投稿に失敗しました:', err);
      errorDiv.classList.remove('hidden');
      errorText.textContent = '送信に失敗したよ。時間をおいてまた試してみてね。';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> しつもんを送る！';
    }
  });
}

function showSuccessUI(submitBtn) {
  submitBtn.disabled = false;
  submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> しつもんを送る！';
  document.getElementById('submit-form-container').classList.add('hidden');
  document.getElementById('submit-success').classList.remove('hidden');
}
