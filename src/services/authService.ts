import type { UserProfile } from "../types/auth";
import { jwtAuthProvider } from "../providers/jwtAuthProvider";

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

// ============================================================
// 导出统一 API（JWT 模式）
// ============================================================

export const AUTH_PROVIDER = "jwt" as const;

export const getProfileLandingPath = (profile: UserProfile) =>
  profile.role === "admin" ? "/admin" : "/college";

export const signInWithPassword = async (account: string, password: string) =>
  jwtAuthProvider.signInWithPassword(account, password);

export const sendPasswordResetEmail = async (account: string) =>
  jwtAuthProvider.sendPasswordResetEmail(account);

export const getCurrentSessionProfile = async () =>
  jwtAuthProvider.getCurrentSessionProfile();

export const signOut = async () => jwtAuthProvider.signOut();

export const updateRecoveryPassword = async (newPassword: string) =>
  jwtAuthProvider.updateRecoveryPassword(newPassword);

export const subscribeAuthProfile = (
  onChange: (profile: UserProfile | null, error?: string, event?: string) => void
) => jwtAuthProvider.subscribeAuthProfile(onChange);
