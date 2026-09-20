import React, { useEffect, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Callback invoked when the modal requests to close */
  onClose: () => void;
  /** Text rendered in the modal header */
  title: string;
  /** Content rendered inside the scrollable body area */
  children: ReactNode;
  /** Optional footer content (buttons, links, etc.) */
  footer?: ReactNode;
  /** Modal width variant */
  size?: 'sm' | 'md' | 'lg';
  /** Close the modal when clicking the overlay / backdrop */
  closeOnOverlay?: boolean;
  /** Close the modal when pressing the Escape key */
  closeOnEsc?: boolean;
  /** Additional class name appended to the modal wrapper */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Size map                                                           */
/* ------------------------------------------------------------------ */

const SIZE_WIDTHS: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'min(480px, 90vw)',
  md: 'min(720px, 90vw)',
  lg: 'min(1120px, 94vw)',
};

/* ------------------------------------------------------------------ */
/*  Styles (injected once via a <style> tag in the portal)             */
/* ------------------------------------------------------------------ */

const MODAL_STYLE_ID = 'bos-modal-ui-style';

function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(MODAL_STYLE_ID)) return;

  const sheet = document.createElement('style');
  sheet.id = MODAL_STYLE_ID;
  sheet.textContent = `
    /* ---------- Backdrop ---------- */
    .bos-modal-ui-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
      animation: bos-modal-ui-fade-in 200ms ease-out both;
    }

    .bos-modal-ui-backleave {
      animation: bos-modal-ui-fade-out 150ms ease-in both;
    }

    /* ---------- Card ---------- */
    .bos-modal-ui-card {
      position: relative;
      display: flex;
      flex-direction: column;
      width: var(--bos-modal-ui-width, min(720px, 90vw));
      max-height: 85vh;
      background: #fff;
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-xl, 0 20px 60px rgba(0, 0, 0, 0.15));
      animation: bos-modal-ui-scale-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    /* ---------- Header ---------- */
    .bos-modal-ui-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      padding: 16px 24px;
      border-bottom: 1px solid var(--color-border, #e5e7eb);
    }

    .bos-modal-ui-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.5;
      color: var(--color-text-primary, #1f2937);
    }

    .bos-modal-ui-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: var(--radius-md, 8px);
      background: transparent;
      color: var(--color-text-secondary, #6b7280);
      cursor: pointer;
      transition: background 120ms, color 120ms;
      font-size: 18px;
      line-height: 1;
    }

    .bos-modal-ui-close:hover {
      background: var(--color-bg-hover, #f3f4f6);
      color: var(--color-text-primary, #1f2937);
    }

    /* ---------- Body ---------- */
    .bos-modal-ui-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      color: var(--color-text-primary, #1f2937);
      font-size: 14px;
      line-height: 1.6;
    }

    /* ---------- Footer ---------- */
    .bos-modal-ui-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      flex-shrink: 0;
      padding: 12px 24px;
      border-top: 1px solid var(--color-border, #e5e7eb);
    }

    /* ---------- Keyframes ---------- */
    @keyframes bos-modal-ui-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    @keyframes bos-modal-ui-fade-out {
      from { opacity: 1; }
      to   { opacity: 0; }
    }

    @keyframes bos-modal-ui-scale-in {
      from { opacity: 0; transform: scale(0.95) translateY(8px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
  `;

  document.head.appendChild(sheet);
}

/* ------------------------------------------------------------------ */
/*  X icon (inline SVG — zero dependencies)                            */
/* ------------------------------------------------------------------ */

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal component                                                    */
/* ------------------------------------------------------------------ */

function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
  closeOnEsc = true,
  className,
}: ModalProps): React.ReactPortal | null {
  const cardRef = useRef<HTMLDivElement>(null);

  /* ---- inject styles once on mount ---- */
  useEffect(() => {
    injectStyles();
  }, []);

  /* ---- ESC key handler ---- */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [closeOnEsc, onClose],
  );

  useEffect(() => {
    if (!open) return;

    document.addEventListener('keydown', handleKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, handleKeyDown]);

  /* ---- Overlay click handler ---- */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (closeOnOverlay && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnOverlay, onClose],
  );

  /* ---- Stop click propagation on the card ---- */
  const handleCardClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  /* ---- Render nothing when closed ---- */
  if (!open) return null;

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  const widthVar = SIZE_WIDTHS[size];

  return createPortal(
    <div
      className="bos-modal-ui-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={cardRef}
        className={`bos-modal-ui-card${className ? ` ${className}` : ''}`}
        style={{ '--bos-modal-ui-width': widthVar } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={handleCardClick}
      >
        {/* Header */}
        <div className="bos-modal-ui-header">
          <h2 className="bos-modal-ui-title">{title}</h2>
          <button
            type="button"
            className="bos-modal-ui-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="bos-modal-ui-body">{children}</div>

        {/* Footer (optional) */}
        {footer != null && (
          <div className="bos-modal-ui-footer">{footer}</div>
        )}
      </div>
    </div>,
    portalTarget,
  );
}

export default Modal;
