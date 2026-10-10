/**
 * 困难生 Repository - SQL Server 实现
 */
import { query, sql, getPool } from "./connection.js";

function mapHardshipRow(row) {
  return {
    id: row.id,
    key: row.key,
    studentId: row.student_id,
    name: row.name,
    idCard: row.id_card,
    college: row.college,
    major: row.major,
    className: row.class_name,
    hardshipLevel: row.hardship_level,
    year: row.year,
    specialType: row.special_type,
    remark: row.remark,
    sourceFile: row.source_file,
    importedAt: row.imported_at,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const hardshipStudentRepository = {
  async findAll(options = {}) {
    const { includeDeleted = false, college, year, offset = 0, limit = 1000 } = options;
    let sqlText = "SELECT * FROM dbo.hardship_students WHERE 1=1";
    const params = { offset, limit };

    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    if (college) {
      sqlText += " AND college = @college";
      params.college = college;
    }
    if (year) {
      sqlText += " AND year = @year";
      params.year = year;
    }

    sqlText += " ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
    const rows = await query(sqlText, params);
    return rows.map(mapHardshipRow);
  },

  async findByKey(key, includeDeleted = false) {
    let sqlText = "SELECT * FROM dbo.hardship_students WHERE [key] = @key";
    const params = { key };
    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    const rows = await query(sqlText, params);
    return rows.length > 0 ? mapHardshipRow(rows[0]) : null;
  },

  async findByStudentId(studentId, includeDeleted = false) {
    let sqlText = "SELECT * FROM dbo.hardship_students WHERE student_id = @studentId";
    const params = { studentId };
    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    const rows = await query(sqlText, params);
    return rows.map(mapHardshipRow);
  },

  async search(keyword, includeDeleted = false) {
    const trimmed = keyword.trim();
    if (!trimmed) return [];

    let sqlText = `SELECT * FROM dbo.hardship_students WHERE 1=1`;
    const params = { keyword: trimmed, keywordLike: `%${trimmed}%` };

    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }

    sqlText += ` AND (student_id = @keyword OR id_card = @keyword OR name = @keyword
                OR name LIKE @keywordLike OR student_id LIKE @keywordLike OR id_card LIKE @keywordLike)`;
    sqlText += " ORDER BY created_at DESC OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY";

    const rows = await query(sqlText, params);
    return rows.map(mapHardshipRow);
  },

  async count(includeDeleted = false) {
    let sqlText = "SELECT COUNT(*) as total FROM dbo.hardship_students";
    if (!includeDeleted) {
      sqlText += " WHERE is_deleted = 0";
    }
    const rows = await query(sqlText);
    return rows[0].total;
  },

  async bulkUpsert(students) {
    if (students.length === 0) return 0;

    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();
    const request = tx.request();
    const tempTableName = "#temp_hardship_students";

    try {
      // 创建临时表
      await request.query(`
        SELECT TOP 0 * INTO ${tempTableName} FROM dbo.hardship_students;
      `);

      // 构建批量数据
      const tempTable = new sql.Table(tempTableName);
      tempTable.create = false;
      tempTable.columns.add("key", sql.NVarChar(100), { nullable: false });
      tempTable.columns.add("student_id", sql.NVarChar(50), { nullable: true });
      tempTable.columns.add("name", sql.NVarChar(100), { nullable: true });
      tempTable.columns.add("id_card", sql.NVarChar(50), { nullable: true });
      tempTable.columns.add("college", sql.NVarChar(100), { nullable: true });
      tempTable.columns.add("major", sql.NVarChar(100), { nullable: true });
      tempTable.columns.add("class_name", sql.NVarChar(100), { nullable: true });
      tempTable.columns.add("hardship_level", sql.NVarChar(50), { nullable: true });
      tempTable.columns.add("year", sql.NVarChar(20), { nullable: true });
      tempTable.columns.add("special_type", sql.NVarChar(100), { nullable: true });
      tempTable.columns.add("remark", sql.NVarChar(500), { nullable: true });
      tempTable.columns.add("source_file", sql.NVarChar(255), { nullable: true });
      tempTable.columns.add("imported_at", sql.NVarChar(50), { nullable: true });
      tempTable.columns.add("is_deleted", sql.Bit, { nullable: false });
      tempTable.columns.add("deleted_at", sql.DateTimeOffset, { nullable: true });

      for (const s of students) {
        tempTable.rows.add(
          s.key, s.studentId || null, s.name || null, s.idCard || null,
          s.college || null, s.major || null, s.className || null,
          s.hardshipLevel || null, s.year || null, s.specialType || null,
          s.remark || null, s.sourceFile || null, s.importedAt || null,
          false, null
        );
      }

      await request.bulk(tempTable);

      // MERGE upsert
      await request.query(`
        MERGE dbo.hardship_students AS target
        USING ${tempTableName} AS source
        ON target.[key] = source.[key]
        WHEN MATCHED THEN
          UPDATE SET
            student_id = source.student_id,
            name = source.name,
            id_card = source.id_card,
            college = source.college,
            major = source.major,
            class_name = source.class_name,
            hardship_level = source.hardship_level,
            year = source.year,
            special_type = source.special_type,
            remark = source.remark,
            source_file = source.source_file,
            imported_at = source.imported_at,
            is_deleted = 0,
            deleted_at = NULL
        WHEN NOT MATCHED THEN
          INSERT ([key], student_id, name, id_card, college, major, class_name,
                  hardship_level, year, special_type, remark, source_file, imported_at, is_deleted)
          VALUES (source.[key], source.student_id, source.name, source.id_card,
                  source.college, source.major, source.class_name, source.hardship_level,
                  source.year, source.special_type, source.remark, source.source_file,
                  source.imported_at, 0);
      `);

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    return students.length;
  },

  async softDeleteAll() {
    await query(
      "UPDATE dbo.hardship_students SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET() WHERE is_deleted = 0"
    );
  },
};
