import { useEffect, useMemo, useState, type ReactNode } from "react";
import AdminLayout from "./layouts/AdminLayout";
import CollegeLayout from "./layouts/CollegeLayout";
import LoginPage from "./pages/LoginPage";
import AdminHomePage from "./pages/admin/AdminHomePage";
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
import CollegeUploadPage from "./pages/college/CollegeUploadPage";
import CollegeRecordsPage from "./pages/college/CollegeRecordsPage";
import NationalScholarshipPage from "./pages/awards/NationalScholarshipPage";
import NationalInspirationalPage from "./pages/awards/NationalInspirationalPage";
import ShanghaiScholarshipPage from "./pages/awards/ShanghaiScholarshipPage";

type Role = "admin" | "college";

const ROLE_KEY = "bos_role";

const normalizePath = (path: string) => {
  const known = [
    "/login",
    "/admin",
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
    "/college/upload",
    "/college/records",
    "/college/awards/national",
    "/college/awards/inspirational",
    "/college/awards/shanghai",
  ];
  return known.includes(path) ? path : "/login";
};

const readRole = (): Role | null => {
  const raw = localStorage.getItem(ROLE_KEY);
  return raw === "admin" || raw === "college" ? raw : null;
};

const readPath = () => normalizePath(window.location.pathname || "/login");

export default function PlatformApp() {
  const [role, setRole] = useState<Role | null>(() => readRole());
  const [path, setPath] = useState(readPath);

  const navigate = (to: string) => {
    const next = normalizePath(to);
    if (next === path) return;
    window.history.pushState({}, "", next);
    setPath(next);
  };

  useEffect(() => {
    const onPop = () => setPath(readPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!role && path !== "/login") {
      navigate("/login");
      return;
    }
    if (role === "admin" && path.startsWith("/college")) {
      navigate("/admin");
      return;
    }
    if (role === "college" && path.startsWith("/admin")) {
      navigate("/college");
    }
  }, [path, role]);

  const selectRole = (nextRole: Role) => {
    localStorage.setItem(ROLE_KEY, nextRole);
    setRole(nextRole);
    navigate(nextRole === "admin" ? "/admin" : "/college");
  };

  const logout = () => {
    localStorage.removeItem(ROLE_KEY);
    setRole(null);
    navigate("/login");
  };

  const content = useMemo<ReactNode>(() => {
    if (!role || path === "/login") {
      return <LoginPage onSelectRole={selectRole} currentRole={role} />;
    }

    if (path.startsWith("/admin")) {
      const page =
        path === "/admin/colleges" ? (
          <AdminCollegesPage />
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
          <AdminHomePage />
        );

      return (
        <AdminLayout path={path} onNavigate={navigate} onLogout={logout}>
          {page}
        </AdminLayout>
      );
    }

    const page =
      path === "/college/upload" ? (
        <CollegeUploadPage />
      ) : path === "/college/records" ? (
        <CollegeRecordsPage />
      ) : path === "/college/awards/national" ? (
        <NationalScholarshipPage />
      ) : path === "/college/awards/inspirational" ? (
        <NationalInspirationalPage />
      ) : path === "/college/awards/shanghai" ? (
        <ShanghaiScholarshipPage />
      ) : (
        <CollegeHomePage />
      );

    return (
      <CollegeLayout path={path} onNavigate={navigate} onLogout={logout}>
        {page}
      </CollegeLayout>
    );
  }, [role, path]);

  return <>{content}</>;
}
