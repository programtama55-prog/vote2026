import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 開発環境と本番環境でSupabaseの接続情報を切り替えられるように、windowオブジェクトのプロパティも参照できるようにします。
const supabaseUrl = window.SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const supabaseAnonKey = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-anon-key';

export function isSupabaseConfigured() {
  return supabaseUrl && !supabaseUrl.includes('your-supabase-project') && supabaseAnonKey && !supabaseAnonKey.includes('your-anon-key');
}

if (!isSupabaseConfigured()) {
  console.warn('こども選挙: SupabaseのURLとAnon Keyがデフォルトのままです。実際のDBと連携する場合は、window.SUPABASE_URL および window.SUPABASE_ANON_KEY を設定するか、supabase.js 内の変数を書き換えてください。');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
