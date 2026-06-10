"use client";

import { useState } from "react";
import CoachChat from "./CoachChat";
import { COLORS } from "@/lib/design-tokens";

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
  const showUnread = unreadCount > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Talk to coach"
        className={showAmber ? "fab-pulse-amber" : !showUnread ? "fab-pulse-idle" : undefined}
        style={{
          position: "fixed",
          bottom: "calc(80px + 16px + 8px + env(safe-area-inset-bottom))",
          right: "max(20px, calc(50% - 240px + 20px))",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: COLORS.primary,
          border: "none",
          boxShadow: "0px 4px 16px rgba(238, 79, 79, 0.35)",
          cursor: "pointer",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <i className="ti ti-message-circle" style={{ fontSize: 22, color: "#fff" }} />
        {showUnread && (
          <span style={{
            position: "absolute", top: 2, right: 2, width: 10, height: 10, borderRadius: "50%",
            background: COLORS.success, border: "2px solid #fff",
          }} />
        )}
      </button>

      {sheetOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setSheetOpen(false)} style={{ flex: 1, background: "rgba(26,29,36,0.25)" }} />
          <div style={{
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: "24px 24px 0 0",
            borderTop: "1.5px solid rgba(255,255,255,0.5)",
            boxShadow: "0px -4px 32px rgba(0,0,0,0.08)",
            padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
            maxWidth: 480, width: "100%", margin: "0 auto", maxHeight: "60vh",
          }}>
            <div style={{ width: 40, height: 4, background: COLORS.outline, borderRadius: 2, margin: "0 auto 16px" }} />
            <CoachChat compact onExpand={() => { setSheetOpen(false); onOpenLog(); }} onMessageSent={onCoachReply} showTodayLog={false} />
          </div>
        </div>
      )}
    </>
  );
}
