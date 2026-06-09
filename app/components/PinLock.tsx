"use client";

import { useState } from "react";
import { clearAllData, setUnlocked, verifyPin } from "../../lib/storage";

const C = {
  primary: "#1A73E8",
  background: "#F8F9FA",
  surface: "#FFFFFF",
  onSurface: "#191C1D",
  onSurfaceVariant: "#414754",
  outlineVariant: "#C1C6D6",
  error: "#BA1A1A",
  secondary: "#34A853",
};

interface PinLockProps {
  onUnlock: () => void;
}

export default function PinLock({ onUnlock }: PinLockProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [forgotStep, setForgotStep] = useState(0);

  const appendDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) {
      if (verifyPin(next)) {
        setUnlocked(true);
        onUnlock();
      } else {
        setError("Incorrect PIN. Try again.");
        setPin("");
      }
    }
  };

  const backspace = () => {
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  const handleForgot = () => {
    if (forgotStep === 1) {
      setForgotStep(2);
      return;
    }
    clearAllData();
    window.location.reload();
  };

  if (forgotStep > 0) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.background,
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          color: C.onSurface,
          maxWidth: 480,
          margin: "0 auto",
          padding: "48px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: C.primary,
            letterSpacing: "-0.03em",
            marginBottom: 32,
          }}
        >
          Pulse
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            marginBottom: 12,
            letterSpacing: "-0.02em",
          }}
        >
          {forgotStep === 1 ? "Delete all data?" : "Are you sure?"}
        </div>
        <p
          style={{
            fontSize: 14,
            color: C.onSurfaceVariant,
            lineHeight: 1.7,
            marginBottom: 32,
            maxWidth: 320,
          }}
        >
          {forgotStep === 1
            ? "This will delete all your Pulse data. You cannot undo this."
            : "This will delete all your Pulse data. Are you sure?"}
        </p>
        <button
          type="button"
          onClick={handleForgot}
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "14px 0",
            borderRadius: 999,
            background: C.error,
            color: "#fff",
            border: "none",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 12,
          }}
        >
          {forgotStep === 1 ? "Yes, delete everything" : "Yes, I am sure"}
        </button>
        <button
          type="button"
          onClick={() => setForgotStep(0)}
          style={{
            background: "none",
            border: "none",
            color: C.onSurfaceVariant,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');`}</style>
      </div>
    );
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.background,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: C.onSurface,
        maxWidth: 480,
        margin: "0 auto",
        padding: "48px 24px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontSize: 52,
          fontWeight: 800,
          color: C.primary,
          letterSpacing: "-0.03em",
          marginBottom: 8,
        }}
      >
        Pulse
      </div>
      <div
        style={{
          fontSize: 14,
          color: C.onSurfaceVariant,
          marginBottom: 40,
        }}
      >
        Enter your PIN
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: i < pin.length ? C.primary : C.outlineVariant,
              transition: "background 0.15s",
            }}
          />
        ))}
      </div>

      {error && (
        <div
          style={{
            fontSize: 13,
            color: C.error,
            marginBottom: 16,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          width: "100%",
          maxWidth: 280,
          marginTop: 8,
        }}
      >
        {digits.map((d, i) => {
          if (d === "") return <div key={i} />;
          if (d === "back") {
            return (
              <button
                key={i}
                type="button"
                onClick={backspace}
                style={padStyle}
                aria-label="Backspace"
              >
                ⌫
              </button>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => appendDigit(d)}
              style={padStyle}
            >
              {d}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setForgotStep(1)}
        style={{
          marginTop: 40,
          background: "none",
          border: "none",
          color: C.onSurfaceVariant,
          fontSize: 13,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        Forgot PIN?
      </button>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');`}</style>
    </div>
  );
}

const padStyle: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1",
  maxHeight: 72,
  borderRadius: 16,
  border: `1.5px solid ${C.outlineVariant}`,
  background: C.surface,
  fontSize: 28,
  fontWeight: 700,
  color: C.onSurface,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0px 4px 16px rgba(0,0,0,0.04)",
};
