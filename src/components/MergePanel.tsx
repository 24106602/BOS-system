import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { CollegeProcessedBatch } from "../types/merge";
import {
  clearMergeBatches,
  deleteMergeBatch,
  getDisabledMergeBatches,
  getMergeBatches,
  restoreMergeBatch,
} from "../db/localMergeDb";
import { checkMergeDuplicates } from "../services/mergeDuplicateChecker";
import { exportMergedExcel } from "../services/mergeService";

export default function MergePanel() {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>([]);
  const [exportMessage, setExportMessage] = useState("");
  const [disabledBatches, setDisabledBatches] = useState<CollegeProcessedBatch[]>([]);
  const [showDisabled, setShowDisabled] = useState(false);

  const load = async () => {
    const data = await getMergeBatches();
    setBatches(data);
    if (showDisabled) setDisabledBatches(await getDisabledMergeBatches());
  };

  const toggleDisabledRecords = async () => {
    if (showDisabled) {
      setShowDisabled(false);
      setDisabledBatches([]);
      return;
    }
    setDisabledBatches(await getDisabledMergeBatches());
    setShowDisabled(true);
  };

  useEffect(() => {
    let cancelled = false;

    getMergeBatches().then((data) => {
      if (!cancelled) setBatches(data);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const studentBatches = batches.filter((item) => item.dataType === "student");
  const familyBatches = batches.filter((item) => item.dataType === "family");

  const toggle = (id: string, setSelectedIds: Dispatch<SetStateAction<string[]>>) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const exportSelected = (selectedBatches: CollegeProcessedBatch[], title: string) => {
    const result = exportMergedExcel(selectedBatches);
    const duplicateCount = checkMergeDuplicates(selectedBatches).length;
    setExportMessage(
      duplicateCount > 0
        ? `${title}导出成功：合并总行数 ${result.totalRows} 条，学院数量 ${result.collegeCount} 个，重复问题数量 ${duplicateCount} 个。请查看 Excel 中的“重复数据检查”工作表。`
        : `${title}导出成功：合并总行数 ${result.totalRows} 条，学院数量 ${result.collegeCount} 个，重复问题数量 ${duplicateCount} 个。`
    );
  };

  const renderPool = (
    title: string,
    items: CollegeProcessedBatch[],
    selectedIds: string[],
    setSelectedIds: Dispatch<SetStateAction<string[]>>,
    exportButtonText: string
  ) => {
    const selectedBatches = items.filter((item) => selectedIds.includes(item.id));
    const totalRows = selectedBatches.reduce((sum, item) => sum + item.rowCount, 0);

    return (
      <section style={{ marginBottom: 28 }}>
        <h3>{title}</h3>

        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setSelectedIds(items.map((item) => item.id))}
            style={{ marginRight: 8 }}
          >
            全选
          </button>

          <button onClick={() => setSelectedIds([])} style={{ marginRight: 8 }}>
            取消选择
          </button>

          <button
            onClick={() => exportSelected(selectedBatches, title)}
            disabled={selectedBatches.length === 0}
            style={{ marginRight: 8 }}
          >
            {exportButtonText}
          </button>
        </div>

        <p>
          已选批次：{selectedBatches.length} 个；合计数据：{totalRows} 条
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>选择</th>
              <th>学院</th>
              <th>数据类型</th>
              <th>行数</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggle(item.id, setSelectedIds)}
                  />
                </td>
                <td>{item.collegeName}</td>
                <td>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"}</td>
                <td>{item.rowCount}</td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
                <td>
                  <button
                    onClick={async () => {
                      await deleteMergeBatch(item.id);
                      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
                      await load();
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {items.length === 0 && <p>暂无已加入该汇总池的数据。</p>}
      </section>
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>全校数据汇总</h2>

      <div style={{ marginBottom: 12 }}>
        <button
          onClick={async () => {
            if (!confirm("确定禁用全部汇总池数据吗？历史记录将保留。")) return;
            await clearMergeBatches();
            setSelectedStudentIds([]);
            setSelectedFamilyIds([]);
            await load();
          }}
        >
          清空汇总池
        </button>
        <button style={{ marginLeft: 8 }} onClick={() => void toggleDisabledRecords()}>
          {showDisabled ? "隐藏已禁用记录" : "查看已禁用记录"}
        </button>
      </div>

      {exportMessage && <p>{exportMessage}</p>}

      {renderPool(
        "本专科信息汇总池",
        studentBatches,
        selectedStudentIds,
        setSelectedStudentIds,
        "导出本专科汇总表"
      )}

      {renderPool(
        "家庭成员信息汇总池",
        familyBatches,
        selectedFamilyIds,
        setSelectedFamilyIds,
        "导出家庭成员汇总表"
      )}

      {batches.length === 0 && <p>暂无已加入汇总池的数据。</p>}

      {showDisabled && (
        <section style={{ marginTop: 28 }}>
          <h3>已禁用汇总批次</h3>
          <p>仅管理员可在此查看和恢复误删批次。</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>学院</th><th>数据类型</th><th>行数</th><th>禁用时间</th><th>操作</th></tr></thead>
            <tbody>
              {disabledBatches.map((item) => (
                <tr key={item.id}>
                  <td>{item.collegeName}</td>
                  <td>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"}</td>
                  <td>{item.rowCount}</td>
                  <td>{item.deletedAt ? new Date(item.deletedAt).toLocaleString() : "-"}</td>
                  <td><button onClick={async () => {
                    if (!confirm("确定恢复该汇总批次吗？")) return;
                    await restoreMergeBatch(item.id);
                    await load();
                  }}>恢复</button></td>
                </tr>
              ))}
              {disabledBatches.length === 0 && <tr><td colSpan={5}>暂无已禁用批次。</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
