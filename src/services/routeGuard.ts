import type { UserProfile, UserRole } from "../types/auth";

export const getProtectedRedirect = (
  profile: UserProfile | null,
  requiredRole: UserRole
) => {
  if (!profile) return "/login";
  if (profile.role === requiredRole) return "";
  return profile.role === "admin" ? "/admin" : "/college";
};

export const getCollegeAccountLabel = (profile: UserProfile | null) =>
  `当前账号：${profile?.college_name || profile?.display_name || "学院账号"}`;

export const getAdminAccountLabel = (profile: UserProfile | null) =>
  `当前账号：${profile?.display_name || "学校管理员"}`;
