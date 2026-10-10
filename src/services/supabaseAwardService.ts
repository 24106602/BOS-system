/**
 * 三大奖数据服务层 - 通过后端 API
 * 统一封装三大奖数据的后端操作，替代 localStorage 存储
 */
import { api } from "../lib/apiClient";
import { isApiDataSource } from "./apiDataService";
import type { AwardSubmission, AwardType } from "../types/award";

// ============================================================
// 1. 获取所有三大奖提交批次
// ============================================================

export async function fetchAwardSubmissions(
  awardType?: AwardType
): Promise<AwardSubmission[]> {
  if (!isApiDataSource) return [];

  const query = awardType
    ? `/award-submissions?awardType=${encodeURIComponent(awardType)}`
    : "/award-submissions";
  const data = await api.get<unknown[]>(query);
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
  if (!isApiDataSource) return;
  await api.post("/award-submissions", { awardType, submission });
}

// ============================================================
// 3. 删除三大奖提交批次
// ============================================================

export async function deleteAwardSubmissionFromCloud(
  id: string
): Promise<void> {
  if (!isApiDataSource) return;
  await api.delete(`/award-submissions/${encodeURIComponent(id)}`);
}

export async function clearAwardSubmissionsFromCloud(): Promise<void> {
  if (!isApiDataSource) return;
  await api.delete("/award-submissions");
}

// ============================================================
// 4. 行映射工具函数
// ============================================================

function mapBatchWithRows(batch: Record<string, unknown>): AwardSubmission {
  const batchRows = (batch.award_batch_rows || batch.rows || []) as Record<string, unknown>[];
  const rows = batchRows
    .filter((row) => row.is_deleted !== true)
    .sort((a, b) => Number(a.row_index) - Number(b.row_index))
    .map((r) => (r.row_data || r) as Record<string, unknown>);

  return {
    id: String(batch.id ?? ""),
    awardType: String(batch.award_type ?? batch.awardType ?? "") as AwardType,
    academicYear: String(batch.academic_year ?? batch.academicYear ?? ""),
    collegeName: String(batch.college_name ?? batch.collegeName ?? ""),
    createdAt: String(batch.created_at ?? batch.createdAt ?? ""),
    confirmedAt: String(batch.confirmed_at ?? batch.confirmedAt ?? batch.created_at ?? batch.createdAt ?? ""),
    reviewStatus: String(batch.review_status ?? batch.reviewStatus ?? "draft") as "draft" | "confirmed",
    submitStatus: String(batch.submit_status ?? batch.submitStatus ?? "pending") as "pending" | "submitted",
    rowCount: Number(batch.row_count ?? batch.rowCount ?? 0),
    awardTypeCounts: {},
    fields: Object.keys(rows[0] || {}),
    rows,
  };
}
