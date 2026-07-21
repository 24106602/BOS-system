import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  CENTER_ONLY_DIFFICULTY_STATUS_TRANSITIONS,
  DIFFICULTY_STUDENT_STATUS_ACTION_TARGETS,
  DIFFICULTY_STUDENT_STATUS_TRANSITIONS,
  getDifficultyStudentActionTarget,
  normalizeDifficultyStudentStatus,
} from "../src/constants/statusTransitions.ts";
import { ForbiddenError, guardStatus } from "../src/utils/guardStatus.ts";
import {
  getDifficultyRecognitionWindow,
  guardDifficultyRecognitionWindow,
  guardDifficultyRecognitionWindows,
  saveDifficultyRecognitionWindow,
} from "./difficultyRecognitionWindow.js";
import {
  IncompleteDataError,
  reportDifficultyStudentsAtomically,
} from "./difficultyReportIntegrity.js";
import {
  DifficultyImportValidationError,
  assertDifficultyImportConstraints,
  translateDifficultyStudentUniqueError,
} from "./difficultyImportValidation.js";
import {
  confirmDifficultyStudentImport,
  validateDifficultyStudentImport,
} from "./validators/difficultyStudentImport.js";
import {
  applyLoggedDifficultyTransition,
  deleteDifficultyStudentWithLog,
  getDifficultyStudentOperationHistory,
  getTransitionLogAction,
  readRequiredWorkflowRemark,
  restoreDifficultyStudentWithLog,
  resolveResubmitTransition,
  saveDifficultyStudentWithLog,
} from "./difficultyReviewWorkflow.js";

const EDITABLE_FIELDS = [
  "academic_year",
  "college_name",
  "student_id",
  "name",
  "id_card",
  "grade",
  "gender",
  "difficulty_level",
  "photo_uploaded",
  "photo_url",
  "rejected_reason",
  "raw_data",
];

const text = (value) => String(value ?? "").trim();
const normalizeIdCard = (value) => text(value).replace(/\s|-/g, "").toUpperCase();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const getAcademicYears = (rows) => [
  ...new Set((rows || []).map((row) => text(row?.academic_year)).filter(Boolean)),
];

const pickEditableFields = (input) => Object.fromEntries(
  EDITABLE_FIELDS
    .filter((field) => Object.hasOwn(input || {}, field))
    .map((field) => [field, input[field]])
);

const forbidden = (message, currentStatus = "draft", action = "edit") =>
  new ForbiddenError(message, normalizeDifficultyStudentStatus(currentStatus), action, []);

const invalidRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "INVALID_REQUEST";
  return error;
};

const requireRole = (profile, roles) => {
  if (!roles.includes(profile.role)) {
    throw forbidden(`当前账号角色“${profile.role}”无权执行该操作`);
  }
};

const assertCollegeScope = (profile, collegeName) => {
  if (profile.role === "college" && text(profile.college_name) !== text(collegeName)) {
    throw forbidden("学院账号只能操作本学院困难生数据");
  }
};

const getTransitionTarget = (status, action) => {
  guardStatus(status, action, DIFFICULTY_STUDENT_STATUS_TRANSITIONS);
  const normalized = normalizeDifficultyStudentStatus(status);
  const target = getDifficultyStudentActionTarget(normalized, action);
  if (!target) throw forbidden(`状态操作“${action}”缺少目标状态定义`, normalized, action);
  return target;
};

const findReportSourceStatus = () => Object.keys(DIFFICULTY_STUDENT_STATUS_ACTION_TARGETS)
  .find((status) => DIFFICULTY_STUDENT_STATUS_ACTION_TARGETS[status]?.report === "reported");

const findStudent = async (admin, id) => {
  const { data, error } = await admin
    .from("students")
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const notFound = new Error("困难生记录不存在");
    notFound.statusCode = 404;
    throw notFound;
  }
  return data;
};

const findStudentByIdentity = async (admin, row) => {
  let query = admin
    .from("students")
    .select("*")
    .eq("academic_year", text(row.academic_year))
    .eq("college_name", text(row.college_name))
    .eq("is_deleted", false);
  const idCard = normalizeIdCard(row.id_card);
  const studentId = text(row.student_id);
  if (idCard) query = query.eq("id_card", idCard);
  else if (studentId) query = query.eq("student_id", studentId);
  else return null;
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
};

const authenticate = async (req, _res, next) => {
  try {
    const token = text(req.headers.authorization).replace(/^Bearer\s+/i, "");
    if (!token) {
      const error = new Error("缺少登录凭证");
      error.statusCode = 401;
      throw error;
    }
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publishableKey || !serviceRoleKey) {
      const error = new Error("困难生 API 的 Supabase 服务端环境变量未完整配置");
      error.statusCode = 503;
      throw error;
    }

    const authClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userResult.user) {
      const error = new Error("登录凭证无效或已过期");
      error.statusCode = 401;
      throw error;
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("auth_user_id,role,college_name,display_name,enabled")
      .eq("auth_user_id", userResult.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.enabled === false) {
      const error = new Error("账号资料不存在或已停用");
      error.statusCode = 403;
      throw error;
    }
    req.difficultyContext = { admin, profile, user: userResult.user };
    next();
  } catch (error) {
    next(error);
  }
};

export const difficultyStudentErrorHandler = (error, _req, res, _next) => {
  if (error instanceof DifficultyImportValidationError) {
    res.status(error.statusCode).json({
      code: error.code,
      message: error.message,
      failures: error.failures,
    });
    return;
  }
  if (error instanceof IncompleteDataError) {
    res.status(400).json({
      code: error.code,
      message: error.message,
      failures: error.failures,
    });
    return;
  }
  const statusCode = error instanceof ForbiddenError
    ? 403
    : Number(error?.statusCode) || 500;
  res.status(statusCode).json({
    error: statusCode === 403 ? "Forbidden" : "Difficulty student API error",
    code: error?.code || (statusCode === 403 ? "FORBIDDEN" : "DIFFICULTY_API_ERROR"),
    message: error instanceof Error ? error.message : "困难生接口调用失败",
    currentStatus: error?.currentStatus,
    action: error?.action,
    allowedPrerequisiteStatuses: error?.allowedPrerequisiteStatuses,
    academicYear: error?.academicYear,
    startDate: error?.startDate,
    endDate: error?.endDate,
    currentDate: error?.currentDate,
    failures: Array.isArray(error?.failures) ? error.failures : undefined,
  });
};

export const createDifficultyStudentRouter = () => {
  const router = Router();
  router.use(authenticate);

  const reportStudents = async (admin, students, context, additionalFailures = []) =>
    reportDifficultyStudentsAtomically(admin, students, {
      configuredChecks: process.env.DIFFICULTY_REPORT_REQUIRED_CHECKS,
      additionalFailures,
      context,
    });

  const getImportTokenSecret = () =>
    process.env.DIFFICULTY_IMPORT_TOKEN_SECRET
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;

  router.get("/time-window", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["college", "admin", "center"]);
      const data = await getDifficultyRecognitionWindow(admin, req.query.academicYear);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.put("/time-window/:academicYear", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["admin", "center"]);
      const data = await saveDifficultyRecognitionWindow(
        admin,
        req.params.academicYear,
        req.body || {},
        req.difficultyContext
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.post("/import/validate", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["college", "admin"]);
      await guardDifficultyRecognitionWindow(admin, req.body?.academicYear, {
        action: "import",
      });
      const result = await validateDifficultyStudentImport({
        context: req.difficultyContext,
        body: req.body || {},
        secret: getImportTokenSecret(),
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/import/confirm", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["college", "admin"]);
      const academicYear = text(req.body?.academicYear)
        || text(req.body?.passedRows?.[0]?.academic_year);
      await guardDifficultyRecognitionWindow(admin, academicYear, {
        action: "import",
      });
      const result = await confirmDifficultyStudentImport({
        context: req.difficultyContext,
        body: req.body || {},
        secret: getImportTokenSecret(),
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/disabled", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["admin"]);
      let query = admin
        .from("students")
        .select("*")
        .eq("is_deleted", true)
        .order("deleted_at", { ascending: false });
      if (text(req.query.academicYear)) query = query.eq("academic_year", text(req.query.academicYear));
      const { data, error } = await query;
      if (error) throw error;
      res.json({ data: data || [] });
    } catch (error) {
      next(error);
    }
  });

  router.post("/batch-submit", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["college", "admin"]);
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const preparedRows = [];

      for (const input of rows) {
        const row = pickEditableFields(input);
        row.academic_year = text(row.academic_year);
        row.college_name = text(row.college_name);
        row.student_id = text(row.student_id);
        row.id_card = normalizeIdCard(row.id_card);
        assertCollegeScope(profile, row.college_name);
        if (!row.academic_year || (!row.student_id && !row.id_card)) {
          skipped += 1;
          continue;
        }
        preparedRows.push(row);
      }

      await guardDifficultyRecognitionWindows(admin, getAcademicYears(preparedRows), {
        action: "confirm",
      });
      await assertDifficultyImportConstraints(admin, preparedRows, { allowExisting: true });

      for (const row of preparedRows) {
        const existing = await findStudentByIdentity(admin, row);
        const currentStatus = normalizeDifficultyStudentStatus(existing?.status, "draft");
        const nextStatus = getTransitionTarget(currentStatus, "submit");
        try {
          if (existing) {
            await applyLoggedDifficultyTransition(admin, existing, {
              currentStatus,
              nextStatus,
              operationAction: getTransitionLogAction(currentStatus, nextStatus),
              changes: row,
              context: req.difficultyContext,
            });
          } else {
            await saveDifficultyStudentWithLog(admin, {
              payload: row,
              nextStatus,
              action: "confirm",
              context: req.difficultyContext,
            });
          }
        } catch (error) {
          throw translateDifficultyStudentUniqueError(error, row);
        }
        if (existing) updated += 1;
        else inserted += 1;
      }
      res.json({ inserted, updated, skipped, failed: 0 });
    } catch (error) {
      next(error);
    }
  });

  router.post("/historical-import", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["admin"]);
      const row = pickEditableFields(req.body?.row || {});
      row.academic_year = text(row.academic_year);
      row.college_name = text(row.college_name);
      row.student_id = text(row.student_id);
      row.id_card = normalizeIdCard(row.id_card);
      await guardDifficultyRecognitionWindow(admin, row.academic_year, {
        action: "import",
      });
      await assertDifficultyImportConstraints(admin, [row]);
      const existing = await findStudentByIdentity(admin, row);
      const currentStatus = existing
        ? normalizeDifficultyStudentStatus(existing.status)
        : findReportSourceStatus();
      if (!currentStatus) throw new Error("未找到历史数据上报的前置状态定义");
      const nextStatus = getTransitionTarget(currentStatus, "report");
      try {
        await saveDifficultyStudentWithLog(admin, {
          student: existing,
          payload: row,
          currentStatus,
          nextStatus,
          action: "report",
          remark: "管理员导入往年困难生数据",
          context: req.difficultyContext,
        });
      } catch (error) {
        throw translateDifficultyStudentUniqueError(error, row);
      }
      res.json({ inserted: existing ? 0 : 1, updated: existing ? 1 : 0 });
    } catch (error) {
      next(error);
    }
  });

  router.post("/batch-report", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["admin"]);
      const requestedIds = Array.isArray(req.body?.ids)
        ? [...new Set(req.body.ids.map(text).filter(Boolean))]
        : [];
      if (requestedIds.length === 0) throw invalidRequest("上报记录不能为空");

      const validIds = requestedIds.filter((id) => UUID_PATTERN.test(id));
      const invalidIdFailures = requestedIds
        .filter((id) => !UUID_PATTERN.test(id))
        .map((id) => ({ studentId: id, reasons: ["困难生记录不存在"] }));
      const { data, error } = validIds.length > 0
        ? await admin.from("students").select("*").eq("is_deleted", false).in("id", validIds)
        : { data: [], error: null };
      if (error) throw error;

      const studentsById = new Map((data || []).map((student) => [text(student.id), student]));
      const missingFailures = validIds
        .filter((id) => !studentsById.has(id))
        .map((id) => ({ studentId: id, reasons: ["困难生记录不存在"] }));
      const students = validIds.map((id) => studentsById.get(id)).filter(Boolean);
      await guardDifficultyRecognitionWindows(admin, getAcademicYears(students), {
        action: "report",
      });
      const updated = await reportStudents(
        admin,
        students,
        req.difficultyContext,
        [...invalidIdFailures, ...missingFailures]
      );
      res.json({ data: updated, processed: updated.length });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["college", "admin"]);
      const student = await findStudent(admin, req.params.id);
      assertCollegeScope(profile, student.college_name);
      guardStatus(student.status, "edit", DIFFICULTY_STUDENT_STATUS_TRANSITIONS);
      const currentStatus = normalizeDifficultyStudentStatus(student.status);
      const nextStatus = getDifficultyStudentActionTarget(currentStatus, "edit") || currentStatus;
      const data = await applyLoggedDifficultyTransition(admin, student, {
        currentStatus,
        nextStatus,
        operationAction: "college_edit",
        changes: pickEditableFields(req.body),
        context: req.difficultyContext,
      });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/logs", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["college", "admin"]);
      const student = await findStudent(admin, req.params.id);
      assertCollegeScope(profile, student.college_name);
      const data = await getDifficultyStudentOperationHistory(admin, student.id);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["college", "admin"]);
      const student = await findStudent(admin, req.params.id);
      assertCollegeScope(profile, student.college_name);
      guardStatus(student.status, "delete", DIFFICULTY_STUDENT_STATUS_TRANSITIONS);
      await deleteDifficultyStudentWithLog(
        admin,
        student,
        req.difficultyContext,
        text(req.body?.remark)
      );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/restore", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["admin"]);
      const { data: student, error } = await admin
        .from("students")
        .select("*")
        .eq("id", req.params.id)
        .eq("is_deleted", true)
        .maybeSingle();
      if (error) throw error;
      if (!student) throw invalidRequest("已禁用困难生记录不存在");
      const data = await restoreDifficultyStudentWithLog(
        admin,
        student,
        req.difficultyContext,
        text(req.body?.remark) || "管理员恢复已禁用困难生记录"
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  const transitionHandler = (action, roles, centerOnly = false) => async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, roles);
      const student = await findStudent(admin, req.params.id);
      assertCollegeScope(profile, student.college_name);
      await guardDifficultyRecognitionWindow(admin, student.academic_year, {
        action,
      });
      const currentStatus = normalizeDifficultyStudentStatus(student.status);
      const nextStatus = getTransitionTarget(currentStatus, action);
      if (action === "submit" && currentStatus === "draft" && text(student.rejected_reason)) {
        throw invalidRequest("学校退回后的修改记录必须填写修改说明并通过“修改后重新提交”操作提交");
      }
      const transitionKey = `${currentStatus}->${nextStatus}`;
      const isCenterOnly = CENTER_ONLY_DIFFICULTY_STATUS_TRANSITIONS.includes(transitionKey);
      if (isCenterOnly !== centerOnly) {
        throw forbidden("该状态转换必须通过对应角色的专用接口执行", currentStatus, action);
      }
      const remark = action === "reject" && nextStatus === "rejected_by_school"
        ? readRequiredWorkflowRemark(req.body, {
          fields: ["remark", "reason"],
          label: "退回原因",
        })
        : "";
      const data = await applyLoggedDifficultyTransition(admin, student, {
        currentStatus,
        nextStatus,
        operationAction: getTransitionLogAction(currentStatus, nextStatus),
        remark,
        context: req.difficultyContext,
      });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  };

  router.post("/:id/submit", transitionHandler("submit", ["college", "admin"]));
  router.post("/:id/approve", transitionHandler("approve", ["admin"]));
  router.post("/:id/reject", transitionHandler("reject", ["admin"]));
  router.post("/:id/resubmit", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["college"]);
      const student = await findStudent(admin, req.params.id);
      assertCollegeScope(profile, student.college_name);
      await guardDifficultyRecognitionWindow(admin, student.academic_year, {
        action: "resubmit",
      });
      const { currentStatus, nextStatus } = resolveResubmitTransition(
        student.status,
        Boolean(text(student.rejected_reason))
      );
      const remark = readRequiredWorkflowRemark(req.body, {
        fields: ["remark", "modificationRemark"],
        label: "修改说明",
      });
      const data = await applyLoggedDifficultyTransition(admin, student, {
        currentStatus,
        nextStatus,
        operationAction: "college_resubmit",
        remark,
        context: req.difficultyContext,
      });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });
  router.post("/:id/report", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["admin"]);
      const student = await findStudent(admin, req.params.id);
      await guardDifficultyRecognitionWindow(admin, student.academic_year, {
        action: "report",
      });
      const updated = await reportStudents(admin, [student], req.difficultyContext);
      res.json({ data: updated[0] || null });
    } catch (error) {
      next(error);
    }
  });
  router.post("/:id/return-by-center", transitionHandler("reject", ["center"], true));

  return router;
};

export const registerDifficultyStudentRoutes = (app) => {
  app.use("/api/difficulty-students", createDifficultyStudentRouter());
  app.use(difficultyStudentErrorHandler);
};
