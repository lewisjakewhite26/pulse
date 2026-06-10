"use client";

import { useState } from "react";
import type { PulseProfile, ParsedBackupFile } from "@/lib/types";
import {
  ageFromDateOfBirth,
  effortSummary,
} from "@/lib/profile-helpers";
import {
  exportAllData,
  isDefaultPin,
  parseBackupFile,
  restoreFromBackup,
  saveProfile,
  updateAccountPin,
} from "@/lib/storage";
import { AUTH_THEME, GLASS_CARD } from "@/lib/design-tokens";

const C = AUTH_THEME;

function GlassCard({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      ...GLASS_CARD,
      padding: "14px 16px",
      maxWidth: "100%", minWidth: 0, overflow: "hidden", ...style,
    }}>
      {children}
    </div>
  );
}

function Row({ label, value, source }: { label: string; value?: string | number; source?: string }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 10, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 14, color: C.onSurface, marginTop: 2, wordBreak: "break-word" }}>{value}</div>
      {source && <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginTop: 2, fontStyle: "italic" }}>{source}</div>}
    </div>
  );
}

interface ProfileTabProps {
  profile: PulseProfile;
  onProfileChange: (p: PulseProfile) => void;
  onRestoreComplete?: () => void;
}

export default function ProfileTab({ profile, onProfileChange, onRestoreComplete }: ProfileTabProps) {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(profile.goal);
  const [restorePending, setRestorePending] = useState<ParsedBackupFile | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [showPinChange, setShowPinChange] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaved, setPinSaved] = useState(false);
  const age = ageFromDateOfBirth(profile.dateOfBirth);
  const ex = profile.extracted;
  const learned = profile.learned;
  const t = profile.targets;

  const handleBackupRestore = async (file: File) => {
    try {
      const backup = await parseBackupFile(file);
      setRestorePending(backup);
      setRestoreError(null);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Could not read backup");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Profile</div>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: C.onSurfaceVariant, marginTop: 6 }}>Pulse learns about you as you go. Tap anything to edit.</div>
      </div>

      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-user" style={{ fontSize: 20, color: C.primary }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: C.primary }}>You</div>
          </div>
          <i className="ti ti-pencil" style={{ fontSize: 16, color: C.onSurfaceVariant }} />
        </div>
        <Row label="Name" value={profile.name} />
        <Row label="Age" value={age ? `${age} years` : undefined} source="from date of birth" />
        <Row label="Sex" value={profile.sex} />
      </GlassCard>

      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.teal }}>Your goal</div>
          <button type="button" onClick={() => setEditingGoal(!editingGoal)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <i className="ti ti-pencil" style={{ fontSize: 16, color: C.onSurfaceVariant }} />
          </button>
        </div>
        {editingGoal ? (
          <>
            <textarea value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)} rows={4} style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12, border: `1.5px solid ${C.outlineVariant}`, fontFamily: "inherit", fontSize: 14, marginBottom: 10 }} />
            <button type="button" onClick={() => { const next = { ...profile, goal: goalDraft }; saveProfile(next); onProfileChange(next); setEditingGoal(false); }} style={{ padding: "8px 16px", borderRadius: 999, background: C.primary, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>Save goal</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: C.onSurface, marginBottom: 10, wordBreak: "break-word" }}>{profile.goal || "Not set yet."}</p>
            <div style={{ fontSize: 12, color: C.onSurfaceVariant }}>{effortSummary(profile.timeline, profile.effortLevel)}</div>
          </>
        )}
      </GlassCard>

      {isDefaultPin() && !showPinChange && (
        <GlassCard style={{ borderLeft: `4px solid ${C.amber}` }}>
          <p style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, marginBottom: 10 }}>
            You&apos;re using the default PIN (0000). Change it in settings.
          </p>
          <button
            type="button"
            onClick={() => setShowPinChange(true)}
            style={{ background: "none", border: "none", color: C.primary, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", padding: 0 }}
          >
            Change PIN
          </button>
        </GlassCard>
      )}

      {showPinChange && (
        <GlassCard>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Change PIN</div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="New PIN"
            style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12, border: `1.5px solid ${C.outlineVariant}`, fontFamily: "inherit", fontSize: 14, marginBottom: 10 }}
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="Confirm PIN"
            style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12, border: `1.5px solid ${C.outlineVariant}`, fontFamily: "inherit", fontSize: 14, marginBottom: 10 }}
          />
          {pinError && <div style={{ fontSize: 12, color: C.error, marginBottom: 10 }}>{pinError}</div>}
          {pinSaved && <div style={{ fontSize: 12, color: C.secondary, marginBottom: 10 }}>PIN updated.</div>}
          <button
            type="button"
            onClick={() => {
              setPinError(null);
              if (newPin.length !== 4) {
                setPinError("PIN must be 4 digits.");
                return;
              }
              if (newPin !== confirmPin) {
                setPinError("PINs don't match.");
                return;
              }
              if (updateAccountPin(newPin)) {
                setPinSaved(true);
                setNewPin("");
                setConfirmPin("");
                setTimeout(() => { setShowPinChange(false); setPinSaved(false); }, 1500);
              } else {
                setPinError("Could not update PIN.");
              }
            }}
            style={{ padding: "10px 20px", borderRadius: 999, background: C.primary, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
          >
            Save PIN
          </button>
        </GlassCard>
      )}

      <GlassCard>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: C.onSurfaceVariant }}>What Pulse knows</div>
        <Row label="Weight" value={profile.latestMeasurement?.weight ? `${profile.latestMeasurement.weight} kg` : ex.currentWeight ? `${ex.currentWeight} kg` : undefined} source={profile.latestMeasurement ? "from your scale" : "you mentioned this"} />
        <Row label="Body fat" value={profile.latestMeasurement?.bodyFat ? `${profile.latestMeasurement.bodyFat}%` : ex.currentBodyFat ? `${ex.currentBodyFat}%` : undefined} source={profile.latestMeasurement ? "from your scale" : "you mentioned this"} />
        <Row label="Sport" value={ex.sport} source="you mentioned this" />
        <Row label="Drinking" value={ex.drinkingHabit || learned.alcoholPattern} source={learned.alcoholPattern ? "noticed from your logs" : "you mentioned this"} />
        <Row label="Usual lunch" value={learned.usualLunch || ex.typicalMeals?.lunch} source={learned.usualLunch ? "noticed from your logs" : "you mentioned this"} />
        <Row label="Medication" value={ex.medication?.join(", ") || learned.medicationMentioned?.join(", ")} source={learned.medicationMentioned?.length ? "noticed from your logs" : "you mentioned this"} />
        {learned.patterns?.map((p) => <Row key={p} label="Pattern" value={p} source="noticed from your logs" />)}
      </GlassCard>

      <GlassCard>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: C.primary }}>Targets</div>
        {t.calculated && t.calories ? (
          <>
            <Row label="Calories" value={`${t.calories} kcal/day`} />
            <Row label="Protein" value={t.protein_g ? `${t.protein_g}g` : undefined} />
            <Row label="Water" value={t.water_ml ? `${t.water_ml}ml` : undefined} />
          </>
        ) : (
          <p style={{ fontSize: 15, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
            Your coach will suggest targets after a few days of logging.{" "}
            <button type="button" style={{ background: "none", border: "none", color: C.primary, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>Set manually</button>
          </p>
        )}
      </GlassCard>

      <GlassCard>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.onSurfaceVariant }}>backup</span>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.onSurfaceVariant }}>Backups</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" onClick={() => exportAllData()} style={{ width: "100%", padding: "14px 16px", borderRadius: 999, background: C.primary, color: "#fff", border: "none", cursor: "pointer", fontSize: 18, fontWeight: 700, fontFamily: "inherit", boxSizing: "border-box", boxShadow: "0px 8px 24px rgba(238,79,79,0.25)" }}>
            Download today&apos;s backup
          </button>
          <label style={{ width: "100%", padding: "14px 16px", borderRadius: 999, background: "rgba(255,255,255,0.7)", backdropFilter: "blur(15px)", color: C.onSurface, border: `1.5px solid ${C.glassBorder}`, cursor: "pointer", fontSize: 15, fontWeight: 600, fontFamily: "inherit", textAlign: "center", boxSizing: "border-box", display: "block" }}>
            Restore from backup
            <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleBackupRestore(f); e.target.value = ""; }} style={{ display: "none" }} />
          </label>
          {restoreError && <div style={{ fontSize: 12, color: C.error }}>{restoreError}</div>}
          {restorePending && (
            <div style={{ padding: 14, borderRadius: 14, borderLeft: `4px solid ${C.amber}`, background: "rgba(255,255,255,0.7)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Restore backup from {restorePending.backupDate}?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button type="button" onClick={() => { restoreFromBackup(restorePending); onRestoreComplete?.(); window.location.reload(); }} style={{ padding: "10px", borderRadius: 999, background: C.primary, color: "#fff", border: "none", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>Confirm restore</button>
                <button type="button" onClick={() => setRestorePending(null)} style={{ padding: "10px", borderRadius: 999, background: "transparent", border: `1px solid ${C.outlineVariant}`, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.5 }}>One backup is saved per day. Restoring replaces all data but keeps your account and PIN.</div>
        </div>
      </GlassCard>
    </div>
  );
}
