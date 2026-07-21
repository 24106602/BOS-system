import assert from "node:assert/strict";
import test from "node:test";
import {
  exportDifficultyStudents,
  fetchDifficultyExportRows,
  makeDifficultyExportFile,
  normalizeDifficultyExportRequest,
} from "../server/difficultyStudentExport.js";
import {
  DEFAULT_DIFFICULTY_EXPORT_COLUMN_KEYS,
  MAX_DIFFICULTY_EXPORT_LIMIT,
} from "../src/constants/difficultyExportColumns.ts";

const adminProfile = { role: "admin", display_name: "学校管理员" };

const makeQueryAdmin = (rows) => {
  const calls = [];
  const rpcCalls = [];
  return {
    calls,
    rpcCalls,
    from(table) {
      calls.push(["from", table]);
      const query = {
        select(columns) {
          calls.push(["select", columns]);
          return this;
        },
        eq(column, value) {
          calls.push(["eq", column, value]);
          return this;
        },
        ilike(column, value) {
          calls.push(["ilike", column, value]);
          return this;
        },
        in(column, value) {
          calls.push(["in", column, value]);
          return this;
        },
        order(column, options) {
          calls.push(["order", column, options]);
          return this;
        },
        range(start, end) {
          calls.push(["range", start, end]);
          return Promise.resolve({
            data: rows.slice(start, end + 1),
            error: null,
          });
        },
      };
      return query;
    },
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      return { data: "export-log-id", error: null };
    },
  };
};

test("默认只导出基础列且不包含敏感字段", () => {
  const request = normalizeDifficultyExportRequest(
    { academicYear: "2025-2026" },
    adminProfile
  );
  assert.deepEqual(
    request.columns.map((column) => column.key),
    DEFAULT_DIFFICULTY_EXPORT_COLUMN_KEYS
  );
  assert.equal(request.sensitiveColumns.length, 0);
  assert.equal(request.includeSensitive, false);
  assert.equal(request.format, "xlsx");
});

test("导出列使用白名单并强制敏感信息显式确认", () => {
  assert.throws(
    () => normalizeDifficultyExportRequest({
      academicYear: "2025-2026",
      columns: ["name", "not_allowed_column"],
    }, adminProfile),
    /导出列不在允许的白名单内/
  );

  assert.throws(
    () => normalizeDifficultyExportRequest({
      academicYear: "2025-2026",
      columns: ["name", "idCard"],
    }, adminProfile),
    (error) => {
      assert.equal(error.code, "SENSITIVE_EXPORT_CONFIRMATION_REQUIRED");
      return true;
    }
  );

  const confirmed = normalizeDifficultyExportRequest({
    academicYear: "2025-2026",
    columns: ["name", "idCard"],
    includeSensitive: true,
  }, adminProfile);
  assert.deepEqual(confirmed.sensitiveColumns.map((column) => column.key), ["idCard"]);
});

test("单次导出超过 5000 条时明确要求分批", () => {
  assert.throws(
    () => normalizeDifficultyExportRequest({
      academicYear: "2025-2026",
      limit: MAX_DIFFICULTY_EXPORT_LIMIT + 1,
    }, adminProfile),
    new RegExp(`单次导出上限为 ${MAX_DIFFICULTY_EXPORT_LIMIT} 条`)
  );
});

test("学院账号后端强制精确限定本学院数据", async () => {
  const admin = makeQueryAdmin([{
    id: "record-1",
    academic_year: "2025-2026",
    college_name: "计算机学院",
    name: "张三",
  }]);
  const request = normalizeDifficultyExportRequest({
    academicYear: "2025-2026",
    limit: 1,
    filters: { collegeName: "其他学院" },
  }, { role: "college", college_name: "计算机学院" });

  await fetchDifficultyExportRows(admin, request);
  assert.ok(admin.calls.some((call) =>
    call[0] === "eq" && call[1] === "college_name" && call[2] === "计算机学院"
  ));
  assert.equal(admin.calls.some((call) => call[0] === "ilike" && call[1] === "college_name"), false);
});

test("CSV 导出只包含所选列并防止表格公式注入", () => {
  const request = normalizeDifficultyExportRequest({
    academicYear: "2025-2026",
    columns: ["name", "student_id"],
    format: "csv",
  }, adminProfile);
  const file = makeDifficultyExportFile([{
    name: "=1+1",
    student_id: "S001",
    raw_data: {},
  }], request);
  const csv = new TextDecoder().decode(file);
  assert.match(csv, /姓名,学号/);
  assert.match(csv, /'=1\+1,S001/);
  assert.doesNotMatch(csv, /身份证号/);
});

test("数值为零的模板字段不会在导出时被当作空值", () => {
  const request = normalizeDifficultyExportRequest({
    academicYear: "2025-2026",
    columns: ["familyIncome"],
    includeSensitive: true,
    format: "csv",
  }, adminProfile);
  const file = makeDifficultyExportFile([{
    raw_data: { "家庭人均年收入(*)": 0 },
  }], request);
  const csv = new TextDecoder().decode(file);
  assert.match(csv, /家庭人均年收入\(\*\)/);
  assert.match(csv, /\n0/);
});

test("每次导出记录操作人、字段、敏感标记和实际条数", async () => {
  const admin = makeQueryAdmin([{
    id: "record-1",
    academic_year: "2025-2026",
    college_name: "计算机学院",
    name: "张三",
    id_card: "310101200001010010",
    status: "school_approved",
    raw_data: { "身份证号(*)": "310101200001010010" },
  }]);
  const context = {
    user: { id: "00000000-0000-4000-8000-000000000001" },
    profile: adminProfile,
  };

  const result = await exportDifficultyStudents(admin, {
    academicYear: "2025-2026",
    columns: ["name", "idCard"],
    includeSensitive: true,
    limit: 10,
    format: "xlsx",
  }, context);

  assert.ok(result.file.byteLength > 0);
  assert.equal(result.rowCount, 1);
  assert.equal(admin.rpcCalls.length, 1);
  assert.equal(admin.rpcCalls[0].name, "log_operation");
  const params = admin.rpcCalls[0].params;
  assert.equal(params.p_action, "export");
  assert.equal(params.p_operator_id, context.user.id);
  assert.deepEqual(params.p_snapshot.columns, ["name", "idCard"]);
  assert.deepEqual(params.p_snapshot.sensitive_columns, ["idCard"]);
  assert.equal(params.p_snapshot.sensitive_included, true);
  assert.equal(params.p_snapshot.row_count, 1);
});
