import { useEffect, useMemo, useState, type CSSProperties } from "react";
import ProcessingWorkbench from "../../App";
import ErrorReportTable, { type ValidationError } from "../../components/ErrorReportTable";

type CollegeUploadEventDetail = {
  errorCount: number;
  validationErrors: ValidationError[];
};

type SyncWindow = Window & {
  __bosSyncToSchool?: () => Promise<void>;
  __bosHasBlockingErrors?: () => boolean;
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
        <h1 style={styles.title}>学院数据上传与治理</h1>
        <div style={styles.tip}>流程：上传模板 → 上传待处理数据 → 开始治理 → 查看不通过预览 → 上载到学校端</div>
        <div style={styles.tip}>总数据行数：{hasProcessed ? "已治理" : "未治理"}</div>
        <div style={styles.tip}>不通过数量：{errorCount}</div>
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
  ok: {
    color: "#15803d",
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
