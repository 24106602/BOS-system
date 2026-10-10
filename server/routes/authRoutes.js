/**
 * 认证路由
 * 登录、刷新令牌、修改密码、登出
 */
import { generateTokenPair, verifyToken, signAccessToken, decodeToken } from "../auth/jwt.js";
import { getDataRepository } from "../data/index.js";
import { authenticateToken } from "../auth/middleware.js";

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function toJwtUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    college_name: user.collegeName || null,
  };
}

export function registerAuthRoutes(app) {
  const repo = getDataRepository();

  // ---------------------------------------------------------
  // 登录
  // POST /api/auth/login
  // ---------------------------------------------------------
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { account, password } = req.body;
      const email = (account || "").trim().toLowerCase();

      if (!email || !password) {
        return res.status(400).json({ error: "请输入账号和密码" });
      }

      const user = await repo.user.verifyPassword(email, password);
      if (!user) {
        return res.status(401).json({ error: "账号或密码错误" });
      }

      // 更新最后登录时间
      await repo.user.updateLastLogin(user.id);

      const tokens = generateTokenPair(toJwtUser(user));
      const profile = sanitizeUser(user);

      res.json({
        profile,
        ...tokens,
      });
    } catch (error) {
      console.error("[Auth] Login error:", error);
      if (error.message && error.message.includes("账号已停用")) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: "登录失败，请稍后重试" });
    }
  });

  // ---------------------------------------------------------
  // 刷新令牌
  // POST /api/auth/refresh
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

      const accessToken = signAccessToken(toJwtUser(user));
      const decoded = decodeToken(accessToken);

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
  // GET /api/auth/me
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
  // PUT /api/auth/password
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

      // 验证旧密码
      const valid = await repo.user.verifyPassword(user.email, oldPassword);
      if (!valid) {
        return res.status(401).json({ error: "旧密码错误" });
      }

      await repo.user.changePassword(req.user.id, newPassword);

      res.json({ message: "密码修改成功" });
    } catch (error) {
      console.error("[Auth] Password change error:", error);
      res.status(500).json({ error: "密码修改失败" });
    }
  });

  // ---------------------------------------------------------
  // 登出（前端清除 token 即可，后端预留接口）
  // POST /api/auth/logout
  // ---------------------------------------------------------
  app.post("/api/auth/logout", authenticateToken, (req, res) => {
    res.json({ message: "已退出登录" });
  });

  console.log("[Auth] 认证路由已注册");
}
