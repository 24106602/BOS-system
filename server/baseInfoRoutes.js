import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  BaseInfoError,
  disableCounselor,
  disableDepartment,
  importCounselors,
  importDepartments,
  listCounselors,
  listDepartments,
  updateCounselor,
  updateDepartment,
} from "./baseInfoService.js";

const text = (value) => String(value ?? "").trim();

const authenticate = async (req, _res, next) => {
  try {
    const token = text(req.headers.authorization).replace(/^Bearer\s+/i, "");
    if (!token) throw new BaseInfoError("缺少登录凭证", 401, "UNAUTHENTICATED");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publishableKey || !serviceRoleKey) {
      throw new BaseInfoError("基础信息 API 的 Supabase 服务端环境变量未完整配置", 503, "BACKEND_NOT_CONFIGURED");
    }

    const authClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userResult.user) {
      throw new BaseInfoError("登录凭证无效或已过期", 401, "UNAUTHENTICATED");
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
      throw new BaseInfoError("账号资料不存在或已停用", 403, "ACCOUNT_DISABLED");
    }
    req.baseInfoContext = { admin, profile, user: userResult.user };
    next();
  } catch (error) {
    next(error);
  }
};

export const createBaseInfoRouter = () => {
  const router = Router();
  router.use(authenticate);

  router.get("/departments", async (req, res, next) => {
    try {
      const { admin, profile } = req.baseInfoContext;
      res.json({ data: await listDepartments(admin, profile) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/departments/import", async (req, res, next) => {
    try {
      const { admin, profile } = req.baseInfoContext;
      res.json(await importDepartments(admin, profile, req.body?.rows));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/departments/:id", async (req, res, next) => {
    try {
      const { admin, profile } = req.baseInfoContext;
      res.json({ data: await updateDepartment(admin, profile, req.params.id, req.body || {}) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/departments/:id", async (req, res, next) => {
    try {
      const { admin, profile } = req.baseInfoContext;
      await disableDepartment(admin, profile, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/counselors", async (req, res, next) => {
    try {
      const { admin, profile } = req.baseInfoContext;
      res.json({ data: await listCounselors(admin, profile) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/counselors/import", async (req, res, next) => {
    try {
      const { admin, profile } = req.baseInfoContext;
      res.json(await importCounselors(admin, profile, req.body?.rows));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/counselors/:id", async (req, res, next) => {
    try {
      const { admin, profile } = req.baseInfoContext;
      res.json({ data: await updateCounselor(admin, profile, req.params.id, req.body || {}) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/counselors/:id", async (req, res, next) => {
    try {
      const { admin, profile } = req.baseInfoContext;
      await disableCounselor(admin, profile, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({
      error: statusCode === 403 ? "Forbidden" : "Base info API error",
      code: error?.code || "BASE_INFO_API_ERROR",
      message: error instanceof Error ? error.message : "基础信息接口调用失败",
    });
  });

  return router;
};

export const registerBaseInfoRoutes = (app) => {
  app.use("/api/base-info", createBaseInfoRouter());
};
