"use client";

import { useEffect, useRef, useState } from "react";
import {
  AUTH_THEME,
  AuthErrorBanner,
  AuthHeading,
  AuthShell,
  AuthStyles,
  GlassCard,
  StepProgressPills,
  labelLtStyle,
} from "./AuthShell";

const C = AUTH_THEME;

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (completed: string) => void;
  disabled?: boolean;
  shake?: boolean;
  hasError?: boolean;
}

export function PinInput({
  value,
  onChange,
  onComplete,
  disabled,
  shake,
  hasError,
}: PinInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const commit = (next: string) => {
    const cleaned = next.replace(/\D/g, "").slice(0, 4);
    onChange(cleaned);
    if (cleaned.length === 4) onComplete?.(cleaned);
  };

  useEffect(() => {
    const idx = Math.min(value.length, 3);
    refs.current[idx]?.focus();
    setFocusedIndex(idx);
  }, []);

  useEffect(() => {
    if (value.length === 0) {
      refs.current[0]?.focus();
      setFocusedIndex(0);
    }
  }, [value]);

  const handleChange = (index: number, raw: string) => {
    if (disabled) return;

    if (raw.length > 1) {
      commit(raw);
      const len = raw.replace(/\D/g, "").slice(0, 4).length;
      const focusIdx = Math.min(3, Math.max(0, len - 1));
      refs.current[focusIdx]?.focus();
      setFocusedIndex(focusIdx);
      return;
    }

    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) {
      const next = value.slice(0, index) + value.slice(index + 1);
      commit(next);
      return;
    }

    const next = (value.slice(0, index) + digit + value.slice(index + 1)).slice(0, 4);
    commit(next);

    if (next.length < 4) {
      refs.current[next.length]?.focus();
      setFocusedIndex(next.length);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "Backspace") {
      if (value[index]) {
        const next = value.slice(0, index) + value.slice(index + 1);
        onChange(next);
        return;
      }
      if (index > 0) {
        e.preventDefault();
        const next = value.slice(0, index - 1) + value.slice(index);
        onChange(next);
        refs.current[index - 1]?.focus();
        setFocusedIndex(index - 1);
      }
    }

    if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
    }
    if (e.key === "ArrowRight" && index < 3) {
      refs.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }
  };

  const boxStyle = (index: number): React.CSSProperties => {
    const filled = index < value.length;
    if (hasError || shake) {
      return {
        background: "rgba(220,38,38,0.06)",
        border: `1.5px solid ${C.error}`,
      };
    }
    if (filled) {
      return {
        background: "rgba(238,79,79,0.08)",
        border: `1.5px solid ${C.primary}`,
      };
    }
    return {
      background: "rgba(255,255,255,0.7)",
      border: `1.5px solid ${C.outline}`,
    };
  };

  return (
    <div
      className={shake ? "pin-input-shake" : undefined}
      style={{ display: "flex", gap: 12, justifyContent: "center" }}
      role="group"
      aria-label="4-digit PIN"
    >
      {[0, 1, 2, 3].map((index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={index === 0 ? 4 : 1}
          disabled={disabled}
          value={value[index] ?? ""}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={() => setFocusedIndex(index)}
          aria-label={`Digit ${index + 1} of 4`}
          className="pin-digit-input"
          style={{
            width: 52,
            height: 64,
            borderRadius: 12,
            fontSize: 24,
            fontWeight: 800,
            textAlign: "center",
            color: C.onSurface,
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            outline: "none",
            caretColor: C.primary,
            padding: 0,
            transition: "border-color 0.15s ease, background 0.15s ease",
            ...boxStyle(index),
            ...(focusedIndex === index && !hasError && !shake
              ? { boxShadow: `0 0 0 3px ${C.primary}18` }
              : {}),
          }}
        />
      ))}
    </div>
  );
}

interface PinSetupScreenProps {
  pinStep: 1 | 2;
  title: string;
  subtitle?: string;
  cardLabel: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onComplete?: (completed: string) => void;
  onBack?: () => void;
}

export function PinSetupScreen({
  pinStep,
  title,
  subtitle,
  cardLabel,
  value,
  error,
  onChange,
  onComplete,
  onBack,
}: PinSetupScreenProps) {
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!error) return;
    setShake(true);
    const timer = window.setTimeout(() => setShake(false), 500);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <AuthShell onBack={onBack}>
      <StepProgressPills step={pinStep} />
      <AuthHeading title={title} subtitle={subtitle} />
      <GlassCard>
        <div style={labelLtStyle}>{cardLabel}</div>
        <PinInput
          value={value}
          onChange={onChange}
          onComplete={onComplete}
          shake={shake}
          hasError={Boolean(error)}
        />
        {error && <AuthErrorBanner message={error} />}
      </GlassCard>
    </AuthShell>
  );
}

interface PinLockScreenProps {
  displayName: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onComplete?: (completed: string) => void;
  onForgot: () => void;
}

export function PinLockScreen({
  displayName,
  value,
  error,
  onChange,
  onComplete,
  onForgot,
}: PinLockScreenProps) {
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!error) return;
    setShake(true);
    const timer = window.setTimeout(() => setShake(false), 500);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <AuthShell>
      <AuthHeading
        title={`Welcome back, ${displayName}`}
        subtitle="Enter your PIN to continue"
      />
      <GlassCard>
        <div style={labelLtStyle}>Your PIN</div>
        <PinInput
          value={value}
          onChange={onChange}
          onComplete={onComplete}
          shake={shake}
          hasError={Boolean(error)}
        />
        {error && <AuthErrorBanner message={error} />}
        <button
          type="button"
          onClick={onForgot}
          style={{
            marginTop: 20,
            background: "none",
            border: "none",
            color: C.onSurfaceVariant,
            fontSize: 12,
            lineHeight: 1.5,
            cursor: "pointer",
            fontFamily: "inherit",
            width: "100%",
            textAlign: "center",
            padding: 0,
          }}
        >
          Forgot your PIN? This will delete all your data.
        </button>
      </GlassCard>
    </AuthShell>
  );
}

export { AUTH_THEME as PIN_THEME };
