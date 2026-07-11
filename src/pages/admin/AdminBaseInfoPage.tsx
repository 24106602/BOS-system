import type { CSSProperties } from "react";
import { useState } from "react";
import { collegeAccounts } from "../../utils/collegeDetector";

type SchoolInfo = {
  schoolCode: string;
  schoolName: string;
  schoolType: string;
  schoolNature: string;
  schoolLevel: string;
  contactPerson: string;
  contactPhone: string;
  enabled: boolean;
  sortOrder: number;
};

const mockSchoolInfo: SchoolInfo = {
  schoolCode: "BOS-001",
  schoolName: "上海应用技术大学",
  schoolType: "普通高等学校",
  schoolNature: "公办",
  schoolLevel: "本专科",
  contactPerson: "学生处",
  contactPhone: "021-60873000",
  enabled: true,
  sortOrder: 1,
};

export default function AdminBaseInfoPage() {
  const [school, setSchool] = useState<SchoolInfo>(mockSchoolInfo);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const totalColleges = collegeAccounts.length;
  const enabledColleges = collegeAccounts.filter((c) => c.enabled).length;

  return (
    <section className="bos-table-page difficulty-workspace">
      <header className="bos-page-title-row">
        <div>
          <h1>学校基础信息</h1>
          <p>维护学校的基本信息和配置参数。</p>
        </div>
        <button className="bos-button is-primary" onClick={handleSave}>
          {saved ? "已保存" : "保存"}
        </button>
      </header>

      <div className="bos-stat-grid">
        <div style={styles.statCard}>
          <div style={styles.statLabel}>学校名称</div>
          <div style={styles.statValue}>{school.schoolName}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>学校编码</div>
          <div style={styles.statValue}>{school.schoolCode}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>办学层次</div>
          <div style={styles.statValue}>{school.schoolLevel}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>院系总数</div>
          <div style={styles.statValue}>{totalColleges}</div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>学校基础信息</h2>
        </div>
        <div style={styles.formGrid}>
          <div style={styles.formRow}>
            <label style={styles.formLabel}>学校名称 *</label>
            <input
              style={styles.formInput}
              value={school.schoolName}
              onChange={(e) => setSchool({ ...school, schoolName: e.target.value })}
            />
          </div>
          <div style={styles.formRow}>
            <label style={styles.formLabel}>学校编码</label>
            <input
              style={styles.formInput}
              value={school.schoolCode}
              onChange={(e) => setSchool({ ...school, schoolCode: e.target.value })}
            />
          </div>
          <div style={styles.formRow}>
            <label style={styles.formLabel}>学校类型</label>
            <select
              style={styles.formSelect}
              value={school.schoolType}
              onChange={(e) => setSchool({ ...school, schoolType: e.target.value })}
            >
              <option value="普通高等学校">普通高等学校</option>
              <option value="成人高等学校">成人高等学校</option>
              <option value="民办高等学校">民办高等学校</option>
            </select>
          </div>
          <div style={styles.formRow}>
            <label style={styles.formLabel}>学校性质</label>
            <select
              style={styles.formSelect}
              value={school.schoolNature}
              onChange={(e) => setSchool({ ...school, schoolNature: e.target.value })}
            >
              <option value="公办">公办</option>
              <option value="民办">民办</option>
              <option value="中外合作">中外合作</option>
            </select>
          </div>
          <div style={styles.formRow}>
            <label style={styles.formLabel}>办学层次</label>
            <select
              style={styles.formSelect}
              value={school.schoolLevel}
              onChange={(e) => setSchool({ ...school, schoolLevel: e.target.value })}
            >
              <option value="本科">本科</option>
              <option value="专科">专科</option>
              <option value="本专科">本专科</option>
              <option value="研究生">研究生</option>
            </select>
          </div>
          <div style={styles.formRow}>
            <label style={styles.formLabel}>联系人</label>
            <input
              style={styles.formInput}
              value={school.contactPerson}
              onChange={(e) => setSchool({ ...school, contactPerson: e.target.value })}
            />
          </div>
          <div style={styles.formRow}>
            <label style={styles.formLabel}>联系电话</label>
            <input
              style={styles.formInput}
              value={school.contactPhone}
              onChange={(e) => setSchool({ ...school, contactPhone: e.target.value })}
            />
          </div>
          <div style={styles.formRow}>
            <label style={styles.formLabel}>状态</label>
            <select
              style={styles.formSelect}
              value={school.enabled ? "启用" : "禁用"}
              onChange={(e) => setSchool({ ...school, enabled: e.target.value === "启用" })}
            >
              <option value="启用">启用</option>
              <option value="禁用">禁用</option>
            </select>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>院系统计信息</h2>
        </div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>统计项目</th>
                <th style={styles.th}>数值</th>
                <th style={styles.th}>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.nameCell}>院系总数</td>
                <td style={styles.td}>{totalColleges}</td>
                <td style={styles.td}>已配置的院系数量</td>
              </tr>
              <tr>
                <td style={styles.nameCell}>启用院系</td>
                <td style={styles.td}>{enabledColleges}</td>
                <td style={styles.td}>可登录系统的院系</td>
              </tr>
              <tr>
                <td style={styles.nameCell}>禁用院系</td>
                <td style={styles.td}>{totalColleges - enabledColleges}</td>
                <td style={styles.td}>暂不可登录的院系</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  statCard: {
    padding: 14,
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    background: "#f8fbfe",
  },
  statLabel: {
    color: "#63738a",
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    color: "#172033",
    fontWeight: 700,
  },
  card: {
    background: "#fff",
    borderRadius: 8,
    border: "1px solid #d7e1ed",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  cardHeader: {
    padding: 14,
    borderBottom: "1px solid #e1e8f0",
  },
  cardTitle: {
    margin: 0,
    fontSize: 15,
    color: "#1f3147",
  },
  formGrid: {
    padding: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
  },
  formRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  formLabel: {
    fontSize: 12,
    color: "#52647b",
    fontWeight: 700,
  },
  formInput: {
    padding: 8,
    border: "1px solid #d9e2ec",
    borderRadius: 6,
    fontSize: 13,
    backgroundColor: "#fff",
  },
  formSelect: {
    padding: 8,
    border: "1px solid #d9e2ec",
    borderRadius: 6,
    fontSize: 13,
    backgroundColor: "#fff",
  },
  tableWrap: {
    overflow: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    border: "1px solid #cbd5e1",
    background: "#edf4fa",
    padding: 8,
    whiteSpace: "nowrap",
    textAlign: "center",
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: 8,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  nameCell: {
    border: "1px solid #cbd5e1",
    padding: 8,
    color: "#26364e",
    whiteSpace: "nowrap",
  },
};
