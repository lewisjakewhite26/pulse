"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getProfile, saveProfile, isOnboarded, setOnboarded,
  getLogs, getDailyTotals, computeWellnessScore,
  addActivity, addMeasurement, getLatestMeasurement,
  getActivities, getWeekHistory, getWeeklyStats,
  getAccount, formatDate,
  isA2HSDismissed, setA2HSDismissed,
  getStravaTokens, saveStravaTokens, clearStravaTokens, addActivityIfNew,
  needsSync, getLastSynced, setLastSynced, exportAllData,
  createDefaultProfile, getCoachState, clearCoachUnread,
  createAccount, hasAccount, setUnlocked,
} from "../lib/storage";
import { ageFromDateOfBirth, formatDecimal, roundDecimal } from "../lib/profile-helpers";
import { ensureWelcomeInChatHistory, runOnboardingBackgroundTasks } from "../lib/onboarding-client";
import { parseActivityFile, stravaActivityToUpload } from "../lib/activity-parser";
import { isStravaClientConfigured } from "../lib/strava-config";
import { connectRenphoScale, isWebBluetoothAvailable } from "../lib/renpho-bluetooth";
import OnboardingFlow from "../app/components/onboarding/OnboardingFlow";
import CoachChat from "../app/components/coach/CoachChat";
import FloatingCoachButton from "../app/components/coach/FloatingCoachButton";
import ProfileTab from "../app/components/profile/ProfileTab";
import GoalJourney from "../app/components/trends/GoalJourney";
import { COLORS, GLASS_CARD, TAB_ICONS, FLOATING_NAV, HEADER_STYLE } from "../lib/design-tokens";

const C = {
  ...COLORS,
  surfaceContainer: COLORS.outlineVariant,
  secondary: COLORS.success,
  amber: COLORS.warning,
  tertiary: COLORS.teal,
  purple: "#8B5CF6",
};

const TABS = [
  { id: "dashboard", icon: TAB_ICONS.dashboard },
  { id: "log", icon: TAB_ICONS.log },
  { id: "activity", icon: TAB_ICONS.activity },
  { id: "trends", icon: TAB_ICONS.trends },
  { id: "profile", icon: TAB_ICONS.profile },
];

function isChromeAndroid() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg|OPR|SamsungBrowser|Firefox/i.test(ua);
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

function canShowA2HSBanner() {
  return isChromeAndroid() && !isStandaloneDisplay() && !isA2HSDismissed();
}

function profileAge(profile) {
  return ageFromDateOfBirth(profile.dateOfBirth);
}

// ─── Shared UI components ────────────────────────────────────────────────────

function GlassCard({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      ...GLASS_CARD,
      padding: "16px 20px",
      cursor: onClick ? "pointer" : "default",
      maxWidth: "100%", minWidth: 0, overflow: "hidden",
      transition: "all 0.2s ease",
      ...style
    }}>{children}</div>
  );
}

function Label({ children, style = {} }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant, ...style }}>{children}</div>;
}

function Btn({ children, onClick, disabled, secondary, style = {} }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "14px 0", borderRadius: 999,
      background: disabled ? C.outlineVariant : secondary ? "transparent" : C.primary,
      color: secondary ? C.primary : "#fff",
      border: secondary ? `1.5px solid ${C.primary}` : "none",
      fontSize: 14, fontWeight: 700, fontFamily: "inherit",
      cursor: disabled ? "not-allowed" : "pointer",
      boxShadow: disabled || secondary ? "none" : `0 6px 20px ${C.primary}28`,
      transition: "all 0.2s", ...style
    }}>{children}</button>
  );
}

function OptionChip({ label, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "9px 16px", borderRadius: 999,
      border: `1.5px solid ${selected ? C.primary : C.outlineVariant}`,
      background: selected ? `${C.primary}12` : C.surface,
      color: selected ? C.primary : C.onSurfaceVariant,
      fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", transition: "all 0.15s"
    }}>{label}</button>
  );
}

function FormInput({ label, value, onChange, placeholder, type = "text", unit, tall, compact }) {
  const base = {
    flex: 1, minWidth: 0, width: "100%", maxWidth: "100%",
    padding: "11px 14px", borderRadius: unit ? "10px 0 0 10px" : 10,
    border: `1.5px solid ${C.outlineVariant}`, background: C.surface,
    fontSize: 14, color: C.onSurface, fontFamily: "inherit", outline: "none",
    borderRight: unit ? "none" : undefined, boxSizing: "border-box",
  };
  return (
    <div style={{ marginBottom: compact ? 0 : 14, width: "100%", minWidth: 0, maxWidth: "100%" }}>
      {label && <Label style={{ marginBottom: 6 }}>{label}</Label>}
      <div style={{ display: "flex", alignItems: "stretch", minWidth: 0, maxWidth: "100%", width: "100%" }}>
        {tall
          ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
              style={{ ...base, borderRadius: 10, resize: "vertical", lineHeight: 1.6 }} />
          : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={base} />
        }
        {unit && (
          <div style={{
            padding: "11px 10px", background: C.surfaceContainer, flexShrink: 0,
            border: `1.5px solid ${C.outlineVariant}`, borderLeft: "none",
            borderRadius: "0 10px 10px 0", fontSize: 12, color: C.onSurfaceVariant, fontWeight: 600,
            display: "flex", alignItems: "center"
          }}>{unit}</div>
        )}
      </div>
    </div>
  );
}

function ConfDot({ val }) {
  const color = val >= 0.85 ? C.secondary : val >= 0.6 ? C.amber : C.error;
  return <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

function HabitChip({ label, done }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "8px 16px", borderRadius: 999,
      background: done ? C.success : "rgba(255,255,255,0.7)",
      border: done ? "none" : `1.5px solid ${C.outline}`,
      fontSize: 12, fontWeight: 600,
      color: done ? C.successText : C.onSurfaceVariant,
      transform: done ? "scale(1.04)" : "scale(1)",
      transition: "all 0.3s ease-in-out",
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: done ? "'FILL' 1" : "'FILL' 0" }}>{done ? "check_circle" : "radio_button_unchecked"}</span>
      {label}
    </div>
  );
}

function StatChip({ icon, label, value, unit, current, max, color, tablerIcon, formatDisplay }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const displayVal = current > 0
    ? (formatDisplay ? formatDisplay(current) : (typeof value === "number" && value > 999 ? value.toLocaleString() : String(current)))
    : null;
  return (
    <GlassCard style={{ minWidth: 130, padding: "14px 16px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {tablerIcon
          ? <i className={`ti ${tablerIcon}`} style={{ fontSize: 16, color }} />
          : <span className="material-symbols-outlined" style={{ fontSize: 16, color }}>{icon}</span>}
        <Label>{label}</Label>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.onSurface, marginBottom: 8, letterSpacing: "-0.01em" }}>
        {displayVal ?? "--"}{" "}
        <span style={{ fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>{unit}</span>
      </div>
      <div style={{ height: 3, background: C.outlineVariant, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 1s ease" }} />
      </div>
    </GlassCard>
  );
}

function WellnessArc({ score }) {
  const [anim, setAnim] = useState(0);
  useEffect(() => { const t = setTimeout(() => setAnim(score), 200); return () => clearTimeout(t); }, [score]);
  const size = 180, cx = 90, cy = 90, rOuter = 72, rInner = 54, gap = 5;
  const isEmpty = Math.round(anim) === 0;
  const outerSegments = [
    Math.min(anim * 1.05, 100),
    Math.min(anim * 0.95, 100),
    Math.min(anim * 0.85, 100),
    Math.min(anim * 1.0, 100),
  ];
  const innerSegments = [
    Math.min(anim * 0.9, 100),
    Math.min(anim * 1.0, 100),
    Math.min(anim * 0.8, 100),
    Math.min(anim * 0.95, 100),
  ];
  const arcPath = (s, e, pct, r) => {
    const sweep = Math.max(0, (e - s - gap * 2) * (pct / 100));
    const a = s + gap, b = a + sweep;
    const toRad = d => (d - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(toRad(a)), y1 = cy + r * Math.sin(toRad(a));
    const x2 = cx + r * Math.cos(toRad(b)), y2 = cy + r * Math.sin(toRad(b));
    return `M ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const bgPath = (s, e, r) => {
    const a = s + gap, b = e - gap;
    const toRad = d => (d - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(toRad(a)), y1 = cy + r * Math.sin(toRad(a));
    const x2 = cx + r * Math.cos(toRad(b)), y2 = cy + r * Math.sin(toRad(b));
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const angles = [[0, 90], [90, 180], [180, 270], [270, 360]];
  const trackOpacity = isEmpty ? 0.1 : 1;
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
        <svg width={size} height={size}>
          {angles.map(([s, e], i) => (
            <g key={`outer-${i}`}>
              <path d={bgPath(s, e, rOuter)} fill="none" stroke={`rgba(238,79,79,${trackOpacity * 0.1})`} strokeWidth={9} strokeLinecap="round" />
              {!isEmpty && (
                <path d={arcPath(s, e, outerSegments[i], rOuter)} fill="none" stroke={C.primary} strokeWidth={9} strokeLinecap="round"
                  className="arc-segment" />
              )}
            </g>
          ))}
          {angles.map(([s, e], i) => (
            <g key={`inner-${i}`}>
              <path d={bgPath(s, e, rInner)} fill="none" stroke={`rgba(171,254,103,${trackOpacity * 0.1})`} strokeWidth={9} strokeLinecap="round" />
              {!isEmpty && (
                <path d={arcPath(s, e, innerSegments[i], rInner)} fill="none" stroke={C.success} strokeWidth={9} strokeLinecap="round"
                  className="arc-segment" />
              )}
            </g>
          ))}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 44, fontWeight: 800, color: C.primary, lineHeight: 1, letterSpacing: "-0.04em" }}>{Math.round(anim)}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 6 }}>Your day so far</div>
        </div>
      </div>
      {isEmpty && (
        <p style={{ fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant, marginTop: 12 }}>Start logging to see your score</p>
      )}
    </div>
  );
}

function RecentLog({ logs }) {
  if (!logs.length) return null;
  const entries = logs.slice(0, 5);
  return (
    <div>
      <Label style={{ marginBottom: 10 }}>Recent log</Label>
      <GlassCard style={{ padding: "4px 16px" }}>
        {entries.map((entry, i) => (
          <div key={entry.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
            borderBottom: i < entries.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none",
          }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant, width: 48, flexShrink: 0 }}>{entry.time}</div>
            <div style={{ flex: 1, fontSize: 15, lineHeight: 1.6, color: C.onSurface, minWidth: 0, wordBreak: "break-word" }}>{entry.raw}</div>
            <div style={{
              width: 16, height: 16, borderRadius: "50%", background: C.success, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <i className="ti ti-check" style={{ fontSize: 10, color: "#fff" }} />
            </div>
          </div>
        ))}
      </GlassCard>
    </div>
  );
}

function ScoreRing({ score, label, verdict, delay = 0 }) {
  const [anim, setAnim] = useState(0);
  useEffect(() => { const t = setTimeout(() => setAnim(score), 300 + delay); return () => clearTimeout(t); }, [score, delay]);
  const size = 80, r = 32, circ = 2 * Math.PI * r;
  const scoreColor = score >= 70 ? C.secondary : score >= 45 ? C.amber : C.error;
  return (
    <GlassCard style={{ padding: 16, textAlign: "center" }}>
      <div style={{ position: "relative", width: size, height: size, margin: "0 auto 10px" }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.surfaceContainer} strokeWidth={7} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={scoreColor} strokeWidth={7}
            strokeDasharray={`${(anim / 100) * circ} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: scoreColor }}>{Math.round(anim)}</span>
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.onSurface, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.5 }}>{verdict}</div>
    </GlassCard>
  );
}

function ProgressBar({ step, total }) {
  return (
    <div style={{ height: 3, background: C.surfaceContainer, borderRadius: 2, overflow: "hidden", marginBottom: 32 }}>
      <div style={{ height: "100%", width: `${(step / total) * 100}%`, background: C.primary, borderRadius: 2, transition: "width 0.4s ease" }} />
    </div>
  );
}

// DEBUG — remove after fix
function RenphoDebugPanel({ logs }) {
  const logRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (logs.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.onSurfaceVariant }}>Renpho debug log</span>
        <button
          type="button"
          onClick={copyLogs}
          style={{
            background: "#2d3436",
            color: "#dfe6e9",
            border: "none",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          {copied ? "Copied" : "Copy logs"}
        </button>
      </div>
      <div
        ref={logRef}
        style={{
          background: "#1a1a2e",
          color: "#c8d6e5",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 11,
          lineHeight: 1.5,
          padding: "10px 12px",
          borderRadius: 10,
          maxHeight: 220,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {logs.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
    </div>
  );
}


function formatLastSyncedLabel(iso) {
  if (!iso) return "Not synced yet";
  const d = new Date(iso);
  const today = new Date().toISOString().split("T")[0];
  const syncedDay = iso.split("T")[0];
  if (syncedDay === today) {
    return `Last synced ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} today`;
  }
  return `Last synced ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

function SyncStatusChip({ syncState, onSync }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const chipRef = useRef(null);
  const longPressRef = useRef(null);

  const tooltipText = syncState === "dirty"
    ? "Unsaved changes. Tap to sync."
    : formatLastSyncedLabel(getLastSynced());

  useEffect(() => {
    if (!showTooltip) return;
    const onDown = (e) => {
      if (chipRef.current && !chipRef.current.contains(e.target)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [showTooltip]);

  const label = syncState === "syncing" ? "Syncing..." : syncState === "dirty" ? "Not synced" : "Synced";
  const synced = syncState === "synced";
  const chipBg = synced ? C.success : syncState === "dirty" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.7)";
  const chipText = synced ? C.successText : syncState === "dirty" ? C.warning : C.onSurfaceVariant;
  const dotColor = synced ? C.successText : syncState === "dirty" ? C.warning : C.onSurfaceVariant;

  return (
    <div ref={chipRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={syncState === "syncing"}
        onClick={() => { if (syncState !== "syncing") onSync(); }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onTouchStart={() => {
          longPressRef.current = setTimeout(() => setShowTooltip(true), 500);
        }}
        onTouchEnd={() => clearTimeout(longPressRef.current)}
        onTouchCancel={() => clearTimeout(longPressRef.current)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 999,
          background: chipBg,
          border: synced ? "none" : "1.5px solid rgba(255,255,255,0.4)",
          cursor: syncState === "syncing" ? "default" : "pointer",
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          fontSize: 11,
          fontWeight: 600,
          color: chipText,
          transition: "all 0.2s ease",
        }}
      >
        {syncState === "syncing" ? (
          <span style={{
            width: 8,
            height: 8,
            border: `2px solid ${C.primary}`,
            borderTopColor: "transparent",
            borderRadius: "50%",
            display: "inline-block",
            animation: "pulse-sync-spin 0.8s linear infinite",
          }} />
        ) : (
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        )}
        {label}
      </button>
      {showTooltip && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 6,
          padding: "8px 12px",
          background: C.surface,
          border: `1px solid ${C.outlineVariant}`,
          borderRadius: 8,
          fontSize: 12,
          color: C.onSurfaceVariant,
          whiteSpace: "nowrap",
          zIndex: 200,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        }}>
          {tooltipText}
        </div>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function Pulse() {
  const [onboarded, setOnboardedState] = useState(() => isOnboarded());
  const [profile, setProfile] = useState(() => getProfile() ?? createDefaultProfile(""));
  const [welcomeMessage, setWelcomeMessage] = useState(() => getProfile()?.welcomeMessage ?? "");
  const [welcomeLoading, setWelcomeLoading] = useState(false);
  const [coachUnread, setCoachUnread] = useState(() => getCoachState().unreadCount ?? 0);
  const [dataTick, setDataTick] = useState(0);
  const refreshData = () => setDataTick(t => t + 1);

  const [tab, setTab] = useState(() => {
    if (typeof sessionStorage !== "undefined") {
      const devTab = sessionStorage.getItem("pulse_dev_tab");
      if (devTab) {
        sessionStorage.removeItem("pulse_dev_tab");
        return devTab;
      }
    }
    return "dashboard";
  });
  const [dragOver, setDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [activitySaved, setActivitySaved] = useState(false);
  const [scaleStatus, setScaleStatus] = useState("idle");
  const [scaleMeasurement, setScaleMeasurement] = useState(null);
  const [scaleError, setScaleError] = useState(null);
  const [measurementSaved, setMeasurementSaved] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]); // DEBUG — remove after fix
  const fileRef = useRef();
  const installPromptRef = useRef(null);
  const [showA2HS, setShowA2HS] = useState(false);
  const [stravaTokens, setStravaTokensState] = useState(() => getStravaTokens());
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaMessage, setStravaMessage] = useState(null);
  const [stravaToast, setStravaToast] = useState(null);
  const [syncState, setSyncState] = useState(() => (needsSync() ? "dirty" : "synced"));

  const triggerSync = useCallback(async () => {
    setSyncState("syncing");
    await new Promise((resolve) => setTimeout(resolve, 800));
    exportAllData();
    setLastSynced();
    setSyncState("synced");
  }, []);

  useEffect(() => {
    if (syncState === "syncing") return;
    setSyncState(needsSync() ? "dirty" : "synced");
  }, [dataTick, syncState]);

  const checkScheduledSync = useCallback(() => {
    const hour = new Date().getHours();
    const lastSynced = getLastSynced();
    const lastSyncedDate = lastSynced ? lastSynced.split("T")[0] : null;
    const today = new Date().toISOString().split("T")[0];
    if (hour >= 22 && needsSync() && lastSyncedDate !== today) {
      triggerSync();
    }
  }, [triggerSync]);

  useEffect(() => {
    checkScheduledSync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkScheduledSync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [checkScheduledSync]);

  useEffect(() => {
    if (!onboarded) return;
    const p = getProfile();
    if (p && !p.welcomeMessage) {
      setWelcomeLoading(true);
      void runOnboardingBackgroundTasks(p).then(() => {
        const updated = getProfile();
        if (updated) {
          setProfile(updated);
          if (updated.welcomeMessage) setWelcomeMessage(updated.welcomeMessage);
        }
        setWelcomeLoading(false);
      });
    }
  }, [onboarded]);

  useEffect(() => {
    if (tab === "log") {
      ensureWelcomeInChatHistory();
      clearCoachUnread();
      setCoachUnread(0);
    }
  }, [tab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "activity") setTab("activity");
    const strava = params.get("strava");
    if (strava === "connected") {
      setStravaTokensState(getStravaTokens());
      setStravaToast({ type: "success", text: "Strava connected successfully." });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (strava === "cancelled") {
      setStravaToast({ type: "error", text: "Strava authorisation was cancelled." });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (strava === "error") {
      setStravaToast({ type: "error", text: "Could not connect to Strava." });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!stravaToast) return;
    const t = setTimeout(() => setStravaToast(null), 3000);
    return () => clearTimeout(t);
  }, [stravaToast]);

  useEffect(() => {
    if (!canShowA2HSBanner()) return;
    const onInstallPrompt = (e) => {
      e.preventDefault();
      installPromptRef.current = e;
      setShowA2HS(true);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onInstallPrompt);
  }, []);

  const handleA2HSAdd = async () => {
    const prompt = installPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    installPromptRef.current = null;
    if (outcome === "accepted") setShowA2HS(false);
  };

  const handleA2HSDismiss = () => {
    setA2HSDismissed();
    setShowA2HS(false);
    installPromptRef.current = null;
  };

  void dataTick;
  const account = getAccount();
  const daily = getDailyTotals();
  const wellnessScore = computeWellnessScore(daily, profile);
  const todayLogs = getLogs();
  const weekHistory = getWeekHistory();
  const weeklyStats = getWeeklyStats();
  const activities = getActivities(10);
  const latestMeasurement = getLatestMeasurement();
  const calorieTarget = profile.targets?.calories ?? 2400;
  const proteinTarget = profile.targets?.protein_g ?? 180;
  const waterTarget = profile.targets?.water_ml ?? 3000;
  const stepsTarget = profile.targets?.steps ?? 10000;
  const hasTrendData = weekHistory.some(h => h.calories > 0 || h.weight != null || h.alcohol > 0 || h.steps > 0);
  const weightPoints = weekHistory.filter(h => h.weight != null);

  const handleOnboardingComplete = (prof) => {
    if (!hasAccount()) {
      createAccount(prof.name, "0000"); // DEBUG — default PIN
    }
    setUnlocked(true);
    try { localStorage.setItem("pulse_session_unlocked", "true"); } catch { /* ignore */ }
    saveProfile(prof);
    setProfile(prof);
    setOnboarded(true);
    setOnboardedState(true);
    setWelcomeLoading(true);
    void runOnboardingBackgroundTasks(prof).then(() => {
      const updated = getProfile();
      if (updated) {
        setProfile(updated);
        if (updated.welcomeMessage) setWelcomeMessage(updated.welcomeMessage);
      }
      setWelcomeLoading(false);
    });
  };

  const openLogTab = () => {
    clearCoachUnread();
    setCoachUnread(0);
    setTab("log");
  };

  if (!onboarded) return (
    <>
      <OnboardingFlow onComplete={handleOnboardingComplete} />
    </>
  );

  const handleFileUpload = async (file) => {
    setUploadStatus({ name: file.name, size: (file.size / 1024).toFixed(1) + " KB", status: "parsing", error: null });
    setActivitySaved(false);
    try {
      const result = await parseActivityFile(file);
      setUploadStatus(prev => ({ ...prev, status: "done", result, error: null }));
    } catch (err) {
      setUploadStatus(prev => ({ ...prev, status: "error", error: err.message || "Could not parse file." }));
    }
  };

  const connectStrava = () => {
    window.location.href = "/api/strava/authorize";
  };

  const disconnectStrava = () => {
    clearStravaTokens();
    setStravaTokensState(null);
    setStravaMessage(null);
  };

  const syncStrava = async () => {
    const tokens = getStravaTokens();
    if (!tokens) return;
    setStravaSyncing(true);
    setStravaMessage(null);
    try {
      const res = await fetch("/api/strava/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed.");
      if (data.tokens) {
        saveStravaTokens(data.tokens);
        setStravaTokensState(data.tokens);
      }
      let imported = 0;
      for (const act of data.activities || []) {
        const parsed = stravaActivityToUpload(act);
        const saved = addActivityIfNew({
          type: parsed.activity,
          source: parsed.type,
          date: parsed.date,
          duration: parsed.duration,
          distance: parsed.distance,
          avgHR: parsed.avgHR,
          calories: parsed.calories,
          externalId: parsed.externalId,
        });
        if (saved) imported++;
      }
      refreshData();
      setStravaMessage(`Imported ${imported} new ${imported === 1 ? "activity" : "activities"}.`);
    } catch (err) {
      setStravaMessage(err.message || "Could not sync Strava.");
    } finally {
      setStravaSyncing(false);
    }
  };

  const calcBIA = (weight, impedance, age, heightCm, isMale) => {
    const h = heightCm / 100, bmi = weight / (h * h);
    let bf = isMale ? (1.20 * bmi) + (0.23 * age) - 16.2 : (1.20 * bmi) + (0.23 * age) - 5.4;
    bf = Math.max(3, Math.min(60, bf - (500 - impedance) * 0.05));
    const lean = weight - (bf / 100) * weight;
    return { bodyFat: Math.round(bf * 10) / 10, muscleMass: Math.round(lean * 0.85 * 10) / 10, boneMass: Math.round(lean * 0.07 * 10) / 10, waterPct: Math.round(lean * 0.73 / weight * 1000) / 10, leanMass: Math.round(lean * 10) / 10, bmr: Math.round(isMale ? (10 * weight) + (6.25 * heightCm) - (5 * age) + 5 : (10 * weight) + (6.25 * heightCm) - (5 * age) - 161), bmi: Math.round(bmi * 10) / 10 };
  };

  const connectRenpho = async () => {
    if (!isWebBluetoothAvailable()) {
      setScaleError("Web Bluetooth not supported. Use Chrome on Android.");
      setScaleStatus("error");
      return;
    }
    setScaleMeasurement(null);
    setDebugLogs([]); // DEBUG — remove after fix
    await connectRenphoScale({
      userProfile: {
        sex: profile.sex || "Male",
        age: String(profileAge(profile) || 30),
        height: "175",
      },
      calcBIA,
      onStatus: setScaleStatus,
      onError: setScaleError,
      onDebugLog: (message) => setDebugLogs((prev) => [...prev, message]), // DEBUG — remove after fix
      onReading: ({ weight, impedance, composition }) => {
        setScaleMeasurement({
          weight: roundDecimal(weight),
          impedance,
          bodyFat: composition.bodyFat != null ? roundDecimal(composition.bodyFat) : undefined,
          muscleMass: composition.muscleMass != null ? roundDecimal(composition.muscleMass) : undefined,
          boneMass: composition.boneMass != null ? roundDecimal(composition.boneMass) : undefined,
          waterPct: composition.waterPct != null ? roundDecimal(composition.waterPct) : undefined,
          leanMass: composition.leanMass != null ? roundDecimal(composition.leanMass) : undefined,
          bmr: composition.bmr != null ? Math.round(composition.bmr) : undefined,
          bmi: composition.bmi != null ? roundDecimal(composition.bmi) : undefined,
          time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        });
      },
    });
  };

  const wData = weightPoints.map(h => h.weight);
  const wMin = wData.length ? Math.min(...wData) - 0.5 : 0;
  const wMax = wData.length ? Math.max(...wData) + 0.5 : 1;
  const W = 320, H = 80;

  const handleSaveActivity = () => {
    if (!uploadStatus?.result) return;
    const r = uploadStatus.result;
    addActivity({
      type: r.activity,
      source: r.type,
      date: r.date || formatDate(new Date()),
      duration: r.duration,
      distance: r.distance,
      avgHR: r.avgHR,
      calories: r.calories,
      externalId: r.externalId,
    });
    setActivitySaved(true);
    refreshData();
    setTimeout(() => { setActivitySaved(false); setUploadStatus(null); }, 2000);
  };

  const handleSaveMeasurement = () => {
    if (!scaleMeasurement) return;
    addMeasurement({
      date: formatDate(new Date()),
      time: scaleMeasurement.time,
      weight: scaleMeasurement.weight != null ? roundDecimal(scaleMeasurement.weight) : undefined,
      bodyFat: scaleMeasurement.bodyFat != null ? roundDecimal(scaleMeasurement.bodyFat) : undefined,
      muscleMass: scaleMeasurement.muscleMass != null ? roundDecimal(scaleMeasurement.muscleMass) : undefined,
      boneMass: scaleMeasurement.boneMass != null ? roundDecimal(scaleMeasurement.boneMass) : undefined,
      waterPct: scaleMeasurement.waterPct != null ? roundDecimal(scaleMeasurement.waterPct) : undefined,
      leanMass: scaleMeasurement.leanMass != null ? roundDecimal(scaleMeasurement.leanMass) : undefined,
      bmr: scaleMeasurement.bmr != null ? Math.round(scaleMeasurement.bmr) : undefined,
      bmi: scaleMeasurement.bmi != null ? roundDecimal(scaleMeasurement.bmi) : undefined,
      impedance: scaleMeasurement.impedance,
    });
    setMeasurementSaved(true);
    refreshData();
    setTimeout(() => setMeasurementSaved(false), 2000);
  };

  const dashboardCoachMessage = profile.welcomeMessage || welcomeMessage;
  const hasLoggedToday = todayLogs.length > 0 || daily.calories > 0 || daily.water_ml > 0 || daily.steps > 0;
  const medHabitLabel = profile.extracted?.medication?.[0]
    || profile.learned?.medicationMentioned?.[0]
    || "Medication";

  return (
    <div className="pulse-canvas" style={{ minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: C.onSurface, maxWidth: 480, width: "100%", margin: "0 auto", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
        <header style={{ ...HEADER_STYLE, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", paddingTop: "env(safe-area-inset-top)" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.primary, letterSpacing: "-0.03em" }}>Pulse</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {(account?.username || profile.name) && <div style={{ fontSize: 13, fontWeight: 600, color: C.onSurfaceVariant }}>Hey, {account?.username || profile.name}</div>}
            <SyncStatusChip syncState={syncState} onSync={triggerSync} />
          </div>
        </header>
        {tab === "dashboard" && showA2HS && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: `${C.primary}08`, borderBottom: `1px solid ${C.primary}20` }}>
            <span style={{ flex: 1, fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.4 }}>Add Pulse to your home screen for the best experience</span>
            <button type="button" onClick={handleA2HSAdd} style={{ padding: "6px 14px", borderRadius: 999, background: C.primary, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", flexShrink: 0 }}>Add</button>
            <button type="button" onClick={handleA2HSDismiss} aria-label="Dismiss" style={{ padding: "4px 8px", borderRadius: 8, background: "transparent", color: C.onSurfaceVariant, border: "none", fontSize: 18, lineHeight: 1, fontFamily: "inherit", cursor: "pointer", flexShrink: 0 }}>×</button>
          </div>
        )}
      </div>

      <main style={{ padding: "20px 20px 0", paddingBottom: "calc(80px + 16px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 24, minWidth: 0, maxWidth: "100%", overflowX: "hidden" }}>

        {tab === "dashboard" && <>
          <GlassCard onClick={openLogTab} style={{ cursor: "pointer", padding: "14px 16px", borderLeft: `3px solid ${C.primary}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.primary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                Your coach
              </div>
              {welcomeLoading && !dashboardCoachMessage ? (
                <p className="shimmer" style={{ fontSize: 15, lineHeight: 1.6, color: C.onSurfaceVariant, margin: 0, borderRadius: 8, padding: "4px 0" }}>
                  Getting ready...
                </p>
              ) : (
                <p style={{ fontSize: 15, lineHeight: 1.6, color: C.onSurface, margin: 0 }}>
                  {dashboardCoachMessage || "Getting ready..."}
                </p>
              )}
            </div>
            <i className="ti ti-arrow-right" style={{ fontSize: 16, color: C.primary, flexShrink: 0 }} />
          </GlassCard>
          <WellnessArc score={wellnessScore} />
          <div className="hide-scrollbar" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, marginLeft: -20, paddingLeft: 20, marginRight: -20, paddingRight: 20 }}>
            <StatChip icon="local_fire_department" label="Calories" value={daily.calories} unit="kcal" current={daily.calories} max={calorieTarget} color={C.primary} />
            <StatChip icon="egg_alt" label="Protein" value={daily.protein_g} unit="g" current={daily.protein_g} max={proteinTarget} color={C.teal} />
            <StatChip icon="water_drop" label="Water" value={daily.water_ml} unit="L" current={daily.water_ml} max={waterTarget} color={C.blue} tablerIcon="ti-droplet" formatDisplay={(n) => (n / 1000).toFixed(1)} />
            <StatChip icon="directions_walk" label="Steps" value={daily.steps} unit={`/ ${Math.round(stepsTarget / 1000)}k`} current={daily.steps} max={stepsTarget} color={C.grey} formatDisplay={(n) => n.toLocaleString()} />
          </div>
          <GlassCard>
            {!latestMeasurement ? (
              <>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: C.onSurfaceVariant, margin: "0 0 10px" }}>No measurements yet.</p>
                <button type="button" onClick={() => setTab("activity")} style={{ background: "none", border: "none", color: C.primary, fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>
                  Connect Renpho scale →
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 44, fontWeight: 800, color: C.primary, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 16 }}>
                  {formatDecimal(latestMeasurement.weight)}<span style={{ fontSize: 18, fontWeight: 700 }}> kg</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {latestMeasurement.bodyFat != null && (
                    <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.5)", borderRadius: 12, border: `1px solid ${C.outline}` }}>
                      <Label style={{ marginBottom: 4, display: "block" }}>Body fat</Label>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.onSurface }}>{formatDecimal(latestMeasurement.bodyFat)}%</div>
                    </div>
                  )}
                  {latestMeasurement.muscleMass != null && (
                    <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.5)", borderRadius: 12, border: `1px solid ${C.outline}` }}>
                      <Label style={{ marginBottom: 4, display: "block" }}>Muscle mass</Label>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.onSurface }}>{formatDecimal(latestMeasurement.muscleMass)} kg</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </GlassCard>
          <div>
            <Label style={{ marginBottom: 10 }}>Daily habits</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <HabitChip label={medHabitLabel} done={daily.medication_taken} />
              <HabitChip label="Dry day" done={daily.alcohol_units === 0 && (todayLogs.length > 0 || daily.calories > 0)} />
              <HabitChip label="Step goal" done={daily.steps >= stepsTarget} />
            </div>
          </div>
          <RecentLog logs={todayLogs} />
        </>}

        {tab === "log" && (
          <CoachChat markUnread={false} onMessageSent={refreshData} />
        )}

        {tab === "activity" && <>
          {stravaToast && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 14, marginBottom: 4,
              background: stravaToast.type === "success" ? C.success : C.primary,
              color: stravaToast.type === "success" ? C.successText : "#fff",
              fontSize: 14, fontWeight: 600,
            }}>
              <i className={`ti ${stravaToast.type === "success" ? "ti-check" : "ti-x"}`} style={{ fontSize: 18 }} />
              {stravaToast.text}
            </div>
          )}
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Activity</div>
          <GlassCard style={{ borderLeft: `3px solid ${C.strava}`, padding: "14px 16px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Strava</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: stravaTokens ? C.success : C.strava }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: stravaTokens ? C.successText : C.strava }}>
                {stravaTokens
                  ? `Connected${stravaTokens.athlete?.firstname ? ` · ${stravaTokens.athlete.firstname}` : ""}`
                  : "Not connected"}
              </span>
            </div>
            {!isStravaClientConfigured() ? (
              <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
                Strava isn&apos;t connected yet.
              </div>
            ) : stravaTokens ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={syncStrava} disabled={stravaSyncing} style={{ width: "100%", padding: "10px 0", borderRadius: 999, background: "rgba(252,76,2,0.08)", border: "1px solid rgba(252,76,2,0.25)", color: "#FC4C02", cursor: stravaSyncing ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                  {stravaSyncing ? "Syncing…" : "Sync recent activities"}
                </button>
                <button onClick={disconnectStrava} style={{ width: "100%", padding: "8px 0", borderRadius: 999, background: "transparent", border: `1px solid ${C.outlineVariant}`, color: C.onSurfaceVariant, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Disconnect</button>
              </div>
            ) : (
              <button onClick={connectStrava} style={{ width: "100%", padding: "11px 0", borderRadius: 999, background: "rgba(255,255,255,0.7)", backdropFilter: "blur(15px)", border: `1.5px solid ${C.strava}`, color: C.strava, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit", transition: "all 0.2s ease" }}>Connect Strava</button>
            )}
            {stravaMessage && !stravaToast && (
              <div style={{ marginTop: 10, fontSize: 12, color: stravaMessage.startsWith("Imported") ? C.successText : C.error, lineHeight: 1.5 }}>{stravaMessage}</div>
            )}
          </GlassCard>
          <div>
            <Label style={{ marginBottom: 10 }}>Recent activities</Label>
            {activities.length === 0 ? (
              <GlassCard style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ fontSize: 15, color: C.onSurfaceVariant, lineHeight: 1.6 }}>No activities yet. Upload a Garmin file or connect your scale.</div>
              </GlassCard>
            ) : (
              <GlassCard style={{ padding: "4px 16px" }}>
                {activities.map((a, i) => {
                  const isSport = /football|sport|soccer/i.test(a.type);
                  return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < activities.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none" }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: isSport ? C.success : `${C.primary}20`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <i className={`ti ${isSport ? "ti-ball-football" : "ti-run"}`} style={{ fontSize: 18, color: isSport ? C.successText : C.primary }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.onSurface }}>{a.type}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: C.onSurfaceVariant, background: C.outlineVariant, padding: "2px 8px", borderRadius: 999 }}>{a.source}</span>
                        <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12, textAlign: "right", flexShrink: 0 }}>
                      {a.distance && <div><div style={{ fontSize: 13, fontWeight: 700 }}>{a.distance}</div><div style={{ fontSize: 11, color: C.onSurfaceVariant }}>Dist</div></div>}
                      <div><div style={{ fontSize: 13, fontWeight: 700 }}>{a.duration}</div><div style={{ fontSize: 11, color: C.onSurfaceVariant }}>Time</div></div>
                      {a.avgHR && <div><div style={{ fontSize: 13, fontWeight: 700, color: a.avgHR > 150 ? C.primary : C.onSurface }}>{a.avgHR}</div><div style={{ fontSize: 11, color: C.onSurfaceVariant }}>HR</div></div>}
                      {a.calories && <div><div style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{a.calories}</div><div style={{ fontSize: 11, color: C.onSurfaceVariant }}>Kcal</div></div>}
                    </div>
                  </div>
                );})}
              </GlassCard>
            )}
          </div>
          <div>
            <Label style={{ marginBottom: 10 }}>Renpho scale</Label>
            <GlassCard style={{ position: "relative", ...(scaleStatus === "done" ? { borderLeft: `3px solid ${C.success}` } : {}) }}>
              <div style={{ position: "absolute", top: 16, right: 16, width: 8, height: 8, borderRadius: "50%",
                background: scaleStatus === "idle" ? C.grey : scaleStatus === "scanning" ? C.warning : scaleStatus === "connected" || scaleStatus === "reading" ? C.primary : scaleStatus === "done" ? C.success : C.error }} />
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, paddingRight: 20 }}>Step on with bare feet</div>
              <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 14 }}>
                {scaleStatus === "idle" && "Tap connect, then step on with bare feet"}
                {scaleStatus === "scanning" && "Scanning for your scale..."}
                {scaleStatus === "connected" && "Connected. Step on the scale."}
                {scaleStatus === "reading" && "Reading in progress..."}
                {scaleStatus === "done" && "Reading complete"}
                {scaleStatus === "error" && (scaleError || "Something went wrong")}
              </div>
              {scaleMeasurement && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "Weight", value: `${formatDecimal(scaleMeasurement.weight)}kg`, color: C.primary },
                    { label: "Body fat", value: `${formatDecimal(scaleMeasurement.bodyFat)}%`, color: C.error },
                    { label: "Muscle", value: `${formatDecimal(scaleMeasurement.muscleMass)}kg`, color: C.secondary },
                    { label: "BMI", value: formatDecimal(scaleMeasurement.bmi), color: C.tertiary },
                    { label: "Water", value: `${formatDecimal(scaleMeasurement.waterPct)}%`, color: "#0891B2" },
                    { label: "BMR", value: `${scaleMeasurement.bmr} kcal`, color: C.onSurfaceVariant },
                  ].map(m => (
                    <div key={m.label} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.5)", borderRadius: 12, border: `1px solid ${C.outline}` }}>
                      <Label style={{ marginBottom: 4, display: "block" }}>{m.label}</Label>
                      <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {scaleMeasurement && (
                  <button onClick={handleSaveMeasurement} style={{ width: "100%", padding: "12px 0", borderRadius: 999, background: measurementSaved ? C.success : C.primary, color: measurementSaved ? C.successText : "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit", transition: "all 0.3s ease-in-out", boxShadow: measurementSaved ? "none" : "0px 8px 24px rgba(238,79,79,0.25)" }}>
                    {measurementSaved ? "Saved" : "Save measurement"}
                  </button>
                )}
                <button onClick={connectRenpho} disabled={["scanning","reading","connected"].includes(scaleStatus)} style={{
                  width: "100%", padding: "12px 0", borderRadius: 999, fontSize: 14, fontWeight: 700, fontFamily: "inherit", transition: "all 0.2s ease",
                  background: scaleStatus === "done" ? C.success : scaleStatus === "idle" ? "rgba(255,255,255,0.7)" : C.primary,
                  color: scaleStatus === "done" ? C.successText : scaleStatus === "idle" ? C.onSurface : "#fff",
                  border: scaleStatus === "idle" ? `1.5px solid ${C.outline}` : "none",
                  boxShadow: scaleStatus === "idle" || scaleStatus === "done" ? "none" : "0px 8px 24px rgba(238,79,79,0.25)",
                  cursor: ["scanning","reading","connected"].includes(scaleStatus) ? "not-allowed" : "pointer",
                }}>
                  {scaleStatus === "idle" && "Connect scale"}{scaleStatus === "scanning" && "Scanning..."}{scaleStatus === "connected" && "Step on scale"}{scaleStatus === "reading" && "Reading..."}{scaleStatus === "done" && "Take another reading"}{scaleStatus === "error" && "Try again"}
                </button>
              </div>
              <RenphoDebugPanel logs={debugLogs} />
            </GlassCard>
          </div>
          <div>
            <Label style={{ marginBottom: 10 }}>Garmin file upload</Label>
            <GlassCard style={{ padding: 0, overflow: "hidden" }}>
              <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
                onClick={() => fileRef.current?.click()}
                style={{ padding: "28px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? `${C.primary}08` : "transparent", border: `2px dashed ${dragOver ? C.primary : C.outline}`, borderRadius: 16, margin: 6, transition: "all 0.2s ease" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 30, color: C.onSurfaceVariant, display: "block", marginBottom: 8 }}>upload_file</span>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Drop any Garmin file here</div>
                <div style={{ fontSize: 11, color: C.onSurfaceVariant }}>.FIT · .CSV · .GPX · .TCX</div>
                <input ref={fileRef} type="file" accept=".fit,.csv,.gpx,.tcx" onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])} style={{ display: "none" }} />
              </div>
              {uploadStatus && (
                <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.outlineVariant}30` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: uploadStatus.status === "done" || uploadStatus.status === "error" ? 12 : 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{uploadStatus.name}</span>
                    <span style={{ fontSize: 11, color: C.onSurfaceVariant }}>{uploadStatus.size}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: uploadStatus.status === "done" ? C.secondary : uploadStatus.status === "error" ? C.error : C.amber }}>
                      {uploadStatus.status === "parsing" ? "Parsing..." : uploadStatus.status === "error" ? "Failed" : "Parsed"}
                    </span>
                  </div>
                  {uploadStatus.status === "error" && (
                    <div style={{ fontSize: 12, color: C.error, lineHeight: 1.5 }}>{uploadStatus.error}</div>
                  )}
                  {uploadStatus.status === "done" && uploadStatus.result && <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                      {[
                        { label: "Activity", value: uploadStatus.result.activity },
                        { label: "Source", value: uploadStatus.result.type },
                        { label: "Date", value: uploadStatus.result.dateDisplay },
                        { label: "Duration", value: uploadStatus.result.duration },
                        { label: "Distance", value: uploadStatus.result.distance },
                        { label: "Avg HR", value: uploadStatus.result.avgHR ? `${uploadStatus.result.avgHR} bpm` : null },
                        { label: "Calories", value: uploadStatus.result.calories ? `${uploadStatus.result.calories} kcal` : null },
                      ].filter(f => f.value).map(f => (
                        <div key={f.label}><Label style={{ fontSize: 9, marginBottom: 2 }}>{f.label}</Label><div style={{ fontSize: 13, fontWeight: 700 }}>{f.value}</div></div>
                      ))}
                    </div>
                    <button onClick={handleSaveActivity} style={{ width: "100%", padding: "12px 0", borderRadius: 999, background: activitySaved ? C.success : C.primary, color: activitySaved ? C.successText : "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit", transition: "all 0.3s ease-in-out", boxShadow: activitySaved ? "none" : "0px 8px 24px rgba(238,79,79,0.25)" }}>{activitySaved ? "Saved" : "Save activity"}</button>
                  </>}
                </div>
              )}
            </GlassCard>
          </div>
        </>}

        {tab === "trends" && <>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Trends</div>
          <GoalJourney profile={profile} />
          <GlassCard>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, letterSpacing: "-0.01em" }}>Weight</div>
            {weightPoints.length === 0 ? (
              <div style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, padding: "12px 0" }}>No data yet. Save a Renpho measurement to track weight.</div>
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <svg width={W} height={H + 20} style={{ display: "block" }}>
                    <polyline points={wData.map((w, i) => {
                      const x = wData.length === 1 ? W / 2 : (i / (wData.length - 1)) * W;
                      const y = H - ((w - wMin) / (wMax - wMin)) * H;
                      return `${x},${y}`;
                    }).join(" ")} fill="none" stroke={C.teal} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    {wData.map((w, i) => {
                      const x = wData.length === 1 ? W / 2 : (i / (wData.length - 1)) * W;
                      const y = H - ((w - wMin) / (wMax - wMin)) * H;
                      return <circle key={i} cx={x} cy={y} r={4} fill={C.teal} />;
                    })}
                    {weightPoints.map((h, i) => {
                      const x = weightPoints.length === 1 ? W / 2 : (i / (weightPoints.length - 1)) * W;
                      return <text key={i} x={x} y={H + 16} textAnchor="middle" fontSize={9} fill={C.onSurfaceVariant} fontFamily="Plus Jakarta Sans">{new Date(h.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</text>;
                    })}
                  </svg>
                </div>
                <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                  <div><div style={{ fontSize: 44, fontWeight: 800, color: C.primary, letterSpacing: "-0.04em", lineHeight: 1 }}>{latestMeasurement?.weight != null ? formatDecimal(latestMeasurement.weight) : "—"}<span style={{ fontSize: 13, fontWeight: 500, color: C.onSurfaceVariant }}> kg</span></div><Label style={{ marginTop: 6, display: "block" }}>Today</Label></div>
                  {weightPoints.length >= 2 && (() => {
                    const change = weightPoints[weightPoints.length - 1].weight - weightPoints[0].weight;
                    const down = change < 0;
                    return (
                    <div><div style={{ fontSize: 44, fontWeight: 800, color: down ? C.teal : C.error, letterSpacing: "-0.04em", lineHeight: 1 }}>{change > 0 ? "+" : ""}{change.toFixed(1)}<span style={{ fontSize: 13, fontWeight: 500, color: C.onSurfaceVariant }}> kg</span></div><Label style={{ marginTop: 6, display: "block" }}>7 day change</Label></div>
                    );
                  })()}
                </div>
              </>
            )}
          </GlassCard>
          <div>
            <Label style={{ marginBottom: 10 }}>Weekly summary</Label>
            {!hasTrendData ? (
              <GlassCard>
                <div style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6 }}>Start logging to see trends.</div>
              </GlassCard>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Avg calories", value: weeklyStats.avgCalories > 0 ? weeklyStats.avgCalories.toLocaleString() : "—", unit: "kcal/day", color: C.primary },
                  { label: "Avg steps", value: weeklyStats.avgSteps > 0 ? weeklyStats.avgSteps.toLocaleString() : "—", unit: "steps/day", color: C.teal },
                  { label: "Dry days", value: `${weeklyStats.dryDays} / 7`, unit: "this week", color: C.successText },
                  { label: "Activities", value: String(weeklyStats.activityCount), unit: "this week", color: C.grey },
                ].map(s => (
                  <GlassCard key={s.label} style={{ padding: "14px 16px" }}>
                    <Label style={{ marginBottom: 8, display: "block" }}>{s.label}</Label>
                    <div style={{ fontSize: 44, fontWeight: 800, color: s.color, letterSpacing: "-0.04em", lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant, marginTop: 6 }}>{s.unit}</div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
          <GlassCard>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, letterSpacing: "-0.01em" }}>Alcohol</div>
            {!hasTrendData ? (
              <div style={{ fontSize: 15, color: C.onSurfaceVariant, lineHeight: 1.6 }}>Start logging to see trends.</div>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 80 }}>
                {weekHistory.map((h, i) => {
                  const barH = h.alcohol === 0 ? 8 : Math.max(12, (h.alcohol / 6) * 56);
                  const barColor = h.alcohol === 0 ? C.success : h.alcohol >= 4 ? C.primary : C.warning;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{ width: "100%", height: barH, background: barColor, borderRadius: 4, transition: "height 0.3s ease-in-out" }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant }}>{h.alcohol}u</span>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </>}

        {tab === "profile" && (
          <ProfileTab
            profile={profile}
            onProfileChange={(p) => { setProfile(p); setSyncState("dirty"); }}
            onRestoreComplete={() => setSyncState("dirty")}
          />
        )}

      </main>

      <FloatingCoachButton
        currentTab={tab}
        onOpenLog={openLogTab}
        hasLoggedToday={hasLoggedToday}
        unreadCount={coachUnread}
        onCoachReply={() => setCoachUnread(getCoachState().unreadCount)}
      />

      <nav style={FLOATING_NAV}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-label={t.id} style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 48, height: 36, borderRadius: 999, border: "none", cursor: "pointer",
            background: tab === t.id ? C.primaryLight : "transparent",
            transition: "all 0.2s ease",
          }}>
            <i className={`ti ${t.icon}`} style={{ fontSize: 24, color: tab === t.id ? C.primary : C.inactiveIcon }} />
          </button>
        ))}
      </nav>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, textarea, button { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        input, textarea { max-width: 100%; }
        input:focus, textarea:focus { border-color: #EE4F4F !important; box-shadow: 0 0 0 3px rgba(238,79,79,0.1); outline: none; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24; font-family: 'Material Symbols Outlined'; font-style: normal; display: inline-block; line-height: 1; text-transform: none; letter-spacing: normal; white-space: nowrap; }
      `}</style>
    </div>
  );
}
