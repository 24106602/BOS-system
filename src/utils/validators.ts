// 通用校验和格式化工具：集中处理身份证、手机号、邮编、必填项、数字和字典修正。
export const normalizeText = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",")
    .replace(/。/g, ".")
    .replace(/；/g, ";")
    .replace(/:/g, "")
    .replace(/：/g, "")
    .toLowerCase();

export const cleanFieldName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\*/g, "")
    .replace(/\s+/g, "")
    .replace(/（.*?）/g, "")
    .replace(/\(.*?\)/g, "");

export const isRequiredByRule = (field: string, ruleText: string) =>
  field.includes("*") || ruleText.includes("必填");

export const isValidIdCard = (value: string) => /^[1-9]\d{16}[\dX]$/.test(value);

export const isValidPhone = (value: string) => /^\d{11}$/.test(value);

export const isValidPostcode = (value: string) => /^\d{6}$/.test(value);

export const digitsOnly = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export const isZeroLikeText = (value: string) => {
  const text = normalizeText(value);
  return ["", "无", "没有", "否", "零", "0", "0.0", "0.00", "暂无"].includes(text);
};

export const parseRuleOptions = (ruleText: string) => {
  const result: string[] = [];
  const regex = /[“"]([^”"]+)[”"]/g;
  let match;

  while ((match = regex.exec(String(ruleText ?? ""))) !== null) {
    const value = String(match[1] ?? "").trim();
    if (value && !result.includes(value)) result.push(value);
  }

  return result;
};

export const extractMaxLength = (ruleText: string) => {
  const match =
    ruleText.match(/不超过\s*(\d+)\s*个?字符/) ||
    ruleText.match(/长度.*?不超过\s*(\d+)/);

  return match ? Number(match[1]) : null;
};

export const shouldBeNumber = (field: string, ruleText: string) => {
  if (field.includes("身份证")) return false;
  if (field.includes("手机")) return false;
  if (field.includes("电话")) return false;
  if (field.includes("邮政编码")) return false;

  return (
    ruleText.includes("只能填写数字") ||
    ruleText.includes("只能填写整数") ||
    field.includes("年龄") ||
    field.includes("人口数") ||
    field.includes("人口") ||
    field.includes("年收入") ||
    field.includes("欠债金额") ||
    field.includes("劳动人口") ||
    field.includes("赡养人口")
  );
};

const provinceNames = [
  "江苏省", "北京市", "天津市", "河北省", "山西省", "内蒙古自治区", "辽宁省", "吉林省",
  "黑龙江省", "上海市", "浙江省", "安徽省", "福建省", "江西省", "山东省", "河南省",
  "湖北省", "湖南省", "广东省", "广西壮族自治区", "海南省", "重庆市", "四川省", "贵州省",
  "云南省", "西藏自治区", "陕西省", "甘肃省", "青海省", "宁夏回族自治区", "新疆维吾尔自治区",
  "台湾省", "香港特别行政区", "澳门特别行政区",
];

const provinceAliasMap: Record<string, string> = {
  广西: "广西壮族自治区",
  内蒙古: "内蒙古自治区",
  西藏: "西藏自治区",
  宁夏: "宁夏回族自治区",
  新疆: "新疆维吾尔自治区",
  香港: "香港特别行政区",
  澳门: "澳门特别行政区",
  北京: "北京市",
  天津: "天津市",
  上海: "上海市",
  重庆: "重庆市",
};

export const fixProvince = (value: string) => {
  const text = String(value ?? "").trim();
  const exact = provinceNames.find((p) => text === p);
  if (exact) return exact;

  for (const key of Object.keys(provinceAliasMap)) {
    if (text.includes(key)) return provinceAliasMap[key];
  }

  const found = provinceNames.find((p) => {
    const short = p
      .replace("省", "")
      .replace("市", "")
      .replace("自治区", "")
      .replace("特别行政区", "")
      .replace("壮族", "")
      .replace("回族", "")
      .replace("维吾尔", "");

    return text.includes(p) || text.includes(short);
  });

  return found || text;
};

export const SMART_FIX: Record<string, string> = {
  身份证: "居民身份证",
  身份证号: "居民身份证",
  男性: "男",
  女性: "女",
  male: "男",
  female: "女",
  yes: "是",
  no: "否",
  是的: "是",
  不是: "否",
  城市: "城镇",
  城镇户口: "城镇",
  非农: "城镇",
  非农业: "城镇",
  市区: "城镇",
  乡村: "农村",
  农村户口: "农村",
  农业: "农村",
  农户: "农村",
};

export const specialDifficultyList = [
  "无",
  "脱贫家庭学生",
  "脱贫不稳定家庭学生",
  "边缘易致贫家庭学生",
  "突发严重困难家庭学生",
  "低保家庭学生",
  "低保边缘家庭学生",
  "特困救助供养学生",
  "刚性支出困难家庭学生",
  "其他低收入家庭学生",
  "孤儿",
  "事实无人抚养儿童",
  "残疾学生",
  "残疾人子女",
  "烈士子女",
];

export const specialDifficultyRequiredList = specialDifficultyList.filter((item) => item !== "无");

export const incomeSourceList = [
  "工资、奖金、津贴、补贴和其他劳动收入",
  "离退休金、基本养老金、基本生活费、失业保险金",
  "继承、接受赠予、出租或出售家庭财产获得的收入",
  "存款及利息，有价证券及红利、股票、博彩收入",
  "经商、办厂以及从事种植业、养殖业、加工业扣除必要成本后的收入",
  "赡养费、抚(扶)养费",
  "自谋职业收入",
  "其他应当计入家庭的收入",
];

export const disabilityCategoryList = ["无", "视力残疾", "听力残疾", "智力残疾", "其他残疾"];

export const keywordMatch = (
  value: string,
  candidates: string[],
  keywordMap: Record<string, string[]>
) => {
  const text = normalizeText(value);
  const exact = candidates.find((item) => normalizeText(item) === text);
  if (exact) return exact;

  let bestValue = "";
  let bestScore = 0;

  candidates.forEach((candidate) => {
    let score = 0;
    const candidateText = normalizeText(candidate);

    if (candidateText.includes(text) || text.includes(candidateText)) score += 20;

    const keywords = keywordMap[candidate] || [];
    keywords.forEach((keyword) => {
      if (text.includes(normalizeText(keyword))) score += 30;
    });

    for (const char of text) {
      if (candidateText.includes(char)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestValue = candidate;
    }
  });

  return bestScore > 0 ? bestValue : "";
};

export const fixSpecialDifficulty = (value: string) => {
  const keywordMap: Record<string, string[]> = {
    无: ["无", "没有", "否", "普通", "一般"],
    脱贫家庭学生: ["脱贫", "建档立卡", "已脱贫", "扶贫"],
    脱贫不稳定家庭学生: ["脱贫不稳定", "不稳定脱贫", "返贫风险"],
    边缘易致贫家庭学生: ["边缘", "易致贫", "边缘户"],
    突发严重困难家庭学生: ["突发", "严重困难", "重大变故", "意外"],
    低保家庭学生: ["低保", "低保户"],
    低保边缘家庭学生: ["低保边缘", "边缘低保"],
    特困救助供养学生: ["特困", "救助供养", "供养"],
    刚性支出困难家庭学生: ["刚性支出", "支出困难", "大额支出"],
    其他低收入家庭学生: ["低收入", "其他低收入"],
    孤儿: ["孤儿"],
    事实无人抚养儿童: ["事实无人抚养", "无人抚养"],
    残疾学生: ["本人残疾", "残疾学生"],
    残疾人子女: ["残疾人子女", "父母残疾", "家长残疾"],
    烈士子女: ["烈士"],
  };

  return keywordMatch(value, specialDifficultyList, keywordMap) || value;
};

export const fixIncomeSource = (value: string) => {
  const keywordMap: Record<string, string[]> = {
    "工资、奖金、津贴、补贴和其他劳动收入": ["工资", "奖金", "津贴", "补贴", "劳动", "打工", "务工", "上班"],
    "离退休金、基本养老金、基本生活费、失业保险金": ["退休", "退休金", "养老金", "基本生活费", "失业", "失业保险"],
    "继承、接受赠予、出租或出售家庭财产获得的收入": ["继承", "赠予", "出租", "出售", "房租", "租金", "财产"],
    "存款及利息，有价证券及红利、股票、博彩收入": ["存款", "利息", "证券", "红利", "股票", "博彩"],
    "经商、办厂以及从事种植业、养殖业、加工业扣除必要成本后的收入": ["经商", "办厂", "种植", "养殖", "加工", "务农", "农业", "个体经营"],
    "赡养费、抚(扶)养费": ["赡养", "抚养", "扶养"],
    自谋职业收入: ["自谋", "自由职业", "灵活就业", "个体"],
    其他应当计入家庭的收入: ["其他", "无", "未知", "不详", "果园"],
  };

  return keywordMatch(value, incomeSourceList, keywordMap) || "其他应当计入家庭的收入";
};

export const fixYesNo = (value: string) => {
  const text = normalizeText(value);
  if (!text) return "否";

  const noWords = ["否", "无", "没有", "没", "未", "不是", "不", "0", "false", "no"];
  const yesWords = ["是", "有", "存在", "发生", "1", "true", "yes", "y"];

  if (noWords.some((word) => text === normalizeText(word) || text.includes(normalizeText(word)))) return "否";
  if (yesWords.some((word) => text === normalizeText(word) || text.includes(normalizeText(word)))) return "是";

  return "否";
};

export const fixDisabilityCategory = (value: string) => {
  const text = normalizeText(value);

  if (
    !text ||
    text === normalizeText("否") ||
    text.includes(normalizeText("没有")) ||
    text.includes(normalizeText("无")) ||
    text.includes(normalizeText("不是"))
  ) {
    return "无";
  }

  if (text.includes(normalizeText("视力"))) return "视力残疾";
  if (text.includes(normalizeText("听力"))) return "听力残疾";
  if (text.includes(normalizeText("智力"))) return "智力残疾";
  if (text.includes(normalizeText("残疾"))) return "其他残疾";

  return disabilityCategoryList.find((item) => normalizeText(item) === text) || value;
};

export const compressText = (value: string, maxLength: number) => {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/因为/g, "")
    .replace(/由于/g, "")
    .replace(/所以/g, "")
    .replace(/导致/g, "")
    .replace(/家庭/g, "家")
    .replace(/经济/g, "经")
    .replace(/困难/g, "困");

  return cleaned.length <= maxLength ? cleaned : cleaned.slice(0, maxLength);
};

export const formatIncomeNumber = (num: number) => {
  const fixed = (Math.round(num * 100) / 100).toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
};

export const parseAmountToNumber = (raw: string) => {
  const text = String(raw ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/￥/g, "")
    .replace(/元/g, "")
    .replace(/\s+/g, "");

  if (!text) return null;
  if (["无", "没有", "零", "0", "0.0", "0.00", "无欠债", "没有欠债"].includes(text)) return 0;

  const wanMatch = text.match(/(\d+(\.\d+)?)万/);
  if (wanMatch) return Number(wanMatch[1]) * 10000;

  const numberMatch = text.match(/\d+(\.\d+)?/);
  return numberMatch ? Number(numberMatch[0]) : null;
};

export const parseIntegerValue = (raw: unknown) => {
  const num = parseAmountToNumber(String(raw ?? ""));
  return num === null || Number.isNaN(num) ? null : Math.floor(num);
};

export const trimIntegerToSixDigits = (num: number) => {
  const intText = String(Math.floor(Math.abs(num)));
  return intText.length <= 6 ? intText : intText.slice(0, 6);
};

export const currentAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 9 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
};

export const fixSchoolYear = (value: string, validList: string[]) => {
  const raw = String(value ?? "").trim();
  const current = currentAcademicYear();

  if (!raw) return validList.includes(current) ? current : validList[0] || current;

  const exact = validList.find((item) => normalizeText(item) === normalizeText(raw));
  if (exact) return exact;

  const numbers = raw.match(/\d{4}/g);
  if (numbers && numbers.length >= 2) {
    const fixed = `${numbers[0]}-${numbers[1]}`;
    const matched = validList.find((item) => normalizeText(item) === normalizeText(fixed));
    if (matched) return matched;
  }

  const shortYearMatch = raw.match(/(20\d{2})\D*(\d{2})/);
  if (shortYearMatch) {
    const fixed = `${shortYearMatch[1]}-20${shortYearMatch[2]}`;
    const matched = validList.find((item) => normalizeText(item) === normalizeText(fixed));
    if (matched) return matched;
  }

  return raw;
};

export const fixTerm = (value: string, validList: string[]) => {
  const raw = String(value ?? "").trim();
  const text = normalizeText(raw);

  if (!raw) return validList.includes("全学年") ? "全学年" : validList[0] || raw;

  const exact = validList.find((item) => normalizeText(item) === text);
  if (exact) return exact;
  if (text.includes("全") || text.includes("全年")) return "全学年";
  if (text.includes("春")) return "春季学期";
  if (text.includes("秋")) return "秋季学期";

  return raw;
};

export const fixRelation = (value: string, validList: string[]) => {
  const raw = String(value ?? "").trim();
  const text = normalizeText(raw);
  const exact = validList.find((item) => normalizeText(item) === text);
  if (exact) return exact;

  const keywordMap: Record<string, string[]> = {
    父亲: ["父亲", "爸爸", "父", "爸"],
    母亲: ["母亲", "妈妈", "母", "妈"],
    爷爷: ["爷爷", "祖父"],
    奶奶: ["奶奶", "祖母"],
    外公: ["外公", "外祖父"],
    外婆: ["外婆", "外祖母"],
    哥哥: ["哥哥", "兄长", "兄"],
    姐姐: ["姐姐", "姐"],
    弟弟: ["弟弟", "弟"],
    妹妹: ["妹妹", "妹"],
    妻子: ["妻子", "老婆", "配偶"],
    丈夫: ["丈夫", "老公", "配偶"],
    儿子: ["儿子", "儿"],
    女儿: ["女儿", "女"],
    其他: ["其他", "亲属", "家属"],
  };

  return keywordMatch(raw, validList, keywordMap) || raw;
};

export const fixHealthStatus = (value: string, validList: string[]) => {
  const raw = String(value ?? "").trim();
  const text = normalizeText(raw);
  const exact = validList.find((item) => normalizeText(item) === text);
  if (exact) return exact;

  const keywordMap: Record<string, string[]> = {
    健康: ["健康", "正常", "很好"],
    良好: ["良好", "较好", "好"],
    一般: ["一般", "普通"],
    体质较差: ["体质较差", "较差", "差", "体弱"],
    有严重疾病: ["严重疾病", "重病", "大病", "癌", "尿毒症"],
    有慢性病: ["慢性病", "慢病", "高血压", "糖尿病"],
    身体伤残: ["伤残", "残疾", "残障"],
  };

  return keywordMatch(raw, validList, keywordMap) || raw;
};
