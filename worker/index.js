import { createClient } from "@supabase/supabase-js";
import {
  CENTER_ONLY_DIFFICULTY_STATUS_TRANSITIONS,
  DIFFICULTY_STUDENT_STATUS_ACTION_TARGETS,
  DIFFICULTY_STUDENT_STATUS_TRANSITIONS,
  getDifficultyStudentActionTarget,
  normalizeDifficultyStudentStatus,
} from "../src/constants/statusTransitions.ts";
import { ForbiddenError, guardStatus } from "../src/utils/guardStatus.ts";

const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization";
const DEFAULT_ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const DEFAULT_MAX_PROMPT_LENGTH = 20000;
const DIFFICULTY_API_PREFIX = "/api/difficulty-students";
const SYSTEM_PROMPT =
  "你是高校困难生数据治理系统助手，负责分析 Excel 治理结果、生成问题总结和整改建议。";

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

const parseAllowedOrigins = (env) =>
  String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const getCors = (request, env) => {
  const requestOrigin = request.headers.get("Origin");
  const sameOrigin = new URL(request.url).origin;
  const allowedOrigins = parseAllowedOrigins(env);
  const allowAnyOrigin = allowedOrigins.includes("*");
  const isAllowed =
    !requestOrigin ||
    requestOrigin === sameOrigin ||
    allowAnyOrigin ||
    allowedOrigins.includes(requestOrigin);

  return {
    isAllowed,
    headers: {
      "Access-Control-Allow-Origin": allowAnyOrigin ? "*" : requestOrigin || sameOrigin,
      "Access-Control-Allow-Methods": DEFAULT_ALLOWED_METHODS,
      "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  };
};

const jsonResponse = (body, status, corsHeaders) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });

const apiError = (message, statusCode = 500, code = "DIFFICULTY_API_ERROR") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

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

const getSupabaseClients = async (request, env) => {
  const token = text(request.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  if (!token) throw apiError("缺少登录凭证", 401, "UNAUTHENTICATED");

  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) {
    throw apiError("困难生 API 的 Supabase 服务端环境变量未完整配置", 503, "BACKEND_NOT_CONFIGURED");
  }

  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userResult.user) {
    throw apiError("登录凭证无效或已过期", 401, "UNAUTHENTICATED");
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
    throw apiError("账号资料不存在或已停用", 403, "ACCOUNT_DISABLED");
  }

  return { admin, profile, user: userResult.user };
};

const findStudent = async (admin, id) => {
  const { data, error } = await admin.from("students").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw apiError("困难生记录不存在", 404, "NOT_FOUND");
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

const readJsonBody = async (request) => {
  try {
    return await request.json();
  } catch {
    throw apiError("请求 body 必须是有效 JSON", 400, "INVALID_JSON");
  }
};

const handleBatchSubmit = async (request, context) => {
  const { admin, profile } = context;
  requireRole(profile, ["college", "admin"]);
  const body = await readJsonBody(request);
  const rows = Array.isArray(body?.rows) ? body.rows : [];
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

  return { body: { inserted, updated, skipped, failed: 0 }, status: 200 };
};

const handleHistoricalImport = async (request, context) => {
  const { admin, profile } = context;
  requireRole(profile, ["admin"]);
  const body = await readJsonBody(request);
  const row = pickEditableFields(body?.row || {});
  row.academic_year = text(row.academic_year);
  row.college_name = text(row.college_name);
  row.student_id = text(row.student_id);
  row.id_card = normalizeIdCard(row.id_card);
  const existing = await findStudentByIdentity(admin, row);
  const currentStatus = existing
    ? normalizeDifficultyStudentStatus(existing.status)
    : findReportSourceStatus();
  if (!currentStatus) throw apiError("未找到历史数据上报的前置状态定义");
  const nextStatus = getTransitionTarget(currentStatus, "report");
  const result = existing
    ? await admin.from("students").update({ ...row, status: nextStatus }).eq("id", existing.id)
    : await admin.from("students").insert({ ...row, status: nextStatus });
  if (result.error) throw result.error;
  return { body: { inserted: existing ? 0 : 1, updated: existing ? 1 : 0 }, status: 200 };
};

const handleEdit = async (request, context, id) => {
  const { admin, profile } = context;
  requireRole(profile, ["college", "admin"]);
  const student = await findStudent(admin, id);
  assertCollegeScope(profile, student.college_name);
  guardStatus(student.status, "edit", DIFFICULTY_STUDENT_STATUS_TRANSITIONS);
  const currentStatus = normalizeDifficultyStudentStatus(student.status);
  const nextStatus = getDifficultyStudentActionTarget(currentStatus, "edit") || currentStatus;
  const body = await readJsonBody(request);
  const { data, error } = await admin
    .from("students")
    .update({ ...pickEditableFields(body), status: nextStatus })
    .eq("id", student.id)
    .select()
    .single();
  if (error) throw error;
  return { body: { data }, status: 200 };
};

const handleDelete = async (_request, context, id) => {
  const { admin, profile } = context;
  requireRole(profile, ["college", "admin"]);
  const student = await findStudent(admin, id);
  assertCollegeScope(profile, student.college_name);
  guardStatus(student.status, "delete", DIFFICULTY_STUDENT_STATUS_TRANSITIONS);
  const { error } = await admin.from("students").delete().eq("id", student.id);
  if (error) throw error;
  return { body: null, status: 204 };
};

const handleTransition = async (request, context, id, routeAction) => {
  const actionConfig = {
    submit: { action: "submit", roles: ["college", "admin"], centerOnly: false },
    approve: { action: "approve", roles: ["admin"], centerOnly: false },
    reject: { action: "reject", roles: ["admin"], centerOnly: false },
    report: { action: "report", roles: ["admin"], centerOnly: false },
    "return-by-center": { action: "reject", roles: ["center"], centerOnly: true },
  }[routeAction];
  if (!actionConfig) throw apiError("状态操作接口不存在", 404, "NOT_FOUND");

  const { admin, profile } = context;
  requireRole(profile, actionConfig.roles);
  const student = await findStudent(admin, id);
  assertCollegeScope(profile, student.college_name);
  const currentStatus = normalizeDifficultyStudentStatus(student.status);
  const nextStatus = getTransitionTarget(currentStatus, actionConfig.action);
  const transitionKey = `${currentStatus}->${nextStatus}`;
  const isCenterOnly = CENTER_ONLY_DIFFICULTY_STATUS_TRANSITIONS.includes(transitionKey);
  if (isCenterOnly !== actionConfig.centerOnly) {
    throw forbidden("该状态转换必须通过对应角色的专用接口执行", currentStatus, actionConfig.action);
  }

  let body = {};
  if (request.headers.get("Content-Type")?.includes("application/json")) {
    body = await readJsonBody(request);
  }
  const changes = actionConfig.action === "reject" && nextStatus === "rejected_by_school"
    ? { status: nextStatus, rejected_reason: text(body?.reason) }
    : { status: nextStatus };
  const { data, error } = await admin
    .from("students")
    .update(changes)
    .eq("id", student.id)
    .select()
    .single();
  if (error) throw error;
  return { body: { data }, status: 200 };
};

const handleDifficultyApi = async (request, env) => {
  const context = await getSupabaseClients(request, env);
  const url = new URL(request.url);
  const relativePath = url.pathname.slice(DIFFICULTY_API_PREFIX.length) || "/";

  if (request.method === "POST" && relativePath === "/batch-submit") {
    return handleBatchSubmit(request, context);
  }
  if (request.method === "POST" && relativePath === "/historical-import") {
    return handleHistoricalImport(request, context);
  }

  const recordMatch = relativePath.match(/^\/([^/]+)$/);
  if (recordMatch && request.method === "PATCH") {
    return handleEdit(request, context, decodeURIComponent(recordMatch[1]));
  }
  if (recordMatch && request.method === "DELETE") {
    return handleDelete(request, context, decodeURIComponent(recordMatch[1]));
  }

  const transitionMatch = relativePath.match(/^\/([^/]+)\/(submit|approve|reject|report|return-by-center)$/);
  if (transitionMatch && request.method === "POST") {
    return handleTransition(
      request,
      context,
      decodeURIComponent(transitionMatch[1]),
      transitionMatch[2]
    );
  }

  throw apiError("困难生接口不存在", 404, "NOT_FOUND");
};

const handleDeepSeek = async (request, env) => {
  if (!env.DEEPSEEK_API_KEY) {
    throw apiError("Worker Secret 未配置 DEEPSEEK_API_KEY", 503, "BACKEND_NOT_CONFIGURED");
  }

  const body = await readJsonBody(request);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw apiError("请求 body 中缺少 prompt", 400, "INVALID_PROMPT");

  const maxPromptLength = Number.parseInt(env.DEEPSEEK_MAX_PROMPT_LENGTH || "", 10)
    || DEFAULT_MAX_PROMPT_LENGTH;
  if (prompt.length > maxPromptLength) {
    throw apiError(`prompt 超过最大长度 ${maxPromptLength}`, 413, "PROMPT_TOO_LARGE");
  }

  const deepseekResponse = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });

  const data = await deepseekResponse.json().catch(() => ({}));
  if (!deepseekResponse.ok) {
    throw apiError("上游服务返回异常，请稍后重试", deepseekResponse.status, "DEEPSEEK_UPSTREAM_ERROR");
  }
  return { body: { text: data?.choices?.[0]?.message?.content || "" }, status: 200 };
};

const formatError = (error) => {
  const isForbidden = error instanceof ForbiddenError;
  const status = isForbidden ? 403 : Number(error?.statusCode) || 500;
  return {
    status,
    body: {
      error: status === 403 ? "Forbidden" : "API error",
      code: error?.code || (status === 403 ? "FORBIDDEN" : "API_ERROR"),
      message: error instanceof Error ? error.message : "接口调用失败",
      currentStatus: error?.currentStatus,
      action: error?.action,
      allowedPrerequisiteStatuses: error?.allowedPrerequisiteStatuses,
    },
  };
};

export default {
  async fetch(request, env) {
    const cors = getCors(request, env);
    if (!cors.isAllowed) return jsonResponse({ error: "Forbidden" }, 403, cors.headers);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors.headers });
    }

    const url = new URL(request.url);
    try {
      let result;
      if (url.pathname === "/api/deepseek" && request.method === "POST") {
        result = await handleDeepSeek(request, env);
      } else if (url.pathname.startsWith(`${DIFFICULTY_API_PREFIX}/`)) {
        result = await handleDifficultyApi(request, env);
      } else {
        result = { body: { error: "Not Found" }, status: 404 };
      }

      if (result.status === 204) return new Response(null, { status: 204, headers: cors.headers });
      return jsonResponse(result.body, result.status, cors.headers);
    } catch (error) {
      console.error("BOS worker request failed:", error);
      const result = formatError(error);
      return jsonResponse(result.body, result.status, cors.headers);
    }
  },
};
