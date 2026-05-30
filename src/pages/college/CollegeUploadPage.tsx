import { useEffect, useMemo, useState, type CSSProperties } from "react";
import ProcessingWorkbench from "../../App";
import ErrorReportTable, { type ValidationError } from "../../components/ErrorReportTable";

type CollegeUploadEventDetail = {
  errorCount: number;
  validationErrors: ValidationError[];
};

type SyncWindow = Window & {
  __bosSyncToSchool?: () => Promise<void>;
};

export default function CollegeUploadPage() {
  const [errorCount, setErrorCount] = useState(0);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("等待提交");

  useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<CollegeUploadEventDetail>).detail;
      if (!detail) return;
      setHasProcessed(true);
      setErrorCount(detail.errorCount || 0);
      setValidationErrors(detail.validationErrors || []);
      setSubmitMessage(
        detail.errorCount > 0 ? "上传失败：当前数据仍存在错误" : "治理通过，可上传到学校端"
      );
    };

    window.addEventListener("bos:college-upload-result", onResult);
    return () => window.removeEventListener("bos:college-upload-result", onResult);
  }, []);

  const canSubmit = useMemo(
    () => hasProcessed && errorCount === 0 && !validationErrors.some((item) => item.level === "error"),
    [hasProcessed, errorCount, validationErrors]
  );

  const uploadToSchool = async () => {
    if (!canSubmit) {
      setSubmitMessage("上传失败：当前数据仍存在错误");
      alert("上传失败，当前数据仍存在错误");
      return;
    }

    const syncFn = (window as SyncWindow).__bosSyncToSchool;
    if (!syncFn) {
      setSubmitMessage("上传失败：未找到云端同步入口");
      alert("上传失败：未找到云端同步入口");
      return;
    }

    try {
      setSubmitMessage("正在上传到学校端...");
      await syncFn();
      setSubmitMessage("已提交到学校端");
      alert("已提交到学校端");
    } catch (error) {
      console.error("College upload sync failed:", error);
      setSubmitMessage("上传失败：云端写入异常");
      alert("上传失败：云端写入异常");
    }
  };

  return (
    <section style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>学院数据上传与治理</h1>
        <div style={styles.tip}>流程：上传模板 → 上传待处理数据 → 开始治理 → 查看错误列表 → 上传到学校端</div>
        <div style={styles.tip}>当前错误数：{errorCount}</div>
        {hasProcessed && !canSubmit && <div style={styles.warn}>上传失败：当前数据仍存在错误</div>}
        <button style={canSubmit ? styles.submit : styles.submitDisabled} onClick={uploadToSchool} disabled={!canSubmit}>
          上传到学校端
        </button>
        <div style={styles.tip}>提交状态：{submitMessage}</div>
      </div>

      <div style={styles.card}>
        <h2 style={styles.subTitle}>错误列表</h2>
        <ErrorReportTable errors={validationErrors} />
      </div>

      <ProcessingWorkbench />
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: "grid",
    gap: 12,
  },
  card: {
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    padding: 16,
  },
  title: {
    margin: "0 0 10px 0",
    color: "#0f172a",
  },
  subTitle: {
    margin: "0 0 10px 0",
    color: "#0f172a",
  },
  tip: {
    color: "#475569",
    marginBottom: 8,
  },
  warn: {
    color: "#b91c1c",
    fontWeight: 700,
    marginBottom: 8,
  },
  submit: {
    background: "#16a34a",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  submitDisabled: {
    background: "#94a3b8",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "not-allowed",
  },
};
