import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ENV_SUPABASE_URL = 'https://yuxvrgkmjorzcgrtjmoz.supabase.co';
const ENV_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1eHZyZ2ttam9yemNncnRqbW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MzU2NzksImV4cCI6MjEwMTIxMTY3OX0.sWcYZkaBBzydG5Jb_gSZA6IvfVZ2uFMzYnn_glL49CM';

const STORAGE_URL_KEY = 'kodomo_senkyo_supabase_url';
const STORAGE_ANON_KEY = 'kodomo_senkyo_supabase_key';

let currentUrl = localStorage.getItem(STORAGE_URL_KEY) || window.SUPABASE_URL || ENV_SUPABASE_URL;
let currentKey = localStorage.getItem(STORAGE_ANON_KEY) || window.SUPABASE_ANON_KEY || ENV_SUPABASE_ANON_KEY;

export function getSupabaseUrl() {
  return currentUrl || window.SUPABASE_URL || ENV_SUPABASE_URL;
}

export function getSupabaseAnonKey() {
  return currentKey || window.SUPABASE_ANON_KEY || ENV_SUPABASE_ANON_KEY;
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
  currentUrl = ENV_SUPABASE_URL;
  currentKey = ENV_SUPABASE_ANON_KEY;
  window.location.reload();
}

export function isSupabaseConfigured() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return Boolean(
    url && 
    !url.includes('your-supabase-project') && 
    !url.includes('your-project') && 
    !url.includes('placeholder') && 
    key && 
    !key.includes('your-anon-key') &&
    !key.includes('placeholder')
  );
}

export const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());



