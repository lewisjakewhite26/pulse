"use client";

import { useState } from "react";
import { createAccount } from "../../lib/storage";
import {
  AuthHeading,
  AuthShell,
  GlassCard,
  LegacyWelcomeCard,
  labelLtStyle,
  primaryButtonStyle,
  AUTH_THEME,
} from "./AuthShell";
import { PinSetupScreen } from "./PinPad";

const C = AUTH_THEME;

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
  // DEBUG HARDCODED — remove before shipping to others
  const [username, setUsername] = useState(existingProfileName || "Lewis");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const handleCreate = (confirmedPin: string) => {
    if (pin !== confirmedPin) {
      setError("Those PINs don't match. Try again.");
      setConfirmPin("");
      return;
    }
    if (createAccount(username, pin)) {
      onComplete();
    } else {
      setError("Could not create account. Check your details.");
      setConfirmPin("");
    }
  };

  if (step === 0) {
    return (
      <AuthShell>
        {hasExistingProfile && <LegacyWelcomeCard name={existingProfileName} />}
        <AuthHeading
          title="What should we call you?"
          subtitle="This appears in your dashboard greeting."
        />
        <GlassCard>
          <div style={labelLtStyle}>Your name</div>
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
              border: `1.5px solid ${username ? C.primary : C.outlineVariant}`,
              background: "rgba(255,255,255,0.5)",
              fontSize: 16,
              fontFamily: "inherit",
              outline: "none",
              marginBottom: 20,
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            disabled={!username.trim()}
            onClick={() => setStep(1)}
            style={{
              ...primaryButtonStyle,
              background: !username.trim() ? C.outlineVariant : C.primary,
              cursor: !username.trim() ? "not-allowed" : "pointer",
              boxShadow: username.trim() ? `0 6px 20px ${C.primary}28` : "none",
            }}
          >
            Continue
          </button>
        </GlassCard>
      </AuthShell>
    );
  }

  if (step === 1) {
    return (
      <PinSetupScreen
        pinStep={1}
        title="Set a PIN"
        subtitle="You'll enter this every time you open Pulse."
        cardLabel="Set a PIN"
        value={pin}
        onChange={(next) => {
          setPin(next);
          setError("");
        }}
        onComplete={() => setStep(2)}
        onBack={() => {
          setStep(0);
          setPin("");
          setError("");
        }}
      />
    );
  }

  return (
    <PinSetupScreen
      pinStep={2}
      title="Confirm your PIN"
      cardLabel="Confirm your PIN"
      value={confirmPin}
      error={error}
      onChange={(next) => {
        setConfirmPin(next);
        if (error) setError("");
      }}
      onComplete={handleCreate}
      onBack={() => {
        setStep(1);
        setConfirmPin("");
        setError("");
      }}
    />
  );
}
