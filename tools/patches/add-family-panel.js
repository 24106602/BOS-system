const fs = require("fs");
const path = require("path");

const project = "D:\\助理部门\\软件\\bos-system";
const appPath = path.join(project, "src", "App.tsx");

if (!fs.existsSync(appPath)) {
  throw new Error(`找不到 App.tsx：${appPath}`);
}

let app = fs.readFileSync(appPath, "utf8");

if (!app.includes("const [activeProcessingPanel, setActiveProcessingPanel]")) {
  app = app.replace(
    '  const [activeModule, setActiveModule] = useState<"processing" | "database">("processing");',
    '  const [activeModule, setActiveModule] = useState<"processing" | "database">("processing");\n  const [activeProcessingPanel, setActiveProcessingPanel] = useState<"student" | "family">("student");'
  );
}

app = app.replace(
  '<h1 style={styles.title}>困难生数据处理</h1>\n            <span style={styles.windowBadge}>独立功能窗口</span>',
  '<h1 style={styles.title}>本专科困难生信息处理</h1>\n            <span style={styles.windowBadge}>困难生数据处理子功能</span>'
);

app = app.replace(
  '<h2 style={styles.logTitle}>实时治理日志</h2>',
  '<h2 style={styles.logTitle}>本专科处理日志</h2>'
);

const processingStart = `      ) : (
      <div style={styles.layout}>`;

const processingStartReplacement = `      ) : (
      <div style={styles.processingWorkspace}>
        <div style={styles.subModuleBar}>
          <button
            onClick={() => setActiveProcessingPanel("student")}
            style={activeProcessingPanel === "student" ? styles.activeSubModule : styles.inactiveSubModule}
          >
            本专科困难生信息处理
          </button>
          <button
            onClick={() => setActiveProcessingPanel("family")}
            style={activeProcessingPanel === "family" ? styles.activeSubModule : styles.inactiveSubModule}
          >
            家庭成员信息处理
          </button>
        </div>

      {activeProcessingPanel === "student" ? (
      <div style={styles.layout}>`;

if (!app.includes("activeProcessingPanel === \"student\"")) {
  if (!app.includes(processingStart)) {
    throw new Error("没有找到困难生数据处理页面开始位置，请检查 App.tsx。");
  }
  app = app.replace(processingStart, processingStartReplacement);
}

const processingEnd = `        </div>
      </div>
      )}
    </div>`;

const familyPanel = `        </div>
      </div>
      ) : (
        <div style={styles.familyLayout}>
          <div style={styles.familyMainPanel}>
            <div style={styles.windowHeader}>
              <h1 style={styles.title}>家庭成员信息处理</h1>
              <span style={styles.windowBadge}>困难生数据处理子功能</span>
            </div>

            <div style={styles.buttonGrid}>
              <button disabled style={styles.disabledActionButton}>上传模板</button>
              <button disabled style={styles.disabledActionButton}>上传家庭成员数据</button>
              <button disabled style={styles.disabledActionButton}>开始处理</button>
              <button disabled style={styles.disabledActionButton}>导出结果</button>
            </div>

            <div style={styles.status}>家庭成员信息处理待配置</div>

            <div style={styles.statsGrid}>
              <div style={styles.statCard}><div>成员数据行数</div><strong>0</strong></div>
              <div style={styles.statCard}><div>关系校验</div><strong style={{ color: "#16a34a" }}>0</strong></div>
              <div style={styles.statCard}><div>异常</div><strong style={{ color: "#dc2626" }}>0</strong></div>
              <div style={styles.statCard}><div>标记</div><strong style={{ color: "#7c3aed" }}>0</strong></div>
              <div style={styles.statCard}><div>待复核</div><strong style={{ color: "#f97316" }}>0</strong></div>
            </div>

            <section style={styles.section}><h2>家庭成员模板预览</h2><div style={styles.empty}>暂无模板</div></section>
            <section style={styles.section}><h2>家庭成员数据预览</h2><div style={styles.empty}>暂无数据</div></section>
            <section style={styles.section}><h2>家庭成员处理结果</h2><div style={styles.empty}>暂无结果</div></section>
          </div>

          <div style={styles.familySidePanel}>
            <h2 style={styles.logTitle}>家庭成员处理日志</h2>
            <div style={styles.logBox}>
              <div style={{ ...styles.logItem, color: "#ffffff" }}>[等待] 家庭成员信息处理功能区已就绪</div>
            </div>
          </div>
        </div>
      )}
      </div>
      )}
    </div>`;

if (!app.includes("家庭成员模板预览")) {
  const lastIndex = app.lastIndexOf(processingEnd);
  if (lastIndex === -1) {
    throw new Error("没有找到困难生数据处理页面结束位置，请检查 App.tsx。");
  }
  app = app.slice(0, lastIndex) + familyPanel + app.slice(lastIndex + processingEnd.length);
}

const layoutStyle = `  layout: {
    display: "grid",
    gridTemplateColumns: "58% 42%",
    gap: 16,
    height: "calc(100% - 70px)",
  },`;

const layoutStyleReplacement = `  layout: {
    display: "grid",
    gridTemplateColumns: "58% 42%",
    gap: 16,
    height: "calc(100% - 64px)",
  },
  processingWorkspace: {
    height: "calc(100% - 70px)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  subModuleBar: {
    display: "flex",
    gap: 10,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  activeSubModule: {
    background: "#0f172a",
    color: "#ffffff",
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  inactiveSubModule: {
    background: "#ffffff",
    color: "#334155",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  familyLayout: {
    display: "grid",
    gridTemplateColumns: "58% 42%",
    gap: 16,
    minHeight: 0,
    flex: 1,
  },
  familyMainPanel: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    overflowY: "auto",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
  },
  familySidePanel: {
    background: "#020617",
    borderRadius: 24,
    padding: 24,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },`;

if (!app.includes("processingWorkspace")) {
  if (!app.includes(layoutStyle)) {
    throw new Error("没有找到 layout 样式位置，请检查 App.tsx。");
  }
  app = app.replace(layoutStyle, layoutStyleReplacement);
}

const purpleButtonStyle = `  purpleButton: button("#7c3aed"),`;
const purpleButtonReplacement = `  purpleButton: button("#7c3aed"),
  disabledActionButton: {
    background: "#e2e8f0",
    color: "#64748b",
    border: "none",
    borderRadius: 14,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "not-allowed",
  },`;

if (!app.includes("disabledActionButton")) {
  if (!app.includes(purpleButtonStyle)) {
    throw new Error("没有找到按钮样式位置，请检查 App.tsx。");
  }
  app = app.replace(purpleButtonStyle, purpleButtonReplacement);
}

fs.writeFileSync(appPath, app, "utf8");
console.log("已新增：本专科困难生信息处理 / 家庭成员信息处理 二级功能区。");
