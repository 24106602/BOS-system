import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

app.post("/api/deepseek", async (req, res) => {
  try {
    const { prompt } = req.body;

    const result = await client.chat.completions.create({
      model: "deepseek-v4-pro",
      messages: [
        {
          role: "system",
          content:
            "你是高校困难生数据治理系统助手，负责分析Excel字段错误、生成修复建议和问题总结。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    res.json({
      text: result.choices[0].message.content,
    });
  } catch (error) {
    res.status(500).json({
      error: "DeepSeek 调用失败",
      detail: error.message,
    });
  }
});

app.listen(3001, () => {
  console.log("DeepSeek server running on http://localhost:3001");
});
