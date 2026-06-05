import { useEffect, useMemo, useState, type CSSProperties } from "react";
import ProcessingWorkbench from "../../App";
import ErrorReportTable, { type ValidationError } from "../../components/ErrorReportTable";

type CollegeUploadEventDetail = {
  errorCount: number;
  totalCount: number;
  fixedCount: number;
  validationErrors: ValidationError[];
};

type SyncWindow = Window & {
  __bosSyncToSchool?: () => Promise<void>;
  __bosHasBlockingErrors?: () => boolean;
};

export default function CollegeUploadPage() {
  const [errorCount, setErrorCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [fixedCount, setFixedCount] = useState(0);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("等待提交");

  useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<CollegeUploadEventDetail>).detail;
      if (!detail) return;
      setHasProcessed(true);
      setErrorCount(detail.errorCount || 0);
      setTotalCount(detail.totalCount || 0);
      setFixedCount(detail.fixedCount || 0);
      setValidationErrors(detail.validationErrors || []);
      setSubmitMessage(
        detail.errorCount > 0 ? "上载失败：当前数据仍存在不通过项" : "治理通过：可以上载到学校端"
      );
    };

    window.addEventListener("bos:college-upload-result", onResult);
    return () => window.removeEventListener("bos:college-upload-result", onResult);
  }, []);

  const hasBlockingErrors = useMemo(
    () =>
      !hasProcessed ||
      errorCount > 0 ||
      validationErrors.some((item) => item.level === "error"),
    [hasProcessed, errorCount, validationErrors]
  );

  const canSubmit = !hasBlockingErrors;

  const enterProcessing = (panel: "student" | "family") => {
    window.dispatchEvent(new CustomEvent("bos:switch-processing-panel", { detail: panel }));
    document.getElementById("difficulty-processing-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const uploadToSchool = async () => {
    const globalBlocking = (window as SyncWindow).__bosHasBlockingErrors?.() ?? false;
    if (hasBlockingErrors || globalBlocking) {
      setSubmitMessage("上载失败：当前数据仍存在不通过项，请查看不通过预览");
      alert("上载失败：当前数据仍存在不通过项，请查看不通过预览");
      return;
    }

    const syncFn = (window as SyncWindow).__bosSyncToSchool;
    if (!syncFn) {
      setSubmitMessage("上载失败：未找到学校端上载入口");
      alert("上载失败：未找到学校端上载入口");
      return;
    }

    try {
      setSubmitMessage("正在上载到学校端...");
      await syncFn();
      setSubmitMessage("已上载到学校端");
      alert("已上载到学校端");
    } catch (error) {
      console.error("College upload sync failed:", error);
      setSubmitMessage("上载失败：云端写入异常");
      alert("上载失败：云端写入异常");
    }
  };

  return (
    <section style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.eyebrow}>困难生业务 / 数据处理</div>
        <h1 style={styles.title}>学院数据治理与上载</h1>
        <div style={styles.tip}>流程：选择模板文件 → 选择数据文件 → 开始治理 → 查看不通过预览 → 上载到学校端</div>
        <div style={styles.resultGrid}>
          <ResultStat label="总人数" value={hasProcessed ? totalCount : 0} />
          <ResultStat label="通过人数" value={hasProcessed ? Math.max(0, totalCount - errorCount) : 0} tone="#087b5b" />
          <ResultStat label="不通过人数" value={errorCount} tone="#b42336" />
          <ResultStat label="自动修复项" value={fixedCount} tone="#0f766e" />
        </div>
        {hasProcessed && hasBlockingErrors ? (
          <div style={styles.warn}>当前数据存在不通过项，不能上载到学校端</div>
        ) : hasProcessed ? (
          <div style={styles.ok}>当前数据已全部通过，可以上载到学校端</div>
        ) : null}

        <button style={canSubmit ? styles.submit : styles.submitDisabled} onClick={uploadToSchool} disabled={!canSubmit}>
          上载到学校端
        </button>
        <div style={styles.tip}>提交状态：{submitMessage}</div>
      </div>

      <div style={styles.processGrid}>
        <ProcessCard
          title="本专科信息处理"
          description="治理学生本人困难生主信息，生成通过名单、不通过名单和问题说明。"
          fileState={hasProcessed ? "已完成一次治理" : "等待选择模板和数据"}
          total={hasProcessed ? totalCount : 0}
          passed={hasProcessed ? Math.max(0, totalCount - errorCount) : 0}
          failed={hasProcessed ? errorCount : 0}
          fixed={hasProcessed ? fixedCount : 0}
          onEnter={() => enterProcessing("student")}
        />
        <ProcessCard
          title="家庭成员信息处理"
          description="治理家庭成员附属信息，后续通过学生身份证号与本专科信息关联。"
          fileState="进入后查看当前文件状态"
          total={0}
          passed={0}
          failed={0}
          fixed={0}
          onEnter={() => enterProcessing("family")}
        />
      </div>

      <div style={styles.card}>
        <h2 style={styles.subTitle}>不通过预览</h2>
        <ErrorReportTable errors={validationErrors} />
      </div>

      <div id="difficulty-processing-workbench">
        <ProcessingWorkbench collegeMode />
      </div>
    </section>
  );
}

function ProcessCard({
  title,
  description,
  fileState,
  total,
  passed,
  failed,
  fixed,
  onEnter,
}: {
  title: string;
  description: string;
  fileState: string;
  total: number;
  passed: number;
  failed: number;
  fixed: number;
  onEnter: () => void;
}) {
  return (
    <section style={styles.processCard}>
      <div style={styles.processHead}>
        <h2 style={styles.processTitle}>{title}</h2>
        <span style={styles.processBadge}>{fileState}</span>
      </div>
      <p style={styles.processText}>{description}</p>
      <div style={styles.miniStats}>
        <MiniStat label="总数据量" value={total} />
        <MiniStat label="通过" value={passed} tone="#087b5b" />
        <MiniStat label="不通过" value={failed} tone="#b42336" />
        <MiniStat label="自动修复" value={fixed} tone="#0f766e" />
      </div>
      <button style={styles.enterButton} onClick={onEnter}>进入处理</button>
    </section>
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

function ResultStat({ label, value, tone = "#0077d4" }: { label: string; value: number; tone?: string }) {
  return (
    <div style={styles.resultStat}>
      <div style={styles.resultLabel}>{label}</div>
      <strong style={{ ...styles.resultValue, color: tone }}>{value}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: "grid",
    gap: 12,
  },
  card: {
    background: "#fff",
    borderRadius: 8,
    border: "1px solid #d7e1ed",
    padding: 16,
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  processGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 12,
  },
  processCard: {
    background: "#fff",
    borderRadius: 8,
    border: "1px solid #d7e1ed",
    padding: 16,
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  processHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  processTitle: {
    margin: 0,
    color: "#172033",
    fontSize: 18,
  },
  processBadge: {
    padding: "4px 8px",
    borderRadius: 999,
    background: "#f3f8fd",
    color: "#52647b",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  processText: {
    margin: "0 0 12px",
    color: "#63738a",
    fontSize: 13,
    lineHeight: 1.7,
  },
  miniStats: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
    marginBottom: 12,
  },
  miniStat: {
    display: "grid",
    gap: 4,
    padding: 8,
    borderRadius: 6,
    border: "1px solid #d7e1ed",
    background: "#f8fbfe",
    color: "#63738a",
    fontSize: 12,
  },
  enterButton: {
    border: "none",
    borderRadius: 6,
    padding: "9px 12px",
    background: "#0077d4",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
  eyebrow: {
    color: "#0077d4",
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 5,
  },
  title: {
    margin: "0 0 10px 0",
    color: "#172033",
    fontSize: 22,
  },
  subTitle: {
    margin: "0 0 10px 0",
    color: "#172033",
    fontSize: 17,
  },
  tip: {
    color: "#63738a",
    fontSize: 13,
    marginBottom: 8,
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 8,
    margin: "12px 0",
  },
  resultStat: {
    padding: 10,
    borderRadius: 6,
    border: "1px solid #d7e1ed",
    background: "#f8fbfe",
  },
  resultLabel: {
    color: "#63738a",
    fontSize: 12,
    marginBottom: 5,
  },
  resultValue: {
    fontSize: 20,
  },
  warn: {
    color: "#b42336",
    background: "#fff1f2",
    border: "1px solid #ffd4da",
    borderRadius: 6,
    padding: "9px 10px",
    fontWeight: 700,
    marginBottom: 8,
  },
  ok: {
    color: "#087b5b",
    background: "#e9f8f2",
    border: "1px solid #c7eedf",
    borderRadius: 6,
    padding: "9px 10px",
    fontWeight: 700,
    marginBottom: 8,
  },
  submit: {
    background: "#0077d4",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  submitDisabled: {
    background: "#a6b4c5",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "not-allowed",
  },
};
