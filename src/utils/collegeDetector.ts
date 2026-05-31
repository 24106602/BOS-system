const collegeNames = [
  "外国语学院",
  "艺术与设计学院",
  "人文学院",
  "理学院",
  "经济与管理学院",
  "香料香精化妆品学部",
  "材料科学与工程学院",
  "化工与能源技术学部",
  "城市建设与生态技术学部",
  "智能技术学部",
];

const collegeAliases: Record<string, string> = {
  经管学院: "经济与管理学院",
  艺设学院: "艺术与设计学院",
  材料学院: "材料科学与工程学院",
  化工学部: "化工与能源技术学部",
  城建学部: "城市建设与生态技术学部",
  智能学部: "智能技术学部",
};

export function detectCollegeName(fileName: string): string {
  const matchedFullName = collegeNames.find((name) => fileName.includes(name));
  if (matchedFullName) return matchedFullName;

  const matchedAlias = Object.entries(collegeAliases).find(([alias]) => fileName.includes(alias));
  if (matchedAlias) return matchedAlias[1];

  return "未知学院";
}

export type CollegeAccount = {
  college_code: string;
  college_name: string;
  account_name: string;
  role: "college";
  enabled: true;
  initialPassword?: string;
};

export const collegeAccounts: CollegeAccount[] = [
  { college_code: "HUM", college_name: "School of Humanities", account_name: "HUM", role: "college", enabled: true },
  { college_code: "UCC", college_name: "Urban Construction College", account_name: "UCC", role: "college", enabled: true },
  { college_code: "ECO", college_name: "Ecological College", account_name: "ECO", role: "college", enabled: true },
  { college_code: "INFO", college_name: "Information Group", account_name: "INFO", role: "college", enabled: true },
  { college_code: "MFG", college_name: "Manufacturing Group", account_name: "MFG", role: "college", enabled: true },
  { college_code: "SCI", college_name: "School of Science", account_name: "SCI", role: "college", enabled: true },
  { college_code: "MAT", college_name: "Department of Materials Technology", account_name: "MAT", role: "college", enabled: true },
  { college_code: "SEM", college_name: "School of Economics and Management", account_name: "SEM", role: "college", enabled: true },
  { college_code: "CEET", college_name: "Department of Chemical Engineering and Energy Technology", account_name: "CEET", role: "college", enabled: true },
  { college_code: "FFC", college_name: "Department of Flavors, Fragrances and Cosmetics", account_name: "FFC", role: "college", enabled: true },
  { college_code: "FL", college_name: "School of Foreign Languages", account_name: "FL", role: "college", enabled: true },
  { college_code: "AD", college_name: "School of Arts and Design", account_name: "AD", role: "college", enabled: true },
];

const CURRENT_COLLEGE_ACCOUNT_KEY = "bos_college_account";

export type CollegeDetectionResult = {
  collegeName: string;
  accountName: string;
  source: "account" | "file" | "unknown";
  error: string;
};

const detectCollegeAccountFromFileName = (fileName: string) => {
  const normalized = fileName.toUpperCase();
  return collegeAccounts.find(
    (account) =>
      new RegExp(`(^|[^A-Z0-9])${account.college_code}([^A-Z0-9]|$)`).test(normalized) ||
      normalized.includes(account.college_name.toUpperCase())
  );
};

export const getCurrentCollegeAccount = () => {
  const accountName = window.localStorage.getItem(CURRENT_COLLEGE_ACCOUNT_KEY)?.trim().toUpperCase() || "";
  if (!accountName) return undefined;
  return collegeAccounts.find(
    (account) => account.account_name.toUpperCase() === accountName || account.college_code === accountName
  );
};

export const resolveCollegeUpload = (fileName: string): CollegeDetectionResult => {
  const currentAccount = getCurrentCollegeAccount();
  const accountFromFile = detectCollegeAccountFromFileName(fileName);
  const legacyFileCollege = detectCollegeName(fileName);

  if (currentAccount && accountFromFile && currentAccount.college_code !== accountFromFile.college_code) {
    return {
      collegeName: currentAccount.college_name,
      accountName: currentAccount.account_name,
      source: "account",
      error: "上传文件所属学院与当前账号不一致。",
    };
  }

  if (currentAccount) {
    return {
      collegeName: currentAccount.college_name,
      accountName: currentAccount.account_name,
      source: "account",
      error: "",
    };
  }

  if (accountFromFile) {
    return {
      collegeName: accountFromFile.college_name,
      accountName: accountFromFile.account_name,
      source: "file",
      error: "",
    };
  }

  if (legacyFileCollege !== "未知学院") {
    return {
      collegeName: legacyFileCollege,
      accountName: "",
      source: "file",
      error: "",
    };
  }

  return {
    collegeName: "未知学院",
    accountName: "",
    source: "unknown",
    error: "无法识别所属学院，请检查账号或文件名。",
  };
};
