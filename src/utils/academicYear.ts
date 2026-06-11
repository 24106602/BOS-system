import type { CollegeProcessedBatch } from "../types/merge";

export const getCurrentAcademicYear = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= 9 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
};

export const makeAcademicYearOptions = () => {
  const currentStart = Number(getCurrentAcademicYear().slice(0, 4));
  return [-1, 0, 1, 2].map((offset) => {
    const start = currentStart + offset;
    return `${start}-${start + 1}`;
  });
};

export const ACADEMIC_YEAR_OPTIONS = makeAcademicYearOptions();

export const getBatchAcademicYear = (batch: Pick<CollegeProcessedBatch, "academic_year">) =>
  String(batch.academic_year || getCurrentAcademicYear()).trim() || getCurrentAcademicYear();

export const isBatchInAcademicYear = (batch: Pick<CollegeProcessedBatch, "academic_year">, academicYear: string) =>
  getBatchAcademicYear(batch) === academicYear;

export const withAcademicYear = <T extends Record<string, unknown>>(rows: T[], academicYear: string) =>
  rows.map((row) => ({ ...row, academic_year: String(row.academic_year || academicYear) }));
