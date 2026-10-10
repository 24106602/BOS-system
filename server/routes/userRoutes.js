/**
 * 用户管理路由（管理员）
 * 路径前缀: /api/admin/users
 */
import { getDataRepository } from "../data/index.js";
import { authenticateToken, requireRole } from "../auth/middleware.js";

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 6;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function registerUserRoutes(app) {
  // ---------------------------------------------------------
  // 获取用户列表（仅管理员）
  // GET /api/admin/users
  // ---------------------------------------------------------
  app.get(
    "/api/admin/users",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        const repo = getDataRepository().user;
        const users = await repo.findAll();
        res.json({ data: users.map(sanitizeUser), total: users.length });
      } catch (error) {
        console.error("[Users] List error:", error);
        res.status(500).json({ error: error.message || "获取用户列表失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 创建用户（仅管理员）
  // POST /api/admin/users
  // ---------------------------------------------------------
  app.post(
    "/api/admin/users",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { email, password, role, collegeName, displayName } = req.body;

        if (!email || !validateEmail(email)) {
          return res.status(400).json({ error: "请输入有效的邮箱地址" });
        }
        if (!password || !validatePassword(password)) {
          return res.status(400).json({ error: "密码长度至少 6 位" });
        }
        if (role && !["admin", "college"].includes(role)) {
          return res.status(400).json({ error: "角色只能是 admin 或 college" });
        }
        if (role === "college" && !collegeName) {
          return res.status(400).json({ error: "学院用户必须填写学院名称" });
        }

        const repo = getDataRepository().user;
        const existing = await repo.findByEmail(email);
        if (existing) {
          return res.status(409).json({ error: "该邮箱已被注册" });
        }

        const user = await repo.create({
          email,
          password,
          role: role || "college",
          collegeName: collegeName || null,
          displayName: displayName || email,
        });

        res.status(201).json({ user: sanitizeUser(user) });
      } catch (error) {
        console.error("[Users] Create error:", error);
        res.status(500).json({ error: error.message || "创建用户失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 更新用户（仅管理员）
  // PUT /api/admin/users/:id
  // ---------------------------------------------------------
  app.put(
    "/api/admin/users/:id",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { email, role, collegeName, displayName, enabled } = req.body;

        const repo = getDataRepository().user;
        const existing = await repo.findById(id);
        if (!existing) {
          return res.status(404).json({ error: "用户不存在" });
        }

        // 防止管理员把自己禁用
        if (id === req.user.id && enabled === false) {
          return res.status(400).json({ error: "不能禁用当前登录的账号" });
        }

        const updates = {};
        if (email !== undefined) updates.email = email;
        if (role !== undefined) updates.role = role;
        if (collegeName !== undefined) updates.collegeName = collegeName;
        if (displayName !== undefined) updates.displayName = displayName;
        if (enabled !== undefined) updates.enabled = enabled;

        const user = await repo.update(id, updates);
        res.json({ user: sanitizeUser(user) });
      } catch (error) {
        console.error("[Users] Update error:", error);
        res.status(500).json({ error: error.message || "更新用户失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 重置用户密码（仅管理员）
  // PUT /api/admin/users/:id/password
  // ---------------------------------------------------------
  app.put(
    "/api/admin/users/:id/password",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || !validatePassword(newPassword)) {
          return res.status(400).json({ error: "新密码长度至少 6 位" });
        }

        const repo = getDataRepository().user;
        const existing = await repo.findById(id);
        if (!existing) {
          return res.status(404).json({ error: "用户不存在" });
        }

        await repo.changePassword(id, newPassword);
        res.json({ message: "密码重置成功" });
      } catch (error) {
        console.error("[Users] Reset password error:", error);
        res.status(500).json({ error: error.message || "重置密码失败" });
      }
    }
  );

  // ---------------------------------------------------------
  // 删除用户（仅管理员）
  // DELETE /api/admin/users/:id
  // ---------------------------------------------------------
  app.delete(
    "/api/admin/users/:id",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;

        if (id === req.user.id) {
          return res.status(400).json({ error: "不能删除当前登录的账号" });
        }

        const repo = getDataRepository().user;
        const deleted = await repo.delete(id);
        if (!deleted) {
          return res.status(404).json({ error: "用户不存在" });
        }

        res.json({ message: "删除成功" });
      } catch (error) {
        console.error("[Users] Delete error:", error);
        res.status(500).json({ error: error.message || "删除用户失败" });
      }
    }
  );

  console.log("[Users] 用户管理路由已注册");
}
