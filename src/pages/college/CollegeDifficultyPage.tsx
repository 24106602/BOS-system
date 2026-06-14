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

  const unitName = profile.college_name || profile.display_name || "当前学部（院）";
  const myBatches = useMemo(
    () => batches.filter((item) => isSameSubmissionCollege(item.collegeName, unitName)),
    [batches, unitName]
  );
  const studentBatches = myBatches.filter((item) => item.dataType === "student");
  const familyBatches = myBatches.filter((item) => item.dataType === "family");
  const studentCount = studentBatches.reduce((sum, item) => sum + item.rowCount, 0);
  const familyCount = familyBatches.reduce((sum, item) => sum + item.rowCount, 0);
  const lastAt = myBatches.map((item) => item.createdAt).sort().at(-1) || "";
  const latestStudentAt = studentBatches.map((item) => item.createdAt).sort().at(-1) || "";
  const latestFamilyAt = familyBatches.map((item) => item.createdAt).sort().at(-1) || "";

  return (
    <section style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>困难生业务 / 学部（院）端业务首页</div>
          <h1 style={styles.title}>困难生业务</h1>
          <p style={styles.description}>当前学部（院）提交与处理情况概览。业务首页只展示入口、状态和最近提交记录。</p>
        </div>
        <span style={styles.enabledBadge}>当前学部（院）：{unitName}</span>
      </div>

      <div style={styles.entryGrid}>
        <BusinessEntryCard
          title="本专科信息处理"
          description="上传学生本人困难生主信息，系统自动治理并拆分通过名单和不通过名单。"
          total={studentCount}
          passed={studentCount}
          failed={0}
          repaired={0}
          status={studentCount > 0 ? "已上载" : "待处理"}
          onEnter={() => onNavigate?.("/college/difficulty/student")}
        />
        <BusinessEntryCard
          title="家庭成员信息处理"
          description="上传学生家庭成员附属信息，后续通过学生身份证号与本专科信息关联。"
          total={familyCount}
          passed={familyCount}
          failed={0}
          repaired={0}
          status={familyCount > 0 ? "已上载" : "待处理"}
          onEnter={() => onNavigate?.("/college/difficulty/family")}
        />
        <BusinessEntryCard
          title="困难生明细"
          description="查看本学院已上载困难生数据，按学年筛选并支持姓名、学号、身份证号和困难等级检索。"
          total={studentCount}
          passed={studentCount}
          failed={0}
          repaired={0}
          status={studentCount > 0 ? "可查看" : "待上载"}
          onEnter={() => onNavigate?.("/college/difficulty/students")}
        />
      </div>

      <section style={{ ...styles.card, ...styles.overviewCard }}>
        <h2 style={styles.subTitle}>数据提交概览</h2>
        <div style={styles.stats}>
          <Stat label="本专科信息最近提交状态" value={studentCount > 0 ? "已上载" : "暂无提交"} />
          <Stat label="家庭成员信息最近提交状态" value={familyCount > 0 ? "已上载" : "暂无提交"} />
          <Stat label="最近提交时间" value={lastAt ? new Date(lastAt).toLocaleString() : "暂无"} />
          <Stat label="当前待整改数量" value={0} tone="#b42336" />
        </div>
        <div style={styles.hint}>
          具体 Excel 上传、通过/不通过预览、导出名单和处理日志只在对应处理页面中显示。
        </div>
      </section>

      <section style={{ ...styles.card, ...styles.recordsCard }}>
        <h2 style={styles.subTitle}>最近提交记录</h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>数据类型</th>
                <th style={styles.th}>提交单位</th>
                <th style={styles.th}>通过人数</th>
                <th style={styles.th}>不通过人数</th>
                <th style={styles.th}>提交状态</th>
                <th style={styles.th}>最近提交时间</th>
              </tr>
            </thead>
            <tbody>
              {myBatches.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={6}>暂无提交记录</td>
                </tr>
              ) : (
                myBatches
                  .slice()
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 8)
                  .map((item) => (
                    <tr key={item.id}>
                      <td style={styles.td}>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"}</td>
                      <td style={styles.td}>{item.collegeName}</td>
                      <td style={styles.td}>{item.rowCount}</td>
                      <td style={styles.td}>0</td>
                      <td style={styles.td}>已上载</td>
                      <td style={styles.td}>{new Date(item.createdAt).toLocaleString()}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div style={styles.hiddenMeta}>
        {latestStudentAt}
        {latestFamilyAt}
      </div>
    </section>
  );
}

function BusinessEntryCard({
  title,
  description,
  total,
  passed,
  failed,
  repaired,
  status,
  onEnter,
}: {
  title: string;
  description: string;
  total: number;
  passed: number;
  failed: number;
  repaired: number;
  status: string;
  onEnter: () => void;
}) {
  return (
    <section style={styles.entryCard}>
      <div style={styles.cardHead}>
        <h2 style={styles.cardTitle}>{title}</h2>
        <span style={status === "已上载" ? styles.okBadge : styles.waitBadge}>{status}</span>
      </div>
      <p style={styles.cardText}>{description}</p>
      <div style={styles.miniStats}>
        <MiniStat label="数据总量" value={total} />
        <MiniStat label="通过人数" value={passed} tone="#087b5b" />
        <MiniStat label="不通过人数" value={failed} tone="#b42336" />
        <MiniStat label="自动修复数量" value={repaired} tone="#0f766e" />
      </div>
      <button style={styles.primaryButton} onClick={onEnter}>进入处理</button>
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

function MiniStat({ label, value, tone = "#0077d4" }: { label: string; value: number; tone?: string }) {
  return (
    <div style={styles.miniStat}>
      <span>{label}</span>
      <strong style={{ color: tone }}>{value}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { height: "calc(100vh - 104px)", minHeight: 650, display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr) auto", gap: 12, overflow: "hidden" },
  hero: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 16, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)" },
  eyebrow: { color: "#0077d4", fontSize: 13, fontWeight: 800 },
  title: { margin: "5px 0 7px", color: "#172033", fontSize: 26 },
  description: { margin: 0, color: "#63738a", fontSize: 14, lineHeight: 1.7 },
  enabledBadge: { padding: "6px 10px", borderRadius: 999, background: "#e9f8f2", color: "#087b5b", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" },
  entryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 },
  entryCard: { padding: 14, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)", minWidth: 0 },
  card: { padding: 14, border: "1px solid #d7e1ed", borderRadius: 8, background: "#fff", boxShadow: "0 4px 14px rgba(15,35,64,0.05)", minWidth: 0, minHeight: 0, overflow: "hidden" },
  overviewCard: { flexShrink: 0 },
  recordsCard: { display: "flex", flexDirection: "column" },
  cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 },
  cardTitle: { margin: 0, color: "#172033", fontSize: 18 },
  subTitle: { margin: "0 0 12px", color: "#172033", fontSize: 18 },
  cardText: { margin: "0 0 10px", color: "#63738a", fontSize: 13, lineHeight: 1.6 },
  okBadge: { padding: "4px 8px", borderRadius: 999, background: "#e9f8f2", color: "#087b5b", fontSize: 12, fontWeight: 800 },
  waitBadge: { padding: "4px 8px", borderRadius: 999, background: "#f3f8fd", color: "#52647b", fontSize: 12, fontWeight: 800 },
  miniStats: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 10 },
  miniStat: { display: "grid", gap: 4, padding: 8, borderRadius: 6, border: "1px solid #d7e1ed", background: "#f8fbfe", color: "#63738a", fontSize: 12 },
  primaryButton: { border: "none", borderRadius: 6, padding: "10px 14px", background: "#0077d4", color: "#fff", fontWeight: 800, cursor: "pointer" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 },
  stat: { padding: 13, border: "1px solid #d7e1ed", borderRadius: 8, background: "#f8fbfe" },
  statLabel: { color: "#63738a", marginBottom: 7, fontSize: 13 },
  statValue: { fontSize: 18 },
  hint: { marginTop: 10, padding: 9, borderRadius: 6, background: "#f3f9ff", color: "#0875bd", border: "1px solid #cce3f8", fontSize: 13 },
  tableWrap: { flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, zIndex: 1, border: "1px solid #d7e1ed", background: "#edf4fa", padding: 9, whiteSpace: "nowrap", textAlign: "center" },
  td: { border: "1px solid #cbd5e1", padding: 9, textAlign: "center", whiteSpace: "nowrap" },
  hiddenMeta: { display: "none" },
};
