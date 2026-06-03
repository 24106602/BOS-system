import type { UserProfile, UserRole } from "../types/auth";

export type AccountDirectoryEntry = {
  role: UserRole;
  collegeName: string | null;
  displayName: string;
  loginEmail: string;
  enabled: boolean;
};

export const accountDirectory: AccountDirectoryEntry[] = [
  {
    role: "admin",
    collegeName: null,
    displayName: "学校管理员",
    loginEmail: "admin@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "外国语学院",
    displayName: "外国语学院",
    loginEmail: "wgyxy@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "艺术与设计学院",
    displayName: "艺术与设计学院",
    loginEmail: "yssjxy@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "人文学院",
    displayName: "人文学院",
    loginEmail: "rwxy@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "理学院",
    displayName: "理学院",
    loginEmail: "lxy@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "经济与管理学院",
    displayName: "经济与管理学院",
    loginEmail: "jjglxy@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "香精香料化妆品学部",
    displayName: "香精香料化妆品学部",
    loginEmail: "xjxlhzp@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "材料技术学部",
    displayName: "材料技术学部",
    loginEmail: "cljsxb@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "化工与能源技术学部",
    displayName: "化工与能源技术学部",
    loginEmail: "hgyjsxb@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "城建学院",
    displayName: "城建学院",
    loginEmail: "cjxy@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "生态学院",
    displayName: "生态学院",
    loginEmail: "stxy@bos.local",
    enabled: true,
  },
  {
    role: "college",
    collegeName: "智能技术学部",
    displayName: "智能技术学部",
    loginEmail: "znjsxb@bos.local",
    enabled: true,
  },
];

export const finalCollegeDirectory = accountDirectory.filter((entry) => entry.role === "college");

export const resolveLoginEmail = (profile: Pick<UserProfile, "role" | "college_name" | "display_name" | "login_email">) => {
  const matched = accountDirectory.find((entry) =>
    profile.role === "admin"
      ? entry.role === "admin"
      : entry.role === "college" && entry.collegeName === profile.college_name
  );
  return profile.login_email || matched?.loginEmail || "";
};

export const makeFallbackUserProfiles = (): UserProfile[] =>
  accountDirectory.map((entry, index) => ({
    id: `fallback_${index + 1}`,
    auth_user_id: "",
    role: entry.role,
    college_name: entry.collegeName,
    display_name: entry.displayName,
    login_email: entry.loginEmail,
    enabled: entry.enabled,
    created_at: null,
  }));
