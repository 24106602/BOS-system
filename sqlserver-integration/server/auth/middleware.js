/**
 * 认证中间件
 * Express 中间件：验证 JWT token，挂载用户信息到 req.user
 */
import { verifyToken } from "./jwt.js";
import { getDataRepository } from "../data/index.js";

export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "未提供认证令牌" });
  }

  const result = verifyToken(token);
  if (!result.valid) {
    return res.status(401).json({ error: "认证令牌无效或已过期" });
  }

  const { payload } = result;

  // 只接受 access token
  if (payload.type !== "access") {
    return res.status(401).json({ error: "令牌类型错误" });
  }

  // 挂载用户信息到请求对象
  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    college_name: payload.college_name,
  };

  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "未登录" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "权限不足" });
    }

    next();
  };
}

export function requireAdmin = requireRole("admin");
export function requireCollege = requireRole("college");
export function requireAuthenticated = authenticateToken;

/**
 * 学院数据隔离中间件
 * 如果用户是 college 角色，自动限制只能访问本学院的数据
 */
export function withCollegeScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "未登录" });
  }

  if (req.user.role === "admin") {
    req.collegeScope = null; // null 表示无限制（管理员）
  } else {
    req.collegeScope = req.user.college_name;
  }

  next();
}
