"use client";

import { useState } from "react";
import CoachChat from "./CoachChat";

interface FloatingCoachButtonProps {
  currentTab: string;
  onOpenLog: () => void;
  hasLoggedToday: boolean;
  unreadCount: number;
  onCoachReply?: () => void;
}

export default function FloatingCoachButton({
  currentTab,
  onOpenLog,
  hasLoggedToday,
  unreadCount,
  onCoachReply,
}: FloatingCoachButtonProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (currentTab === "log") return null;

  const showAmber = !hasLoggedToday;
  const showGreen = unreadCount > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Talk to coach"
        className={showAmber ? "fab-pulse-amber" : showGreen ? "" : "fab-pulse-idle"}
        style={{
          position: "fixed",
          bottom: "calc(84px + env(safe-area-inset-bottom))",
          right: "max(16px, calc(50% - 240px + 16px))",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "#1A73E8",
          border: "none",
          boxShadow: "0 4px 20px rgba(26,115,232,0.35)",
          cursor: "pointer",
          zIndex: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: "#fff" }}>chat</span>
        {(showGreen || showAmber) && (
          <span style={{
            position: "absolute", top: 4, right: 4, width: 10, height: 10, borderRadius: "50%",
            background: showAmber ? "#FBBC05" : "#34A853", border: "2px solid #fff",
          }} />
        )}
      </button>

      {sheetOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setSheetOpen(false)} style={{ flex: 1, background: "rgba(0,0,0,0.35)" }} />
          <div style={{
            background: "#F8F9FA", borderRadius: "20px 20px 0 0", padding: "16px 20px calc(16px + env(safe-area-inset-bottom))",
            maxWidth: 480, width: "100%", margin: "0 auto", maxHeight: "70vh", boxShadow: "0 -8px 32px rgba(0,0,0,0.12)",
          }}>
            <div style={{ width: 40, height: 4, background: "#DADCE0", borderRadius: 2, margin: "0 auto 16px" }} />
            <CoachChat compact onExpand={() => { setSheetOpen(false); onOpenLog(); }} onMessageSent={onCoachReply} />
          </div>
        </div>
      )}
    </>
  );
}
