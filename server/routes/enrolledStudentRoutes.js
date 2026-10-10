/**
 * 在校生数据 API 路由
 * SQL Server 模式下使用
 */
import { getDataRepository } from "../data/index.js";
import { authenticateToken, requireRole, withCollegeScope } from "../auth/middleware.js";

export function registerEnrolledStudentRoutes(app) {
  const repo = getDataRepository();

  // ---------------------------------------------------------
  // 获取在校生列表
  // ---------------------------------------------------------
  app.get(
    "/api/enrolled-students",
    authenticateToken,
    withCollegeScope,
    async (req, res) => {
      try {
        const { includeDeleted = "false", offset = "0", limit = "1000" } = req.query;
        const options = {
          includeDeleted: includeDeleted === "true",
          offset: Number.parseInt(offset, 10),
          limit: Number.parseInt(limit, 10),
        };

        // 学院端只能看全校在校生（只读，用于身份校验）
        // 管理员可以看到全部，学院用户也可以读取（但只读）
        if (req.collegeScope) {
          // 学院用户：可以读取全部在校生（用于身份校验），但不返回敏感字段
          const students = await repo.enrolledStudent.findAll(options);
          const safeStudents = students.map((s) => ({
            id: s.id,
            studentId: s.studentId,
            name: s.name,
            college: s.college,
            major: s.major,
            className: s.className,
            grade: s.grade,
          }));
          res.json(safeStudents);
        } else {
          // 管理员：完整数据
          const students = await repo.enrolledStudent.findAll(options);
          res.json(students);
        }
      } catch (error) {
        console.error("[EnrolledStudents] List error:", error);
        res.status(500).json({ error: "获取在校生列表失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 在校生身份校验（公开接口，用于学院端导入时校验）
  // ---------------------------------------------------------
  app.post(
    "/api/enrolled-students/verify",
    authenticateToken,
    async (req, res) => {
      try {
        const { studentId, idCard, name } = req.body;
        const result = await repo.enrolledStudent.verifyStudent(
          studentId || "",
          idCard || "",
          name || ""
        );
        res.json(result);
      } catch (error) {
        console.error("[EnrolledStudents] Verify error:", error);
        res.status(500).json({ error: "身份校验失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 批量导入在校生（仅管理员）
  // mode: replace（全量替换） | append（追加）
  // ---------------------------------------------------------
  app.post(
    "/api/enrolled-students/batch",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { students = [], mode = "append" } = req.body;

        if (!Array.isArray(students) || students.length === 0) {
          return res.status(400).json({ error: "请提供学生数据" });
        }

        if (mode === "replace") {
          // 全量替换：先软删除所有，再插入
          await repo.enrolledStudent.softDeleteAll();
        }

        let count;
        if (mode === "append") {
          count = await repo.enrolledStudent.bulkUpsert(students);
        } else {
          count = await repo.enrolledStudent.bulkUpsert(students);
        }

        res.json({ count, mode });
      } catch (error) {
        console.error("[EnrolledStudents] Batch import error:", error);
        res.status(500).json({ error: error.message || "批量导入失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 清空在校生（软删除，仅管理员）
  // ---------------------------------------------------------
  app.delete(
    "/api/enrolled-students",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        await repo.enrolledStudent.softDeleteAll();
        res.json({ success: true });
      } catch (error) {
        console.error("[EnrolledStudents] Clear error:", error);
        res.status(500).json({ error: "清空失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 统计数量
  // ---------------------------------------------------------
  app.get(
    "/api/enrolled-students/count",
    authenticateToken,
    async (req, res) => {
      try {
        const { includeDeleted = "false" } = req.query;
        const total = await repo.enrolledStudent.count(includeDeleted === "true");
        res.json({ total });
      } catch (error) {
        console.error("[EnrolledStudents] Count error:", error);
        res.status(500).json({ error: "统计失败" });
      }
    }
  );

  console.log("[EnrolledStudents] 在校生数据路由已注册");
}
