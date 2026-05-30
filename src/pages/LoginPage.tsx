import type { CSSProperties } from "react";

type Role = "admin" | "college";

type LoginPageProps = {
  currentRole: Role | null;
  onSelectRole: (role: Role) => void;
};

export default function LoginPage({ currentRole, onSelectRole }: LoginPageProps) {
  const roleText = currentRole === "admin" ? "学校管理员端" : currentRole === "college" ? "学院端" : "请选择身份";

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <div style={styles.brandPanel}>
          <div style={styles.logo}>校</div>
          <p style={styles.eyebrow}>STUDENT AFFAIRS DATA PLATFORM</p>
          <h1 style={styles.brandTitle}>困难生业务系统</h1>
          <p style={styles.brandText}>面向学校管理部门与学院的数据治理平台</p>
          <div style={styles.brandLine} />
          <p style={styles.brandNote}>规范上载、自动治理、集中汇总</p>
        </div>
        <div style={styles.loginPanel}>
          <p style={styles.loginEyebrow}>平台入口</p>
          <h2 style={styles.title}>选择工作端</h2>
          <p style={styles.tip}>当前身份：{roleText}</p>
          <div style={styles.buttons}>
            <button style={styles.admin} onClick={() => onSelectRole("admin")}>
              <span style={styles.buttonTitle}>学校管理员端</span>
              <span style={styles.buttonDescription}>查看学院上载、困难生总库与全校汇总</span>
            </button>
            <button style={styles.college} onClick={() => onSelectRole("college")}>
              <span style={styles.buttonTitle}>学院端</span>
              <span style={styles.buttonDescription}>治理本学院数据并上载到学校端</span>
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "#eaf1f8",
  },
  shell: {
    width: "min(900px, 100%)",
    minHeight: 430,
    display: "grid",
    gridTemplateColumns: "minmax(260px, 0.85fr) minmax(360px, 1.15fr)",
    overflow: "hidden",
    background: "#fff",
    border: "1px solid #d9e3ee",
    borderRadius: 8,
    boxShadow: "0 18px 44px rgba(15, 35, 64, 0.12)",
  },
  brandPanel: {
    padding: "46px 38px",
    color: "#fff",
    background: "#0b1428",
  },
  logo: {
    width: 54,
    height: 54,
    display: "grid",
    placeItems: "center",
    marginBottom: 42,
    borderRadius: 8,
    color: "#fff",
    background: "#008de5",
    fontSize: 24,
    fontWeight: 900,
  },
  eyebrow: {
    margin: "0 0 12px",
    color: "#72c7ff",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0,
  },
  brandTitle: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.25,
  },
  brandText: {
    margin: "14px 0 0",
    color: "#b8c7dc",
    fontSize: 14,
    lineHeight: 1.8,
  },
  brandLine: {
    width: 46,
    height: 3,
    marginTop: 34,
    borderRadius: 2,
    background: "#00a8ff",
  },
  brandNote: {
    margin: "15px 0 0",
    color: "#8ea2bf",
    fontSize: 13,
  },
  loginPanel: {
    padding: "54px 48px",
  },
  loginEyebrow: {
    margin: 0,
    color: "#0077d4",
    fontSize: 13,
    fontWeight: 800,
  },
  title: {
    margin: "10px 0 8px",
    color: "#101d34",
    fontSize: 28,
  },
  tip: {
    margin: "0 0 26px",
    color: "#718096",
    fontSize: 14,
  },
  buttons: {
    display: "grid",
    gap: 12,
  },
  admin: {
    display: "grid",
    gap: 5,
    padding: "16px 18px",
    border: "1px solid #0077d4",
    borderRadius: 8,
    color: "#fff",
    background: "#0077d4",
    textAlign: "left",
    cursor: "pointer",
  },
  college: {
    display: "grid",
    gap: 5,
    padding: "16px 18px",
    border: "1px solid #cfdbe7",
    borderRadius: 8,
    color: "#15304f",
    background: "#f8fbfe",
    textAlign: "left",
    cursor: "pointer",
  },
  buttonTitle: {
    fontSize: 16,
    fontWeight: 800,
  },
  buttonDescription: {
    fontSize: 13,
    opacity: 0.82,
  },
};
