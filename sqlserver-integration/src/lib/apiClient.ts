/**
 * API 客户端
 * 统一封装后端 API 请求，支持 JWT 认证
 * 替代直接使用 supabase client 进行认证和数据操作
 */
import type { UserProfile } from "../types/auth";

const ACCESS_TOKEN_KEY = "bos_access_token";
const REFRESH_TOKEN_KEY = "bos_refresh_token";
const TOKEN_EXPIRES_KEY = "bos_token_expires";
const PROFILE_KEY = "bos_user_profile";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";

// ---------------------------------------------------------
// Token 管理
// ---------------------------------------------------------

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string, expiresAt: number) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(TOKEN_EXPIRES_KEY, String(expiresAt));
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

export function getStoredProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredProfile(profile: UserProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearStoredProfile() {
  localStorage.removeItem(PROFILE_KEY);
}

export function isTokenExpired(): boolean {
  const expiresStr = localStorage.getItem(TOKEN_EXPIRES_KEY);
  if (!expiresStr) return true;
  const expiresAt = Number.parseInt(expiresStr, 10);
  // 提前 1 分钟过期，留出刷新时间
  return Date.now() >= expiresAt - 60 * 1000;
}

// ---------------------------------------------------------
// Token 刷新
// ---------------------------------------------------------

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        throw new Error("无刷新令牌");
      }

      const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error("刷新令牌失败");
      }

      const data = await response.json();
      setTokens(data.accessToken, refreshToken, data.expiresAt);
      return data.accessToken;
    } catch (error) {
      clearTokens();
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ---------------------------------------------------------
// 核心请求方法
// ---------------------------------------------------------

export interface ApiRequestOptions extends RequestInit {
  skipAuth?: boolean;
  skipRefresh?: boolean;
}

async function request<T = any>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { skipAuth = false, skipRefresh = false, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> || {}),
  };

  if (!skipAuth) {
    let token = getAccessToken();

    // 如果 token 过期且允许刷新
    if (token && isTokenExpired() && !skipRefresh) {
      try {
        token = await refreshAccessToken();
      } catch {
        // 刷新失败，继续使用旧 token（会返回 401）
      }
    }

    if (token) {
      finalHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  const url = path.startsWith("http") ? path : `${apiBaseUrl}${path}`;
  const response = await fetch(url, { ...rest, headers: finalHeaders });

  if (response.status === 401 && !skipRefresh && !skipAuth) {
    // 尝试刷新 token 后重试
    try {
      const newToken = await refreshAccessToken();
      finalHeaders["Authorization"] = `Bearer ${newToken}`;
      const retryResponse = await fetch(url, { ...rest, headers: finalHeaders });
      return handleResponse<T>(retryResponse);
    } catch {
      clearTokens();
      window.dispatchEvent(new CustomEvent("bos:auth-expired"));
      throw new Error("登录已过期，请重新登录");
    }
  }

  return handleResponse<T>(response);
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    let errorMessage = `请求失败 (${response.status})`;
    if (isJson) {
      try {
        const data = await response.json();
        errorMessage = data.error || data.message || errorMessage;
      } catch {
        // ignore
      }
    }
    throw new Error(errorMessage);
  }

  if (isJson) {
    return response.json() as Promise<T>;
  }

  return response.text() as unknown as T;
}

// ---------------------------------------------------------
// 导出便捷方法
// ---------------------------------------------------------

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body?: any, options?: ApiRequestOptions) =>
    request<T>(path, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: any, options?: ApiRequestOptions) =>
    request<T>(path, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: any, options?: ApiRequestOptions) =>
    request<T>(path, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),

  upload: <T>(path: string, formData: FormData, options?: ApiRequestOptions) => {
    const { headers, ...rest } = options || {};
    return request<T>(path, {
      ...rest,
      method: "POST",
      body: formData as any,
      headers: {
        // 不设置 Content-Type，让浏览器自动设置 boundary
        ...(headers as Record<string, string> || {}),
      } as any,
    });
  },
};

export default api;
