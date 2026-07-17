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

const EDITABLE_FIELDS = [
  "academic_year",
  "college_name",
  "student_id",
  "name",
  "id_card",
  "grade",
  "gender",
  "difficulty_level",
  "rejected_reason",
  "raw_data",
];

const text = (value) => String(value ?? "").trim();
const normalizeIdCard = (value) => text(value).replace(/\s|-/g, "").toUpperCase();

const pickEditableFields = (input) => Object.fromEntries(
  EDITABLE_FIELDS
    .filter((field) => Object.hasOwn(input || {}, field))
    .map((field) => [field, input[field]])
);

const forbidden = (message, currentStatus = "draft", action = "edit") =>
  new ForbiddenError(message, normalizeDifficultyStudentStatus(currentStatus), action, []);

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
  const { data, error } = await admin.from("students").select("*").eq("id", id).maybeSingle();
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
    .eq("college_name", text(row.college_name));
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
      .select("auth_user_id,role,college_name,enabled")
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
  });
};

export const createDifficultyStudentRouter = () => {
  const router = Router();
  router.use(authenticate);

  router.post("/batch-submit", async (req, res, next) => {
    try {
      const { admin, profile } = req.difficultyContext;
      requireRole(profile, ["college", "admin"]);
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      let inserted = 0;
      let updated = 0;
      let skipped = 0;

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

        const existing = await findStudentByIdentity(admin, row);
        const currentStatus = normalizeDifficultyStudentStatus(existing?.status, "draft");
        const nextStatus = getTransitionTarget(currentStatus, "submit");
        const payload = { ...row, status: nextStatus };
        const result = existing
          ? await admin.from("students").update(payload).eq("id", existing.id)
          : await admin.from("students").insert(payload);
        if (result.error) throw result.error;
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
      const existing = await findStudentByIdentity(admin, row);
      const currentStatus = existing
        ? normalizeDifficultyStudentStatus(existing.status)
        : findReportSourceStatus();
      if (!currentStatus) throw new Error("未找到历史数据上报的前置状态定义");
      const nextStatus = getTransitionTarget(currentStatus, "report");
      const result = existing
        ? await admin.from("students").update({ ...row, status: nextStatus }).eq("id", existing.id)
        : await admin.from("students").insert({ ...row, status: nextStatus });
      if (result.error) throw result.error;
      res.json({ inserted: existing ? 0 : 1, updated: existing ? 1 : 0 });
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
      const { data, error } = await admin
        .from("students")
        .update({ ...pickEditableFields(req.body), status: nextStatus })
        .eq("id", student.id)
        .select()
        .single();
      if (error) throw error;
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
      const { error } = await admin.from("students").delete().eq("id", student.id);
      if (error) throw error;
      res.status(204).end();
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
      const currentStatus = normalizeDifficultyStudentStatus(student.status);
      const nextStatus = getTransitionTarget(currentStatus, action);
      const transitionKey = `${currentStatus}->${nextStatus}`;
      const isCenterOnly = CENTER_ONLY_DIFFICULTY_STATUS_TRANSITIONS.includes(transitionKey);
      if (isCenterOnly !== centerOnly) {
        throw forbidden("该状态转换必须通过对应角色的专用接口执行", currentStatus, action);
      }
      const transitionChanges = action === "reject" && nextStatus === "rejected_by_school"
        ? { status: nextStatus, rejected_reason: text(req.body?.reason) }
        : { status: nextStatus };
      const { data, error } = await admin
        .from("students")
        .update(transitionChanges)
        .eq("id", student.id)
        .select()
        .single();
      if (error) throw error;
      res.json({ data });
    } catch (error) {
      next(error);
    }
  };

  router.post("/:id/submit", transitionHandler("submit", ["college", "admin"]));
  router.post("/:id/approve", transitionHandler("approve", ["admin"]));
  router.post("/:id/reject", transitionHandler("reject", ["admin"]));
  router.post("/:id/report", transitionHandler("report", ["admin"]));
  router.post("/:id/return-by-center", transitionHandler("reject", ["center"], true));

  return router;
};

export const registerDifficultyStudentRoutes = (app) => {
  app.use("/api/difficulty-students", createDifficultyStudentRouter());
  app.use(difficultyStudentErrorHandler);
};
