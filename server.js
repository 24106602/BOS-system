import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { registerBaseInfoRoutes } from "./server/baseInfoRoutes.js";
import { registerDifficultyStudentRoutes } from "./server/difficultyStudentRoutes.js";
import { registerAuthRoutes } from "./server/routes/authRoutes.js";
import { registerEnrolledStudentRoutes } from "./server/routes/enrolledStudentRoutes.js";
import { registerDifficultyStudentDetailRoutes } from "./server/routes/difficultyStudentRoutes.js";
import { registerDifficultyFamilyRoutes } from "./server/routes/difficultyFamilyRoutes.js";
import { registerDifficultyImportRoutes } from "./server/routes/difficultyImportRoutes.js";
import { registerDifficultyFamilyImportRoutes } from "./server/routes/difficultyFamilyImportRoutes.js";
import { registerUserRoutes } from "./server/routes/userRoutes.js";
import { checkHealth } from "./server/data/sqlserver/connection.js";

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "null",
];

const allowedOrigins = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// CORS 放行规则：
// 1. 无 Origin 头（非浏览器请求）→ 放行
// 2. 白名单包含 "*" → 全部放行
// 3. Origin 在白名单中 → 放行
// 4. ALLOWED_ORIGINS 为空（生产同源部署）→ 全部放行
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  if (allowedOrigins.includes("*")) return true;
  return allowedOrigins.includes(origin);
};

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: [
      "Content-Disposition",
      "X-Export-Row-Count",
      "X-Export-Limit",
      "X-Export-Offset",
      "X-Export-Next-Offset",
      "X-Export-Has-More",
    ],
    maxAge: 86400,
  })
);
app.use(express.json({
  limit: process.env.API_MAX_BODY_SIZE || process.env.DEEPSEEK_MAX_BODY_SIZE || "12mb",
}));

registerBaseInfoRoutes(app);

const dataSource = process.env.DATA_SOURCE || "supabase";
if (dataSource !== "sqlserver") {
  registerDifficultyStudentRoutes(app);
}

// SQL Server 模式路由
if (dataSource === "sqlserver") {
  registerAuthRoutes(app);
  registerEnrolledStudentRoutes(app);
  registerDifficultyStudentDetailRoutes(app);
  registerDifficultyFamilyRoutes(app);
  registerDifficultyImportRoutes(app);
  registerDifficultyFamilyImportRoutes(app);
  registerUserRoutes(app);
  console.log(`[Server] SQL Server 模式已启用`);
}

const client = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    })
  : null;

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const MAX_PROMPT_LENGTH = Number.parseInt(process.env.DEEPSEEK_MAX_PROMPT_LENGTH || "20000", 10);
const SYSTEM_PROMPT =
  "你是高校困难生数据治理系统助手，负责分析 Excel 治理结果、生成问题总结和整改建议。";

app.post("/api/deepseek", async (req, res) => {
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      res.status(500).json({
        error: "DeepSeek 调用失败",
        detail: "服务端未配置 DEEPSEEK_API_KEY",
      });
      return;
    }

    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) {
      res.status(400).json({
        error: "DeepSeek 调用失败",
        detail: "请求 body 中缺少 prompt",
      });
      return;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      res.status(413).json({
        error: "DeepSeek 调用失败",
        detail: `prompt 超过最大长度 ${MAX_PROMPT_LENGTH}`,
      });
      return;
    }

    const result = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    res.json({
      text: result.choices[0]?.message?.content || "",
    });
  } catch (error) {
    console.error("DeepSeek proxy request failed:", error);
    res.status(502).json({
      error: "DeepSeek 调用失败",
      detail: "上游服务暂不可用，请稍后重试",
    });
  }
});

const port = Number.parseInt(process.env.PORT || "3001", 10);

// ---------------------------------------------------------
// 健康检查端点
// ---------------------------------------------------------
app.get("/api/health", async (req, res) => {
  const start = Date.now();
  const dbHealth = await checkHealth();
  const latency = Date.now() - start;

  const health = {
    status: dbHealth.status === "healthy" ? "ok" : "error",
    timestamp: new Date().toISOString(),
    latencyMs: latency,
    database: dbHealth,
    dataSource: process.env.DATA_SOURCE || "sqlserver",
    uptime: process.uptime(),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
    },
  };

  res.status(dbHealth.status === "healthy" ? 200 : 503).json(health);
});

// ---------------------------------------------------------
// 生产环境：提供前端静态文件
// ---------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");

if (fs.existsSync(distDir)) {
  console.log(`[Server] 生产模式：提供前端静态文件 (${distDir})`);
  app.use(
    express.static(distDir, {
      maxAge: "1h",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );

  // SPA 路由回退：所有非 API 请求返回 index.html
  app.get(/^\/(?!api\/|assets\/|favicon\.ico|logo\.png).*/, (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  console.log(`[Server] 开发模式：未找到前端 dist 目录，仅提供 API 服务`);
}

app.listen(port, () => {
  console.log(`BOS API Server running on http://localhost:${port} (数据源: ${dataSource})`);
});
