import { createClient } from '@supabase/supabase-js';

// 读取我们在 .env.local 和 Vercel 中配置的环境变量
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase 环境变量缺失，请检查 .env 文件配置！");
}

// 导出全局唯一的 Supabase 客户端实例
export const supabase = createClient(supabaseUrl, supabaseAnonKey);