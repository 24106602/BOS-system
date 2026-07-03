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
  "家庭成员因残疾、年迈而劳动能力弱情况（60字）(*)",
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

export type DifficultyStudentCanonicalKey =
  | "name"
  | "studentId"
  | "nativePlace"
  | "idCard"
  | "familyPopulation"
  | "phone"
  | "counselorName"
  | "applicationDate"
  | "familyAddress"
  | "postcode"
  | "parentPhone"
  | "specialDifficultyType"
  | "familyIncome"
  | "hasNaturalDisaster"
  | "naturalDisasterDescription"
  | "hasUnexpectedEvent"
  | "unexpectedEventDescription"
  | "familyDisabilityWeakLaborSituation"
  | "familyUnemploymentSituation"
  | "familyDebtAmount"
  | "familyDebtReason"
  | "otherSituation"
  | "finalRecommendLevel"
  | "studentStatement"
  | "recognitionDate"
  | "agreesReviewGroup"
  | "collegeRecommendLevel"
  | "collegeOpinion"
  | "agreesCollegeWorkingGroup"
  | "schoolRecommendLevel"
  | "schoolOpinion"
  | "householdType"
  | "laborPopulation"
  | "unemployedPopulation"
  | "dependentPopulation"
  | "isWubaoHousehold"
  | "isSingleParentChild"
  | "disabilityCategory"
  | "parentsLostLaborAbility"
  | "hasMajorDiseasePatient"
  | "incomeSource";

export type DifficultyStudentValidatorKey =
  | "name"
  | "studentId"
  | "nativePlace"
  | "idCard"
  | "population"
  | "phone"
  | "text"
  | "applicationDate"
  | "familyAddress"
  | "postcode"
  | "specialDifficultyType"
  | "familyIncome"
  | "yesNo"
  | "situationText"
  | "familyDebtAmount"
  | "difficultyLevel"
  | "studentStatement"
  | "date"
  | "agreement"
  | "householdType"
  | "number"
  | "disabilityCategory"
  | "incomeSource";

export type DifficultyStudentFieldBinding = {
  fieldName: string;
  canonicalKey: DifficultyStudentCanonicalKey;
  validatorKey: DifficultyStudentValidatorKey;
  aliases: readonly string[];
};

export const SPECIAL_DIFFICULTY_TYPE_ALIASES: Readonly<Record<string, string>> = {
  低保户: "低保家庭学生",
  建档立卡: "脱贫家庭学生",
  残疾人家庭: "残疾人子女",
  父母残疾: "残疾人子女",
  本人残疾: "残疾学生",
  残疾家庭: "残疾人子女",
};

export const normalizeDifficultyField = (value: string) =>
  String(value ?? "")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
    .replace(/[*＊()（）:：，,。；;]/g, "")
    .toLowerCase();

export const DIFFICULTY_STUDENT_FIELD_BINDINGS = [
  { fieldName: "姓名(*)", canonicalKey: "name", validatorKey: "name", aliases: ["姓名", "学生姓名", "name"] },
  { fieldName: "学号", canonicalKey: "studentId", validatorKey: "studentId", aliases: ["学号", "学生学号", "student_id"] },
  { fieldName: "籍贯(*)", canonicalKey: "nativePlace", validatorKey: "nativePlace", aliases: ["籍贯", "籍贯(*)", "籍贯（*）"] },
  { fieldName: "身份证号(*)", canonicalKey: "idCard", validatorKey: "idCard", aliases: ["身份证号", "身份证号码", "身份证件号", "证件号码", "证件号", "学生身份证号", "id_card"] },
  { fieldName: "家庭人口数(*)", canonicalKey: "familyPopulation", validatorKey: "population", aliases: ["家庭人口数", "家庭人口", "家庭人数", "人口数"] },
  { fieldName: "手机号码(*)", canonicalKey: "phone", validatorKey: "phone", aliases: ["手机号码", "手机号", "联系电话", "联系方式", "学生联系电话"] },
  { fieldName: "辅导员姓名", canonicalKey: "counselorName", validatorKey: "text", aliases: ["辅导员姓名", "辅导员"] },
  { fieldName: "申请日期(*)", canonicalKey: "applicationDate", validatorKey: "applicationDate", aliases: ["申请日期", "日期"] },
  { fieldName: "家庭地址(*)", canonicalKey: "familyAddress", validatorKey: "familyAddress", aliases: ["家庭地址", "家庭住址", "通讯地址", "详细地址"] },
  { fieldName: "邮政编码(*)", canonicalKey: "postcode", validatorKey: "postcode", aliases: ["邮政编码", "邮编", "家庭邮编"] },
  { fieldName: "家长手机号码(*)", canonicalKey: "parentPhone", validatorKey: "phone", aliases: ["家长手机号码", "家长手机号", "监护人电话", "家长联系电话", "监护人联系电话"] },
  { fieldName: "特殊困难类型(*)", canonicalKey: "specialDifficultyType", validatorKey: "specialDifficultyType", aliases: ["特殊困难类型", "特殊群体类型", "特殊困难群体类型", "困难类型"] },
  { fieldName: "家庭人均年收入(*)", canonicalKey: "familyIncome", validatorKey: "familyIncome", aliases: ["家庭人均年收入", "家庭年均收入", "家庭年收入"] },
  { fieldName: "是否遭受自然灾害(*)", canonicalKey: "hasNaturalDisaster", validatorKey: "yesNo", aliases: ["是否遭受自然灾害"] },
  { fieldName: "自然灾害描述（60字）(*)", canonicalKey: "naturalDisasterDescription", validatorKey: "situationText", aliases: ["自然灾害描述", "自然灾害情况"] },
  { fieldName: "是否遭受突发事件(*)", canonicalKey: "hasUnexpectedEvent", validatorKey: "yesNo", aliases: ["是否遭受突发事件", "是否遭受突发意外事件"] },
  { fieldName: "突发事件描述（60字）(*)", canonicalKey: "unexpectedEventDescription", validatorKey: "situationText", aliases: ["突发事件描述", "突发意外事件具体描述", "意外事件描述"] },
  { fieldName: "家庭成员因残疾、年迈而劳动能力弱情况（60字）(*)", canonicalKey: "familyDisabilityWeakLaborSituation", validatorKey: "situationText", aliases: ["家庭成员因残疾、年迈而劳动能力弱情况", "家庭成员因残疾、 无年迈而劳动能力弱情况", "家庭成员因残疾无年迈而劳动能力弱情况"] },
  { fieldName: "家庭成员失业情况（60字）(*)", canonicalKey: "familyUnemploymentSituation", validatorKey: "situationText", aliases: ["家庭成员失业情况"] },
  { fieldName: "家庭欠债金额(*)", canonicalKey: "familyDebtAmount", validatorKey: "familyDebtAmount", aliases: ["家庭欠债金额", "欠债金额", "负债金额", "债务金额"] },
  { fieldName: "家庭欠债情况（60字）(*)", canonicalKey: "familyDebtReason", validatorKey: "situationText", aliases: ["家庭欠债情况", "学生家庭欠债原因", "家庭欠债原因", "欠债原因", "负债原因"] },
  { fieldName: "其他情况", canonicalKey: "otherSituation", validatorKey: "situationText", aliases: ["其他情况", "其它重大信息", "其他说明", "其它影响家庭经济信息", "其他影响家庭经济信息"] },
  { fieldName: "推荐档次(*)", canonicalKey: "finalRecommendLevel", validatorKey: "difficultyLevel", aliases: ["推荐档次", "困难等级", "困难认定等级", "认定等级"] },
  { fieldName: "陈述理由（60字）(*)", canonicalKey: "studentStatement", validatorKey: "studentStatement", aliases: ["陈述理由", "申请理由", "困难陈述"] },
  { fieldName: "认定时间(*)", canonicalKey: "recognitionDate", validatorKey: "date", aliases: ["认定时间", "认定日期"] },
  { fieldName: "是否同意评议小组意见(*)", canonicalKey: "agreesReviewGroup", validatorKey: "yesNo", aliases: ["是否同意评议小组意见"] },
  { fieldName: "院系推荐档次(*)", canonicalKey: "collegeRecommendLevel", validatorKey: "difficultyLevel", aliases: ["院系推荐档次", "院系认定结果", "院系困难等级", "院系认定档次", "院系推荐结果"] },
  { fieldName: "院系意见（60字）(*)", canonicalKey: "collegeOpinion", validatorKey: "agreement", aliases: ["院系意见"] },
  { fieldName: "是否同意院系工作组意见(*)", canonicalKey: "agreesCollegeWorkingGroup", validatorKey: "yesNo", aliases: ["是否同意院系工作组意见"] },
  { fieldName: "学校推荐档次(*)", canonicalKey: "schoolRecommendLevel", validatorKey: "difficultyLevel", aliases: ["学校推荐档次", "学校认定结果", "学校困难等级", "学校认定档次", "学校推荐结果"] },
  { fieldName: "学校意见（60字）(*)", canonicalKey: "schoolOpinion", validatorKey: "agreement", aliases: ["学校意见"] },
  { fieldName: "户籍性质（*）", canonicalKey: "householdType", validatorKey: "householdType", aliases: ["户籍性质", "户口性质"] },
  { fieldName: "劳动力人口数（*）", canonicalKey: "laborPopulation", validatorKey: "population", aliases: ["劳动力人口数", "劳动力人口", "劳动人口数", "劳动人口"] },
  { fieldName: "家庭失业人数（*）", canonicalKey: "unemployedPopulation", validatorKey: "number", aliases: ["家庭失业人数", "失业人数"] },
  { fieldName: "赡养人口数（*）", canonicalKey: "dependentPopulation", validatorKey: "population", aliases: ["赡养人口数", "赡养人口"] },
  { fieldName: "是否五保户（*）", canonicalKey: "isWubaoHousehold", validatorKey: "yesNo", aliases: ["是否五保户", "五保户"] },
  { fieldName: "是否单亲家庭子女（*）", canonicalKey: "isSingleParentChild", validatorKey: "yesNo", aliases: ["是否单亲家庭子女", "是否单亲", "单亲家庭子女"] },
  { fieldName: "残疾类别（*）", canonicalKey: "disabilityCategory", validatorKey: "disabilityCategory", aliases: ["残疾类别", "残疾类型"] },
  { fieldName: "父母是否丧失劳动（*）", canonicalKey: "parentsLostLaborAbility", validatorKey: "yesNo", aliases: ["父母是否丧失劳动", "父母是否丧失劳动能力"] },
  { fieldName: "家中有大病患者（*）", canonicalKey: "hasMajorDiseasePatient", validatorKey: "yesNo", aliases: ["家中有大病患者", "是否有大病患者"] },
  { fieldName: "收入来源(*)", canonicalKey: "incomeSource", validatorKey: "incomeSource", aliases: ["收入来源", "家庭收入来源"] },
] as const satisfies readonly DifficultyStudentFieldBinding[];

export const resolveDifficultyFieldBinding = (value: string) => {
  const normalized = normalizeDifficultyField(value);
  return DIFFICULTY_STUDENT_FIELD_BINDINGS.find((binding) =>
    [binding.fieldName, ...binding.aliases].some(
      (candidate) => normalizeDifficultyField(candidate) === normalized
    )
  );
};

export const getDifficultyFieldAliases = (value: string) => {
  const binding = resolveDifficultyFieldBinding(value);
  return binding ? [binding.fieldName, ...binding.aliases] : [];
};

export const getDifficultyTemplateValue = (
  rawData: Record<string, unknown> | null | undefined,
  field: DifficultyStudentTemplateField,
  fallback = ""
) => {
  const source = rawData || {};
  const aliases = getDifficultyFieldAliases(field).map(normalizeDifficultyField);
  const matched = Object.entries(source).find(([key]) =>
    aliases.includes(normalizeDifficultyField(key))
  );
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
