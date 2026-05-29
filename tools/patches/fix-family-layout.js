const fs = require("fs");
const path = require("path");

const project = "D:\\助理部门\\软件\\bos-system";
const appPath = path.join(project, "src", "App.tsx");

if (!fs.existsSync(appPath)) {
  throw new Error(`找不到 App.tsx：${appPath}`);
}

let app = fs.readFileSync(appPath, "utf8");

const oldModuleBar = `  moduleBar: {
    height: 56,
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },`;

const newModuleBar = `  moduleBar: {
    minHeight: 56,
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    paddingBottom: 8,
    background: "#f1f5f9",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },`;

if (app.includes(oldModuleBar)) {
  app = app.replace(oldModuleBar, newModuleBar);
}

const oldLayout = `  layout: {
    display: "grid",
    gridTemplateColumns: "58% 42%",
    gap: 16,
    height: "calc(100% - 70px)",
  },`;

const newLayout = `  layout: {
    display: "grid",
    gridTemplateColumns: "58% 42%",
    gap: 16,
    minHeight: 0,
    flex: 1,
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
    flexShrink: 0,
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

if (!app.includes("processingWorkspace:")) {
  if (!app.includes(oldLayout)) {
    throw new Error("没有找到 layout 样式块，无法自动修复。");
  }

  app = app.replace(oldLayout, newLayout);
}

const purpleButton = `  purpleButton: button("#7c3aed"),`;
const purpleButtonWithDisabled = `  purpleButton: button("#7c3aed"),
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

if (!app.includes("disabledActionButton:")) {
  if (!app.includes(purpleButton)) {
    throw new Error("没有找到按钮样式位置，无法自动修复。");
  }

  app = app.replace(purpleButton, purpleButtonWithDisabled);
}

fs.writeFileSync(appPath, app, "utf8");
console.log("已修复顶部模块栏和家庭成员功能区排版样式。");
