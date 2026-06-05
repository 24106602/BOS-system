import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import AdminLayout from "./layouts/AdminLayout";
import CollegeLayout from "./layouts/CollegeLayout";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AdminHomePage from "./pages/admin/AdminHomePage";
import AdminDifficultyOverviewPage from "./pages/admin/AdminDifficultyOverviewPage";
import AdminCollegesPage from "./pages/admin/AdminCollegesPage";
import AdminStudentsPage from "./pages/admin/AdminStudentsPage";
import AdminSummaryPage from "./pages/admin/AdminSummaryPage";
import AdminStudentSummaryPage from "./pages/admin/AdminStudentSummaryPage";
import AdminFamilySummaryPage from "./pages/admin/AdminFamilySummaryPage";
import AdminAwardsOverviewPage from "./pages/admin/awards/AdminAwardsOverviewPage";
import AdminNationalScholarshipPage from "./pages/admin/awards/AdminNationalScholarshipPage";
import AdminNationalInspirationalPage from "./pages/admin/awards/AdminNationalInspirationalPage";
import AdminShanghaiScholarshipPage from "./pages/admin/awards/AdminShanghaiScholarshipPage";
import CollegeHomePage from "./pages/college/CollegeHomePage";
import CollegeDifficultyPage from "./pages/college/CollegeDifficultyPage";
import CollegeUploadPage from "./pages/college/CollegeUploadPage";
import CollegeRecordsPage from "./pages/college/CollegeRecordsPage";
import NationalScholarshipPage from "./pages/awards/NationalScholarshipPage";
import NationalInspirationalPage from "./pages/awards/NationalInspirationalPage";
import ShanghaiScholarshipPage from "./pages/awards/ShanghaiScholarshipPage";
import ProtectedRoute, { RootRedirect } from "./components/ProtectedRoute";
import {
  getCurrentSessionProfile,
  signOut,
  subscribeAuthProfile,
} from "./services/authService";
import type { AuthUserContext, UserProfile } from "./types/auth";

const normalizePath = (path: string) => {
  const known = [
    "/",
    "/login",
    "/reset-password",
    "/admin",
    "/admin/difficulty",
    "/admin/colleges",
    "/admin/students",
    "/admin/summary",
    "/admin/student-summary",
    "/admin/family-summary",
    "/admin/awards",
    "/admin/awards/national",
    "/admin/awards/inspirational",
    "/admin/awards/shanghai",
    "/college",
    "/college/difficulty",
    "/college/difficulty/student",
    "/college/difficulty/family",
    "/college/upload",
    "/college/records",
    "/college/awards/national",
    "/college/awards/inspirational",
    "/college/awards/shanghai",
  ];
  return known.includes(path) ? path : "/login";
};

const readPath = () => normalizePath(window.location.pathname || "/login");

const initialAuthState: AuthUserContext = {
  profile: null,
  loading: true,
  error: "",
};

export default function PlatformApp() {
  const [authState, setAuthState] = useState<AuthUserContext>(initialAuthState);
  const [path, setPath] = useState(readPath);

  const navigate = useCallback((to: string, replace = false) => {
    const next = normalizePath(to);
    if (window.location.pathname !== next) {
      if (replace) window.history.replaceState({}, "", next);
      else window.history.pushState({}, "", next);
    }
    setPath(next);
  }, []);

  useEffect(() => {
    const onPop = () => setPath(readPath());
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

  const content = useMemo<ReactNode>(() => {
    if (path === "/") {
      return <RootRedirect profile={authState.profile} loading={authState.loading} onNavigate={navigate} />;
    }

    if (path === "/login") {
      return (
        <LoginPage
          currentProfile={authState.profile}
          initialError={authState.error}
          onLogin={handleLogin}
        />
      );
    }

    if (path === "/reset-password") {
      return <ResetPasswordPage onComplete={handlePasswordResetComplete} />;
    }

    if (path.startsWith("/admin")) {
      const page =
        path === "/admin/colleges" ? (
          <AdminCollegesPage />
        ) : path === "/admin/difficulty" ? (
          <AdminDifficultyOverviewPage onNavigate={navigate} />
        ) : path === "/admin/student-summary" ? (
          <AdminStudentSummaryPage />
        ) : path === "/admin/family-summary" ? (
          <AdminFamilySummaryPage />
        ) : path === "/admin/awards" ? (
          <AdminAwardsOverviewPage />
        ) : path === "/admin/awards/national" ? (
          <AdminNationalScholarshipPage />
        ) : path === "/admin/awards/inspirational" ? (
          <AdminNationalInspirationalPage />
        ) : path === "/admin/awards/shanghai" ? (
          <AdminShanghaiScholarshipPage />
        ) : path === "/admin/students" ? (
          <AdminStudentsPage />
        ) : path === "/admin/summary" ? (
          <AdminSummaryPage />
        ) : (
          <AdminHomePage onNavigate={navigate} />
        );

      return (
        <ProtectedRoute
          requiredRole="admin"
          profile={authState.profile}
          loading={authState.loading}
          path={path}
          onNavigate={navigate}
        >
          <AdminLayout path={path} profile={authState.profile!} onNavigate={navigate} onLogout={logout}>
            {page}
          </AdminLayout>
        </ProtectedRoute>
      );
    }

    const page =
      path === "/college/upload" ? (
        <CollegeUploadPage panel="student" onNavigate={navigate} />
      ) : path === "/college/difficulty/student" ? (
        <CollegeUploadPage panel="student" onNavigate={navigate} />
      ) : path === "/college/difficulty/family" ? (
        <CollegeUploadPage panel="family" onNavigate={navigate} />
      ) : path === "/college/difficulty" ? (
        <CollegeDifficultyPage profile={authState.profile!} onNavigate={navigate} />
      ) : path === "/college/records" ? (
        <CollegeRecordsPage />
      ) : path === "/college/awards/national" ? (
        <NationalScholarshipPage />
      ) : path === "/college/awards/inspirational" ? (
        <NationalInspirationalPage />
      ) : path === "/college/awards/shanghai" ? (
        <ShanghaiScholarshipPage />
      ) : (
        <CollegeHomePage onNavigate={navigate} />
      );

    return (
      <ProtectedRoute
        requiredRole="college"
        profile={authState.profile}
        loading={authState.loading}
        path={path}
        onNavigate={navigate}
      >
        <CollegeLayout path={path} profile={authState.profile!} onNavigate={navigate} onLogout={logout}>
          {page}
        </CollegeLayout>
      </ProtectedRoute>
    );
  }, [authState.error, authState.loading, authState.profile, handleLogin, handlePasswordResetComplete, logout, navigate, path]);

  return <>{content}</>;
}
