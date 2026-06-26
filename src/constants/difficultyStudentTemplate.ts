export const DIFFICULTY_STUDENT_TEMPLATE_FIELDS = [
  "姓名(*)",
  "籍贯(*)",
  "身份证号(*)",
  "家庭人口数(*)",
  "手机号码(*)",
  "辅导员姓名",
  "申请日期(*)",
  "家庭地址(*)",
  "邮政编码(*)",
  "家长手机号码(*)",
  "特殊困难类型(*)",
  "家庭人均年收入(*)",
  "是否遭受自然灾害(*)",
  "自然灾害描述（60字）(*)",
  "是否遭受突发事件(*)",
  "突发事件描述（60字）(*)",
  "家庭成员因残疾、 无年迈而劳动能力弱情况（60字）(*)",
  "家庭成员失业情况（60字）(*)",
  "家庭欠债金额(*)",
  "家庭欠债情况（60字）(*)",
  "其他情况",
  "推荐档次(*)",
  "陈述理由（60字）(*)",
  "认定时间(*)",
  "是否同意评议小组意见(*)",
  "院系推荐档次(*)",
  "院系意见（60字）(*)",
  "是否同意院系工作组意见(*)",
  "学校推荐档次(*)",
  "学校意见（60字）(*)",
  "户籍性质（*）",
  "劳动力人口数（*）",
  "家庭失业人数（*）",
  "赡养人口数（*）",
  "是否五保户（*）",
  "是否单亲家庭子女（*）",
  "残疾类别（*）",
  "父母是否丧失劳动（*）",
  "家中有大病患者（*）",
  "收入来源(*)",
] as const;

export type DifficultyStudentTemplateField =
  (typeof DIFFICULTY_STUDENT_TEMPLATE_FIELDS)[number];

const FIELD_ALIASES: Partial<Record<DifficultyStudentTemplateField, string[]>> = {
  "姓名(*)": ["姓名", "学生姓名", "姓名（*）", "姓名 *", "name"],
  "家庭人口数(*)": ["家庭人口数", "家庭人口", "家庭人数", "人口数"],
  "身份证号(*)": ["身份证号", "身份证件号", "学生身份证号", "id_card"],
  "特殊困难类型(*)": ["特殊困难类型", "特殊困难类型（*）", "特殊群体类型", "特殊困难群体类型", "困难类型", "difficulty_level"],
  "推荐档次(*)": ["推荐档次", "困难等级", "困难认定等级", "认定等级"],
  "院系推荐档次(*)": ["院系推荐档次", "院系认定结果", "院系困难等级", "院系认定档次", "院系推荐结果"],
  "学校推荐档次(*)": ["学校推荐档次", "学校认定结果", "学校困难等级", "学校认定档次", "学校推荐结果"],
  "家庭人均年收入(*)": ["家庭人均年收入", "家庭年均收入", "家庭年收入"],
  "家庭欠债金额(*)": ["家庭欠债金额", "欠债金额", "负债金额"],
  "家庭欠债情况（60字）(*)": ["家庭欠债情况", "学生家庭欠债原因", "欠债原因"],
  "陈述理由（60字）(*)": ["陈述理由", "申请理由", "困难陈述"],
  "户籍性质（*）": ["户籍性质", "户口性质"],
  "劳动力人口数（*）": ["劳动力人口数", "劳动力人口", "劳动人口数", "劳动人口"],
  "赡养人口数（*）": ["赡养人口数", "赡养人口"],
  "残疾类别（*）": ["残疾类别", "残疾类型"],
  "收入来源(*)": ["收入来源", "家庭收入来源"],
};

export const normalizeDifficultyField = (value: string) => {
  const normalized = String(value ?? "")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
    .replace(/[*＊()（）:：，,。；;]/g, "")
    .toLowerCase();

  if (/^(?:学生)?姓名$/.test(normalized)) return "姓名";
  if (/^(?:家庭人口|家庭人口数|家庭人数|人口数|家庭人口总数)$/.test(normalized)) return "家庭人口数";
  if (/^(?:劳动力人口|劳动力人口数|劳动人口|劳动人口数|劳动人数)$/.test(normalized)) {
    return "劳动力人口数";
  }
  if (/^(?:赡养人口|赡养人口数|赡养人数|被赡养人口数)$/.test(normalized)) return "赡养人口数";
  if (/^(?:特殊困难类型|特殊群体类型|特殊困难群体类型|困难类型)$/.test(normalized)) return "特殊困难类型";

  return normalized;
};

export const getDifficultyTemplateValue = (
  rawData: Record<string, unknown> | null | undefined,
  field: DifficultyStudentTemplateField,
  fallback = ""
) => {
  const source = rawData || {};
  const aliases = [field, ...(FIELD_ALIASES[field] || [])].map(normalizeDifficultyField);
  const matched = Object.entries(source).find(([key]) => {
    const normalizedKey = normalizeDifficultyField(key);
    return aliases.some(
      (alias) =>
        normalizedKey === alias ||
        (alias.length >= 3 && (normalizedKey.includes(alias) || alias.includes(normalizedKey)))
    );
  });
  const value = matched?.[1];
  return value === undefined || value === null || String(value).trim() === ""
    ? fallback
    : String(value);
};

export const makeDifficultyRowKey = (
  academicYear: string,
  collegeName: string,
  idCard: string,
  studentId: string,
  index: number
) => [academicYear, collegeName, idCard || studentId || index].join("::");
