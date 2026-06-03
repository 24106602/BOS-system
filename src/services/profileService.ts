import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
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

const profileSelect = "id,auth_user_id,role,college_name,display_name,login_email,enabled,created_at";
const profileSelectWithoutLoginEmail = "id,auth_user_id,role,college_name,display_name,enabled,created_at";

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

const shouldRetryWithoutLoginEmail = (errorMessage: string) =>
  /login_email|column/i.test(errorMessage);

export const fetchUserProfile = async (authUserId: string): Promise<UserProfile> => {
  const initial = await supabase
    .from("user_profiles")
    .select(profileSelect)
    .eq("auth_user_id", authUserId)
    .maybeSingle<UserProfileRow>();
  let data = initial.data as UserProfileRow | null;
  let error = initial.error;

  if (error && shouldRetryWithoutLoginEmail(error.message)) {
    const fallback = await supabase
      .from("user_profiles")
      .select(profileSelectWithoutLoginEmail)
      .eq("auth_user_id", authUserId)
      .maybeSingle<UserProfileRow>();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(error.message || "读取用户权限失败");
  if (!data) throw new Error("未找到用户权限配置，请联系管理员");
  return normalizeProfile(data);
};

export const listUserProfiles = async (): Promise<UserProfile[]> => {
  if (!isSupabaseConfigured) return makeFallbackUserProfiles();

  const initial = await supabase
    .from("user_profiles")
    .select(profileSelect)
    .order("role", { ascending: true })
    .order("college_name", { ascending: true });
  let data = initial.data as UserProfileRow[] | null;
  let error = initial.error;

  if (error && shouldRetryWithoutLoginEmail(error.message)) {
    const fallback = await supabase
      .from("user_profiles")
      .select(profileSelectWithoutLoginEmail)
      .order("role", { ascending: true })
      .order("college_name", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(error.message || "读取用户列表失败");
  return (data || []).map((row) => normalizeProfile(row as UserProfileRow));
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
