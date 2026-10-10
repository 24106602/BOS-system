/**
 * 用户管理 Repository (SQL Server)
 */
import { getPool } from "./connection.js";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const SALT_ROUNDS = 10;

export class UserRepository {
  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("email", email.trim().toLowerCase())
      .query(`
        SELECT id, email, password_hash as passwordHash, role, college_name as collegeName,
               display_name as displayName, enabled, created_at as createdAt, updated_at as updatedAt
        FROM users
        WHERE email = @email
      `);
    return result.recordset[0] || null;
  }

  /**
   * 根据 ID 查找用户
   */
  async findById(id) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", id)
      .query(`
        SELECT id, email, role, college_name as collegeName,
               display_name as displayName, enabled, created_at as createdAt, updated_at as updatedAt
        FROM users
        WHERE id = @id
      `);
    return result.recordset[0] || null;
  }

  /**
   * 获取所有用户
   */
  async findAll() {
    const pool = await getPool();
    const result = await pool.query(`
      SELECT id, email, role, college_name as collegeName,
             display_name as displayName, enabled, created_at as createdAt, updated_at as updatedAt
      FROM users
      ORDER BY created_at DESC
    `);
    return result.recordset;
  }

  /**
   * 创建用户
   */
  async create(userData) {
    const pool = await getPool();
    const id = userData.id || randomUUID();
    const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);

    await pool
      .request()
      .input("id", id)
      .input("email", userData.email.trim().toLowerCase())
      .input("passwordHash", passwordHash)
      .input("role", userData.role || "college")
      .input("collegeName", userData.collegeName || null)
      .input("displayName", userData.displayName || userData.email)
      .input("enabled", userData.enabled !== false ? 1 : 0)
      .query(`
        INSERT INTO users (id, email, password_hash, role, college_name, display_name, enabled)
        VALUES (@id, @email, @passwordHash, @role, @collegeName, @displayName, @enabled)
      `);

    return this.findById(id);
  }

  /**
   * 更新用户信息
   */
  async update(id, updates) {
    const pool = await getPool();
    const fields = [];
    const params = {};

    if (updates.email !== undefined) {
      fields.push("email = @email");
      params.email = updates.email.trim().toLowerCase();
    }
    if (updates.role !== undefined) {
      fields.push("role = @role");
      params.role = updates.role;
    }
    if (updates.collegeName !== undefined) {
      fields.push("college_name = @collegeName");
      params.collegeName = updates.collegeName || null;
    }
    if (updates.displayName !== undefined) {
      fields.push("display_name = @displayName");
      params.displayName = updates.displayName;
    }
    if (updates.enabled !== undefined) {
      fields.push("enabled = @enabled");
      params.enabled = updates.enabled ? 1 : 0;
    }

    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = GETDATE()");

    const req = pool.request();
    req.input("id", id);
    for (const [key, value] of Object.entries(params)) {
      req.input(key, value);
    }

    await req.query(`UPDATE users SET ${fields.join(", ")} WHERE id = @id`);
    return this.findById(id);
  }

  /**
   * 修改密码
   */
  async changePassword(id, newPassword) {
    const pool = await getPool();
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await pool
      .request()
      .input("id", id)
      .input("passwordHash", passwordHash)
      .query(`
        UPDATE users
        SET password_hash = @passwordHash, updated_at = GETDATE()
        WHERE id = @id
      `);

    return true;
  }

  /**
   * 验证密码
   */
  async verifyPassword(email, password) {
    const user = await this.findByEmail(email);
    if (!user) return null;
    if (!user.enabled) {
      throw new Error("账号已停用，请联系管理员");
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    return user;
  }

  /**
   * 删除用户
   */
  async delete(id) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", id)
      .query("DELETE FROM users WHERE id = @id");
    return result.rowsAffected[0] > 0;
  }

  /**
   * 统计用户数
   */
  async count() {
    const pool = await getPool();
    const result = await pool.query("SELECT COUNT(*) as total FROM users");
    return result.recordset[0].total;
  }

  /**
   * 更新最后登录时间
   */
  async updateLastLogin(id) {
    const pool = await getPool();
    await pool
      .request()
      .input("id", id)
      .query("UPDATE users SET updated_at = GETDATE() WHERE id = @id");
    return true;
  }
}

export const userRepository = new UserRepository();
