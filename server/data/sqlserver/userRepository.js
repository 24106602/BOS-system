/**
 * 用户 Repository - SQL Server 实现
 */
import { randomUUID } from "node:crypto";
import { query } from "./connection.js";

function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    role: row.role,
    college_name: row.college_name,
    display_name: row.display_name,
    enabled: Boolean(row.enabled),
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const userRepository = {
  async findByEmail(email) {
    const rows = await query(
      "SELECT * FROM dbo.users WHERE email = @email",
      { email }
    );
    return rows.length > 0 ? mapUserRow(rows[0]) : null;
  },

  async findById(id) {
    const rows = await query(
      "SELECT * FROM dbo.users WHERE id = @id",
      { id }
    );
    return rows.length > 0 ? mapUserRow(rows[0]) : null;
  },

  async findAll(options = {}) {
    const { role, enabled, offset = 0, limit = 100 } = options;
    let sqlText = "SELECT * FROM dbo.users WHERE 1=1";
    const params = {};

    if (role) {
      sqlText += " AND role = @role";
      params.role = role;
    }
    if (enabled !== undefined) {
      sqlText += " AND enabled = @enabled";
      params.enabled = enabled;
    }

    sqlText += " ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
    params.offset = offset;
    params.limit = limit;

    const rows = await query(sqlText, params);
    return rows.map(mapUserRow);
  },

  async create(userData) {
    const { email, password_hash, role = "college", college_name = null, display_name = null, enabled = true } = userData;
    const id = randomUUID();

    await query(
      `INSERT INTO dbo.users (id, email, password_hash, role, college_name, display_name, enabled)
       VALUES (@id, @email, @password_hash, @role, @college_name, @display_name, @enabled)`,
      { id, email, password_hash, role, college_name, display_name, enabled }
    );

    return this.findById(id);
  },

  async update(id, updates) {
    const allowedFields = ["password_hash", "role", "college_name", "display_name", "enabled"];
    const setClauses = [];
    const params = { id };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = @${field}`);
        params[field] = updates[field];
      }
    }

    if (setClauses.length === 0) return this.findById(id);

    const sqlText = `UPDATE dbo.users SET ${setClauses.join(", ")} WHERE id = @id`;
    await query(sqlText, params);
    return this.findById(id);
  },

  async updateLastLogin(id) {
    await query(
      "UPDATE dbo.users SET last_login_at = SYSDATETIMEOFFSET() WHERE id = @id",
      { id }
    );
  },

  async delete(id) {
    await query("DELETE FROM dbo.users WHERE id = @id", { id });
    return true;
  },
};
