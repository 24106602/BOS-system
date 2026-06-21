const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST" || url.pathname !== "/api/deepseek") {
      return jsonResponse({ error: "Not Found" }, 404);
    }

    try {
      if (!env.DEEPSEEK_API_KEY) {
        return jsonResponse(
          { error: "DeepSeek调用失败", detail: "缺少 DEEPSEEK_API_KEY Worker Secret" },
          500
        );
      }

      const { prompt } = await request.json();

      if (!prompt || typeof prompt !== "string") {
        return jsonResponse(
          { error: "DeepSeek调用失败", detail: "请求 body 中缺少 prompt" },
          400
        );
      }

      const deepseekResponse = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content:
                "你是高校困难生数据治理系统助手，负责分析Excel治理结果、生成问题总结和整改建议。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      const data = await deepseekResponse.json();

      if (!deepseekResponse.ok) {
        return jsonResponse(
          {
            error: "DeepSeek调用失败",
            detail: data?.error?.message || deepseekResponse.statusText,
          },
          deepseekResponse.status
        );
      }

      return jsonResponse({
        text: data?.choices?.[0]?.message?.content || "",
      });
    } catch (error) {
      return jsonResponse(
        {
          error: "DeepSeek调用失败",
          detail: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  },
};
