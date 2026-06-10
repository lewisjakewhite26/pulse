"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AccountSetup from "./AccountSetup";
import PinLock from "./PinLock";
import { hasAccount, isOnboarded, isUnlocked } from "../../lib/storage";

const Pulse = dynamic(() => import("../../claude-design/pulse-full.jsx"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100vh",
        background: "#F8F9FA",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        color: "#414754",
      }}
    >
      Loading Pulse…
    </div>
  ),
});

export default function PulseApp() {
  const [ready, setReady] = useState(false);
  const [accountExists, setAccountExists] = useState(false);
  const [unlocked, setUnlockedState] = useState(false);
  const [onboarded, setOnboardedState] = useState(false);

  useEffect(() => {
    setAccountExists(hasAccount());
    setUnlockedState(isUnlocked());
    setOnboardedState(isOnboarded());
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F8F9FA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#414754",
        }}
      >
        Loading Pulse…
      </div>
    );
  }

  if (!onboarded) {
    return <Pulse />;
  }

  if (!accountExists) {
    return (
      <AccountSetup
        hasExistingProfile
        existingProfileName=""
        onComplete={() => {
          setAccountExists(true);
          setUnlockedState(true);
        }}
      />
    );
  }

  if (!unlocked) {
    return <PinLock onUnlock={() => setUnlockedState(true)} />;
  }

  return <Pulse />;
}
