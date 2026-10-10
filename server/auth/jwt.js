/**
 * JWT 工具
 * 签发和验证 JSON Web Token
 */
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "bos-system-dev-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

export function signAccessToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    college_name: user.college_name || null,
    type: "access",
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function signRefreshToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    type: "refresh",
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, payload: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

export function decodeToken(token) {
  return jwt.decode(token);
}

export function generateTokenPair(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const decoded = decodeToken(accessToken);

  return {
    accessToken,
    refreshToken,
    expiresAt: decoded.exp * 1000,
    tokenType: "Bearer",
  };
}
