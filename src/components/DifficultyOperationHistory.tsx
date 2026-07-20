import { useEffect, useState } from "react";
import {
  getDifficultyStudentOperationLogs,
  type DifficultyOperationAction,
  type DifficultyOperationLog,
} from "../services/difficultyStudentApi";
import { getDifficultyStudentStatusLabel } from "../constants/statusTransitions";

const ACTION_LABELS: Record<DifficultyOperationAction, string> = {
  confirm: "确认上载",
  approve: "审核通过",
  reject: "审核退回",
  report: "学校上报",
  return: "中心退回",
  edit: "编辑资料",
  delete: "删除记录",
  resubmit: "修改后重新提交",
};

const ROLE_LABELS: Record<string, string> = {
  college_admin: "学院管理员",
  school_admin: "学校管理员",
  center_admin: "中心管理员",
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString("zh-CN", { hour12: false });
};

const getOperatorText = (log: DifficultyOperationLog) =>
  String(log.operator_name || "").trim()
  || ROLE_LABELS[String(log.operator_role || "")]
  || "系统";

const getStatusText = (status?: string | null) =>
  status ? getDifficultyStudentStatusLabel(status) : "无";

function LoadedOperationHistory({ recordId }: { recordId: string | number }) {
  const [logs, setLogs] = useState<DifficultyOperationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    void getDifficultyStudentOperationLogs(recordId)
      .then((result) => {
        if (!active) return;
        setLogs(Array.isArray(result.data) ? result.data : []);
        setMessage("");
      })
      .catch((error) => {
        if (!active) return;
        setLogs([]);
        setMessage(error instanceof Error ? error.message : "操作历史读取失败");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [recordId, reloadToken]);

  if (isLoading) {
    return <div className="difficulty-history-empty">正在读取操作历史...</div>;
  }

  if (message) {
    return (
      <div className="difficulty-history-empty is-error">
        <span>{message}</span>
        <button onClick={() => {
          setIsLoading(true);
          setReloadToken((value) => value + 1);
        }}>重新加载</button>
      </div>
    );
  }

  if (logs.length === 0) {
    return <div className="difficulty-history-empty">该学生暂无操作历史。</div>;
  }

  return (
    <ol className="difficulty-operation-timeline">
      {logs.map((log) => (
        <li key={log.id} className="difficulty-operation-item">
          <span className="difficulty-operation-dot" data-action={log.action} />
          <div className="difficulty-operation-card">
            <div className="difficulty-operation-heading">
              <strong>{ACTION_LABELS[log.action] || log.action}</strong>
              <time>{formatTime(log.created_at)}</time>
            </div>
            <div className="difficulty-operation-meta">
              操作人：{getOperatorText(log)}
              {log.operator_role ? ` · ${ROLE_LABELS[log.operator_role] || log.operator_role}` : ""}
            </div>
            <div className="difficulty-operation-status">
              {getStatusText(log.from_status)} → {getStatusText(log.to_status)}
            </div>
            {log.remark && <p className="difficulty-operation-remark">备注：{log.remark}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function DifficultyOperationHistory({
  recordId,
}: {
  recordId?: string | number | null;
}) {
  if (recordId === undefined || recordId === null || recordId === "") {
    return <div className="difficulty-history-empty">该记录尚未同步到云端，暂无操作历史。</div>;
  }
  return <LoadedOperationHistory recordId={recordId} />;
}
