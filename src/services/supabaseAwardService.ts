/**
 * Supabase 三大奖数据服务层
 * 统一封装三大奖数据的后端操作，替代 localStorage 存储
 */
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { AwardSubmission, AwardType } from "../types/award";

// ============================================================
// 1. 获取所有三大奖提交批次
// ============================================================

export async function fetchAwardSubmissions(
  awardType?: AwardType
): Promise<AwardSubmission[]> {
  if (!isSupabaseConfigured) return [];

  let query = supabase
    .from("award_batches")
    .select("*, award_batch_rows(*)")
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (awardType) {
    query = query.eq("award_type", awardType);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map(mapBatchWithRows);
}

export async function fetchAllAwardSubmissions(): Promise<AwardSubmission[]> {
  return fetchAwardSubmissions();
}

// ============================================================
// 2. 保存三大奖提交批次
// ============================================================

export async function saveAwardSubmissionToCloud(
  awardType: AwardType,
  submission: AwardSubmission
): Promise<void> {
  if (!isSupabaseConfigured) return;

  // upsert 批次
  const { data: batchData, error: batchError } = await supabase
    .from("award_batches")
    .upsert(
      {
        college_name: submission.collegeName,
        award_type: awardType,
        academic_year: submission.academicYear,
        row_count: submission.rowCount,
        review_status: submission.reviewStatus,
        submit_status: submission.submitStatus,
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
      },
      { onConflict: "college_name,award_type,academic_year" }
    )
    .select("id")
    .single();

  if (batchError) throw new Error(batchError.message);
  const batchId = batchData.id;

  // 禁用旧明细后写入新明细，保留每次上载的历史行。
  const { error: disableRowsError } = await supabase
    .from("award_batch_rows")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .eq("is_deleted", false);
  if (disableRowsError) throw new Error(disableRowsError.message);

  // 插入新的明细行
  const rows = (submission.rows || []).map((row, index) => ({
    batch_id: batchId,
    row_data: row,
    row_index: index,
    is_deleted: false,
  }));

  if (rows.length > 0) {
    const { error: rowsError } = await supabase
      .from("award_batch_rows")
      .insert(rows);
    if (rowsError) throw new Error(rowsError.message);
  }
}

// ============================================================
// 3. 删除三大奖提交批次
// ============================================================

export async function deleteAwardSubmissionFromCloud(
  id: string
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from("award_batches")
    .update({ is_deleted: true, deleted_at: deletedAt })
    .eq("id", id)
    .eq("is_deleted", false);
  if (error) throw new Error(error.message);
}

export async function clearAwardSubmissionsFromCloud(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const deletedAt = new Date().toISOString();
  const { error: batchError } = await supabase
    .from("award_batches")
    .update({ is_deleted: true, deleted_at: deletedAt })
    .eq("is_deleted", false);
  if (batchError) throw new Error(batchError.message);
}

// ============================================================
// 4. 行映射工具函数
// ============================================================

function mapBatchWithRows(batch: Record<string, unknown>): AwardSubmission {
  const batchRows = (batch.award_batch_rows || []) as Record<string, unknown>[];
  const rows = batchRows
    .filter((row) => row.is_deleted !== true)
    .sort((a, b) => Number(a.row_index) - Number(b.row_index))
    .map((r) => (r.row_data || {}) as Record<string, unknown>);

  return {
    id: String(batch.id),
    awardType: String(batch.award_type) as AwardType,
    academicYear: String(batch.academic_year || ""),
    collegeName: String(batch.college_name || ""),
    createdAt: String(batch.created_at || ""),
    confirmedAt: String(batch.confirmed_at || batch.created_at || ""),
    reviewStatus: String(batch.review_status || "draft") as "draft" | "confirmed",
    submitStatus: String(batch.submit_status || "pending") as "pending" | "submitted",
    rowCount: Number(batch.row_count || 0),
    awardTypeCounts: {},
    fields: Object.keys(rows[0] || {}),
    rows,
  };
}
