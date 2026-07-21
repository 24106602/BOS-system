import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RecognitionWindowForbiddenError,
  evaluateDifficultyRecognitionWindow,
  guardDifficultyRecognitionWindow,
  normalizeRecognitionDate,
  saveDifficultyRecognitionWindow,
} from "../server/difficultyRecognitionWindow.js";
import { difficultyStudentErrorHandler } from "../server/difficultyStudentRoutes.js";

const makeAdmin = (record = null) => {
  const calls = [];
  const query = {
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve({ data: record, error: null });
    },
    upsert(payload, options) {
      calls.push(["upsert", payload, options]);
      return this;
    },
    single() {
      calls.push(["single"]);
      return Promise.resolve({
        data: {
          ...record,
          academic_year: "2025-2026",
          start_date: "2025-09-01",
          end_date: "2025-10-31",
          status: "active",
        },
        error: null,
      });
    },
  };
  return {
    calls,
    from(table) {
      calls.push(["from", table]);
      return query;
    },
  };
};

test("未配置认定时间时保持向后兼容并允许操作", async () => {
  const result = await guardDifficultyRecognitionWindow(
    makeAdmin(),
    "2025-2026",
    { action: "import", now: new Date("2025-12-01T00:00:00Z") }
  );
  assert.equal(result.configured, false);
  assert.equal(result.isOpen, true);
});

test("认定时间范围包含开始日和结束日", () => {
  const record = {
    academic_year: "2025-2026",
    start_date: "2025-09-01",
    end_date: "2025-10-31",
    status: "active",
  };
  assert.equal(
    evaluateDifficultyRecognitionWindow(record, {
      now: new Date("2025-08-31T16:00:00Z"),
    }).isOpen,
    true
  );
  assert.equal(
    evaluateDifficultyRecognitionWindow(record, {
      now: new Date("2025-10-31T15:59:59Z"),
    }).isOpen,
    true
  );
});

test("非认定时间窗口抛出独立 403 错误并包含时间范围", async () => {
  const admin = makeAdmin({
    academic_year: "2025-2026",
    start_date: "2025-09-01",
    end_date: "2025-10-31",
    status: "active",
  });
  await assert.rejects(
    () => guardDifficultyRecognitionWindow(admin, "2025-2026", {
      action: "approve",
      now: new Date("2025-11-01T00:00:00Z"),
    }),
    (error) => {
      assert.ok(error instanceof RecognitionWindowForbiddenError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "OUTSIDE_RECOGNITION_WINDOW");
      assert.equal(error.message, "当前不在认定时间范围内（2025-09-01 ~ 2025-10-31）");
      return true;
    }
  );
});

test("Express API 将时间窗口错误映射为 403 结构化响应", () => {
  const error = new RecognitionWindowForbiddenError({
    academicYear: "2025-2026",
    startDate: "2025-09-01",
    endDate: "2025-10-31",
    currentDate: "2025-11-01",
    action: "report",
  });
  const response = {
    statusCode: 0,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  difficultyStudentErrorHandler(error, {}, response, () => {});
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, "OUTSIDE_RECOGNITION_WINDOW");
  assert.equal(response.body.message, "当前不在认定时间范围内（2025-09-01 ~ 2025-10-31）");
  assert.equal(response.body.academicYear, "2025-2026");
});

test("日期校验拒绝不存在的自然日", () => {
  assert.throws(
    () => normalizeRecognitionDate("2025-02-30", "开始日期"),
    /开始日期格式必须为 YYYY-MM-DD/
  );
});

test("Express 与 Worker 的指定写接口均接入独立时间守卫", () => {
  const expressSource = readFileSync(
    new URL("../server/difficultyStudentRoutes.js", import.meta.url),
    "utf8"
  );
  const workerSource = readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
  for (const source of [expressSource, workerSource]) {
    assert.match(source, /guardDifficultyRecognitionWindow/);
    assert.match(source, /guardDifficultyRecognitionWindows/);
    for (const action of ["import", "confirm", "approve", "reject", "report", "resubmit"]) {
      assert.match(
        source,
        new RegExp(`(?:action:\\s*["']${action}["']|transitionHandler\\(["']${action}["'])`)
      );
    }
  }
});

test("管理员保存时间窗口时校验日期并使用学年唯一键", async () => {
  const admin = makeAdmin();
  const result = await saveDifficultyRecognitionWindow(
    admin,
    "2025-2026",
    { startDate: "2025-09-01", endDate: "2025-10-31" },
    { user: { id: "admin-user-id" } }
  );
  assert.equal(result.configured, true);
  assert.ok(admin.calls.some((call) =>
    call[0] === "upsert" && call[2]?.onConflict === "academic_year"
  ));
  await assert.rejects(
    () => saveDifficultyRecognitionWindow(
      admin,
      "2025-2026",
      { startDate: "2025-11-01", endDate: "2025-10-31" },
      { user: { id: "admin-user-id" } }
    ),
    /开始日期不能晚于结束日期/
  );
});
