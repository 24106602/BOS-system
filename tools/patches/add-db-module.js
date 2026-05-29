const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const project = "D:\\助理部门\\软件\\bos-system";
const appPath = path.join(project, "src", "App.tsx");
const componentPath = path.join(project, "src", "components", "StudentDatabasePanel.tsx");

if (!fs.existsSync(appPath)) {
  throw new Error(`找不到 App.tsx：${appPath}`);
}

if (!fs.existsSync(componentPath)) {
  throw new Error(`找不到数据库组件：${componentPath}`);
}

let app = fs.readFileSync(appPath, "utf8");

if (!app.includes("StudentDatabasePanel")) {
  app = app.replace(
    'import * as XLSX from "xlsx-js-style";',
    'import * as XLSX from "xlsx-js-style";\nimport StudentDatabasePanel from "./components/StudentDatabasePanel";'
  );
}

if (!app.includes("const [activeModule, setActiveModule]")) {
  app = app.replace(
    '  const [analysis, setAnalysis] = useState<Record<string, number>>({});',
    '  const [analysis, setAnalysis] = useState<Record<string, number>>({});\n  const [activeModule, setActiveModule] = useState<"processing" | "database">("processing");'
  );
}

const oldModuleBar = `      <div style={styles.moduleBar}>
        <div style={styles.moduleTitle}>数据治理系统</div>
        <button style={styles.activeModule}>困难生数据处理</button>
        <button style={styles.disabledModule}>后续功能板块预留</button>
      </div>

      <div style={styles.layout}>`;

const newModuleBar = `      <div style={styles.moduleBar}>
        <div style={styles.moduleTitle}>数据治理系统</div>
        <button
          onClick={() => setActiveModule("processing")}
          style={activeModule === "processing" ? styles.activeModule : styles.inactiveModule}
        >
          困难生数据处理
        </button>
        <button
          onClick={() => setActiveModule("database")}
          style={activeModule === "database" ? styles.activeModule : styles.inactiveModule}
        >
          困难生数据库
        </button>
        <button style={styles.disabledModule}>后续功能板块预留</button>
      </div>

      {activeModule === "database" ? (
        <div style={styles.databaseLayout}>
          <div style={styles.databasePanel}>
            <div style={styles.windowHeader}>
              <h1 style={styles.title}>困难生数据库</h1>
              <span style={styles.windowBadge}>基础数据维护</span>
            </div>

            <StudentDatabasePanel />
          </div>
        </div>
      ) : (
      <div style={styles.layout}>`;

if (app.includes(oldModuleBar)) {
  app = app.replace(oldModuleBar, newModuleBar);
} else if (!app.includes("困难生数据库")) {
  throw new Error("没有找到顶部模块栏位置，请检查 App.tsx 是否已有较大改动。");
}

if (app.includes("<StudentDatabasePanel />") && !app.includes("      )}\n    </div>\n  );")) {
  const oldTail = `        </div>
      </div>
    </div>
  );
}`;
  const newTail = `        </div>
      </div>
      )}
    </div>
  );
}`;
  const lastIndex = app.lastIndexOf(oldTail);
  if (lastIndex === -1) {
    throw new Error("没有找到页面结尾位置，请检查 App.tsx。");
  }
  app = app.slice(0, lastIndex) + newTail + app.slice(lastIndex + oldTail.length);
}

const oldActiveStyle = `  activeModule: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledModule: {`;

const newActiveStyle = `  activeModule: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  inactiveModule: {
    background: "#ffffff",
    color: "#1e293b",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledModule: {`;

if (!app.includes("inactiveModule:")) {
  app = app.replace(oldActiveStyle, newActiveStyle);
}

const oldLayoutStyle = `  layout: {
    display: "grid",
    gridTemplateColumns: "58% 42%",
    gap: 16,
    height: "calc(100% - 70px)",
  },
  leftPanel: {`;

const newLayoutStyle = `  layout: {
    display: "grid",
    gridTemplateColumns: "58% 42%",
    gap: 16,
    height: "calc(100% - 70px)",
  },
  databaseLayout: {
    height: "calc(100% - 70px)",
    overflowY: "auto",
  },
  databasePanel: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    maxWidth: 1180,
    margin: "0 auto",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
  },
  leftPanel: {`;

if (!app.includes("databaseLayout:")) {
  app = app.replace(oldLayoutStyle, newLayoutStyle);
}

fs.writeFileSync(appPath, app, "utf8");
console.log("已加上困难生数据库模块。");

const npm = "D:\\软件\\node\\npm.cmd";
if (fs.existsSync(npm)) {
  childProcess.execFileSync(npm, ["run", "build"], {
    cwd: project,
    stdio: "inherit",
  });
} else {
  console.log(`未找到 ${npm}，请手动运行 npm run build。`);
}
