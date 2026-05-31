import type { CSSProperties, ChangeEventHandler, ReactNode, RefObject } from "react";
import type { FamilyProcessingStats, FamilyReviewRow, LogItem } from "../services/types";

type FamilyProcessPageProps = {
  styles: Record<string, CSSProperties>;
  familyTemplateRef: RefObject<HTMLInputElement | null>;
  familyDataRef: RefObject<HTMLInputElement | null>;
  uploadFamilyTemplate: ChangeEventHandler<HTMLInputElement>;
  uploadFamilyData: ChangeEventHandler<HTMLInputElement>;
  isFamilyProcessing: boolean;
  processFamilyData: () => void;
  exportFamilyResult: () => void;
  exportFamilyErrorReport: () => void;
  addFamilyResultToMergePool: () => void;
  hideSubmitAction?: boolean;
  familyStatus: string;
  familyCollegeName: string;
  familyStats: FamilyProcessingStats;
  renderFamilyTemplatePreview: () => ReactNode;
  renderTable: (rows: Record<string, unknown>[] | FamilyReviewRow[]) => ReactNode;
  makeSourcePreview: (rows: unknown[][], fields: string[]) => Record<string, unknown>[];
  familySourceRows: unknown[][];
  familyTemplateFields: string[];
  familyProcessedData: Record<string, unknown>[];
  familyReviewRows: FamilyReviewRow[];
  familyAnalysis: Record<string, number>;
  familyLogs: LogItem[];
  familyLogEndRef: RefObject<HTMLDivElement | null>;
};

export default function FamilyProcessPage({
  styles,
  familyTemplateRef,
  familyDataRef,
  uploadFamilyTemplate,
  uploadFamilyData,
  isFamilyProcessing,
  processFamilyData,
  exportFamilyResult,
  exportFamilyErrorReport,
  addFamilyResultToMergePool,
  hideSubmitAction = false,
  familyStatus,
  familyCollegeName,
  familyStats,
  renderFamilyTemplatePreview,
  renderTable,
  makeSourcePreview,
  familySourceRows,
  familyTemplateFields,
  familyProcessedData,
  familyReviewRows,
  familyAnalysis,
  familyLogs,
  familyLogEndRef,
}: FamilyProcessPageProps) {
  return (
    <div style={styles.familyLayout}>
      <div style={styles.familyMainPanel}>
        <div style={styles.windowHeader}>
          <h1 style={styles.title}>家庭成员信息处理</h1>
          <span style={styles.windowBadge}>困难生数据处理子功能</span>
        </div>

        <div style={styles.buttonGrid}>
          <input ref={familyTemplateRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={uploadFamilyTemplate} />
          <button onClick={() => familyTemplateRef.current?.click()} style={styles.blueButton}>选择模板文件</button>
          <input ref={familyDataRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={uploadFamilyData} />
          <button onClick={() => familyDataRef.current?.click()} style={styles.greenButton}>选择数据文件</button>
          <button disabled={isFamilyProcessing} onClick={processFamilyData} style={styles.orangeButton}>
            {isFamilyProcessing ? "处理中..." : "开始处理"}
          </button>
          <button onClick={exportFamilyResult} style={styles.purpleButton}>导出通过名单</button>
          <button onClick={exportFamilyErrorReport} style={styles.purpleButton}>导出不通过名单</button>
          {!hideSubmitAction && <button onClick={addFamilyResultToMergePool} style={styles.mergeButton}>上载到学校端</button>}
        </div>

        <div style={styles.status}>{familyStatus}</div>
        <div style={styles.status}>当前识别学院：{familyCollegeName}</div>

        <div style={styles.statsGrid}>
          <div style={styles.statCard}><div>总人数</div><strong>{familyStats.total}</strong></div>
          <div style={styles.statCard}><div>通过人数</div><strong style={{ color: "#16a34a" }}>{Math.max(0, familyStats.total - familyStats.review)}</strong></div>
          <div style={styles.statCard}><div>不通过人数</div><strong style={{ color: "#dc2626" }}>{familyStats.review}</strong></div>
          <div style={styles.statCard}><div>自动修复项</div><strong style={{ color: "#0f766e" }}>{familyStats.repaired}</strong></div>
        </div>

        <section style={styles.section}><h2>家庭成员模板预览</h2>{renderFamilyTemplatePreview()}</section>
        <section style={styles.section}><h2>家庭成员数据预览</h2>{renderTable(makeSourcePreview(familySourceRows, familyTemplateFields))}</section>
        <section style={styles.section}><h2>家庭成员处理结果</h2>{renderTable(familyProcessedData)}</section>
        <section style={styles.section}><h2>家庭成员不通过预览</h2>{renderTable(familyReviewRows)}</section>

        <section style={styles.section}>
          <h2>问题分析</h2>
          {Object.keys(familyAnalysis).length === 0 ? (
            <div style={styles.empty}>暂无分析结果</div>
          ) : (
            Object.keys(familyAnalysis).map((key) => (
              <div key={key} style={styles.problemItem}>{key}：{familyAnalysis[key]} 项问题</div>
            ))
          )}
        </section>
      </div>

      <div style={styles.familySidePanel}>
        <h2 style={styles.logTitle}>家庭成员处理日志</h2>
        <div style={styles.logBox}>
          {familyLogs.length === 0 && (
            <div style={{ ...styles.logItem, color: "#ffffff" }}>[等待] 家庭成员信息处理功能区已就绪</div>
          )}
          {familyLogs.map((item, index) => (
            <div
              key={index}
              style={{
                ...styles.logItem,
                color: item.type === "error" ? "#f87171" : item.type === "success" ? "#4ade80" : "#ffffff",
              }}
            >
              [{item.time}] {item.message}
            </div>
          ))}
          <div ref={familyLogEndRef} />
        </div>
      </div>
    </div>
  );
}
