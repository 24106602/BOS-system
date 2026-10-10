/**
 * 认证模块入口
 */
export { hashPassword, verifyPassword } from "./password.js";
export {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  decodeToken,
  generateTokenPair,
} from "./jwt.js";
export {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireCollege,
  requireAuthenticated,
  withCollegeScope,
} from "./middleware.js";
