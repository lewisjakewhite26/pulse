"use client";

import { useState } from "react";
import { clearAllData, getAccount, getProfile, setUnlocked, verifyPin } from "../../lib/storage";
import { AuthShell, AUTH_THEME, glassCardStyle, primaryButtonStyle } from "./AuthShell";
import { PinLockScreen } from "./PinPad";

const C = AUTH_THEME;

interface PinLockProps {
  onUnlock: () => void;
}

export default function PinLock({ onUnlock }: PinLockProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [forgotStep, setForgotStep] = useState(0);

  const account = getAccount();
  const profile = getProfile();
  const displayName = account?.username || profile?.name || "there";

  const handleComplete = (entered: string) => {
    if (verifyPin(entered)) {
      setUnlocked(true);
      onUnlock();
      return;
    }
    setError("Incorrect PIN");
    setPin("");
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
      <AuthShell onBack={() => setForgotStep(0)}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginBottom: 8,
            }}
          >
            {forgotStep === 1 ? "Delete all data?" : "Are you sure?"}
          </div>
          <div style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.5 }}>
            {forgotStep === 1
              ? "This will delete all your Pulse data. You cannot undo this."
              : "This will delete all your Pulse data. Are you sure?"}
          </div>
        </div>
        <div style={glassCardStyle}>
          <button
            type="button"
            onClick={handleForgot}
            style={{
              ...primaryButtonStyle,
              background: C.error,
              boxShadow: `0 6px 20px ${C.error}28`,
              marginBottom: 12,
            }}
          >
            {forgotStep === 1 ? "Yes, delete everything" : "Yes, I am sure"}
          </button>
          <button
            type="button"
            onClick={() => setForgotStep(0)}
            style={{
              width: "100%",
              background: "none",
              border: "none",
              color: C.onSurfaceVariant,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "8px 0",
            }}
          >
            Cancel
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <PinLockScreen
      displayName={displayName}
      value={pin}
      error={error}
      onChange={(next) => {
        setPin(next);
        if (error) setError("");
      }}
      onComplete={handleComplete}
      onForgot={() => setForgotStep(1)}
    />
  );
}
