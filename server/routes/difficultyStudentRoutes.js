/**
 * 困难生本专科信息 API 路由
 * 路径前缀: /api/difficulty-students
 */
import { getDataRepository } from "../data/index.js";
import { authenticateToken, requireRole, withCollegeScope } from "../auth/middleware.js";

export function registerDifficultyStudentDetailRoutes(app) {
  const repo = () => getDataRepository().difficultyStudentDetail;

  // ---------------------------------------------------------
  // 批量导入困难生本专科信息
  // POST /api/difficulty-students/batch
  // body: { students: [...], mode: "append" | "replace" }
  // ---------------------------------------------------------
  app.post(
    "/api/difficulty-students/batch",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { students = [], mode = "append" } = req.body;

        if (!Array.isArray(students) || students.length === 0) {
          return res.status(400).json({ error: "请提供困难生数据" });
        }

        if (mode === "replace") {
          await repo().softDeleteAll();
        }

        const count = await repo().bulkUpsert(students);
        res.json({ count, mode });
      } catch (error) {
        console.error("[DifficultyStudents] Batch import error:", error);
        res.status(500).json({ error: error.message || "批量导入失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 获取困难生列表
  // GET /api/difficulty-students?academicYear=2025&collegeName=xxx
  // ---------------------------------------------------------
  app.get(
    "/api/difficulty-students",
    authenticateToken,
    withCollegeScope,
    async (req, res) => {
      try {
        const { academicYear, includeDeleted = "false", offset = "0", limit = "1000" } = req.query;
        const collegeName = req.collegeScope || req.query.collegeName;

        const result = await repo().findByCollegeYear(collegeName || null, academicYear || null, {
          includeDeleted: includeDeleted === "true",
          offset: Number.parseInt(offset, 10),
          limit: Number.parseInt(limit, 10),
        });

        res.json(result);
      } catch (error) {
        console.error("[DifficultyStudents] List error:", error);
        res.status(500).json({ error: "获取困难生列表失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 按身份证号查询单个困难生
  // GET /api/difficulty-students/by-idcard/:idCard
  // ---------------------------------------------------------
  app.get(
    "/api/difficulty-students/by-idcard/:idCard",
    authenticateToken,
    async (req, res) => {
      try {
        const { idCard } = req.params;
        const result = await repo().findByIdCard(idCard);
        if (!result) {
          return res.status(404).json({ error: "未找到该困难生" });
        }
        res.json(result);
      } catch (error) {
        console.error("[DifficultyStudents] FindByIdCard error:", error);
        res.status(500).json({ error: "查询失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 统计数量
  // GET /api/difficulty-students/count
  // ---------------------------------------------------------
  app.get(
    "/api/difficulty-students/count",
    authenticateToken,
    async (req, res) => {
      try {
        const { includeDeleted = "false" } = req.query;
        const total = await repo().count(includeDeleted === "true");
        res.json({ total });
      } catch (error) {
        console.error("[DifficultyStudents] Count error:", error);
        res.status(500).json({ error: "统计失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 清空（软删除全部，仅管理员）
  // DELETE /api/difficulty-students
  // ---------------------------------------------------------
  app.delete(
    "/api/difficulty-students",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        await repo().softDeleteAll();
        res.json({ success: true });
      } catch (error) {
        console.error("[DifficultyStudents] Clear error:", error);
        res.status(500).json({ error: "清空失败" });
      }
    }
  );

  console.log("[DifficultyStudents] 困难生本专科信息路由已注册");
}
