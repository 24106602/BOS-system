/**
 * 三大奖数据库 - Supabase 优先 + 本地降级
 * 当 Supabase 已配置时，数据存储到云端；否则降级到 localStorage
 */
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { awardStorageKeys } from "../services/awardConfig";
import { normalizeSubmissionCollegeName } from "../utils/collegeDetector";
import type { AwardSubmission, AwardType } from "../types/award";
import {
  fetchAwardSubmissions,
  fetchAllAwardSubmissions,
  saveAwardSubmissionToCloud,
  deleteAwardSubmissionFromCloud,
  clearAwardSubmissionsFromCloud,
} from "../services/supabaseAwardService";

// ---- 本地存储降级（与原有 localStorage 逻辑兼容）----

const getLocalSubmissions = (awardType: AwardType): AwardSubmission[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(awardStorageKeys[awardType]) || "[]");
    return stored.map((s: Partial<AwardSubmission>) => normalizeSubmission(s, awardType));
  } catch {
    return [];
  }
};

const setLocalSubmissions = (awardType: AwardType, submissions: AwardSubmission[]) => {
  localStorage.setItem(awardStorageKeys[awardType], JSON.stringify(submissions));
};

const normalizeSubmission = (
  submission: Partial<AwardSubmission>,
  awardType: AwardType
): AwardSubmission => {
  const rows = Array.isArray(submission.rows) ? submission.rows : [];
  const fields =
    Array.isArray(submission.fields) && submission.fields.length > 0
      ? submission.fields
      : Object.keys(rows[0] || {});
  return {
    id: submission.id || "",
    awardType: awardType,
    academicYear: submission.academicYear || "",
    collegeName: normalizeSubmissionCollegeName(submission.collegeName || ""),
    createdAt: submission.createdAt || "",
    confirmedAt: submission.confirmedAt || submission.createdAt || "",
    reviewStatus: (submission.reviewStatus as "draft" | "confirmed") || "confirmed",
    submitStatus: (submission.submitStatus as "pending" | "submitted") || "submitted",
    rowCount: submission.rowCount ?? rows.length,
    awardTypeCounts: submission.awardTypeCounts || {},
    fields,
    rows,
  };
};

// ---- 对外接口（与原有 awardProcessor 兼容）----

export async function getAwardSubmissions(awardType: AwardType): Promise<AwardSubmission[]> {
  if (isSupabaseConfigured) {
    try {
      return await fetchAwardSubmissions(awardType);
    } catch (e) {
      console.warn("Supabase 读取三大奖数据失败，降级到本地存储", e);
    }
  }
  return getLocalSubmissions(awardType);
}

export async function getAllAwardSubmissions(): Promise<AwardSubmission[]> {
  if (isSupabaseConfigured) {
    try {
      return await fetchAllAwardSubmissions();
    } catch (e) {
      console.warn("Supabase 读取三大奖数据失败，降级到本地存储", e);
    }
  }
  return (["national", "inspirational", "shanghai"] as AwardType[]).flatMap((awardType) =>
    getLocalSubmissions(awardType)
  );
}

export async function saveAwardSubmission(
  awardType: AwardType,
  submission: AwardSubmission
): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await saveAwardSubmissionToCloud(awardType, submission);
      return;
    } catch (e) {
      console.warn("Supabase 保存三大奖数据失败，降级到本地存储", e);
    }
  }

  // 本地降级
  const submissions = getLocalSubmissions(awardType);
  const normalized = normalizeSubmission({
    ...submission,
    awardType,
    collegeName: normalizeSubmissionCollegeName(submission.collegeName),
  });
  const duplicateIndex = submissions.findIndex(
    (item) =>
      item.academicYear === normalized.academicYear &&
      item.collegeName === normalized.collegeName
  );
  const nextSubmissions =
    duplicateIndex >= 0
      ? submissions.map((item, index) => (index === duplicateIndex ? normalized : item))
      : [...submissions, normalized];
  setLocalSubmissions(awardType, nextSubmissions);
}

export async function deleteAwardSubmission(id: string): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await deleteAwardSubmissionFromCloud(id);
      return;
    } catch (e) {
      console.warn("Supabase 删除三大奖数据失败，降级到本地存储", e);
    }
  }

  // 本地降级
  (["national", "inspirational", "shanghai"] as AwardType[]).forEach((awardType) => {
    const submissions = getLocalSubmissions(awardType);
    const next = submissions.filter((s) => s.id !== id);
    setLocalSubmissions(awardType, next);
  });
}

export async function clearAwardSubmissions(): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await clearAwardSubmissionsFromCloud();
    } catch (e) {
      console.warn("Supabase 清空三大奖数据失败", e);
    }
  }

  // 本地降级
  (["national", "inspirational", "shanghai"] as AwardType[]).forEach((awardType) => {
    localStorage.removeItem(awardStorageKeys[awardType]);
  });
}
