/**
 * 困难生导入路由（Excel 解析 + 校验 + 确认导入）
 * 路径前缀: /api/difficulty-students/import
 */
import * as XLSX from "xlsx";
import crypto from "crypto";
import { getDataRepository } from "../data/index.js";
import { authenticateToken, requireRole } from "../auth/middleware.js";

// 字段别名映射（与前端 DIFFICULTY_STUDENT_FIELD_BINDINGS 一致）
const FIELD_BINDINGS = [
  { canonicalKey: "name", aliases: ["姓名", "姓名(*)", "学生姓名", "name"], required: true },
  { canonicalKey: "studentId", aliases: ["学号", "学生学号", "student_id"], required: false },
  { canonicalKey: "nativePlace", aliases: ["籍贯", "籍贯(*)", "籍贯（*）"], required: true },
  { canonicalKey: "idCard", aliases: ["身份证号", "身份证号码", "身份证件号", "证件号码", "证件号", "学生身份证号", "身份证号(*)", "id_card"], required: true },
  { canonicalKey: "familyPopulation", aliases: ["家庭人口数", "家庭人口", "家庭人数", "人口数", "家庭人口数(*)"], required: true },
  { canonicalKey: "phone", aliases: ["手机号码", "手机号", "联系电话", "联系方式", "学生联系电话", "手机号码(*)"], required: true },
  { canonicalKey: "counselorName", aliases: ["辅导员姓名", "辅导员"], required: false },
  { canonicalKey: "applicationDate", aliases: ["申请日期", "日期", "申请日期(*)"], required: true },
  { canonicalKey: "familyAddress", aliases: ["家庭地址", "家庭住址", "通讯地址", "详细地址", "家庭地址(*)"], required: true },
  { canonicalKey: "postcode", aliases: ["邮政编码", "邮编", "家庭邮编", "邮政编码(*)"], required: true },
  { canonicalKey: "parentPhone", aliases: ["家长手机号码", "家长手机号", "监护人电话", "家长联系电话", "监护人联系电话", "家长手机号码(*)"], required: true },
  { canonicalKey: "specialDifficultyType", aliases: ["特殊困难类型", "特殊群体类型", "特殊困难群体类型", "困难类型", "特殊困难类型(*)"], required: true },
  { canonicalKey: "familyIncome", aliases: ["家庭人均年收入", "家庭年均收入", "家庭年收入", "家庭人均年收入(*)"], required: true },
  { canonicalKey: "hasNaturalDisaster", aliases: ["是否遭受自然灾害", "是否遭受自然灾害(*)"], required: true },
  { canonicalKey: "naturalDisasterDescription", aliases: ["自然灾害描述", "自然灾害情况"], required: true },
  { canonicalKey: "hasUnexpectedEvent", aliases: ["是否遭受突发事件", "是否遭受突发意外事件", "是否遭受突发事件(*)"], required: true },
  { canonicalKey: "unexpectedEventDescription", aliases: ["突发事件描述", "突发意外事件具体描述", "意外事件描述"], required: true },
  { canonicalKey: "familyDisabilityWeakLaborSituation", aliases: ["家庭成员因残疾、年迈而劳动能力弱情况", "家庭成员因残疾、 无年迈而劳动能力弱情况", "家庭成员因残疾无年迈而劳动能力弱情况"], required: true },
  { canonicalKey: "familyUnemploymentSituation", aliases: ["家庭成员失业情况"], required: true },
  { canonicalKey: "familyDebtAmount", aliases: ["家庭欠债金额", "欠债金额", "负债金额", "债务金额", "家庭欠债金额(*)"], required: true },
  { canonicalKey: "familyDebtReason", aliases: ["家庭欠债情况", "学生家庭欠债原因", "家庭欠债原因", "欠债原因", "负债原因"], required: true },
  { canonicalKey: "otherSituation", aliases: ["其他情况", "其它重大信息", "其他说明", "其它影响家庭经济信息", "其他影响家庭经济信息"], required: false },
  { canonicalKey: "finalRecommendLevel", aliases: ["推荐档次", "困难等级", "困难认定等级", "认定等级", "推荐档次(*)"], required: true },
  { canonicalKey: "studentStatement", aliases: ["陈述理由", "申请理由", "困难陈述"], required: true },
  { canonicalKey: "recognitionDate", aliases: ["认定时间", "认定日期", "认定时间(*)"], required: true },
  { canonicalKey: "agreesReviewGroup", aliases: ["是否同意评议小组意见", "是否同意评议小组意见(*)"], required: true },
  { canonicalKey: "collegeRecommendLevel", aliases: ["院系推荐档次", "院系认定结果", "院系困难等级", "院系认定档次", "院系推荐结果", "院系推荐档次(*)"], required: true },
  { canonicalKey: "collegeOpinion", aliases: ["院系意见", "院系意见（60字）(*)"], required: true },
  { canonicalKey: "agreesCollegeWorkingGroup", aliases: ["是否同意院系工作组意见", "是否同意院系工作组意见(*)"], required: true },
  { canonicalKey: "schoolRecommendLevel", aliases: ["学校推荐档次", "学校认定结果", "学校困难等级", "学校认定档次", "学校推荐结果", "学校推荐档次(*)"], required: true },
  { canonicalKey: "schoolOpinion", aliases: ["学校意见", "学校意见（60字）(*)"], required: true },
  { canonicalKey: "householdType", aliases: ["户籍性质", "户口性质", "户籍性质（*）"], required: true },
  { canonicalKey: "laborPopulation", aliases: ["劳动力人口数", "劳动力人口", "劳动人口数", "劳动人口", "劳动力人口数（*）"], required: true },
  { canonicalKey: "unemployedPopulation", aliases: ["家庭失业人数", "失业人数", "家庭失业人数（*）"], required: true },
  { canonicalKey: "dependentPopulation", aliases: ["赡养人口数", "赡养人口", "赡养人口数（*）"], required: true },
  { canonicalKey: "isWubaoHousehold", aliases: ["是否五保户", "五保户", "是否五保户（*）"], required: true },
  { canonicalKey: "isSingleParentChild", aliases: ["是否单亲家庭子女", "是否单亲", "单亲家庭子女", "是否单亲家庭子女（*）"], required: true },
  { canonicalKey: "disabilityCategory", aliases: ["残疾类别", "残疾类型", "残疾类别（*）"], required: true },
  { canonicalKey: "parentsLostLaborAbility", aliases: ["父母是否丧失劳动", "父母是否丧失劳动能力", "父母是否丧失劳动（*）"], required: true },
  { canonicalKey: "hasMajorDiseasePatient", aliases: ["家中有大病患者", "是否有大病患者", "家中有大病患者（*）"], required: true },
  { canonicalKey: "incomeSource", aliases: ["收入来源", "家庭收入来源", "收入来源(*)"], required: true },
];

const YES_NO_VALUES = new Set(["是", "否", "yes", "no", "true", "false", "Y", "N"]);

function normalizeHeader(str) {
  return String(str || "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u3000]/g, "")
    .replace(/[*＊()（）:：，,。；;]/g, "")
    .toLowerCase()
    .trim();
}

function buildHeaderMap(headers) {
  const map = {};
  for (const binding of FIELD_BINDINGS) {
    for (const alias of binding.aliases) {
      const normalized = normalizeHeader(alias);
      for (let i = 0; i < headers.length; i++) {
        if (normalizeHeader(headers[i]) === normalized && !(i in map)) {
          map[i] = binding.canonicalKey;
          break;
        }
      }
    }
  }
  return map;
}

function validateRow(row, rowIndex) {
  const errors = [];
  for (const binding of FIELD_BINDINGS) {
    if (!binding.required) continue;
    const val = row[binding.canonicalKey];
    if (val === undefined || val === null || String(val).trim() === "") {
      errors.push({
        row: rowIndex + 1,
        field: binding.canonicalKey,
        reason: `${binding.canonicalKey} 为必填项`,
      });
    }
  }
  return errors;
}

// 内存中暂存校验结果（简单实现，不持久化）
const validationCache = new Map();

export function registerDifficultyImportRoutes(app) {
  // ---------------------------------------------------------
  // 解析并校验 Excel 文件
  // POST /api/difficulty-students/import/validate
  // ---------------------------------------------------------
  app.post(
    "/api/difficulty-students/import/validate",
    authenticateToken,
    requireRole("admin", "college"),
    async (req, res) => {
      try {
        const { fileBase64, academicYear, collegeName } = req.body;

        if (!fileBase64) {
          return res.status(400).json({ error: "缺少文件数据" });
        }

        // 解析 base64
        const base64Data = fileBase64.includes(",") ? fileBase64.split(",")[1] : fileBase64;
        const buffer = Buffer.from(base64Data, "base64");

        // 解析 Excel
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        if (rawRows.length < 2) {
          return res.json({
            validationToken: "",
            total: 0,
            passed: 0,
            failed: 0,
            failures: [],
            passedRows: [],
            failedRows: [],
          });
        }

        const headers = rawRows[0];
        const headerMap = buildHeaderMap(headers);

        const passedRows = [];
        const failedRows = [];
        const failures = [];

        for (let i = 1; i < rawRows.length; i++) {
          const raw = rawRows[i];
          if (!raw || raw.every((c) => !c && c !== 0)) continue;

          const row = {};
          for (const [colIndex, canonicalKey] of Object.entries(headerMap)) {
            row[canonicalKey] = raw[colIndex] !== undefined ? String(raw[colIndex]).trim() : "";
          }

          // 添加元数据
          row.academicYear = academicYear || "";
          row.collegeName = collegeName || "";
          row.semester = "1";
          row.sourceFile = req.body.fileName || "";
          row.importedAt = new Date().toISOString().replace("T", " ").substring(0, 19);

          // 生成 key
          const idCard = row.idCard || "";
          const studentId = row.studentId || "";
          row.key = `${academicYear || "unknown"}::${collegeName || "unknown"}::${idCard}::${studentId}`;

          const errors = validateRow(row, i);
          if (errors.length > 0) {
            failedRows.push({ row: i, data: row, errors });
            failures.push(...errors);
          } else {
            passedRows.push(row);
          }
        }

        const token = crypto.randomBytes(16).toString("hex");
        validationCache.set(token, {
          passedRows,
          academicYear,
          collegeName,
          createdAt: Date.now(),
        });

        // 30 分钟过期
        setTimeout(() => validationCache.delete(token), 30 * 60 * 1000);

        res.json({
          validationToken: token,
          total: passedRows.length + failedRows.length,
          passed: passedRows.length,
          failed: failedRows.length,
          failures,
          passedRows,
          failedRows,
        });
      } catch (error) {
        console.error("[DifficultyImport] Validate error:", error);
        res.status(500).json({ error: error.message || "解析校验失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 确认导入
  // POST /api/difficulty-students/import/confirm
  // ---------------------------------------------------------
  app.post(
    "/api/difficulty-students/import/confirm",
    authenticateToken,
    requireRole("admin", "college"),
    async (req, res) => {
      try {
        const { validationToken, passedRows, academicYear } = req.body;

        let rowsToImport = passedRows;

        // 如果有 token 且缓存中有数据，使用缓存的数据
        if (validationToken && validationCache.has(validationToken)) {
          const cached = validationCache.get(validationToken);
          rowsToImport = cached.passedRows;
          validationCache.delete(validationToken);
        }

        if (!rowsToImport || rowsToImport.length === 0) {
          return res.json({ inserted: 0, failed: 0, status: "draft" });
        }

        // 确保 key 和元数据存在
        for (const row of rowsToImport) {
          if (!row.key) {
            const idCard = row.idCard || "";
            const studentId = row.studentId || "";
            row.key = `${academicYear || "unknown"}::${row.collegeName || "unknown"}::${idCard}::${studentId}`;
          }
          if (!row.academicYear) row.academicYear = academicYear || "";
        }

        const repo = getDataRepository().difficultyStudentDetail;
        const inserted = await repo.bulkUpsert(rowsToImport);

        res.json({ inserted, failed: 0, status: "draft" });
      } catch (error) {
        console.error("[DifficultyImport] Confirm error:", error);
        res.status(500).json({ error: error.message || "导入失败" });
      }
    }
  );

  console.log("[DifficultyImport] 困难生导入路由已注册");
}
