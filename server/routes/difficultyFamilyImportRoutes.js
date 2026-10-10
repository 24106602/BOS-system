/**
 * 家庭成员信息导入路由（Excel 解析 + 校验 + 确认导入）
 * 路径前缀: /api/difficulty-family-members/import
 */
import * as XLSX from "xlsx";
import crypto from "crypto";
import { getDataRepository } from "../data/index.js";
import { authenticateToken, requireRole } from "../auth/middleware.js";

const FIELD_BINDINGS = [
  { canonicalKey: "academicYear", aliases: ["年度*", "年度", "学年", "year"], required: true },
  { canonicalKey: "semester", aliases: ["学期*", "学期", "semester"], required: true },
  { canonicalKey: "studentIdCard", aliases: ["学生身份证号*", "学生身份证号", "学生身份证件号", "身份证号", "身份证件号", "证件号"], required: true },
  { canonicalKey: "memberName", aliases: ["家庭成员姓名*", "家庭成员姓名", "成员姓名", "家属姓名", "姓名"], required: true },
  { canonicalKey: "memberAge", aliases: ["家庭成员年龄*", "家庭成员年龄", "年龄", "成员年龄"], required: true },
  { canonicalKey: "relation", aliases: ["与学生关系*", "与学生关系", "关系", "家庭成员关系"], required: true },
  { canonicalKey: "workUnit", aliases: ["工作或学习单位*", "工作或学习单位", "工作单位", "单位", "学习单位"], required: true },
  { canonicalKey: "annualIncome", aliases: ["年收入（元）*", "年收入（元）", "年收入", "收入（元）", "收入"], required: true },
  { canonicalKey: "occupation", aliases: ["职业*", "职业", "工作"], required: true },
  { canonicalKey: "healthStatus", aliases: ["健康状况*", "健康状况", "健康"], required: true },
];

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

const validationCache = new Map();

export function registerDifficultyFamilyImportRoutes(app) {
  // ---------------------------------------------------------
  // 解析并校验家庭成员 Excel
  // POST /api/difficulty-family-members/import/validate
  // ---------------------------------------------------------
  app.post(
    "/api/difficulty-family-members/import/validate",
    authenticateToken,
    requireRole("admin", "college"),
    async (req, res) => {
      try {
        const { fileBase64, academicYear, collegeName } = req.body;

        if (!fileBase64) {
          return res.status(400).json({ error: "缺少文件数据" });
        }

        const base64Data = fileBase64.includes(",") ? fileBase64.split(",")[1] : fileBase64;
        const buffer = Buffer.from(base64Data, "base64");

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

          row.collegeName = collegeName || "";
          row.sourceFile = req.body.fileName || "";
          row.importedAt = new Date().toISOString().replace("T", " ").substring(0, 19);

          const idCard = row.studentIdCard || "";
          const memberName = row.memberName || "";
          const relation = row.relation || "";
          row.key = `${row.academicYear || ""}::${row.semester || ""}::${idCard}::${memberName}::${relation}`;

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
        console.error("[FamilyImport] Validate error:", error);
        res.status(500).json({ error: error.message || "解析校验失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 确认导入家庭成员
  // POST /api/difficulty-family-members/import/confirm
  // ---------------------------------------------------------
  app.post(
    "/api/difficulty-family-members/import/confirm",
    authenticateToken,
    requireRole("admin", "college"),
    async (req, res) => {
      try {
        const { validationToken, passedRows, academicYear } = req.body;

        let rowsToImport = passedRows;

        if (validationToken && validationCache.has(validationToken)) {
          const cached = validationCache.get(validationToken);
          rowsToImport = cached.passedRows;
          validationCache.delete(validationToken);
        }

        if (!rowsToImport || rowsToImport.length === 0) {
          return res.json({ inserted: 0, failed: 0, status: "draft" });
        }

        for (const row of rowsToImport) {
          if (!row.key) {
            const idCard = row.studentIdCard || "";
            const memberName = row.memberName || "";
            const relation = row.relation || "";
            row.key = `${row.academicYear || academicYear || ""}::${row.semester || ""}::${idCard}::${memberName}::${relation}`;
          }
          if (!row.academicYear && academicYear) row.academicYear = academicYear;
        }

        const repo = getDataRepository().difficultyFamilyMember;
        const inserted = await repo.bulkUpsert(rowsToImport);

        res.json({ inserted, failed: 0, status: "draft" });
      } catch (error) {
        console.error("[FamilyImport] Confirm error:", error);
        res.status(500).json({ error: error.message || "导入失败" });
      }
    }
  );

  console.log("[FamilyImport] 家庭成员导入路由已注册");
}
