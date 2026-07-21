import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import cors from "cors";
import { registerBaseInfoRoutes } from "./server/baseInfoRoutes.js";
import { registerDifficultyStudentRoutes } from "./server/difficultyStudentRoutes.js";

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
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

const isOriginAllowed = (origin) =>
  !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin);

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
    maxAge: 86400,
  })
);
app.use(express.json({
  limit: process.env.API_MAX_BODY_SIZE || process.env.DEEPSEEK_MAX_BODY_SIZE || "12mb",
}));

registerBaseInfoRoutes(app);
registerDifficultyStudentRoutes(app);

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

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
app.listen(port, () => {
  console.log(`DeepSeek server running on http://localhost:${port}`);
});
