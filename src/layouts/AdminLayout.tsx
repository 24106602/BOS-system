import { useState } from "react";
import type { ReactNode } from "react";
import type { UserProfile } from "../types/auth";
import type { TabItem } from "../types/tab";
import { getAdminAccountLabel } from "../services/routeGuard";

type AdminLayoutProps = {
  path: string;
  profile: UserProfile;
  onNavigate: (to: string) => void;
  onLogout: () => void;
  children: ReactNode;
  activeTabId: string;
  tabs: TabItem[];
  onActivateTab: (tabId: string) => void;
  onRemoveTab: (tabId: string) => void;
};

type MenuItem = {
  path: string;
  label: string;
  mark: string;
};

type ExpandableMenuGroup = {
  title: string;
  icon: string;
  items: MenuItem[];
  defaultOpen?: boolean;
};

const baseInfoMenuGroup: ExpandableMenuGroup = {
  title: "基础信息维护",
  icon: "基",
  items: [
    { path: "/admin/base-info", label: "学校基础信息", mark: "校" },
    { path: "/admin/departments", label: "院系基础信息", mark: "院" },
  ],
};

const accountMenuGroup: ExpandableMenuGroup = {
  title: "账号维护管理",
  icon: "账",
  items: [
    { path: "/admin/accounts", label: "学校账号维护", mark: "校" },
    { path: "/admin/colleges", label: "院系账号维护", mark: "院" },
  ],
};

const awardMenuGroup: ExpandableMenuGroup = {
  title: "三大奖业务",
  icon: "奖",
  items: [
    { path: "/admin/awards", label: "三奖提交总览", mark: "览" },
    { path: "/admin/awards/national", label: "国家奖学金汇总", mark: "国" },
    { path: "/admin/awards/inspirational", label: "国家励志奖学金汇总", mark: "励" },
    { path: "/admin/awards/shanghai", label: "上海市奖学金汇总", mark: "沪" },
  ],
};

const difficultyMenuGroup: ExpandableMenuGroup = {
  title: "困难生业务",
  icon: "困",
  items: [
    { path: "/admin/difficulty", label: "困难生业务首页", mark: "困" },
    { path: "/admin/difficulty/database", label: "困难生数据库", mark: "库" },
    { path: "/admin/difficulty/enrolled", label: "在校生数据库", mark: "在" },
  ],
};

const workspacePaths = new Set([
  "/admin/base-info",
  "/admin/departments",
  "/admin/accounts",
  "/admin/colleges",
  "/admin/awards",
  "/admin/awards/national",
  "/admin/awards/inspirational",
  "/admin/awards/shanghai",
  "/admin/difficulty",
  "/admin/difficulty/database",
  "/admin/difficulty/enrolled",
]);

const pageTitles: Record<string, string> = {
  "/admin": "管理员首页",
  ...Object.fromEntries([...baseInfoMenuGroup.items, ...accountMenuGroup.items, ...awardMenuGroup.items, ...difficultyMenuGroup.items].map((item) => [item.path, item.label])),
};

function MenuButton({
  item,
  active,
  onClick,
}: {
  item: MenuItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`bos-nav-item${active ? " is-active" : ""}`}
      onClick={onClick}
    >
      <span className="bos-nav-mark">{item.mark}</span>
      <span className="bos-nav-copy">
        <strong>{item.label}</strong>
      </span>
    </button>
  );
}

function ExpandableMenu({
  group,
  currentPath,
  onNavigate,
}: {
  group: ExpandableMenuGroup;
  currentPath: string;
  onNavigate: (to: string) => void;
}) {
  const storageKey = `admin_menu_${group.title}_open`;
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return saved === "true";
    } catch {}
    return group.defaultOpen ?? false;
  });

  const handleTitleClick = () => {
    const next = !isOpen;
    setIsOpen(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {}
  };

  return (
    <div className="bos-nav-group">
      <button
        className={`bos-nav-group-title-btn${isOpen ? " is-open" : ""}`}
        onClick={handleTitleClick}
      >
        <span className="bos-nav-group-icon">{group.icon}</span>
        <span className="bos-nav-group-label">{group.title}</span>
        <span className="bos-nav-group-arrow">
          →
        </span>
      </button>

      {isOpen && (
        <div className="bos-nav-group-content">
          {group.items.map((item) => (
            <div key={item.path}>
              <MenuButton
                item={item}
                active={currentPath === item.path}
                onClick={() => {
                  onNavigate(item.path);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabBar({ tabs, activeTabId, onActivateTab, onRemoveTab }: { tabs: TabItem[]; activeTabId: string; onActivateTab: (tabId: string) => void; onRemoveTab: (tabId: string) => void }) {
  if (tabs.length === 0) return null;

  return (
    <div className="bos-tab-bar">
      <div className="bos-tab-bar-scroll">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`bos-tab-item${activeTabId === tab.id ? " is-active" : ""}`}
          >
            <button
              onClick={() => onActivateTab(tab.id)}
              className="bos-tab-button"
            >
              {tab.icon && <span className="bos-tab-icon">{tab.icon}</span>}
              <span className="bos-tab-label">{tab.title}</span>
            </button>
            {tabs.length > 1 && (
              <button
                onClick={() => onRemoveTab(tab.id)}
                className="bos-tab-close"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminLayout({ path, profile, onNavigate, onLogout, children, activeTabId, tabs, onActivateTab, onRemoveTab }: AdminLayoutProps) {
  const account = getAdminAccountLabel(profile);

  return (
    <div className="bos-app-frame">
      <aside className="bos-sidebar-modern">
        <div className="bos-sidebar-brand">
          <span className="bos-sidebar-logo">BOS</span>
          <span>
            <strong>学生事务管理平台</strong>
          </span>
        </div>

        <div className="bos-sidebar-role bos-sidebar-role--admin">
          <span className="bos-role-dot" />
          <span>
            <strong>学校管理员端</strong>
          </span>
        </div>

        <nav className="bos-sidebar-nav">
          <div className="bos-nav-group">
            <div className="bos-nav-group-title">平台导航</div>
            <MenuButton item={{ path: "/admin", label: "管理员首页", mark: "首" }} active={path === "/admin"} onClick={() => onNavigate("/admin")} />
          </div>

          <ExpandableMenu
            group={baseInfoMenuGroup}
            currentPath={path}
            onNavigate={onNavigate}
          />

          <ExpandableMenu
            group={accountMenuGroup}
            currentPath={path}
            onNavigate={onNavigate}
          />

          <ExpandableMenu
            group={awardMenuGroup}
            currentPath={path}
            onNavigate={onNavigate}
          />

          <ExpandableMenu
            group={difficultyMenuGroup}
            currentPath={path}
            onNavigate={onNavigate}
          />
        </nav>

        <div className="bos-sidebar-foot">
          <span className="bos-sidebar-health"><i /> 数据治理服务正常</span>
          <button onClick={onLogout}>退出当前角色</button>
        </div>
      </aside>

      <div className="bos-shell-workspace">
        <header className="bos-topbar-modern">
          <div className="bos-topbar-context">
            <strong>{pageTitles[path] || "数据管理"}</strong>
          </div>
          <div className="bos-topbar-account">
            <span className="bos-account-avatar">管</span>
            <span className="bos-account-copy">
              <strong>{account}</strong>
            </span>
            <button onClick={onLogout}>退出登录</button>
          </div>
        </header>

        <TabBar tabs={tabs} activeTabId={activeTabId} onActivateTab={onActivateTab} onRemoveTab={onRemoveTab} />

        <main className={`bos-page-main${workspacePaths.has(path) ? " bos-page-main--workspace" : ""}`}>
          <div className="bos-page-content">{children}</div>
        </main>
      </div>
    </div>
  );
}