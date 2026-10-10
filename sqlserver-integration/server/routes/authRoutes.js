/**
 * 认证路由
 * 登录、注册、刷新令牌、修改密码等
 */
import { hashPassword, verifyPassword } from "../auth/password.js";
import { generateTokenPair, verifyToken, signAccessToken } from "../auth/jwt.js";
import { getDataRepository } from "../data/index.js";
import { authenticateToken } from "../auth/middleware.js";

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

export function registerAuthRoutes(app) {
  const repo = getDataRepository();

  // ---------------------------------------------------------
  // 登录
  // ---------------------------------------------------------
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { account, password } = req.body;
      const email = (account || "").trim().toLowerCase();

      if (!email || !password) {
        return res.status(400).json({ error: "请输入账号和密码" });
      }

      const user = await repo.user.findByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "账号或密码错误" });
      }

      if (!user.enabled) {
        return res.status(403).json({ error: "账号已停用，请联系管理员" });
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: "账号或密码错误" });
      }

      // 更新最后登录时间
      await repo.user.updateLastLogin(user.id);

      const tokens = generateTokenPair(user);
      const profile = sanitizeUser(user);

      res.json({
        profile,
        ...tokens,
      });
    } catch (error) {
      console.error("[Auth] Login error:", error);
      res.status(500).json({ error: "登录失败，请稍后重试" });
    }
  });

  // ---------------------------------------------------------
  // 刷新令牌
  // ---------------------------------------------------------
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: "缺少刷新令牌" });
      }

      const result = verifyToken(refreshToken);
      if (!result.valid || result.payload.type !== "refresh") {
        return res.status(401).json({ error: "刷新令牌无效或已过期" });
      }

      const user = await repo.user.findById(result.payload.sub);
      if (!user || !user.enabled) {
        return res.status(401).json({ error: "用户不存在或已停用" });
      }

      const accessToken = signAccessToken(user);
      const decoded = JSON.parse(
        Buffer.from(accessToken.split(".")[1], "base64").toString()
      );

      res.json({
        accessToken,
        expiresAt: decoded.exp * 1000,
        tokenType: "Bearer",
      });
    } catch (error) {
      console.error("[Auth] Refresh error:", error);
      res.status(500).json({ error: "刷新令牌失败" });
    }
  });

  // ---------------------------------------------------------
  // 获取当前用户信息
  // ---------------------------------------------------------
  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
      const user = await repo.user.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "用户不存在" });
      }

      res.json({ profile: sanitizeUser(user) });
    } catch (error) {
      console.error("[Auth] Get me error:", error);
      res.status(500).json({ error: "获取用户信息失败" });
    }
  });

  // ---------------------------------------------------------
  // 修改密码
  // ---------------------------------------------------------
  app.put("/api/auth/password", authenticateToken, async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: "请输入旧密码和新密码" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "新密码长度不能少于 6 位" });
      }

      const user = await repo.user.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "用户不存在" });
      }

      const valid = await verifyPassword(oldPassword, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: "旧密码错误" });
      }

      const newHash = await hashPassword(newPassword);
      await repo.user.update(req.user.id, { password_hash: newHash });

      res.json({ message: "密码修改成功" });
    } catch (error) {
      console.error("[Auth] Password change error:", error);
      res.status(500).json({ error: "密码修改失败" });
    }
  });

  // ---------------------------------------------------------
  // 管理员创建用户（仅 admin）
  // ---------------------------------------------------------
  app.post("/api/auth/users", authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "权限不足" });
      }

      const { email, password, role, college_name, display_name } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "请输入邮箱和密码" });
      }

      const existing = await repo.user.findByEmail(email.toLowerCase());
      if (existing) {
        return res.status(409).json({ error: "该邮箱已被注册" });
      }

      const password_hash = await hashPassword(password);
      const user = await repo.user.create({
        email: email.toLowerCase(),
        password_hash,
        role: role || "college",
        college_name,
        display_name,
      });

      res.status(201).json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("[Auth] Create user error:", error);
      res.status(500).json({ error: "创建用户失败" });
    }
  });

  // ---------------------------------------------------------
  // 登出（前端清除 token 即可，后端预留接口）
  // ---------------------------------------------------------
  app.post("/api/auth/logout", authenticateToken, (req, res) => {
    res.json({ message: "已退出登录" });
  });

  console.log("[Auth] 认证路由已注册");
}
