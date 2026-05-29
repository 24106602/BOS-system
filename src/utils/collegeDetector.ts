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
