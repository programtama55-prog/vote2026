-- ===================================================
-- こども選挙 (vote2026) Supabase データベース構築 SQL
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行してください
-- ===================================================

-- 1. スタッフアカウントテーブル
CREATE TABLE IF NOT EXISTS public.staff_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '運営',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 選挙テーブル
CREATE TABLE IF NOT EXISTS public.elections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT '準備中',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 候補者テーブル
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID REFERENCES public.elections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  party TEXT,
  profile TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 質問テーブル
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID REFERENCES public.elections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_official BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'approved',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 候補者回答テーブル
CREATE TABLE IF NOT EXISTS public.candidate_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 反応 (リアクション) テーブル
CREATE TABLE IF NOT EXISTS public.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID REFERENCES public.candidate_answers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ワークショップ・学びコンテンツテーブル
CREATE TABLE IF NOT EXISTS public.workshops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID REFERENCES public.elections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE,
  content TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'approved',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 子どもの課題・提案テーブル
CREATE TABLE IF NOT EXISTS public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID REFERENCES public.elections(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'approved',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 有権者受付登録テーブル
CREATE TABLE IF NOT EXISTS public.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_number TEXT UNIQUE NOT NULL,
  is_advance BOOLEAN DEFAULT false,
  age_group TEXT,
  municipality TEXT,
  status TEXT DEFAULT 'registered',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. 投票用紙交付ログテーブル
CREATE TABLE IF NOT EXISTS public.ballot_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES public.registrations(id) ON DELETE CASCADE,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  staff_id TEXT,
  is_revoked BOOLEAN DEFAULT false,
  revoke_reason TEXT
);

-- 11. 得票入力テーブル
CREATE TABLE IF NOT EXISTS public.vote_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID REFERENCES public.elections(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  count INT DEFAULT 1,
  input_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. 集計確定結果テーブル
CREATE TABLE IF NOT EXISTS public.election_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID REFERENCES public.elections(id) ON DELETE CASCADE,
  total_votes INT DEFAULT 0,
  finalized_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================================================
-- Row Level Security (RLS) 有効化 & ポリシー設定
-- ===================================================

ALTER TABLE public.staff_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ballot_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vote_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.election_results ENABLE ROW LEVEL SECURITY;

-- パブリック読み取りポリシー（一般表示系データ）
CREATE POLICY "Public Read Elections" ON public.elections FOR SELECT USING (true);
CREATE POLICY "Public Read Candidates" ON public.candidates FOR SELECT USING (true);
CREATE POLICY "Public Read Questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Public Read Answers" ON public.candidate_answers FOR SELECT USING (true);
CREATE POLICY "Public Read Reactions" ON public.reactions FOR SELECT USING (true);
CREATE POLICY "Public Insert Reactions" ON public.reactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Read Workshops" ON public.workshops FOR SELECT USING (true);
CREATE POLICY "Public Read Issues" ON public.issues FOR SELECT USING (true);

-- スタッフ・管理者アクセスポリシー
CREATE POLICY "Staff Accounts Read All" ON public.staff_accounts FOR SELECT USING (true);
CREATE POLICY "Staff Accounts Insert" ON public.staff_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff Accounts Update" ON public.staff_accounts FOR UPDATE USING (true);
CREATE POLICY "Staff Accounts Delete" ON public.staff_accounts FOR DELETE USING (true);

CREATE POLICY "Registrations All Access" ON public.registrations FOR ALL USING (true);
CREATE POLICY "Ballot Issues All Access" ON public.ballot_issues FOR ALL USING (true);
CREATE POLICY "Vote Inputs All Access" ON public.vote_inputs FOR ALL USING (true);
CREATE POLICY "Election Results All Access" ON public.election_results FOR ALL USING (true);
