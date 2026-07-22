import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  type?: ToastType;
  duration?: number;
  description?: string;
}

export interface ToastItem {
  id: string;
  message: string;
  description?: string;
  type: ToastType;
  duration: number;
  dismissing: boolean;
}

interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => string;
  success: (message: string, description?: string) => string;
  error: (message: string, description?: string) => string;
  warning: (message: string, description?: string) => string;
  info: (message: string, description?: string) => string;
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                    */
/* -------------------------------------------------------------------------- */

const ToastContext = createContext<ToastContextValue | null>(null);

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 3000;
const GAP = 12; // px between toasts

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `bos-toast-${idCounter}`;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Icon helpers (inline SVG, zero dependencies)                               */
/* -------------------------------------------------------------------------- */

function ToastIcon({ type }: { type: ToastType }) {
  switch (type) {
    case "success":
      return (
        <span
          className="bos-toast__icon bos-toast__icon--success"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      );
    case "error":
      return (
        <span
          className="bos-toast__icon bos-toast__icon--error"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
      );
    case "warning":
      return (
        <span
          className="bos-toast__icon bos-toast__icon--warning"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
      );
    case "info":
      return (
        <span
          className="bos-toast__icon bos-toast__icon--info"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </span>
      );
  }
}

/* -------------------------------------------------------------------------- */
/*  Single Toast card                                                          */
/* -------------------------------------------------------------------------- */

interface ToastCardProps {
  item: ToastItem;
  onClose: (id: string) => void;
}

function ToastCard({ item, onClose }: ToastCardProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (item.duration > 0) {
      timerRef.current = setTimeout(() => {
        onClose(item.id);
      }, item.duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [item.id, item.duration, onClose]);

  const handleClose = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onClose(item.id);
  }, [item.id, onClose]);

  return (
    <div
      className={`bos-toast bos-toast--${item.type}${item.dismissing ? " bos-toast--dismissing" : ""}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="bos-toast__icon-wrapper">
        <ToastIcon type={item.type} />
      </span>

      <div className="bos-toast__body">
        <p className="bos-toast__message">{item.message}</p>
        {item.description && (
          <p className="bos-toast__description">{item.description}</p>
        )}
      </div>

      <button
        type="button"
        className="bos-toast__close"
        onClick={handleClose}
        aria-label="Close notification"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Container (rendered inside a portal)                                      */
/* -------------------------------------------------------------------------- */

interface ToastContainerProps {
  toasts: ToastItem[];
  onClose: (id: string) => void;
}

function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="bos-toast__container" aria-label="Notifications">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onClose={onClose} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Portal wrapper                                                             */
/* -------------------------------------------------------------------------- */

function ToastPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}

/* -------------------------------------------------------------------------- */
/*  Reducer                                                                    */
/* -------------------------------------------------------------------------- */

type Action =
  | { type: "ADD"; payload: ToastItem }
  | { type: "DISMISS"; payload: string }
  | { type: "REMOVE"; payload: string };

function toastReducer(state: ToastItem[], action: Action): ToastItem[] {
  switch (action.type) {
    case "ADD": {
      const updated = [...state, action.payload];
      while (updated.length > MAX_VISIBLE) {
        updated.shift();
      }
      return updated;
    }
    case "DISMISS": {
      return state.map((t) =>
        t.id === action.payload ? { ...t, dismissing: true } : t
      );
    }
    case "REMOVE": {
      return state.filter((t) => t.id !== action.payload);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                   */
/* -------------------------------------------------------------------------- */

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, dispatch] = useReducer(toastReducer, []);

  const handleClose = useCallback((id: string) => {
    dispatch({ type: "DISMISS", payload: id });
    setTimeout(() => {
      dispatch({ type: "REMOVE", payload: id });
    }, 350);
  }, []);

  const addToast = useCallback(
    (message: string, options?: ToastOptions): string => {
      const id = nextId();
      const item: ToastItem = {
        id,
        message,
        type: options?.type ?? "info",
        duration: options?.duration ?? DEFAULT_DURATION,
        description: options?.description,
        dismissing: false,
      };
      dispatch({ type: "ADD", payload: item });
      return id;
    },
    []
  );

  const api = useMemo<ToastContextValue>(
    () => ({
      toast: addToast,
      success: (message: string, description?: string) =>
        addToast(message, { type: "success", description }),
      error: (message: string, description?: string) =>
        addToast(message, { type: "error", description }),
      warning: (message: string, description?: string) =>
        addToast(message, { type: "warning", description }),
      info: (message: string, description?: string) =>
        addToast(message, { type: "info", description }),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastPortal>
        <ToastContainer toasts={toasts} onClose={handleClose} />
      </ToastPortal>
    </ToastContext.Provider>
  );
}

export default ToastProvider;

/* -------------------------------------------------------------------------- */
/*  Styles (auto-injected once into <head>)                                   */
/* -------------------------------------------------------------------------- */

const STYLE_ID = "bos-toast-styles";

function injectStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;

  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
/* ------------------------------------------------------------------ */
/*  BOS Toast — aligned with design-tokens.css                        */
/* ------------------------------------------------------------------ */

.bos-toast__container {
  position: fixed;
  top: var(--space-4, 16px);
  right: var(--space-4, 16px);
  z-index: var(--z-toast, 1100);
  display: flex;
  flex-direction: column;
  gap: ${GAP}px;
  pointer-events: none;
  max-width: calc(100vw - 32px);
  width: 380px;
}

/* ---- Card ---- */

.bos-toast {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3, 12px);
  padding: 14px var(--space-4, 16px);
  border-radius: var(--radius-md, 8px);
  background-color: var(--bg-card, #ffffff);
  border: 1px solid var(--border-default, #e2e8f0);
  box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04));
  pointer-events: auto;
  animation: bos-toast-slide-in 0.35s cubic-bezier(0.21, 1.02, 0.73, 1) forwards;
  opacity: 0;
  transform: translateX(100%);
  font-family: var(--font-family, "PingFang SC", "Microsoft YaHei", "SF Pro Text", system-ui, sans-serif);
}

.bos-toast--dismissing {
  animation: bos-toast-fade-out 0.3s ease-in forwards;
}

/* ---- Color accents ---- */

.bos-toast--success {
  border-left: 4px solid var(--color-success, #16A34A);
}

.bos-toast--error {
  border-left: 4px solid var(--color-danger, #DC2626);
}

.bos-toast--warning {
  border-left: 4px solid var(--color-warning, #D97706);
}

.bos-toast--info {
  border-left: 4px solid var(--color-info, #0891B2);
}

/* ---- Icon wrapper ---- */

.bos-toast__icon-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full, 9999px);
}

.bos-toast__icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.bos-toast__icon--success {
  color: var(--color-success, #16A34A);
  background-color: #F0FDF4;
}

.bos-toast__icon--error {
  color: var(--color-danger, #DC2626);
  background-color: #FEF2F2;
}

.bos-toast__icon--warning {
  color: var(--color-warning, #D97706);
  background-color: #FFFBEB;
}

.bos-toast__icon--info {
  color: var(--color-info, #0891B2);
  background-color: #ECFEFF;
}

/* ---- Body ---- */

.bos-toast__body {
  flex: 1;
  min-width: 0;
}

.bos-toast__message {
  margin: 0;
  font-size: var(--text-sm, 14px);
  font-weight: var(--font-medium, 500);
  line-height: var(--leading-normal, 1.5);
  color: var(--text-primary, #0F172A);
  word-break: break-word;
}

.bos-toast__description {
  margin: 4px 0 0;
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-normal, 400);
  line-height: var(--leading-normal, 1.5);
  color: var(--text-secondary, #64748B);
  word-break: break-word;
}

/* ---- Close button ---- */

.bos-toast__close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--color-gray-400, #94A3B8);
  cursor: pointer;
  transition: background-color var(--transition-fast, 150ms ease),
              color var(--transition-fast, 150ms ease);
}

.bos-toast__close:hover {
  background-color: var(--color-gray-100, #F1F5F9);
  color: var(--color-gray-600, #475569);
}

.bos-toast__close:focus-visible {
  outline: 2px solid var(--color-primary, #2563EB);
  outline-offset: 1px;
}

/* ---- Keyframes ---- */

@keyframes bos-toast-slide-in {
  0% {
    opacity: 0;
    transform: translateX(100%);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes bos-toast-fade-out {
  0% {
    opacity: 1;
    transform: translateX(0);
  }
  100% {
    opacity: 0;
    transform: translateX(40%);
  }
}
`;
  document.head.appendChild(el);
}

/* Inject styles once when the module is evaluated */
injectStyles();
