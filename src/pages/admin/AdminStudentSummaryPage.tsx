import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import { ACADEMIC_YEAR_OPTIONS, getCurrentAcademicYear, isBatchInAcademicYear } from "../../utils/academicYear";

export default function AdminStudentSummaryPage() {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const yearStudentBatches = useMemo(
    () => batches.filter((item) => item.dataType === "student" && isBatchInAcademicYear(item, academicYear)),
    [academicYear, batches]
  );
  const rowCount = yearStudentBatches.reduce((sum, item) => sum + item.rowCount, 0);

  return (
    <section style={styles.card}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>困难生业务 / 主信息</div>
          <h1 style={styles.title}>本专科信息汇总</h1>
        </div>
        <label style={styles.yearSelectLabel}>
          学年
          <select style={styles.yearSelect} value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
            {ACADEMIC_YEAR_OPTIONS.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </label>
      </div>
      <p style={styles.description}>
        当前展示的是 {academicYear} 学年的本专科信息汇总。后续接入真实学生主表后，此处按 academic_year 独立筛选展示。
      </p>
      <div style={styles.statCard}>
        <span>当前学年本专科信息数</span>
        <strong>{rowCount}</strong>
      </div>
      <div style={styles.placeholder}>本专科信息汇总表区域已预留，当前按所选学年读取学院上载批次统计。</div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { background: "#fff", border: "1px solid #d8e3ee", borderRadius: 8, padding: 22, boxShadow: "0 8px 22px rgba(15, 35, 64, 0.06)" },
  header: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", marginBottom: 12 },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "8px 0", color: "#101d34", fontSize: 24 },
  description: { color: "#5b6b80", lineHeight: 1.7, margin: "0 0 16px" },
  yearSelectLabel: { display: "grid", gap: 5, color: "#40526a", fontSize: 12, fontWeight: 700 },
  yearSelect: { minWidth: 132, border: "1px solid #cfdbe7", borderRadius: 6, padding: "9px 10px", color: "#15304f", background: "#fff", fontSize: 13 },
  statCard: { display: "grid", gap: 6, marginBottom: 14, border: "1px solid #dbe5ef", borderRadius: 8, padding: 14, background: "#f8fbfe", color: "#63738a" },
  placeholder: { color: "#718096", border: "1px dashed #b9cada", borderRadius: 8, padding: 18, background: "#f8fbfe" },
};
