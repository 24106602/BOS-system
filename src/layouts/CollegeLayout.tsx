import type { ReactNode } from "react";
import type { UserProfile } from "../types/auth";
import { getCollegeAccountLabel } from "../services/routeGuard";

type CollegeLayoutProps = {
  path: string;
  profile: UserProfile;
  onNavigate: (to: string) => void;
  onLogout: () => void;
  children: ReactNode;
};

const difficultyMenus = [
  { path: "/college/difficulty", label: "业务首页", mark: "首" },
  { path: "/college/difficulty/student", label: "本专科信息处理", mark: "本" },
  { path: "/college/difficulty/family", label: "家庭成员信息处理", mark: "家" },
  { path: "/college/difficulty/students", label: "困难生明细", mark: "明" },
  { path: "/college/records", label: "提交记录", mark: "记" },
];

const awardMenus = [
  { path: "/college/awards/national", label: "国家奖学金数据处理", mark: "国" },
  { path: "/college/awards/inspirational", label: "国家励志奖学金数据处理", mark: "励" },
  { path: "/college/awards/shanghai", label: "上海市奖学金数据处理", mark: "沪" },
];

const englishLabels: Record<string, string> = {
  "/college": "Platform Home",
  "/college/difficulty": "Difficulty Overview",
  "/college/difficulty/student": "Student Information",
  "/college/difficulty/family": "Family Information",
  "/college/difficulty/students": "Student Records",
  "/college/records": "Submission Records",
  "/college/awards/national": "National Scholarship",
  "/college/awards/inspirational": "Inspirational Scholarship",
  "/college/awards/shanghai": "Shanghai Scholarship",
};

const workspacePaths = new Set([
  "/college/upload",
  "/college/difficulty/student",
  "/college/difficulty/family",
  "/college/difficulty/students",
]);

function MenuButton({
  item,
  active,
  onClick,
}: {
  item: { path: string; label: string; mark: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`bos-nav-item${active ? " is-active" : ""}`} onClick={onClick}>
      <span className="bos-nav-mark">{item.mark}</span>
      <span className="bos-nav-copy">
        <strong>{item.label}</strong>
        <small>{englishLabels[item.path]}</small>
      </span>
    </button>
  );
}

export default function CollegeLayout({ path, profile, onNavigate, onLogout, children }: CollegeLayoutProps) {
  const account = getCollegeAccountLabel(profile);

  return (
    <div className="bos-app-frame">
      <aside className="bos-sidebar-modern">
        <div className="bos-sidebar-brand">
          <span className="bos-sidebar-logo">BOS</span>
          <span>
            <strong>学部（院）业务工作台</strong>
            <small>Student Affairs Platform</small>
          </span>
        </div>

        <div className="bos-sidebar-role">
          <span className="bos-role-dot" />
          <span>
            <strong>学部（院）端</strong>
            <small>{account}</small>
          </span>
        </div>

        <nav className="bos-sidebar-nav">
          <div className="bos-nav-group">
            <div className="bos-nav-group-title">平台导航 / PLATFORM</div>
            <MenuButton
              item={{ path: "/college", label: "平台首页", mark: "首" }}
              active={path === "/college"}
              onClick={() => onNavigate("/college")}
            />
          </div>

          <div className="bos-nav-group">
            <div className="bos-nav-group-title">困难生业务 / DIFFICULTY</div>
            {difficultyMenus.map((item) => (
              <MenuButton key={item.path} item={item} active={path === item.path || (path === "/college/upload" && item.path === "/college/difficulty/student")} onClick={() => onNavigate(item.path)} />
            ))}
          </div>

          <div className="bos-nav-group">
            <div className="bos-nav-group-title">三大奖业务 / AWARDS</div>
            {awardMenus.map((item) => (
              <MenuButton key={item.path} item={item} active={path === item.path} onClick={() => onNavigate(item.path)} />
            ))}
          </div>
        </nav>

        <div className="bos-sidebar-foot">
          <span className="bos-sidebar-health"><i /> 数据治理服务正常</span>
          <button onClick={onLogout}>退出当前角色</button>
        </div>
      </aside>

      <div className="bos-shell-workspace">
        <header className="bos-topbar-modern">
          <div className="bos-topbar-search">
            <span>⌕</span>
            <input aria-label="搜索系统内容" placeholder="搜索菜单、学生或业务..." />
          </div>
          <div className="bos-topbar-account">
            <span className="bos-account-avatar">院</span>
            <span className="bos-account-copy">
              <strong>{profile.display_name || "学部（院）经办人"}</strong>
              <small>{account}</small>
            </span>
            <button onClick={onLogout}>退出登录</button>
          </div>
        </header>
        <main className={`bos-page-main${workspacePaths.has(path) ? " bos-page-main--workspace" : ""}`}>{children}</main>
      </div>
    </div>
  );
}
