"use client";

import type { CSSProperties, ReactNode } from "react";

export const AUTH_THEME = {
  primary: "#1A73E8",
  background: "#F8F9FA",
  surface: "#FFFFFF",
  onSurface: "#191C1D",
  onSurfaceVariant: "#414754",
  outlineVariant: "#C1C6D6",
  error: "#BA1A1A",
  secondary: "#34A853",
  amber: "#FBBC05",
} as const;

const C = AUTH_THEME;

export const glassCardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.6)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.2)",
  boxShadow: "0px 4px 24px rgba(0,0,0,0.04)",
  borderRadius: 16,
  padding: 20,
  width: "100%",
};

export const labelLtStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: C.onSurfaceVariant,
  marginBottom: 8,
};

export const primaryButtonStyle: CSSProperties = {
  width: "100%",
  padding: "14px 0",
  borderRadius: 999,
  background: C.primary,
  color: "#fff",
  border: "none",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: `0 6px 20px ${C.primary}28`,
};

interface AuthShellProps {
  children: ReactNode;
  onBack?: () => void;
}

export function AuthShell({ children, onBack }: AuthShellProps) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: C.background,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: C.onSurface,
        maxWidth: 480,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          height: 60,
          flexShrink: 0,
          background: "rgba(255,255,255,0.6)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.2)",
          boxShadow: "0px 4px 24px rgba(0,0,0,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 20px",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: C.primary,
            letterSpacing: "-0.02em",
          }}
        >
          Pulse
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          maxWidth: 380,
          margin: "0 auto",
          padding: "32px 24px max(24px, env(safe-area-inset-bottom))",
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              color: C.primary,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              padding: "0 0 16px",
              fontFamily: "inherit",
              marginTop: -8,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              arrow_back
            </span>
            Back
          </button>
        )}
        {children}
      </main>

      <AuthStyles />
    </div>
  );
}

interface StepProgressPillsProps {
  step: 1 | 2;
}

export function StepProgressPills({ step }: StepProgressPillsProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 24,
      }}
      aria-label={`Step ${step} of 2`}
    >
      {[1, 2].map((s) => (
        <div
          key={s}
          style={{
            width: step >= s ? 24 : 8,
            height: 8,
            borderRadius: 999,
            background: step >= s ? C.primary : C.outlineVariant,
            transition: "width 0.3s ease, background 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

interface AuthHeadingProps {
  title: string;
  subtitle?: string;
}

export function AuthHeading({ title, subtitle }: AuthHeadingProps) {
  return (
    <div style={{ textAlign: "center", marginBottom: 28 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: C.onSurface,
          marginBottom: subtitle ? 8 : 0,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.5 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

export function GlassCard({ children }: { children: ReactNode }) {
  return <div style={glassCardStyle}>{children}</div>;
}

export function LegacyWelcomeCard({ name }: { name: string }) {
  const displayName = name.trim() || "there";
  return (
    <div
      style={{
        ...glassCardStyle,
        borderLeft: `4px solid ${C.amber}`,
        marginBottom: 28,
        padding: 16,
        fontSize: 14,
        lineHeight: 1.6,
        color: C.onSurface,
      }}
    >
      Welcome back, {displayName}. We&apos;ve added a PIN lock to keep your data private. Your existing data is safe. Just set a PIN to continue.
    </div>
  );
}

export function AuthErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: "10px 14px",
        borderRadius: 12,
        background: `${C.error}10`,
        border: `1px solid ${C.error}25`,
        color: C.error,
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}

export function AuthStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap');
      .material-symbols-outlined {
        font-family: 'Material Symbols Outlined';
        font-weight: normal;
        font-style: normal;
        line-height: 1;
        letter-spacing: normal;
        text-transform: none;
        display: inline-block;
        white-space: nowrap;
        font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      }
      .pin-digit-input::-ms-reveal,
      .pin-digit-input::-ms-clear {
        display: none;
      }
      @keyframes pin-shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-8px); }
        40% { transform: translateX(8px); }
        60% { transform: translateX(-6px); }
        80% { transform: translateX(6px); }
      }
      .pin-input-shake {
        animation: pin-shake 0.45s ease;
      }
    `}</style>
  );
}

// Re-export for existing imports
export const PIN_THEME = AUTH_THEME;
