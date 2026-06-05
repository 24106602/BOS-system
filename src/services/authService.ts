import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase, SUPABASE_ENV_ERROR } from "../lib/supabaseClient";
import {
  clearStoredUserProfile,
  fetchUserProfile,
  setStoredUserProfile,
} from "./profileService";
import type { UserProfile } from "../types/auth";

const LEGACY_ROLE_KEY = "bos_role";
const LEGACY_COLLEGE_ACCOUNT_KEY = "bos_college_account";

const ensureSupabaseReady = () => {
  if (!isSupabaseConfigured) throw new Error(SUPABASE_ENV_ERROR);
};

const normalizeAuthError = (message: string) => {
  if (/invalid login credentials/i.test(message)) return "账号或密码错误";
  if (/email not confirmed/i.test(message)) return "邮箱尚未验证，请先完成验证";
  return message || "登录失败，请稍后重试";
};

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

const resolveSessionProfile = async (session: Session | null): Promise<UserProfile | null> => {
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

export const getProfileLandingPath = (profile: UserProfile) =>
  profile.role === "admin" ? "/admin" : "/college";

export const signInWithPassword = async (account: string, password: string) => {
  ensureSupabaseReady();
  const email = account.trim();
  if (!email || !password) throw new Error("请输入账号和密码");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(normalizeAuthError(error.message));

  const profile = await resolveSessionProfile(data.session);
  if (!profile) throw new Error("登录状态异常，请重新登录");
  return profile;
};

export const sendPasswordResetEmail = async (account: string) => {
  ensureSupabaseReady();
  const email = account.trim();
  if (!email) throw new Error("请输入账号或邮箱");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message || "发送密码重置邮件失败");
  return "密码重置邮件已发送，请前往邮箱查收";
};

export const getCurrentSessionProfile = async () => {
  if (!isSupabaseConfigured) {
    clearStoredUserProfile();
    syncLegacyProfileState(null);
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message || "读取登录状态失败");
  return resolveSessionProfile(data.session);
};

export const signOut = async () => {
  if (isSupabaseConfigured) await supabase.auth.signOut();
  clearStoredUserProfile();
  syncLegacyProfileState(null);
};

export const updateRecoveryPassword = async (newPassword: string) => {
  ensureSupabaseReady();
  if (!newPassword) throw new Error("请输入新密码");

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message || "修改密码失败");
  await signOut();
};

export const subscribeAuthProfile = (
  onChange: (profile: UserProfile | null, error?: string, event?: AuthChangeEvent) => void
) => {
  if (!isSupabaseConfigured) return () => undefined;

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      clearStoredUserProfile();
      syncLegacyProfileState(null);
      onChange(null, undefined, event);
      return;
    }

    void resolveSessionProfile(session)
      .then((profile) => onChange(profile, undefined, event))
      .catch((error) => onChange(null, error instanceof Error ? error.message : "登录状态异常", event));
  });

  return () => data.subscription.unsubscribe();
};
