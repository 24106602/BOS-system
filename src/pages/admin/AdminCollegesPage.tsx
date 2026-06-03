import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getMergeBatches } from "../../db/localMergeDb";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import {
  getFallbackProfiles,
  listUserProfiles,
} from "../../services/profileService";
import { resolveLoginEmail } from "../../services/accountDirectory";
import type { UserProfile } from "../../types/auth";
import type { CollegeProcessedBatch } from "../../types/merge";
import { isSameSubmissionCollege, normalizeSubmissionCollegeName } from "../../utils/collegeDetector";

type CollegeSummary = {
  collegeName: string;
  lastSubmittedAt: string;
  submitted: boolean;
};

const getSubmitUnit = (profile: UserProfile) =>
  profile.role === "admin" ? "学校管理员" : profile.college_name || profile.display_name || "-";

const getRoleLabel = (role: UserProfile["role"]) => (role === "admin" ? "管理员" : "学院");

const getSummary = (profile: UserProfile, batches: CollegeProcessedBatch[]): CollegeSummary => {
  if (profile.role !== "college" || !profile.college_name) {
    return {
      collegeName: "学校管理员",
      lastSubmittedAt: "",
      submitted: false,
    };
  }

  const collegeBatches = batches.filter((item) => isSameSubmissionCollege(item.collegeName, profile.college_name || ""));
  return {
    collegeName: profile.college_name,
    lastSubmittedAt: collegeBatches.map((item) => item.createdAt).sort().at(-1) || "",
    submitted: collegeBatches.length > 0,
  };
};

const sortProfiles = (profiles: UserProfile[]) =>
  [...profiles].sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return getSubmitUnit(a).localeCompare(getSubmitUnit(b), "zh-Hans-CN");
  });

export default function AdminCollegesPage() {
  const [batches, setBatches] = useState<CollegeProcessedBatch[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>(() => getFallbackProfiles());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(
    isSupabaseConfigured ? "正在读取 Supabase 用户列表" : "Supabase 未配置，当前显示本地账号映射"
  );

  useEffect(() => {
    getMergeBatches().then(setBatches);
  }, []);

  useEffect(() => {
    let active = true;

    void listUserProfiles()
      .then((rows) => {
        if (!active) return;
        setProfiles(rows.length > 0 ? rows : getFallbackProfiles());
        setMessage(isSupabaseConfigured ? "已读取 user_profiles 用户列表" : "Supabase 未配置，当前显示本地账号映射");
      })
      .catch((error) => {
        if (!active) return;
        setProfiles(getFallbackProfiles());
        setMessage(`读取 user_profiles 失败，当前显示本地账号映射：${error instanceof Error ? error.message : "未知错误"}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(
    () =>
      sortProfiles(profiles).map((profile) => ({
        profile,
        summary: getSummary(profile, batches),
        loginEmail: resolveLoginEmail(profile),
      })),
    [batches, profiles]
  );

  const recentLogs = useMemo(
    () => [...batches].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [batches]
  );

  return (
    <section style={styles.card}>
      <h1 style={styles.title}>学院账号与提交情况</h1>
      <p style={styles.description}>
        学院治理通过后上载到学校端。此处展示 Supabase user_profiles 中的账号权限、提交单位和最近提交状态，不展示敏感凭据。
      </p>
      <div style={loading ? styles.infoStatus : styles.status}>{message}</div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>提交单位</th>
              <th style={styles.th}>登录账号</th>
              <th style={styles.th}>角色</th>
              <th style={styles.th}>是否启用</th>
              <th style={styles.th}>最近提交时间</th>
              <th style={styles.th}>提交状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ profile, summary, loginEmail }) => (
              <tr key={`${profile.role}_${getSubmitUnit(profile)}_${loginEmail}`}>
                <td style={styles.nameCell}>{getSubmitUnit(profile)}</td>
                <td style={styles.td}>{loginEmail || "-"}</td>
                <td style={styles.td}>{getRoleLabel(profile.role)}</td>
                <td style={styles.td}>{profile.enabled ? "是" : "否"}</td>
                <td style={styles.td}>{summary.lastSubmittedAt ? new Date(summary.lastSubmittedAt).toLocaleString() : "-"}</td>
                <td style={styles.td}>
                  <span style={summary.submitted ? styles.submitted : styles.pending}>
                    {profile.role === "admin" ? "-" : summary.submitted ? "已提交" : "未提交"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section style={styles.section}>
        <h2 style={styles.subTitle}>最近上载日志</h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>提交单位</th>
                <th style={styles.th}>上载时间</th>
                <th style={styles.th}>上载类型</th>
                <th style={styles.th}>行数</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr><td style={styles.empty} colSpan={4}>暂无上载日志</td></tr>
              ) : (
                recentLogs.map((item) => (
                  <tr key={item.id}>
                    <td style={styles.nameCell}>{normalizeSubmissionCollegeName(item.collegeName)}</td>
                    <td style={styles.td}>{new Date(item.createdAt).toLocaleString()}</td>
                    <td style={styles.td}>{item.dataType === "student" ? "本专科信息" : "家庭成员信息"}</td>
                    <td style={styles.td}>{item.rowCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: "#fff",
    borderRadius: 8,
    padding: 20,
    border: "1px solid #d7e1ed",
    boxShadow: "0 4px 14px rgba(15,35,64,0.05)",
  },
  title: {
    margin: "0 0 8px 0",
    color: "#172033",
    fontSize: 24,
  },
  description: {
    color: "#63738a",
    fontSize: 13,
    margin: "0 0 12px 0",
    lineHeight: 1.7,
  },
  status: {
    border: "1px solid #d7e1ed",
    borderRadius: 6,
    padding: "9px 10px",
    color: "#52647b",
    background: "#f8fbfe",
    fontSize: 13,
    marginBottom: 12,
  },
  infoStatus: {
    border: "1px solid #bcd9f5",
    borderRadius: 6,
    padding: "9px 10px",
    color: "#0879c5",
    background: "#f3f9ff",
    fontSize: 13,
    marginBottom: 12,
  },
  section: {
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid #e3ebf3",
  },
  subTitle: {
    margin: "0 0 10px",
    color: "#172033",
    fontSize: 17,
  },
  tableWrap: {
    overflow: "auto",
    border: "1px solid #d7e1ed",
    borderRadius: 6,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    border: "1px solid #cbd5e1",
    background: "#edf4fa",
    padding: 8,
    whiteSpace: "nowrap",
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: 8,
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  nameCell: {
    border: "1px solid #cbd5e1",
    padding: 8,
    color: "#26364e",
    whiteSpace: "nowrap",
  },
  submitted: {
    display: "inline-flex",
    padding: "3px 7px",
    borderRadius: 999,
    background: "#e8f7f1",
    color: "#087b5b",
    fontWeight: 700,
    fontSize: 12,
  },
  pending: {
    display: "inline-flex",
    padding: "3px 7px",
    borderRadius: 999,
    background: "#f2f5f8",
    color: "#728197",
    fontWeight: 700,
    fontSize: 12,
  },
  empty: {
    padding: 18,
    color: "#8190a4",
    textAlign: "center",
  },
};
