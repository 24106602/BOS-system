import { useCallback, useEffect, useState, type ReactNode } from "react";
import AdminLayout from "./layouts/AdminLayout";
import CollegeLayout from "./layouts/CollegeLayout";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AdminHomePage from "./pages/admin/AdminHomePage";
import AdminAccountManagePage from "./pages/admin/AdminAccountManagePage";
import AdminBaseInfoPage from "./pages/admin/AdminBaseInfoPage";
import AdminCollegesPage from "./pages/admin/AdminCollegesPage";
import AdminDepartmentsPage from "./pages/admin/AdminDepartmentsPage";
import AdminDifficultyPage from "./pages/admin/AdminDifficultyPage";
import EnrolledStudentDatabasePage from "./pages/EnrolledStudentDatabasePage";

import AdminAwardsOverviewPage from "./pages/admin/awards/AdminAwardsOverviewPage";
import AdminNationalScholarshipPage from "./pages/admin/awards/AdminNationalScholarshipPage";
import AdminNationalInspirationalPage from "./pages/admin/awards/AdminNationalInspirationalPage";
import AdminShanghaiScholarshipPage from "./pages/admin/awards/AdminShanghaiScholarshipPage";
import CollegeHomePage from "./pages/college/CollegeHomePage";
import CollegeDifficultyPage from "./pages/college/CollegeDifficultyPage";
import CollegeDifficultyStudentsPage from "./pages/college/CollegeDifficultyStudentsPage";
import CollegeUploadPage from "./pages/college/CollegeUploadPage";
import CollegeRecordsPage from "./pages/college/CollegeRecordsPage";
import AwardsHomePage from "./pages/awards/AwardsHomePage";
import NationalScholarshipPage from "./pages/awards/NationalScholarshipPage";
import NationalInspirationalPage from "./pages/awards/NationalInspirationalPage";
import ShanghaiScholarshipPage from "./pages/awards/ShanghaiScholarshipPage";
import ProtectedRoute, { RootRedirect } from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import {
  getCurrentSessionProfile,
  signOut,
  subscribeAuthProfile,
} from "./services/authService";
import type { AuthUserContext, UserProfile } from "./types/auth";
import { TabProvider, useTabs } from "./contexts/TabContext";

const normalizePath = (path: string) => {
  const known = [
    "/",
    "/login",
    "/reset-password",
    "/admin",
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
    "/college",
    "/college/difficulty",
    "/college/difficulty/student",
    "/college/difficulty/family",
    "/college/difficulty/students",
    "/college/upload",
    "/college/records",
    "/college/awards",
    "/college/awards/national",
    "/college/awards/inspirational",
    "/college/awards/shanghai",
  ];
  return known.includes(path) ? path : "/login";
};

const readPath = () => normalizePath(window.location.pathname || "/login");

const pageTitles: Record<string, string> = {
  "/admin": "管理员首页",
  "/admin/base-info": "学校基础信息",
  "/admin/departments": "院系基础信息",
  "/admin/accounts": "学校账号维护",
  "/admin/colleges": "院系账号维护",
  "/admin/awards": "三奖提交总览",
  "/admin/awards/national": "国家奖学金汇总",
  "/admin/awards/inspirational": "国家励志奖学金汇总",
  "/admin/awards/shanghai": "上海市奖学金汇总",
  "/admin/difficulty": "困难生业务",
  "/admin/difficulty/database": "困难生数据库",
  "/admin/difficulty/enrolled": "在校生数据库",
  "/college": "平台首页",
  "/college/difficulty": "困难生业务",
  "/college/difficulty/student": "本专科信息处理",
  "/college/difficulty/family": "家庭成员信息处理",
  "/college/difficulty/students": "困难生明细",
  "/college/upload": "本专科信息处理",
  "/college/records": "提交记录",
  "/college/awards": "三奖业务首页",
  "/college/awards/national": "国家奖学金数据处理",
  "/college/awards/inspirational": "国家励志奖学金数据处理",
  "/college/awards/shanghai": "上海市奖学金数据处理",
};

const pageIcons: Record<string, string> = {
  "/admin": "首",
  "/admin/base-info": "校",
  "/admin/departments": "院",
  "/admin/accounts": "校",
  "/admin/colleges": "院",
  "/admin/awards": "览",
  "/admin/awards/national": "国",
  "/admin/awards/inspirational": "励",
  "/admin/awards/shanghai": "沪",
  "/admin/difficulty": "困",
  "/admin/difficulty/database": "库",
  "/admin/difficulty/enrolled": "在",
  "/college": "首",
  "/college/difficulty": "困",
  "/college/difficulty/student": "本",
  "/college/difficulty/family": "家",
  "/college/difficulty/students": "明",
  "/college/upload": "本",
  "/college/records": "记",
  "/college/awards": "奖",
  "/college/awards/national": "国",
  "/college/awards/inspirational": "励",
  "/college/awards/shanghai": "沪",
};

const initialAuthState: AuthUserContext = {
  profile: null,
  loading: true,
  error: "",
};

function AppContent() {
  const [authState, setAuthState] = useState<AuthUserContext>(initialAuthState);
  const [currentPath, setCurrentPath] = useState(readPath);
  const { tabs, activeTabId, addTab, activateTab, removeTab } = useTabs();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const path = activeTab?.path || currentPath;

  const navigate = useCallback((to: string, replace = false) => {
    const next = normalizePath(to);
    const title = pageTitles[next] || "业务管理";
    const icon = pageIcons[next] || "";

    addTab({ path: next, title, icon });

    if (window.location.pathname !== next) {
      if (replace) window.history.replaceState({}, "", next);
      else window.history.pushState({}, "", next);
    }
    setCurrentPath(next);
  }, [addTab]);

  useEffect(() => {
    const onPop = () => setCurrentPath(readPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let active = true;

    void getCurrentSessionProfile()
      .then((profile) => {
        if (active) setAuthState({ profile, loading: false, error: "" });
      })
      .catch((error) => {
        if (!active) return;
        setAuthState({
          profile: null,
          loading: false,
          error: error instanceof Error ? error.message : "读取登录状态失败",
        });
      });

    const unsubscribe = subscribeAuthProfile((profile, error, event) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthState({ profile: null, loading: false, error: "" });
        navigate("/reset-password", true);
        return;
      }
      setAuthState({ profile, loading: false, error: error || "" });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [navigate]);

  const handleLogin = useCallback(
    (profile: UserProfile, nextPath: string) => {
      setAuthState({ profile, loading: false, error: "" });
      navigate(nextPath);
    },
    [navigate]
  );

  const logout = useCallback(async () => {
    try {
      await signOut();
    } finally {
      setAuthState({ profile: null, loading: false, error: "" });
      navigate("/login", true);
    }
  }, [navigate]);

  const handlePasswordResetComplete = useCallback(() => {
    setAuthState({ profile: null, loading: false, error: "" });
    navigate("/login", true);
  }, [navigate]);

  const renderPage = (pagePath: string): ReactNode => {
    if (pagePath === "/") {
      return <RootRedirect profile={authState.profile} loading={authState.loading} onNavigate={navigate} />;
    }

    if (pagePath === "/login") {
      return (
        <LoginPage
          currentProfile={authState.profile}
          initialError={authState.error}
          onLogin={handleLogin}
        />
      );
    }

    if (pagePath === "/reset-password") {
      return <ResetPasswordPage onComplete={handlePasswordResetComplete} />;
    }

    if (pagePath.startsWith("/admin")) {
      const page =
        pagePath === "/admin" ? (
          <AdminHomePage onNavigate={navigate} />
        ) : pagePath === "/admin/base-info" ? (
          <AdminBaseInfoPage />
        ) : pagePath === "/admin/departments" ? (
          <AdminDepartmentsPage />
        ) : pagePath === "/admin/accounts" ? (
          <AdminAccountManagePage />
        ) : pagePath === "/admin/colleges" ? (
          <AdminCollegesPage />
        ) : pagePath === "/admin/awards" ? (
          <AdminAwardsOverviewPage />
        ) : pagePath === "/admin/awards/national" ? (
          <AdminNationalScholarshipPage />
        ) : pagePath === "/admin/awards/inspirational" ? (
          <AdminNationalInspirationalPage />
        ) : pagePath === "/admin/awards/shanghai" ? (
          <AdminShanghaiScholarshipPage />
        ) : pagePath === "/admin/difficulty" ? (
          <AdminDifficultyPage onNavigate={navigate} />
        ) : pagePath === "/admin/difficulty/database" ? (
          <DatabasePage />
        ) : pagePath === "/admin/difficulty/enrolled" ? (
          <EnrolledStudentDatabasePage />
        ) : (
          <AdminHomePage onNavigate={navigate} />
        );

      return (
        <ProtectedRoute
          requiredRole="admin"
          profile={authState.profile}
          loading={authState.loading}
          path={pagePath}
          onNavigate={navigate}
        >
          <AdminLayout
            path={pagePath}
            profile={authState.profile!}
            onNavigate={navigate}
            onLogout={logout}
            activeTabId={activeTabId}
            tabs={tabs}
            onActivateTab={activateTab}
            onRemoveTab={removeTab}
          >
            {page}
          </AdminLayout>
        </ProtectedRoute>
      );
    }

    const page =
      pagePath === "/college/upload" ? (
        <CollegeUploadPage panel="student" onNavigate={navigate} />
      ) : pagePath === "/college/difficulty/student" ? (
        <CollegeUploadPage panel="student" onNavigate={navigate} />
      ) : pagePath === "/college/difficulty/family" ? (
        <CollegeUploadPage panel="family" onNavigate={navigate} />
      ) : pagePath === "/college/difficulty/students" ? (
        <CollegeDifficultyStudentsPage profile={authState.profile!} />
      ) : pagePath === "/college/difficulty" ? (
        <CollegeDifficultyPage profile={authState.profile!} onNavigate={navigate} />
      ) : pagePath === "/college/records" ? (
        <CollegeRecordsPage />
      ) : pagePath === "/college/awards" ? (
        <AwardsHomePage onNavigate={navigate} />
      ) : pagePath === "/college/awards/national" ? (
        <NationalScholarshipPage onNavigate={navigate} />
      ) : pagePath === "/college/awards/inspirational" ? (
        <NationalInspirationalPage onNavigate={navigate} />
      ) : pagePath === "/college/awards/shanghai" ? (
        <ShanghaiScholarshipPage onNavigate={navigate} />
      ) : (
        <CollegeHomePage onNavigate={navigate} />
      );

    return (
      <ProtectedRoute
        requiredRole="college"
        profile={authState.profile}
        loading={authState.loading}
        path={pagePath}
        onNavigate={navigate}
      >
        <CollegeLayout
          path={pagePath}
          profile={authState.profile!}
          onNavigate={navigate}
          onLogout={logout}
          activeTabId={activeTabId}
          tabs={tabs}
          onActivateTab={activateTab}
          onRemoveTab={removeTab}
        >
          {page}
        </CollegeLayout>
      </ProtectedRoute>
    );
  };

  return (
    <div className="bos-tab-container">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`bos-tab-content${activeTabId === tab.id ? " is-active" : ""}`}
        >
          {activeTabId === tab.id && (
            <ErrorBoundary onNavigate={navigate}>
              {renderPage(tab.path)}
            </ErrorBoundary>
          )}
        </div>
      ))}
    </div>
  );
}

export default function PlatformApp() {
  const [path] = useState(readPath);
  const initialTitle = pageTitles[path] || "业务管理";
  const initialIcon = pageIcons[path] || "";

  return (
    <TabProvider initialPath={path} initialTitle={initialTitle}>
      <AppContent />
    </TabProvider>
  );
}