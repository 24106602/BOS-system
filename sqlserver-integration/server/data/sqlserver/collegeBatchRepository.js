/**
 * 学院提交批次 Repository - SQL Server 实现
 * 包含批次主表和批次明细表
 */
import { query, sql } from "./connection.js";

function mapBatchRow(row) {
  return {
    id: row.id,
    collegeName: row.college_name,
    dataType: row.data_type,
    academicYear: row.academic_year,
    rowCount: row.row_count,
    status: row.status,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rows: [], // 明细行需要单独查询或 join
  };
}

function mapBatchWithRows(row, rowsData) {
  const batch = mapBatchRow(row);
  batch.rows = rowsData
    .filter((r) => r.batch_id === row.id && !r.is_deleted)
    .sort((a, b) => a.row_index - b.row_index)
    .map((r) => {
      try {
        return JSON.parse(r.row_data);
      } catch {
        return {};
      }
    });
  return batch;
}

export const collegeBatchRepository = {
  async findAll(options = {}) {
    const { includeDeleted = false, collegeName, dataType, academicYear, includeRows = true } = options;
    let sqlText = "SELECT * FROM dbo.college_batches WHERE 1=1";
    const params = {};

    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    if (collegeName) {
      sqlText += " AND college_name = @collegeName";
      params.collegeName = collegeName;
    }
    if (dataType) {
      sqlText += " AND data_type = @dataType";
      params.dataType = dataType;
    }
    if (academicYear) {
      sqlText += " AND academic_year = @academicYear";
      params.academicYear = academicYear;
    }

    sqlText += " ORDER BY created_at ASC";
    const batches = await query(sqlText, params);

    if (!includeRows || batches.length === 0) {
      return batches.map(mapBatchRow);
    }

    // 查询所有明细行
    const batchIds = batches.map((b) => `'${b.id}'`).join(",");
    const rowsSql = `SELECT * FROM dbo.batch_rows WHERE batch_id IN (${batchIds})`;
    const allRows = await query(rowsSql);

    return batches.map((b) => mapBatchWithRows(b, allRows));
  },

  async findById(id, includeRows = true) {
    const batches = await query(
      "SELECT * FROM dbo.college_batches WHERE id = @id",
      { id }
    );
    if (batches.length === 0) return null;

    if (!includeRows) return mapBatchRow(batches[0]);

    const rows = await query(
      "SELECT * FROM dbo.batch_rows WHERE batch_id = @batchId ORDER BY row_index",
      { batchId: id }
    );

    return mapBatchWithRows(batches[0], rows);
  },

  async findByUniqueKey(collegeName, dataType, academicYear, includeRows = true) {
    const batches = await query(
      `SELECT * FROM dbo.college_batches
       WHERE college_name = @collegeName AND data_type = @dataType AND academic_year = @academicYear`,
      { collegeName, dataType, academicYear }
    );
    if (batches.length === 0) return null;

    if (!includeRows) return mapBatchRow(batches[0]);

    const rows = await query(
      "SELECT * FROM dbo.batch_rows WHERE batch_id = @batchId ORDER BY row_index",
      { batchId: batches[0].id }
    );

    return mapBatchWithRows(batches[0], rows);
  },

  async upsertBatch(batchData) {
    const { collegeName, dataType, academicYear, rowCount = 0, status = "uploaded", rows = [] } = batchData;

    // 查找现有批次
    const existing = await query(
      `SELECT id FROM dbo.college_batches
       WHERE college_name = @collegeName AND data_type = @dataType AND academic_year = @academicYear`,
      { collegeName, dataType, academicYear }
    );

    let batchId;
    if (existing.length > 0) {
      batchId = existing[0].id;
      // 更新批次
      await query(
        `UPDATE dbo.college_batches SET row_count = @rowCount, status = @status,
         is_deleted = 0, deleted_at = NULL WHERE id = @id`,
        { id: batchId, rowCount, status }
      );
      // 软删除旧明细
      await query(
        `UPDATE dbo.batch_rows SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET()
         WHERE batch_id = @batchId AND is_deleted = 0`,
        { batchId }
      );
    } else {
      // 新建批次
      const crypto = await import("crypto");
      batchId = crypto.randomUUID();
      await query(
        `INSERT INTO dbo.college_batches (id, college_name, data_type, academic_year, row_count, status)
         VALUES (@id, @collegeName, @dataType, @academicYear, @rowCount, @status)`,
        { id: batchId, collegeName, dataType, academicYear, rowCount, status }
      );
    }

    // 插入新明细行（批量）
    if (rows.length > 0) {
      const pool = await require("./connection.js").getPool();
      const table = new sql.Table("batch_rows");
      table.create = false;
      table.columns.add("batch_id", sql.UniqueIdentifier, { nullable: false });
      table.columns.add("row_data", sql.NVarChar(sql.MAX), { nullable: false });
      table.columns.add("row_index", sql.Int, { nullable: false });
      table.columns.add("is_deleted", sql.Bit, { nullable: false });

      rows.forEach((row, index) => {
        table.rows.add(batchId, JSON.stringify(row), index, false);
      });

      await pool.request().bulk(table);
    }

    return this.findById(batchId);
  },

  async softDelete(id) {
    await query(
      `UPDATE dbo.college_batches SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET()
       WHERE id = @id AND is_deleted = 0`,
      { id }
    );
  },

  async restore(id) {
    await query(
      `UPDATE dbo.college_batches SET is_deleted = 0, deleted_at = NULL
       WHERE id = @id AND is_deleted = 1`,
      { id }
    );
  },

  async softDeleteAll() {
    await query(
      "UPDATE dbo.college_batches SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET() WHERE is_deleted = 0"
    );
  },
};
