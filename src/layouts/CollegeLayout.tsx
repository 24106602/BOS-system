import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";
import type { UserProfile } from "../types/auth";
import type { TabItem } from "../types/tab";
import { getCollegeAccountLabel } from "../services/routeGuard";

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
    { path: "/college/difficulty/students", label: "困难生明细", mark: "明" },
    { path: "/college/records", label: "提交记录", mark: "记" },
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

const englishLabels: Record<string, string> = {
  "/college": "Platform Home",
  "/college/difficulty": "Difficulty Overview",
  "/college/difficulty/student": "Student Information",
  "/college/difficulty/family": "Family Information",
  "/college/difficulty/students": "Student Records",
  "/college/records": "Submission Records",
  "/college/awards": "Awards Home",
  "/college/awards/national": "National Scholarship",
  "/college/awards/inspirational": "Inspirational Scholarship",
  "/college/awards/shanghai": "Shanghai Scholarship",
};

const workspacePaths = new Set([
  "/college/upload",
  "/college/difficulty",
  "/college/difficulty/student",
  "/college/difficulty/family",
  "/college/difficulty/students",
  "/college/records",
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
    <motion.button
      className={`bos-nav-item${active ? " is-active" : ""}`}
      onClick={onClick}
      whileHover={{ backgroundColor: "rgba(64, 97, 135, 0.28)" }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
    >
      <span className="bos-nav-mark">{item.mark}</span>
      <span className="bos-nav-copy">
        <strong>{item.label}</strong>
        <small>{englishLabels[item.path]}</small>
      </span>
    </motion.button>
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
  const [isOpen, setIsOpen] = useState(group.defaultOpen ?? false);
  const isActive = group.items.some(
    (item) =>
      currentPath === item.path ||
      (currentPath === "/college/upload" && item.path === "/college/difficulty/student")
  );

  const handleTitleClick = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="bos-nav-group">
      <motion.button
        className={`bos-nav-group-title-btn${isOpen ? " is-open" : ""}`}
        onClick={handleTitleClick}
        whileHover={{ backgroundColor: "rgba(64, 97, 135, 0.15)" }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15 }}
      >
        <span className="bos-nav-group-icon">{group.icon}</span>
        <span className="bos-nav-group-label">{group.title}</span>
        <motion.span
          className="bos-nav-group-arrow"
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          →
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
            className="bos-nav-group-content"
          >
            {group.items.map((item) => (
              <motion.div
                key={item.path}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15, delay: group.items.indexOf(item) * 0.03 }}
              >
                <MenuButton
                  item={item}
                  active={currentPath === item.path || (currentPath === "/college/upload" && item.path === "/college/difficulty/student")}
                  onClick={() => {
                    onNavigate(item.path);
                  }}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabBar({ tabs, activeTabId, onActivateTab, onRemoveTab }: { tabs: TabItem[]; activeTabId: string; onActivateTab: (tabId: string) => void; onRemoveTab: (tabId: string) => void }) {
  if (tabs.length === 0) return null;

  return (
    <div className="bos-tab-bar">
      <div className="bos-tab-bar-scroll">
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => (
            <motion.div
              key={tab.id}
              initial={{ opacity: 0, y: -10, width: 0 }}
              animate={{ opacity: 1, y: 0, width: "auto" }}
              exit={{ opacity: 0, x: -20, width: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className={`bos-tab-item${activeTabId === tab.id ? " is-active" : ""}`}
            >
              <motion.button
                onClick={() => onActivateTab(tab.id)}
                className="bos-tab-button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.1 }}
              >
                {tab.icon && <span className="bos-tab-icon">{tab.icon}</span>}
                <span className="bos-tab-label">{tab.title}</span>
              </motion.button>
              {tabs.length > 1 && (
                <motion.button
                  onClick={() => onRemoveTab(tab.id)}
                  className="bos-tab-close"
                  whileHover={{ scale: 1.1, opacity: 1 }}
                  whileTap={{ scale: 0.9 }}
                  initial={{ opacity: 0.5 }}
                >
                  ×
                </motion.button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function CollegeLayout({ path, profile, onNavigate, onLogout, children, activeTabId, tabs, onActivateTab, onRemoveTab }: CollegeLayoutProps) {
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
          <span className="bos-sidebar-health"><i /> 数据治理服务正常</span>
          <button onClick={onLogout}>退出当前角色</button>
        </div>
      </aside>

      <div className="bos-shell-workspace">
        <header className="bos-topbar-modern">
          <div className="bos-topbar-context">
            <span>学院业务工作台</span>
            <strong>{pageTitles[path] || "业务管理"}</strong>
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

        <TabBar tabs={tabs} activeTabId={activeTabId} onActivateTab={onActivateTab} onRemoveTab={onRemoveTab} />

        <main className={`bos-page-main${workspacePaths.has(path) ? " bos-page-main--workspace" : ""}`}>
          <div className="bos-page-content">{children}</div>
        </main>
      </div>
    </div>
  );
}