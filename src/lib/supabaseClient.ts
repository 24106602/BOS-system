import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_ENV_ERROR = "请先配置 Supabase 环境变量";

const viteEnv = import.meta.env || {};
const supabaseUrl = viteEnv.VITE_SUPABASE_URL?.trim() || "";
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY?.trim() || "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const createMissingClient = () =>
  new Proxy(
    {},
    {
      get() {
        throw new Error(SUPABASE_ENV_ERROR);
      },
    }
  ) as SupabaseClient;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : createMissingClient();
