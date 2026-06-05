import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import type { CollegeProcessedBatch } from "../../types/merge";
import type { UserProfile } from "../../types/auth";
import { isSameSubmissionCollege } from "../../utils/collegeDetector";

type CollegeDifficultyPageProps = {
  profile: UserProfile;
  onNavigate?: (to: string) => void;
};

export default function CollegeDifficultyPage({ profile, onNavigate }: CollegeDifficultyPageProps) {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  const collegeName = profile.college_name || profile.display_name || "当前学院";
  const myBatches = useMemo(
    () => batches.filter((item) => isSameSubmissionCollege(item.collegeName, collegeName)),
    [batches, collegeName]
  );
  const studentCount = myBatches.filter((item) => item.dataType === "student").reduce((sum, item) => sum + item.rowCount, 0);
  const familyCount = myBatches.filter((item) => item.dataType === "family").reduce((sum, item) => sum + item.rowCount, 0);
  const lastAt = myBatches.map((item) => item.createdAt).sort().at(-1) || "";

  return (
    <section>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>困难生业务 / 学院业务首页</div>
          <h1 style={styles.title}>{collegeName}</h1>
          <p style={styles.description}>这里展示本学院困难生业务处理进度。完成本专科信息和家庭成员信息治理后，全部通过才可上载到学校端。</p>
        </div>
        <span style={styles.enabledBadge}>已启用</span>
      </div>

      <div style={styles.stats}>
        <Stat label="本专科通过人数" value={studentCount} />
        <Stat label="本专科不通过人数" value={0} tone="#c2414d" />
        <Stat label="家庭成员通过人数" value={familyCount} />
        <Stat label="家庭成员不通过人数" value={0} tone="#c2414d" />
        <Stat label="最近上载时间" value={lastAt ? new Date(lastAt).toLocaleString() : "暂无"} />
        <Stat label="数据关联状态" value={studentCount > 0 && familyCount > 0 ? "待学校端关联" : "待完善"} />
      </div>

      <div style={styles.cardGrid}>
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>本专科信息处理状态</h2>
          <p style={styles.cardText}>学生本人困难生主信息，一名学生一行。通过后进入学校端本专科信息汇总。</p>
          <StatusRow label="当前状态" value={studentCount > 0 ? "已上载" : "待处理"} />
          <StatusRow label="通过数量" value={studentCount} />
          <StatusRow label="不通过数量" value={0} />
        </section>
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>家庭成员信息处理状态</h2>
          <p style={styles.cardText}>学生家庭成员附属信息，通过学生身份证号与本专科信息关联。</p>
          <StatusRow label="当前状态" value={familyCount > 0 ? "已上载" : "待处理"} />
          <StatusRow label="通过数量" value={familyCount} />
          <StatusRow label="不通过数量" value={0} />
        </section>
      </div>

      <div style={styles.actions}>
        <button style={styles.primaryButton} onClick={() => onNavigate?.("/college/upload")}>快速进入数据处理</button>
        <button style={styles.secondaryButton} onClick={() => onNavigate?.("/college/records")}>查看提交记录</button>
      </div>
    </section>
  );
}

function Stat({ label, value, tone = "#0077d4" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <strong style={{ ...styles.statValue, color: tone }}>{value}</strong>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={styles.statusRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  hero: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 20, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "5px 0 7px", color: "#172033", fontSize: 26 },
  description: { margin: 0, color: "#63738a", fontSize: 14, lineHeight: 1.7 },
  enabledBadge: { padding: "6px 10px", borderRadius: 999, background: "#e9f8f2", color: "#087b5b", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "14px 0" },
  stat: { padding: 14, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff" },
  statLabel: { color: "#63738a", marginBottom: 7, fontSize: 13 },
  statValue: { fontSize: 20 },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 },
  card: { padding: 16, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff" },
  cardTitle: { margin: "0 0 8px", color: "#172033", fontSize: 18 },
  cardText: { margin: "0 0 12px", color: "#63738a", fontSize: 13, lineHeight: 1.7 },
  statusRow: { display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: "1px solid #edf1f6", color: "#52647b", fontSize: 13 },
  actions: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 },
  primaryButton: { border: "none", borderRadius: 6, padding: "10px 14px", background: "#0077d4", color: "#fff", fontWeight: 800, cursor: "pointer" },
  secondaryButton: { border: "1px solid #cbd8e6", borderRadius: 6, padding: "10px 14px", background: "#fff", color: "#26364e", fontWeight: 800, cursor: "pointer" },
};
