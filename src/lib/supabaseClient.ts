import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 已弃用，系统已切换到 SQL Server 模式。
 * 本文件保留为空壳，仅用于兼容残留的导入引用。
 * 任何对 `supabase` 对象的属性访问都会抛出错误。
 */

export const SUPABASE_ENV_ERROR = "Supabase 已弃用，系统已切换到 SQL Server 模式";

export const isSupabaseConfigured = false as const;

const createDeprecatedClient = (): SupabaseClient =>
  new Proxy(
    {},
    {
      get() {
        throw new Error("Supabase 已弃用，请使用 SQL Server 模式");
      },
    }
  ) as SupabaseClient;

export const supabase = createDeprecatedClient();
