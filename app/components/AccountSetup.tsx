"use client";

import { useState } from "react";
import { createAccount } from "../../lib/storage";

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

interface AccountSetupProps {
  onComplete: () => void;
  hasExistingProfile?: boolean;
  existingProfileName?: string;
}

export default function AccountSetup({
  onComplete,
  hasExistingProfile = false,
  existingProfileName = "",
}: AccountSetupProps) {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState(existingProfileName);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const handleCreate = () => {
    if (pin !== confirmPin) {
      setError("PINs do not match. Try again.");
      setConfirmPin("");
      return;
    }
    if (createAccount(username, pin)) {
      onComplete();
    } else {
      setError("Could not create account. Check your details.");
    }
  };

  const pinDots = (value: string) => (
    <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 8 }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: i < value.length ? C.primary : C.outlineVariant,
          }}
        />
      ))}
    </div>
  );

  const digitPad = (
    value: string,
    setValue: (v: string) => void,
    onFull?: () => void
  ) => {
    const append = (d: string) => {
      if (value.length >= 4) return;
      const next = value + d;
      setValue(next);
      setError("");
      if (next.length === 4 && onFull) onFull();
    };
    const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          maxWidth: 260,
          margin: "0 auto",
        }}
      >
        {digits.map((d, i) => {
          if (d === "") return <div key={i} />;
          if (d === "back") {
            return (
              <button
                key={i}
                type="button"
                onClick={() => setValue(value.slice(0, -1))}
                style={padBtn}
              >
                ⌫
              </button>
            );
          }
          return (
            <button key={i} type="button" onClick={() => append(d)} style={padBtn}>
              {d}
            </button>
          );
        })}
      </div>
    );
  };

  const shell: React.CSSProperties = {
    minHeight: "100vh",
    background: C.background,
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    color: C.onSurface,
    maxWidth: 480,
    margin: "0 auto",
    padding: "48px 24px",
    display: "flex",
    flexDirection: "column",
  };

  if (step === 0) {
    return (
      <div style={shell}>
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: C.primary,
            letterSpacing: "-0.03em",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          Pulse
        </div>
        <div
          style={{
            fontSize: 14,
            color: C.onSurfaceVariant,
            textAlign: "center",
            marginBottom: 40,
            lineHeight: 1.6,
          }}
        >
          Set up your on-device account. Everything stays on this device.
        </div>
        {hasExistingProfile && (
          <div
            style={{
              padding: "14px 16px",
              marginBottom: 24,
              borderRadius: 12,
              background: `${C.primary}08`,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: `1px solid ${C.primary}20`,
              borderLeft: `4px solid ${C.primary}`,
              fontSize: 14,
              lineHeight: 1.6,
              color: C.onSurface,
            }}
          >
            Welcome back. We&apos;ve added a PIN lock since your last visit. Set a PIN to continue. Your existing data is safe.
          </div>
        )}
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em" }}>
          What should we call you?
        </div>
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, marginBottom: 20 }}>
          This appears in your dashboard greeting.
        </div>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. Lewis"
          onKeyDown={(e) => e.key === "Enter" && username.trim() && setStep(1)}
          style={{
            width: "100%",
            padding: "16px 18px",
            borderRadius: 14,
            border: `2px solid ${username ? C.primary : C.outlineVariant}`,
            background: C.surface,
            fontSize: 16,
            fontFamily: "inherit",
            outline: "none",
            marginBottom: "auto",
          }}
        />
        <button
          type="button"
          disabled={!username.trim()}
          onClick={() => setStep(1)}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 999,
            background: !username.trim() ? C.outlineVariant : C.primary,
            color: "#fff",
            border: "none",
            fontSize: 14,
            fontWeight: 700,
            cursor: !username.trim() ? "not-allowed" : "pointer",
            marginTop: 24,
          }}
        >
          Continue
        </button>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');`}</style>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div style={shell}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em", textAlign: "center" }}>
          Choose a 4-digit PIN
        </div>
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, marginBottom: 24, textAlign: "center" }}>
          You will need this once per browser session.
        </div>
        {pinDots(pin)}
        {digitPad(pin, setPin, () => setStep(2))}
        <button
          type="button"
          onClick={() => { setStep(0); setPin(""); }}
          style={{
            marginTop: 32,
            background: "none",
            border: "none",
            color: C.onSurfaceVariant,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Back
        </button>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');`}</style>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em", textAlign: "center" }}>
        Confirm your PIN
      </div>
      <div style={{ fontSize: 13, color: C.onSurfaceVariant, marginBottom: 24, textAlign: "center" }}>
        Enter the same PIN again.
      </div>
      {error && (
        <div style={{ fontSize: 13, color: C.error, textAlign: "center", marginBottom: 12, fontWeight: 600 }}>
          {error}
        </div>
      )}
      {pinDots(confirmPin)}
      {digitPad(confirmPin, setConfirmPin, handleCreate)}
      <button
        type="button"
        onClick={() => { setStep(1); setConfirmPin(""); setError(""); }}
        style={{
          marginTop: 32,
          background: "none",
          border: "none",
          color: C.onSurfaceVariant,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Back
      </button>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');`}</style>
    </div>
  );
}

const padBtn: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1",
  maxHeight: 64,
  borderRadius: 14,
  border: `1.5px solid ${C.outlineVariant}`,
  background: C.surface,
  fontSize: 24,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
