import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STORAGE_URL_KEY = 'kodomo_senkyo_supabase_url';
const STORAGE_ANON_KEY = 'kodomo_senkyo_supabase_key';

let currentUrl = localStorage.getItem(STORAGE_URL_KEY) || window.SUPABASE_URL || '';
let currentKey = localStorage.getItem(STORAGE_ANON_KEY) || window.SUPABASE_ANON_KEY || '';

export function getSupabaseUrl() {
  return currentUrl || window.SUPABASE_URL || '';
}

export function getSupabaseAnonKey() {
  return currentKey || window.SUPABASE_ANON_KEY || '';
}

export function setSupabaseConfig(url, key) {
  if (url) {
    localStorage.setItem(STORAGE_URL_KEY, url.trim());
    currentUrl = url.trim();
  }
  if (key) {
    localStorage.setItem(STORAGE_ANON_KEY, key.trim());
    currentKey = key.trim();
  }
  window.location.reload();
}

export function clearSupabaseConfig() {
  localStorage.removeItem(STORAGE_URL_KEY);
  localStorage.removeItem(STORAGE_ANON_KEY);
  currentUrl = '';
  currentKey = '';
  window.location.reload();
}

export function isSupabaseConfigured() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return Boolean(
    url && 
    !url.includes('your-supabase-project') && 
    !url.includes('your-project') && 
    key && 
    !key.includes('your-anon-key')
  );
}

if (!isSupabaseConfigured()) {
  console.info('こども選挙: Supabaseの接続情報が未設定（またはデモ表示モード）です。設定モーダルまたは window.SUPABASE_URL / window.SUPABASE_ANON_KEY より設定してください。');
}

// クライアントを作成（未設定時はダミーURLで例外を回避）
const activeUrl = isSupabaseConfigured() ? getSupabaseUrl() : 'https://placeholder.supabase.co';
const activeKey = isSupabaseConfigured() ? getSupabaseAnonKey() : 'placeholder-anon-key';

export const supabase = createClient(activeUrl, activeKey);


