import { useEffect, type CSSProperties, type ReactNode } from "react";
import type { UserProfile, UserRole } from "../types/auth";
import { getProtectedRedirect } from "../services/routeGuard";

type RootRedirectProps = {
  profile: UserProfile | null;
  loading: boolean;
  onNavigate: (to: string, replace?: boolean) => void;
};

type ProtectedRouteProps = {
  requiredRole: UserRole;
  profile: UserProfile | null;
  loading: boolean;
  path: string;
  onNavigate: (to: string, replace?: boolean) => void;
  children: ReactNode;
};

export function RootRedirect({ profile, loading, onNavigate }: RootRedirectProps) {
  const target = loading ? "" : profile?.role === "admin" ? "/admin" : profile?.role === "college" ? "/college" : "/login";

  useEffect(() => {
    if (!target) return;
    onNavigate(target, true);
  }, [onNavigate, target]);

  return <div style={styles.message}>{loading ? "正在读取登录状态..." : "正在进入系统..."}</div>;
}

export default function ProtectedRoute({
  requiredRole,
  profile,
  loading,
  path,
  onNavigate,
  children,
}: ProtectedRouteProps) {
  const redirectTo = loading ? "" : getProtectedRedirect(profile, requiredRole);

  useEffect(() => {
    if (!redirectTo) return;
    if (redirectTo === path) return;
    const currentPath = window.location.pathname;
    if (currentPath.startsWith("/admin") && requiredRole === "admin") return;
    if (currentPath.startsWith("/college") && requiredRole === "college") return;
    onNavigate(redirectTo, true);
  }, [onNavigate, path, redirectTo, requiredRole]);

  if (loading) return <div style={styles.message}>正在读取登录状态...</div>;
  if (!profile) return <div style={styles.message}>未登录，正在跳转到登录页...</div>;
  if (profile.role !== requiredRole) return <div style={styles.message}>无权限访问</div>;
  return <>{children}</>;
}

const styles: Record<string, CSSProperties> = {
  message: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    color: "#52647b",
    background: "#eef3f8",
    fontSize: 15,
  },
};
