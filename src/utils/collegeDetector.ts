export type CollegeAccount = {
  college_code: string;
  college_name: string;
  account_name: string;
  role: "college";
  enabled: true;
  initialPassword?: string;
};

export const collegeAccounts: CollegeAccount[] = [
  { college_code: "FL", college_name: "外国语学院", account_name: "FL", role: "college", enabled: true },
  { college_code: "AD", college_name: "艺术与设计学院", account_name: "AD", role: "college", enabled: true },
  { college_code: "HUM", college_name: "人文学院", account_name: "HUM", role: "college", enabled: true },
  { college_code: "SCI", college_name: "理学院", account_name: "SCI", role: "college", enabled: true },
  { college_code: "SEM", college_name: "经济与管理学院", account_name: "SEM", role: "college", enabled: true },
  { college_code: "FFC", college_name: "香精香料化妆品学部", account_name: "FFC", role: "college", enabled: true },
  { college_code: "MAT", college_name: "材料技术学部", account_name: "MAT", role: "college", enabled: true },
  { college_code: "CEET", college_name: "化工与能源技术学部", account_name: "CEET", role: "college", enabled: true },
  { college_code: "UCC", college_name: "城建学院", account_name: "UCC", role: "college", enabled: true },
  { college_code: "ECO", college_name: "生态学院", account_name: "ECO", role: "college", enabled: true },
  { college_code: "INFO", college_name: "智能技术学部", account_name: "INFO", role: "college", enabled: true },
];

export const collegeNames = collegeAccounts.map((account) => account.college_name);

const submissionCollegeAliases: Record<string, string> = {
  香料香精化妆品学部: "香精香料化妆品学部",
  香精香料与化妆品学部: "香精香料化妆品学部",
  材料科学与工程学院: "材料技术学部",
  "School of Humanities": "人文学院",
  "Urban Construction College": "城建学院",
  "Ecological College": "生态学院",
  "Information Group": "智能技术学部",
  "School of Science": "理学院",
  "Department of Materials Technology": "材料技术学部",
  "School of Economics and Management": "经济与管理学院",
  "Department of Chemical Engineering and Energy Technology": "化工与能源技术学部",
  "Department of Flavors, Fragrances and Cosmetics": "香精香料化妆品学部",
  "School of Foreign Languages": "外国语学院",
  "School of Arts and Design": "艺术与设计学院",
};

const fileNameAliases: Array<[string, string]> = [
  ["城建学院", "城建学院"],
  ["城市建设", "城建学院"],
  ["城建", "城建学院"],
  ["生态学院", "生态学院"],
  ["生态", "生态学院"],
  ["经管学院", "经济与管理学院"],
  ["艺设学院", "艺术与设计学院"],
  ["材料学院", "材料技术学部"],
  ["材料科学与工程学院", "材料技术学部"],
  ["化工学部", "化工与能源技术学部"],
  ["智能学部", "智能技术学部"],
  ["香料香精化妆品学部", "香精香料化妆品学部"],
  ["香精香料与化妆品学部", "香精香料化妆品学部"],
];

export const normalizeSubmissionCollegeName = (value: string) => {
  const name = String(value ?? "").trim();
  if (!name) return name;

  const accountKey = name.toUpperCase();
  const matchedAccount = collegeAccounts.find(
    (account) =>
      account.college_code === accountKey ||
      account.account_name.toUpperCase() === accountKey ||
      account.college_name === name
  );
  if (matchedAccount) return matchedAccount.college_name;

  return submissionCollegeAliases[name] || name;
};

export const isSameSubmissionCollege = (left: string, right: string) =>
  normalizeSubmissionCollegeName(left) === normalizeSubmissionCollegeName(right);

export function detectCollegeName(fileName: string): string {
  const matchedFullName = collegeNames.find((name) => fileName.includes(name));
  if (matchedFullName) return matchedFullName;

  const matchedAlias = fileNameAliases.find(([alias]) => fileName.includes(alias));
  if (matchedAlias) return matchedAlias[1];

  return "未知学院";
}

const CURRENT_COLLEGE_ACCOUNT_KEY = "bos_college_account";

export type CollegeDetectionResult = {
  collegeName: string;
  accountName: string;
  source: "account" | "file" | "unknown";
  error: string;
};

const findCollegeAccount = (value: string) => {
  const collegeName = normalizeSubmissionCollegeName(value);
  return collegeAccounts.find((account) => account.college_name === collegeName);
};

const detectCollegeAccountFromFileName = (fileName: string) => {
  const normalized = fileName.toUpperCase();
  const accountByCode = collegeAccounts.find((account) =>
    new RegExp(`(^|[^A-Z0-9])${account.college_code}([^A-Z0-9]|$)`).test(normalized)
  );
  if (accountByCode) return accountByCode;

  const detectedName = detectCollegeName(fileName);
  return detectedName === "未知学院" ? undefined : findCollegeAccount(detectedName);
};

export const getCurrentCollegeAccount = () => {
  const accountName = window.localStorage.getItem(CURRENT_COLLEGE_ACCOUNT_KEY)?.trim() || "";
  return accountName ? findCollegeAccount(accountName) : undefined;
};

export const setCurrentCollegeAccount = (accountName: string) => {
  const account = findCollegeAccount(accountName);
  if (!account) throw new Error("未找到学院账号。");
  window.localStorage.setItem(CURRENT_COLLEGE_ACCOUNT_KEY, account.account_name);
  return account;
};

export const resolveCollegeUpload = (fileName: string): CollegeDetectionResult => {
  const currentAccount = getCurrentCollegeAccount();
  const accountFromFile = detectCollegeAccountFromFileName(fileName);

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

  return {
    collegeName: "未知学院",
    accountName: "",
    source: "unknown",
    error: "无法识别所属学院，请检查账号或文件名。",
  };
};
