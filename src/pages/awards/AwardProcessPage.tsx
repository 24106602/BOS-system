import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { readWorkbook } from "../../services/templateParser";
import {
  exportAwardExcel,
  makeAwardSubmission,
  parseAwardWorkbook,
  processAwardWorkbook,
  saveAwardSubmission,
} from "../../services/awardProcessor";
import { awardTypeLabels, getAwardTemplateValidationError } from "../../services/awardConfig";
import { resolveCollegeUpload } from "../../utils/collegeDetector";
import type { AwardIssue, AwardProcessResult, AwardProcessedRow, AwardTemplate, AwardType } from "../../types/award";

type PageLog = {
  type: "info" | "success" | "error";
  message: string;
  time: string;
};

const addTime = (type: PageLog["type"], message: string): PageLog => ({
  type,
  message,
  time: new Date().toLocaleTimeString(),
});

type AwardProcessPageProps = {
  awardType: AwardType;
};

export default function AwardProcessPage({ awardType }: AwardProcessPageProps) {
  const awardName = awardTypeLabels[awardType];
  const fileRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [template, setTemplate] = useState<AwardTemplate | null>(null);
  const [result, setResult] = useState<AwardProcessResult | null>(null);
  const [collegeName, setCollegeName] = useState("未知学院");
  const [collegeError, setCollegeError] = useState("");
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("等待上传 Excel");
  const [logs, setLogs] = useState<PageLog[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const pushLog = (type: PageLog["type"], message: string) => {
    setLogs((current) => [...current, addTime(type, message)]);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const nextTemplate = parseAwardWorkbook(await readWorkbook(file));
      const templateError = getAwardTemplateValidationError(awardType, file.name, nextTemplate);
      if (templateError) throw new Error(templateError);
      const detection = resolveCollegeUpload(file.name);
      setTemplate(nextTemplate);
      setResult(null);
      setHasSubmitted(false);
      setFileName(file.name);
      setCollegeName(detection.collegeName);
      setCollegeError(detection.error);
      setStatus(`已读取模板：${nextTemplate.fields.length} 个字段，${nextTemplate.sourceRows.length} 行待处理数据`);
      setLogs([
        addTime("success", `已读取 Excel：${file.name}`),
        addTime("info", "已自动读取第 1 行填写要求、第 2 行字段名称，第 3 行起作为待处理数据"),
        addTime(
          detection.error ? "error" : "success",
          detection.error || `已识别所属学院：${detection.collegeName}`
        ),
      ]);
    } catch (error) {
      console.error("Award Excel parse failed:", error);
      setTemplate(null);
      setResult(null);
      setStatus("Excel 读取失败");
      setLogs([addTime("error", error instanceof Error ? error.message : "Excel 读取失败")]);
    } finally {
      event.target.value = "";
    }
  };

  const startProcessing = () => {
    if (!template) {
      alert(`请先选择${awardName} Excel 文件`);
      return;
    }

    setIsProcessing(true);
    setStatus("正在检查并自动修复...");
    const nextResult = processAwardWorkbook(template, awardType);
    setResult(nextResult);
    setHasSubmitted(false);
    setLogs((current) => [
      ...current,
      ...nextResult.logs.map((item) =>
        addTime(
          "success",
          `第 ${item.rowNumber} 行 ${item.field}：${item.reason}\n原值：${String(item.originalValue ?? "")}\n修复后：${String(item.fixedValue ?? "")}`
        )
      ),
      ...nextResult.issues.map((item) =>
        addTime("error", `第 ${item.rowNumber} 行 ${item.field}：${item.reason}`)
      ),
      addTime(
        nextResult.failedRows.length > 0 ? "error" : "success",
        `处理完成：通过 ${nextResult.passedRows.length} 行，不通过 ${nextResult.failedRows.length} 行，自动修复 ${nextResult.logs.length} 项`
      ),
    ]);
    setStatus(
      nextResult.failedRows.length > 0
        ? "处理完成：存在不通过项，请导出不通过名单修改"
        : "处理完成：全部通过，可以上载到学校端"
    );
    setIsProcessing(false);
  };

  const exportPassedRows = () => {
    if (!template || !result || result.passedRows.length === 0) {
      alert("暂无可导出的通过名单");
      return;
    }
    exportAwardExcel({ template, result, exportMode: "passed" });
  };

  const exportFailedRows = () => {
    if (!template || !result || result.failedRows.length === 0) {
      alert("暂无可导出的不通过名单");
      return;
    }
    exportAwardExcel({ template, result, exportMode: "failed" });
  };

  const uploadToSchool = () => {
    if (!template || !result) {
      alert("请先完成数据处理");
      return;
    }
    if (collegeError) {
      alert(collegeError);
      return;
    }
    if (result.failedRows.length > 0) {
      alert("上载失败：当前数据仍存在不通过项，请导出不通过名单修改");
      return;
    }
    if (result.passedRows.length === 0) {
      alert("没有可上载的数据");
      return;
    }

    saveAwardSubmission(awardType, makeAwardSubmission({ awardType, collegeName, fields: template.fields, result }));
    setHasSubmitted(true);
    setStatus(`${awardName}数据已上载到学校端`);
    pushLog("success", `${collegeName} ${awardName}数据已上载到学校端，共 ${result.passedRows.length} 行`);
    alert(`${awardName}数据已上载到学校端`);
  };

  const total = result ? result.passedRows.length + result.failedRows.length : 0;
  const canUpload =
    Boolean(template && result) &&
    !collegeError &&
    result?.failedRows.length === 0 &&
    (result?.passedRows.length || 0) > 0;

  const sourceRows = useMemo<AwardProcessedRow[]>(
    () =>
      (template?.sourceRows || [])
        .map((row, sourceRowIndex) => ({
          sourceRowIndex,
          excelRowNumber: sourceRowIndex + 3,
          values: (template?.fields || []).reduce<Record<string, unknown>>((values, field, index) => {
            values[field] = row[index] ?? "";
            return values;
          }, {}),
        }))
        .filter((row) => Object.values(row.values).some((value) => String(value ?? "").trim() !== "")),
    [template]
  );

  return (
    <section style={styles.page}>
      <div style={styles.mainColumn}>
        <section style={styles.card}>
          <div style={styles.header}>
            <div>
              <div style={styles.eyebrow}>三奖业务 / 学院端数据处理</div>
              <h1 style={styles.title}>{awardName}数据处理</h1>
              <p style={styles.description}>上传 Excel 后，系统自动读取填写要求并进行检查。第 1 行为填写要求，第 2 行为字段名称，第 3 行开始为数据。</p>
            </div>
            <span style={styles.badge}>模板规则自动解析</span>
          </div>

          <div style={styles.uploadArea}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileChange} />
            <div>
              <strong style={styles.uploadTitle}>上传{awardName} Excel</strong>
              <div style={styles.description}>{fileName || "请选择包含填写要求、字段名和数据的 Excel 文件"}</div>
            </div>
            <button style={styles.blueButton} onClick={() => fileRef.current?.click()}>选择 Excel 文件</button>
          </div>

          <div style={styles.buttonGrid}>
            <button style={styles.orangeButton} disabled={isProcessing} onClick={startProcessing}>
              {isProcessing ? "处理中..." : "开始处理"}
            </button>
            <button style={styles.purpleButton} onClick={exportPassedRows}>导出通过名单</button>
            <button style={styles.purpleButton} onClick={exportFailedRows}>导出不通过名单</button>
            <button style={canUpload ? styles.greenButton : styles.disabledButton} disabled={!canUpload} onClick={uploadToSchool}>
              上载到学校端
            </button>
          </div>

          <div style={styles.status}>{status}</div>
          <div style={collegeError ? styles.errorStatus : styles.status}>当前识别学院：{collegeName}{collegeError ? `；${collegeError}` : ""}</div>
          {hasSubmitted && <div style={styles.successStatus}>本次{awardName}数据已上载，学校端汇总页面会自动读取。</div>}

          <div style={styles.statsGrid}>
            <Stat label="总人数" value={total} />
            <Stat label="通过人数" value={result?.passedRows.length || 0} tone="#087b5b" />
            <Stat label="不通过人数" value={result?.failedRows.length || 0} tone="#b42336" />
            <Stat label="自动修复项" value={result?.logs.length || 0} tone="#0f766e" />
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.subTitle}>自动解析规则</h2>
          <RuleTable template={template} />
        </section>

        <section style={styles.card}>
          <h2 style={styles.subTitle}>待处理数据预览</h2>
          <DataTable fields={template?.fields || []} rows={sourceRows} />
        </section>

        <section style={styles.card}>
          <h2 style={styles.subTitle}>通过名单预览</h2>
          <DataTable fields={template?.fields || []} rows={result?.passedRows || []} />
        </section>

        <section style={styles.card}>
          <h2 style={styles.subTitle}>不通过名单预览</h2>
          <DataTable fields={template?.fields || []} rows={result?.failedRows || []} issues={result?.issues || []} />
        </section>
      </div>

      <aside style={styles.logPanel}>
        <h2 style={styles.logTitle}>{awardName}处理日志</h2>
        <div style={styles.logBox}>
          {logs.length === 0 && <div style={styles.logItem}>[等待] {awardName}数据处理功能区已就绪</div>}
          {logs.map((item, index) => (
            <div
              key={`${item.time}_${index}`}
              style={{
                ...styles.logItem,
                color: item.type === "error" ? "#f87171" : item.type === "success" ? "#4ade80" : "#ffffff",
              }}
            >
              [{item.time}] {item.message}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </aside>
    </section>
  );
}

function Stat({ label, value, tone = "#0077d4" }: { label: string; value: number; tone?: string }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <strong style={{ ...styles.statValue, color: tone }}>{value}</strong>
    </div>
  );
}

function RuleTable({ template }: { template: AwardTemplate | null }) {
  if (!template) return <div style={styles.empty}>上传 Excel 后自动显示模板规则</div>;
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>字段名</th>
            <th style={styles.th}>填写要求</th>
            <th style={styles.th}>是否必填</th>
            <th style={styles.th}>解析类型</th>
            <th style={styles.th}>补充规则</th>
          </tr>
        </thead>
        <tbody>
          {template.rules.map((rule) => (
            <tr key={`${rule.columnIndex}_${rule.field}`}>
              <td style={styles.td}>{rule.field}</td>
              <td style={styles.td}>{rule.requirement || "-"}</td>
              <td style={styles.td}>{rule.required ? "必填" : "非必填"}</td>
              <td style={styles.td}>{rule.kind}</td>
              <td style={styles.td}>
                {rule.maxLength ? `最多 ${rule.maxLength} 字` : ""}
                {rule.enumValues?.length ? `允许值：${rule.enumValues.join("、")}` : ""}
                {!rule.maxLength && !rule.enumValues?.length ? "-" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataTable({
  fields,
  rows,
  issues = [],
}: {
  fields: string[];
  rows: AwardProcessedRow[];
  issues?: AwardIssue[];
}) {
  if (rows.length === 0) return <div style={styles.empty}>暂无数据</div>;
  const issueKeys = new Set(issues.map((issue) => `${issue.rowIndex}_${issue.columnIndex}`));

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Excel 行号</th>
            {fields.map((field, columnIndex) => <th key={`${columnIndex}_${field}`} style={styles.th}>{field}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 30).map((row) => (
            <tr key={row.sourceRowIndex}>
              <td style={styles.td}>{row.excelRowNumber}</td>
              {fields.map((field, columnIndex) => (
                <td
                  key={`${columnIndex}_${field}`}
                  style={issueKeys.has(`${row.sourceRowIndex}_${columnIndex}`) ? styles.warningCell : styles.td}
                >
                  {String(row.values[field] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const button = (background: string): CSSProperties => ({
  background,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
});

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 34%)", gap: 12, alignItems: "start" },
  mainColumn: { display: "grid", gap: 12, minWidth: 0 },
  card: { background: "#fff", borderRadius: 8, border: "1px solid #d7e1ed", padding: 16, boxShadow: "0 4px 14px rgba(15,35,64,0.05)", minWidth: 0 },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  eyebrow: { color: "#0077d4", fontSize: 12, fontWeight: 800, marginBottom: 5 },
  title: { margin: 0, color: "#172033", fontSize: 23 },
  subTitle: { margin: "0 0 10px", color: "#172033", fontSize: 17 },
  description: { color: "#63738a", fontSize: 13, lineHeight: 1.7, margin: "7px 0 0" },
  badge: { padding: "6px 9px", borderRadius: 999, background: "#e8f4ff", color: "#0077d4", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  uploadArea: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px dashed #a9c7e1", borderRadius: 8, padding: 14, background: "#f8fbfe", marginBottom: 10 },
  uploadTitle: { color: "#26364e", fontSize: 14 },
  buttonGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8, marginBottom: 10 },
  blueButton: button("#0077d4"),
  orangeButton: button("#d78a14"),
  purpleButton: button("#6757c8"),
  greenButton: button("#0b9b6f"),
  disabledButton: { ...button("#a6b4c5"), cursor: "not-allowed" },
  status: { background: "#f3f9ff", color: "#0875bd", border: "1px solid #cce3f8", borderRadius: 6, padding: 9, marginTop: 7, fontSize: 13 },
  errorStatus: { background: "#fff1f2", color: "#b42336", border: "1px solid #ffd4da", borderRadius: 6, padding: 9, marginTop: 7, fontSize: 13 },
  successStatus: { background: "#e9f8f2", color: "#087b5b", border: "1px solid #c7eedf", borderRadius: 6, padding: 9, marginTop: 7, fontSize: 13, fontWeight: 700 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginTop: 12 },
  statCard: { padding: 11, borderRadius: 6, border: "1px solid #dbe5ef", background: "#f8fbfe", textAlign: "center" },
  statLabel: { color: "#63738a", fontSize: 12, marginBottom: 5 },
  statValue: { fontSize: 21 },
  empty: { color: "#8190a4", padding: 12 },
  tableWrap: { overflow: "auto", maxHeight: 280, border: "1px solid #d7e1ed", borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { position: "sticky", top: 0, zIndex: 1, padding: "8px 9px", border: "1px solid #cbd5e1", background: "#edf4fa", color: "#40526a", whiteSpace: "nowrap", textAlign: "center" },
  td: { padding: "8px 9px", border: "1px solid #d7e1ed", color: "#52647b", whiteSpace: "nowrap", textAlign: "center" },
  warningCell: { padding: "8px 9px", border: "1px solid #d7e1ed", color: "#713f12", background: "#fef08a", whiteSpace: "nowrap", textAlign: "center", fontWeight: 700 },
  logPanel: { position: "sticky", top: 18, padding: 16, borderRadius: 8, background: "#0b1428", overflow: "hidden" },
  logTitle: { color: "#e5efff", fontSize: 18, margin: "0 0 12px" },
  logBox: { maxHeight: 320, overflowY: "auto", fontFamily: "Consolas, monospace", fontSize: 13, lineHeight: 1.6 },
  logItem: { color: "#fff", whiteSpace: "pre-line", marginBottom: 10 },
};
