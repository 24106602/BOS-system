import { api } from "../lib/apiClient";
import {
  makeFallbackUserProfiles,
  resolveLoginEmail,
} from "./accountDirectory";
import type { UserProfile, UserRole } from "../types/auth";

const PROFILE_STORAGE_KEY = "bos_current_user_profile";

type UserProfileRow = {
  id: string;
  auth_user_id: string;
  role: string;
  college_name: string | null;
  display_name: string | null;
  login_email?: string | null;
  enabled: boolean | null;
  created_at: string | null;
};

const isUserRole = (role: string): role is UserRole => role === "admin" || role === "college";

const normalizeProfile = (row: UserProfileRow): UserProfile => {
  if (!isUserRole(row.role)) throw new Error("账号角色配置异常，请联系管理员");
  const profile: UserProfile = {
    id: row.id,
    auth_user_id: row.auth_user_id,
    role: row.role,
    college_name: row.college_name || null,
    display_name: row.display_name || null,
    login_email: row.login_email || null,
    enabled: row.enabled !== false,
    created_at: row.created_at || null,
  };
  return {
    ...profile,
    login_email: resolveLoginEmail(profile) || null,
  };
};

export const fetchUserProfile = async (_authUserId: string): Promise<UserProfile> => {
  const data = await api.get<{ profile: UserProfileRow }>("/auth/me");
  if (!data.profile) throw new Error("未找到用户权限配置，请联系管理员");
  return normalizeProfile(data.profile);
};

export const listUserProfiles = async (): Promise<UserProfile[]> => {
  try {
    const data = await api.get<{ data: UserProfileRow[] }>("/admin/users");
    return (data.data || []).map((row) => normalizeProfile(row));
  } catch {
    return makeFallbackUserProfiles();
  }
};

export const getFallbackProfiles = () => makeFallbackUserProfiles();

export const setStoredUserProfile = (profile: UserProfile) => {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
};

export const getStoredUserProfile = (): UserProfile | null => {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfileRow;
    return normalizeProfile(parsed);
  } catch {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    return null;
  }
};

export const clearStoredUserProfile = () => {
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
};

export const getProfileDisplayName = (profile: UserProfile | null) => {
  if (!profile) return "";
  if (profile.role === "college") return profile.college_name || profile.display_name || "学院账号";
  return profile.display_name || "学校管理员";
};
