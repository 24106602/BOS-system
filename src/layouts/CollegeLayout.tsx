import { useState } from "react";
import type { ReactNode } from "react";
import type { UserProfile } from "../types/auth";
import type { TabItem } from "../types/tab";

type CollegeLayoutProps = {
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

const difficultyMenuGroup: ExpandableMenuGroup = {
  title: "困难生业务",
  icon: "困",
  items: [
    { path: "/college/difficulty", label: "业务首页", mark: "首" },
    { path: "/college/difficulty/student", label: "本专科信息处理", mark: "本" },
    { path: "/college/difficulty/family", label: "家庭成员信息处理", mark: "家" },
  ],
  defaultOpen: true,
};

const awardMenuGroup: ExpandableMenuGroup = {
  title: "三大奖业务",
  icon: "奖",
  items: [
    { path: "/college/awards", label: "三奖业务首页", mark: "奖" },
    { path: "/college/awards/national", label: "国家奖学金数据处理", mark: "国" },
    { path: "/college/awards/inspirational", label: "国家励志奖学金数据处理", mark: "励" },
    { path: "/college/awards/shanghai", label: "上海市奖学金数据处理", mark: "沪" },
  ],
};

const workspacePaths = new Set([
  "/college/upload",
  "/college/difficulty",
  "/college/difficulty/student",
  "/college/difficulty/family",
  "/college/awards",
  "/college/awards/national",
  "/college/awards/inspirational",
  "/college/awards/shanghai",
]);

const pageTitles: Record<string, string> = {
  "/college": "平台首页",
  "/college/upload": "本专科信息处理",
  ...Object.fromEntries([...difficultyMenuGroup.items, ...awardMenuGroup.items].map((item) => [item.path, item.label])),
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
  const storageKey = `menu_${group.title}_open`;
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return saved === "true";
    } catch {}
    return group.defaultOpen ?? false;
  });
  const isActive = group.items.some(
    (item) =>
      currentPath === item.path ||
      (currentPath === "/college/upload" && item.path === "/college/difficulty/student")
  );

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
                active={currentPath === item.path || (currentPath === "/college/upload" && item.path === "/college/difficulty/student")}
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

export default function CollegeLayout({ path, profile, onNavigate, onLogout, children, activeTabId, tabs, onActivateTab, onRemoveTab }: CollegeLayoutProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("college_sidebar_collapsed") === "true";
    } catch { return false; }
  });

  return (
    <div className={`bos-app-frame${collapsed ? " is-collapsed" : ""}`}>
      <aside className="bos-sidebar-modern">
        <div className="bos-sidebar-brand">
          <span className="bos-sidebar-logo">BOS</span>
          <span>
            <strong>业务工作台</strong>
          </span>
        </div>

        <div className="bos-sidebar-role">
          <span className="bos-role-dot" />
          <span>
            <strong>学院端</strong>
          </span>
        </div>

        <nav className="bos-sidebar-nav">
          <div className="bos-nav-group">
            <div className="bos-nav-group-title">平台导航</div>
            <MenuButton
              item={{ path: "/college", label: "平台首页", mark: "首" }}
              active={path === "/college"}
              onClick={() => onNavigate("/college")}
            />
          </div>

          <ExpandableMenu
            group={difficultyMenuGroup}
            currentPath={path}
            onNavigate={onNavigate}
          />

          <ExpandableMenu
            group={awardMenuGroup}
            currentPath={path}
            onNavigate={onNavigate}
          />
        </nav>

        <div className="bos-sidebar-foot">
          <button
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              try { localStorage.setItem("college_sidebar_collapsed", String(next)); } catch {}
            }}
            className="bos-sidebar-toggle"
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {collapsed ? "▶" : "◀"}
          </button>
          <span className="bos-sidebar-health"><i /> 数据治理服务正常</span>
          <button onClick={onLogout}>退出当前角色</button>
        </div>
      </aside>

      <div className="bos-shell-workspace">
        <header className="bos-topbar-modern">
          <div className="bos-topbar-context">
            <strong>{pageTitles[path] || "业务管理"}</strong>
          </div>
          <div className="bos-topbar-account">
            <span className="bos-account-avatar">院</span>
            <span className="bos-account-copy">
              <strong>{profile.display_name || "经办人"}</strong>
            </span>
            <button onClick={onLogout}>退出登录</button>
          </div>
        </header>

        <TabBar tabs={tabs} activeTabId={activeTabId} onActivateTab={onActivateTab} onRemoveTab={onRemoveTab} />

        <main className={`bos-page-main${workspacePaths.has(path) ? " bos-page-main--workspace" : ""}`}>
          <div className="bos-page-content">{children}</div>
        </main>
      </div>
      <style>{`
        .bos-sidebar-toggle {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--border-default, #E2E8F0);
          border-radius: var(--radius-md, 8px);
          color: var(--text-secondary, #64748B);
          background: var(--bg-card, #FFFFFF);
          font-size: 12px;
          cursor: pointer;
          transition: all var(--transition-fast, 150ms ease);
        }
        .bos-sidebar-toggle:hover {
          background: var(--color-gray-50, #F8FAFC);
          color: var(--text-primary, #0F172A);
        }
      `}</style>
    </div>
  );
}
