/**
 * JWT 认证提供者
 * 使用自建后端 API 进行认证，JWT token 存储在 localStorage
 */
import type { AuthProvider } from "./authProvider";
import type { UserProfile } from "../types/auth";
import {
  api,
  setTokens,
  clearTokens,
  getStoredProfile,
  setStoredProfile,
  clearStoredProfile,
  getAccessToken,
} from "../lib/apiClient";

const LEGACY_ROLE_KEY = "bos_role";
const LEGACY_COLLEGE_ACCOUNT_KEY = "bos_college_account";

function normalizeAuthError(message: string): string {
  if (/账号或密码错误/i.test(message)) return "账号或密码错误";
  if (/账号已停用/i.test(message)) return "账号已停用，请联系管理员";
  if (/未提供认证令牌/i.test(message)) return "请先登录";
  if (/认证令牌无效/i.test(message)) return "登录已过期，请重新登录";
  return message || "登录失败，请稍后重试";
}

function syncLegacyProfileState(profile: UserProfile | null) {
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
}

function mapApiProfile(apiUser: any): UserProfile {
  return {
    id: apiUser.id,
    email: apiUser.email,
    role: apiUser.role as "admin" | "college",
    college_name: apiUser.college_name || null,
    display_name: apiUser.display_name || apiUser.email,
    enabled: apiUser.enabled !== false,
  };
}

export class JwtAuthProvider implements AuthProvider {
  readonly type = "jwt" as const;

  get isConfigured(): boolean {
    // JWT 模式始终可用
    return true;
  }

  async signInWithPassword(account: string, password: string): Promise<UserProfile> {
    if (!account || !password) throw new Error("请输入账号和密码");

    try {
      const data = await api.post<{
        profile: any;
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
      }>("/auth/login", { account, password }, { skipAuth: true });

      const profile = mapApiProfile(data.profile);
      setTokens(data.accessToken, data.refreshToken, data.expiresAt);
      setStoredProfile(profile);
      syncLegacyProfileState(profile);

      // 触发登录事件
      window.dispatchEvent(new CustomEvent("bos:auth-change", { detail: { profile } }));

      return profile;
    } catch (error) {
      throw new Error(normalizeAuthError(error instanceof Error ? error.message : "登录失败"));
    }
  }

  async getCurrentSessionProfile(): Promise<UserProfile | null> {
    const token = getAccessToken();
    if (!token) {
      clearStoredProfile();
      syncLegacyProfileState(null);
      return null;
    }

    try {
      const data = await api.get<{ profile: any }>("/auth/me");
      const profile = mapApiProfile(data.profile);

      if (!profile.enabled) {
        await this.signOut();
        throw new Error("账号已停用，请联系管理员");
      }

      setStoredProfile(profile);
      syncLegacyProfileState(profile);
      return profile;
    } catch (error) {
      // token 无效，清除本地状态
      clearTokens();
      clearStoredProfile();
      syncLegacyProfileState(null);
      return null;
    }
  }

  async signOut(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } catch {
      // 忽略登出 API 错误
    }
    clearTokens();
    clearStoredProfile();
    syncLegacyProfileState(null);

    window.dispatchEvent(new CustomEvent("bos:auth-change", { detail: { profile: null } }));
  }

  async sendPasswordResetEmail(account: string): Promise<string> {
    if (!account) throw new Error("请输入账号或邮箱");
    // JWT 模式下密码重置通过后端 API 发送邮件
    // 如果后端没有实现，可以提示用户联系管理员
    try {
      await api.post("/auth/password-reset", { email: account }, { skipAuth: true });
      return "密码重置邮件已发送，请前往邮箱查收";
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "发送密码重置邮件失败");
    }
  }

  async updateRecoveryPassword(newPassword: string): Promise<void> {
    if (!newPassword) throw new Error("请输入新密码");
    await api.put("/auth/password", { newPassword });
    await this.signOut();
  }

  subscribeAuthProfile(
    onChange: (profile: UserProfile | null, error?: string, event?: string) => void
  ): () => void {
    const handleAuthChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      onChange(customEvent.detail?.profile || null, undefined, customEvent.detail?.event);
    };

    const handleExpired = () => {
      onChange(null, "登录已过期，请重新登录", "TOKEN_EXPIRED");
    };

    window.addEventListener("bos:auth-change", handleAuthChange);
    window.addEventListener("bos:auth-expired", handleExpired);

    // 初始检查
    const stored = getStoredProfile();
    if (stored) {
      onChange(stored);
    }

    return () => {
      window.removeEventListener("bos:auth-change", handleAuthChange);
      window.removeEventListener("bos:auth-expired", handleExpired);
    };
  }
}

export const jwtAuthProvider = new JwtAuthProvider();
