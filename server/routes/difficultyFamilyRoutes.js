/**
 * 困难生家庭成员信息 API 路由
 * 路径前缀: /api/difficulty-family-members
 */
import { getDataRepository } from "../data/index.js";
import { authenticateToken, requireRole, withCollegeScope } from "../auth/middleware.js";

export function registerDifficultyFamilyRoutes(app) {
  const repo = () => getDataRepository().difficultyFamilyMember;

  // ---------------------------------------------------------
  // 批量导入家庭成员信息
  // POST /api/difficulty-family-members/batch
  // body: { members: [...], mode: "append" | "replace" }
  // ---------------------------------------------------------
  app.post(
    "/api/difficulty-family-members/batch",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { members = [], mode = "append" } = req.body;

        if (!Array.isArray(members) || members.length === 0) {
          return res.status(400).json({ error: "请提供家庭成员数据" });
        }

        if (mode === "replace") {
          await repo().softDeleteAll();
        }

        const count = await repo().bulkUpsert(members);
        res.json({ count, mode });
      } catch (error) {
        console.error("[DifficultyFamily] Batch import error:", error);
        res.status(500).json({ error: error.message || "批量导入失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 按学生身份证号查询家庭成员
  // GET /api/difficulty-family-members/by-student/:studentIdCard
  // ---------------------------------------------------------
  app.get(
    "/api/difficulty-family-members/by-student/:studentIdCard",
    authenticateToken,
    async (req, res) => {
      try {
        const { studentIdCard } = req.params;
        const result = await repo().findByStudentIdCard(studentIdCard);
        res.json(result);
      } catch (error) {
        console.error("[DifficultyFamily] FindByStudent error:", error);
        res.status(500).json({ error: "查询家庭成员失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 按学年查询所有家庭成员
  // GET /api/difficulty-family-members?academicYear=2025&semester=1
  // ---------------------------------------------------------
  app.get(
    "/api/difficulty-family-members",
    authenticateToken,
    withCollegeScope,
    async (req, res) => {
      try {
        const { academicYear, semester } = req.query;
        if (!academicYear) {
          return res.status(400).json({ error: "请提供学年参数" });
        }
        const result = await repo().findByAcademicYear(academicYear, semester || null);
        res.json(result);
      } catch (error) {
        console.error("[DifficultyFamily] List error:", error);
        res.status(500).json({ error: "获取家庭成员列表失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 统计数量
  // GET /api/difficulty-family-members/count
  // ---------------------------------------------------------
  app.get(
    "/api/difficulty-family-members/count",
    authenticateToken,
    async (req, res) => {
      try {
        const { includeDeleted = "false" } = req.query;
        const total = await repo().count(includeDeleted === "true");
        res.json({ total });
      } catch (error) {
        console.error("[DifficultyFamily] Count error:", error);
        res.status(500).json({ error: "统计失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 按学生身份证号软删除家庭成员（仅管理员）
  // DELETE /api/difficulty-family-members/by-student/:studentIdCard
  // ---------------------------------------------------------
  app.delete(
    "/api/difficulty-family-members/by-student/:studentIdCard",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { studentIdCard } = req.params;
        await repo().softDeleteByStudentIdCard(studentIdCard);
        res.json({ success: true });
      } catch (error) {
        console.error("[DifficultyFamily] Delete error:", error);
        res.status(500).json({ error: "删除失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 清空所有（软删除全部，仅管理员）
  // DELETE /api/difficulty-family-members
  // ---------------------------------------------------------
  app.delete(
    "/api/difficulty-family-members",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        await repo().softDeleteAll();
        res.json({ success: true });
      } catch (error) {
        console.error("[DifficultyFamily] Clear error:", error);
        res.status(500).json({ error: "清空失败" });
      }
    }
  );

  console.log("[DifficultyFamily] 家庭成员信息路由已注册");
}
