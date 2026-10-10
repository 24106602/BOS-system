/**
 * 认证服务 - 支持双认证模式切换
 *
 * 配置方式：
 * - VITE_AUTH_MODE=supabase  → 使用 Supabase Auth（原有方式）
 * - VITE_AUTH_MODE=jwt       → 使用自建 JWT 认证（SQL Server 模式）
 *
 * 接口与原有 authService.ts 保持一致，可直接替换
 */
import type { AuthProvider } from "../providers/authProvider";
import type { UserProfile } from "../types/auth";
import { jwtAuthProvider } from "../providers/jwtAuthProvider";

// Supabase 提供者（懒加载，避免 jwt 模式下加载 supabase 依赖）
let supabaseProvider: AuthProvider | null = null;

async function getSupabaseProvider(): Promise<AuthProvider> {
  if (supabaseProvider) return supabaseProvider;

  // 动态导入 Supabase 认证提供者
  // 注意：实际项目中需要创建 supabaseAuthProvider.ts 包装现有逻辑
  const { isSupabaseConfigured, supabase, SUPABASE_ENV_ERROR } = await import(
    "../lib/supabaseClient"
  );
  const { fetchUserProfile, setStoredUserProfile, clearStoredUserProfile } = await import(
    "./profileService"
  );

  const LEGACY_ROLE_KEY = "bos_role";
  const LEGACY_COLLEGE_ACCOUNT_KEY = "bos_college_account";

  const syncLegacyProfileState = (profile: UserProfile | null) => {
    if (!profile) {
      window.localStorage.removeItem(LEGACY_ROLE_KEY);
      window.localStorage.removeItem(LEGACY_COLLEGE_ACCOUNT_KEY);
      return;
    }
    window.localStorage.setItem(LEGACY_ROLE_KEY, profile.role);
    if (profile.role === "college" && profile.college_name) {
      window.localStorage.setItem(LEGACY_COLLEGE_ACCOUNT_KEY, profile.college_name);
    } else {
      window.localStorage.removeItem(LEGACY_COLLEGE_ACCOUNT_KEY);
    }
  };

  const resolveSessionProfile = async (session: any): Promise<UserProfile | null> => {
    if (!session?.user) {
      clearStoredUserProfile();
      syncLegacyProfileState(null);
      return null;
    }
    const profile = await fetchUserProfile(session.user.id);
    if (!profile.enabled) {
      await supabase.auth.signOut();
      clearStoredUserProfile();
      syncLegacyProfileState(null);
      throw new Error("账号已停用，请联系管理员");
    }
    setStoredUserProfile(profile);
    syncLegacyProfileState(profile);
    return profile;
  };

  const normalizeAuthError = (message: string) => {
    if (/invalid login credentials/i.test(message)) return "账号或密码错误";
    if (/email not confirmed/i.test(message)) return "邮箱尚未验证，请先完成验证";
    return message || "登录失败，请稍后重试";
  };

  supabaseProvider = {
    type: "supabase",
    get isConfigured() {
      return isSupabaseConfigured;
    },

    async signInWithPassword(account: string, password: string) {
      if (!isSupabaseConfigured) throw new Error(SUPABASE_ENV_ERROR);
      const email = account.trim();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(normalizeAuthError(error.message));
      const profile = await resolveSessionProfile(data.session);
      if (!profile) throw new Error("登录状态异常，请重新登录");
      return profile;
    },

    async getCurrentSessionProfile() {
      if (!isSupabaseConfigured) {
        clearStoredUserProfile();
        syncLegacyProfileState(null);
        return null;
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) throw new Error(error.message || "读取登录状态失败");
      return resolveSessionProfile(data.session);
    },

    async signOut() {
      if (isSupabaseConfigured) await supabase.auth.signOut();
      clearStoredUserProfile();
      syncLegacyProfileState(null);
    },

    async sendPasswordResetEmail(account: string) {
      if (!isSupabaseConfigured) throw new Error(SUPABASE_ENV_ERROR);
      const email = account.trim();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message || "发送密码重置邮件失败");
      return "密码重置邮件已发送，请前往邮箱查收";
    },

    async updateRecoveryPassword(newPassword: string) {
      if (!isSupabaseConfigured) throw new Error(SUPABASE_ENV_ERROR);
      if (!newPassword) throw new Error("请输入新密码");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message || "修改密码失败");
      await this.signOut();
    },

    subscribeAuthProfile(onChange) {
      if (!isSupabaseConfigured) return () => undefined;

      const { data } = supabase.auth.onAuthStateChange((event: string, session: any) => {
        if (event === "PASSWORD_RECOVERY") {
          clearStoredUserProfile();
          syncLegacyProfileState(null);
          onChange(null, undefined, event);
          return;
        }
        resolveSessionProfile(session)
          .then((profile) => onChange(profile, undefined, event))
          .catch((error) =>
            onChange(null, error instanceof Error ? error.message : "登录状态异常", event)
          );
      });

      return () => data.subscription.unsubscribe();
    },
  };

  return supabaseProvider;
}

// ---------------------------------------------------------
// 获取当前认证提供者
// ---------------------------------------------------------

export async function getAuthProvider(): Promise<AuthProvider> {
  const authMode = import.meta.env.VITE_AUTH_MODE || "supabase";

  if (authMode === "jwt") {
    return jwtAuthProvider;
  }

  return getSupabaseProvider();
}

// ---------------------------------------------------------
// 导出与原 authService 一致的 API（同步包装）
// 注意：首次调用会异步初始化，建议使用 getAuthProvider() 代替
// ---------------------------------------------------------

export const getProfileLandingPath = (profile: UserProfile) =>
  profile.role === "admin" ? "/admin" : "/college";

export const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || "supabase";
