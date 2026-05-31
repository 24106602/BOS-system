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

      <div style={styles.card}>
        <h2 style={styles.subTitle}>不通过预览</h2>
        <ErrorReportTable errors={validationErrors} />
      </div>

      <ProcessingWorkbench collegeMode />
    </section>
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
