/**
 * 三大奖批次 Repository - SQL Server 实现
 */
import { randomUUID } from "node:crypto";
import { query, sql, getPool } from "./connection.js";

function mapAwardBatchRow(row) {
  return {
    id: row.id,
    collegeName: row.college_name,
    awardType: row.award_type,
    academicYear: row.academic_year,
    rowCount: row.row_count,
    reviewStatus: row.review_status,
    submitStatus: row.submit_status,
    confirmedAt: row.confirmed_at,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rows: [],
  };
}

function mapAwardBatchWithRows(row, rowsData) {
  const batch = mapAwardBatchRow(row);
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

export const awardBatchRepository = {
  async findAll(options = {}) {
    const { includeDeleted = false, collegeName, awardType, academicYear, includeRows = true } = options;
    let sqlText = "SELECT * FROM dbo.award_batches WHERE 1=1";
    const params = {};

    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    if (collegeName) {
      sqlText += " AND college_name = @collegeName";
      params.collegeName = collegeName;
    }
    if (awardType) {
      sqlText += " AND award_type = @awardType";
      params.awardType = awardType;
    }
    if (academicYear) {
      sqlText += " AND academic_year = @academicYear";
      params.academicYear = academicYear;
    }

    sqlText += " ORDER BY created_at ASC";
    const batches = await query(sqlText, params);

    if (!includeRows || batches.length === 0) {
      return batches.map(mapAwardBatchRow);
    }

    const batchIds = batches.map((b) => `'${b.id}'`).join(",");
    const rowsSql = `SELECT * FROM dbo.award_batch_rows WHERE batch_id IN (${batchIds})`;
    const allRows = await query(rowsSql);

    return batches.map((b) => mapAwardBatchWithRows(b, allRows));
  },

  async findById(id, includeRows = true) {
    const batches = await query(
      "SELECT * FROM dbo.award_batches WHERE id = @id",
      { id }
    );
    if (batches.length === 0) return null;

    if (!includeRows) return mapAwardBatchRow(batches[0]);

    const rows = await query(
      "SELECT * FROM dbo.award_batch_rows WHERE batch_id = @batchId ORDER BY row_index",
      { batchId: id }
    );

    return mapAwardBatchWithRows(batches[0], rows);
  },

  async findByUniqueKey(collegeName, awardType, academicYear, includeRows = true) {
    const batches = await query(
      `SELECT * FROM dbo.award_batches
       WHERE college_name = @collegeName AND award_type = @awardType AND academic_year = @academicYear`,
      { collegeName, awardType, academicYear }
    );
    if (batches.length === 0) return null;

    if (!includeRows) return mapAwardBatchRow(batches[0]);

    const rows = await query(
      "SELECT * FROM dbo.award_batch_rows WHERE batch_id = @batchId ORDER BY row_index",
      { batchId: batches[0].id }
    );

    return mapAwardBatchWithRows(batches[0], rows);
  },

  async upsertBatch(batchData) {
    const { collegeName, awardType, academicYear, rowCount = 0, reviewStatus = "draft", submitStatus = "pending", rows = [] } = batchData;

    const existing = await query(
      `SELECT id FROM dbo.award_batches
       WHERE college_name = @collegeName AND award_type = @awardType AND academic_year = @academicYear`,
      { collegeName, awardType, academicYear }
    );

    let batchId;
    if (existing.length > 0) {
      batchId = existing[0].id;
      await query(
        `UPDATE dbo.award_batches SET row_count = @rowCount, review_status = @reviewStatus,
         submit_status = @submitStatus, is_deleted = 0, deleted_at = NULL WHERE id = @id`,
        { id: batchId, rowCount, reviewStatus, submitStatus }
      );
      await query(
        `UPDATE dbo.award_batch_rows SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET()
         WHERE batch_id = @batchId AND is_deleted = 0`,
        { batchId }
      );
    } else {
      batchId = randomUUID();
      await query(
        `INSERT INTO dbo.award_batches (id, college_name, award_type, academic_year, row_count, review_status, submit_status)
         VALUES (@id, @collegeName, @awardType, @academicYear, @rowCount, @reviewStatus, @submitStatus)`,
        { id: batchId, collegeName, awardType, academicYear, rowCount, reviewStatus, submitStatus }
      );
    }

    if (rows.length > 0) {
      const pool = await getPool();
      const table = new sql.Table("award_batch_rows");
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

  async confirmBatch(id) {
    await query(
      `UPDATE dbo.award_batches SET review_status = 'confirmed', confirmed_at = SYSDATETIMEOFFSET()
       WHERE id = @id`,
      { id }
    );
    return this.findById(id);
  },

  async submitBatch(id) {
    await query(
      `UPDATE dbo.award_batches SET submit_status = 'submitted' WHERE id = @id`,
      { id }
    );
    return this.findById(id);
  },

  async softDelete(id) {
    await query(
      `UPDATE dbo.award_batches SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET()
       WHERE id = @id AND is_deleted = 0`,
      { id }
    );
  },
};
