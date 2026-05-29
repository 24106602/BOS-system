$ErrorActionPreference = "Stop"

$project = "D:\助理部门\软件\bos-system"
$appPath = Join-Path $project "src\App.tsx"
$componentPath = Join-Path $project "src\components\StudentDatabasePanel.tsx"

if (-not (Test-Path -Path $appPath)) {
  throw "找不到 App.tsx：$appPath"
}

if (-not (Test-Path -Path $componentPath)) {
  throw "找不到数据库组件：$componentPath"
}

$app = Get-Content -Raw -Encoding UTF8 -Path $appPath

if ($app -notmatch "StudentDatabasePanel") {
  $app = $app.Replace(
    'import * as XLSX from "xlsx-js-style";',
    'import * as XLSX from "xlsx-js-style";' + "`r`n" + 'import StudentDatabasePanel from "./components/StudentDatabasePanel";'
  )
}

if ($app -notmatch 'const \[activeModule, setActiveModule\]') {
  $app = $app.Replace(
    '  const [analysis, setAnalysis] = useState<Record<string, number>>({});',
    '  const [analysis, setAnalysis] = useState<Record<string, number>>({});' + "`r`n" + '  const [activeModule, setActiveModule] = useState<"processing" | "database">("processing");'
  )
}

$oldModuleBar = @'
      <div style={styles.moduleBar}>
        <div style={styles.moduleTitle}>数据治理系统</div>
        <button style={styles.activeModule}>困难生数据处理</button>
        <button style={styles.disabledModule}>后续功能板块预留</button>
      </div>

      <div style={styles.layout}>
'@

$newModuleBar = @'
      <div style={styles.moduleBar}>
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
      <div style={styles.layout}>
'@

if ($app.Contains($oldModuleBar)) {
  $app = $app.Replace($oldModuleBar, $newModuleBar)
}

if ($app -match "<StudentDatabasePanel />" -and $app -notmatch "\r?\n      \)\}\r?\n    </div>\r?\n  \);") {
  $oldTail = "        </div>`r`n      </div>`r`n    </div>`r`n  );`r`n}"
  $newTail = "        </div>`r`n      </div>`r`n      )}`r`n    </div>`r`n  );`r`n}"
  $tailIndex = $app.LastIndexOf($oldTail)

  if ($tailIndex -lt 0) {
    $oldTail = "        </div>`n      </div>`n    </div>`n  );`n}"
    $newTail = "        </div>`n      </div>`n      )}`n    </div>`n  );`n}"
    $tailIndex = $app.LastIndexOf($oldTail)
  }

  if ($tailIndex -ge 0) {
    $app = $app.Substring(0, $tailIndex) + $newTail + $app.Substring($tailIndex + $oldTail.Length)
  } else {
    throw "没有找到页面结尾位置，请手动检查 App.tsx"
  }
}

$oldActiveStyle = @'
  activeModule: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledModule: {
'@

$newActiveStyle = @'
  activeModule: {
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
  disabledModule: {
'@

if ($app -notmatch "inactiveModule") {
  $app = $app.Replace($oldActiveStyle, $newActiveStyle)
}

$oldLayoutStyle = @'
  layout: {
    display: "grid",
    gridTemplateColumns: "58% 42%",
    gap: 16,
    height: "calc(100% - 70px)",
  },
  leftPanel: {
'@

$newLayoutStyle = @'
  layout: {
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
  leftPanel: {
'@

if ($app -notmatch "databaseLayout") {
  $app = $app.Replace($oldLayoutStyle, $newLayoutStyle)
}

Set-Content -Path $appPath -Value $app -Encoding UTF8

Write-Host "已加上困难生数据库模块。"

$npm = "D:\软件\node\npm.cmd"
if (Test-Path -Path $npm) {
  Push-Location $project
  try {
    & $npm run build
  } finally {
    Pop-Location
  }
} else {
  Write-Host "未找到 $npm，请手动运行 npm run build。"
}
