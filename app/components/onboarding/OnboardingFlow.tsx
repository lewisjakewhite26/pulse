"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { connectRenphoScale, isWebBluetoothAvailable } from "@/lib/renpho-bluetooth";
import {
  ageFromDateOfBirth,
  dobFromParts,
  EFFORT_LABELS,
  parseDobParts,
  timelineLabel,
} from "@/lib/profile-helpers";
import { debugSkipOnboarding } from "@/lib/dev-shortcuts";
import type { PulseProfile } from "@/lib/types";
import { AUTH_THEME } from "../AuthShell";

const C = AUTH_THEME;

const screenBase: CSSProperties = {
  minHeight: "100dvh",
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  color: C.onSurface,
  padding: "0 24px calc(32px + env(safe-area-inset-bottom))",
  maxWidth: 480,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = {
  padding: "14px 12px",
  borderRadius: 12,
  border: `1.5px solid ${C.outline}`,
  background: "rgba(255,255,255,0.7)",
  backdropFilter: "blur(15px)",
  fontFamily: "inherit",
  fontSize: 14,
  color: C.onSurface,
  minWidth: 0,
  width: "100%",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%236B7280' d='M1 1l5 5 5-5'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: 32,
};

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "14px 0",
        borderRadius: 999,
        background: disabled ? C.outlineVariant : C.primary,
        color: "#fff",
        border: "none",
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0px 8px 24px rgba(238, 79, 79, 0.25)",
        transition: "all 0.2s ease",
      }}
    >
      {children}
    </button>
  );
}

function ProgressPills({ step }: { step: 1 | 2 }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 28 }}>
      {[1, 2].map((n) => (
        <div
          key={n}
          style={{
            width: n <= step ? 24 : 8,
            height: 6,
            borderRadius: 999,
            background: n <= step ? C.primary : C.outline,
            transition: "width 0.3s ease, background 0.2s ease",
          }}
        />
      ))}
    </div>
  );
}

interface OnboardingFlowProps {
  onComplete: (profile: PulseProfile) => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Lewis"); // DEBUG — remove before shipping
  const dobParts = parseDobParts("");
  const [day, setDay] = useState(dobParts.day);
  const [month, setMonth] = useState(dobParts.month);
  const [year, setYear] = useState(1990);
  const [sex, setSex] = useState<"Male" | "Female" | "">("");
  const [goal, setGoal] = useState("");
  const [timeline, setTimeline] = useState(6);
  const [effortLevel, setEffortLevel] = useState<1 | 2 | 3 | 4>(2);
  const [scaleStatus, setScaleStatus] = useState("idle");
  const [scaleDone, setScaleDone] = useState(false);
  const [measurement, setMeasurement] = useState<PulseProfile["latestMeasurement"]>();

  const years = Array.from({ length: 61 }, (_, i) => 2010 - i);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const basicsComplete = name.trim() && sex && day && month && year;

  const finish = (meas?: PulseProfile["latestMeasurement"]) => {
    const profile: PulseProfile = {
      name: name.trim(),
      dateOfBirth: dobFromParts(Math.min(day, daysInMonth), month, year),
      sex: sex || "Male",
      currentSituation: "",
      goal: goal.trim(),
      timeline,
      effortLevel,
      extracted: {},
      learned: {},
      targets: { calculated: false },
      latestMeasurement: meas ?? measurement,
    };
    onComplete(profile);
  };

  const connectScale = async () => {
    if (!isWebBluetoothAvailable()) {
      setScaleStatus("unsupported");
      return;
    }
    setScaleStatus("scanning");
    const age = ageFromDateOfBirth(dobFromParts(day, month, year)) ?? 30;
    await connectRenphoScale({
      userProfile: { sex: sex || "Male", age: String(age), height: "175" },
      calcBIA: (w, _z, a, h, male) => {
        const bmi = w / ((h / 100) ** 2);
        let bf = male ? 1.2 * bmi + 0.23 * a - 16.2 : 1.2 * bmi + 0.23 * a - 5.4;
        bf = Math.max(3, Math.min(60, bf));
        return { bodyFat: bf.toFixed(1), muscleMass: (w * 0.45).toFixed(1) };
      },
      onStatus: setScaleStatus,
      onError: () => setScaleStatus("error"),
      onReading: ({ weight, composition }) => {
        const m = {
          weight: Math.round(weight * 100) / 100,
          bodyFat: parseFloat(String(composition.bodyFat ?? "")),
          muscleMass: parseFloat(String(composition.muscleMass ?? "")),
          date: new Date().toISOString(),
        };
        setMeasurement(m);
        setScaleDone(true);
        setScaleStatus("done");
        setTimeout(() => finish(m), 1200);
      },
    });
  };

  if (step === 0) {
    return (
      <div className="pulse-canvas" style={{ ...screenBase, justifyContent: "flex-start", paddingTop: "calc(24px + env(safe-area-inset-top))" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.primary, letterSpacing: "-0.03em" }}>Pulse</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8, textAlign: "center" }}>
            First, a couple of quick ones.
          </h1>
          <p style={{ fontSize: 14, color: C.onSurfaceVariant, marginBottom: 32, lineHeight: 1.6, textAlign: "center" }}>
            Needed for body composition calculations. Nothing else.
          </p>

          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant, marginBottom: 8 }}>
            Name
          </div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lewis"
            style={{
              width: "100%", padding: "16px 18px", borderRadius: 16, boxSizing: "border-box",
              border: `1.5px solid ${name.trim() ? C.primary : C.outline}`,
              background: "rgba(255,255,255,0.7)", backdropFilter: "blur(15px)",
              fontSize: 18, fontWeight: 600, fontFamily: "inherit", outline: "none", marginBottom: 24,
            }}
          />

          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant, marginBottom: 8 }}>
            Date of birth
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 8, marginBottom: 24, minWidth: 0 }}>
            <select value={day} onChange={(e) => setDay(Number(e.target.value))} style={selectStyle} aria-label="Day">
              {days.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={selectStyle} aria-label="Month">
              {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle} aria-label="Year">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant, marginBottom: 8 }}>
            Sex
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {(["Male", "Female"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSex(opt)}
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  borderRadius: 14,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 16,
                  fontWeight: 700,
                  border: sex === opt ? "none" : `1.5px solid ${C.outline}`,
                  background: sex === opt ? C.primary : "rgba(255,255,255,0.7)",
                  backdropFilter: "blur(15px)",
                  color: sex === opt ? "#fff" : C.onSurface,
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <Btn onClick={() => setStep(1)} disabled={!basicsComplete}>Continue</Btn>
        {/* DEBUG — remove before shipping */}
        <button
          type="button"
          onClick={debugSkipOnboarding}
          style={{ marginTop: 12, background: "none", border: "none", color: C.onSurfaceVariant, fontSize: 11, fontFamily: "inherit", cursor: "pointer", textDecoration: "underline", width: "100%", textAlign: "center" }}
        >
          Dev: skip onboarding
        </button>
      </div>
    );
  }

  if (step === 1) {
    const effortPct = ((effortLevel - 1) / 3) * 100;

    return (
      <div className="pulse-canvas" style={{ ...screenBase, paddingTop: 48 }}>
        <ProgressPills step={1} />
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
          Where do you want to get to?
        </h1>
        <p style={{ fontSize: 14, color: C.onSurfaceVariant, marginBottom: 20, lineHeight: 1.6 }}>
          Be specific if you can. The more honest you are, the better this works.
        </p>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Want to get leaner, maybe 10% body fat. Want to last the full 90 minutes on the pitch. Would be good to see some definition. Not trying to become an athlete, just want to feel better and look better..."
          rows={5}
          style={{
            width: "100%", minHeight: 140, padding: "16px 18px", borderRadius: 14, boxSizing: "border-box",
            border: `2px solid ${goal.trim().length >= 20 ? C.primary : C.outlineVariant}`,
            background: C.surface, fontSize: 14, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", outline: "none", marginBottom: 24,
          }}
        />
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurfaceVariant, marginBottom: 8 }}>How long are you giving this?</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, marginBottom: 8 }}>{timelineLabel(timeline)}</div>
          <input
            type="range"
            min={1}
            max={18}
            step={1}
            value={timeline}
            onChange={(e) => setTimeline(Number(e.target.value))}
            style={{ width: "100%", accentColor: C.primary }}
          />
        </div>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurfaceVariant, marginBottom: 8 }}>How hard are you willing to work?</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, marginBottom: 8 }}>{EFFORT_LABELS[effortLevel]}</div>
          <div style={{ position: "relative", height: 28, display: "flex", alignItems: "center" }}>
            <div style={{ position: "absolute", left: 0, right: 0, height: 6, borderRadius: 999, background: C.outlineVariant }} />
            <div style={{ position: "absolute", left: 0, width: `${effortPct}%`, height: 6, borderRadius: 999, background: C.primary, transition: "width 0.15s" }} />
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              value={effortLevel}
              onChange={(e) => setEffortLevel(Number(e.target.value) as 1 | 2 | 3 | 4)}
              style={{ width: "100%", position: "relative", zIndex: 1, background: "transparent", accentColor: C.primary }}
            />
          </div>
        </div>
        <Btn onClick={() => setStep(2)} disabled={goal.trim().length < 20}>Continue</Btn>
      </div>
    );
  }

  return (
    <div className="pulse-canvas" style={{ ...screenBase, paddingTop: 48, justifyContent: "center", textAlign: "center" }}>
      <ProgressPills step={2} />
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>Want to grab your measurements?</h1>
      <p style={{ fontSize: 15, color: C.onSurfaceVariant, marginBottom: 32, lineHeight: 1.6 }}>
        Connect your Renpho scale and it pulls your weight, body fat, and muscle mass automatically. Takes about 30 seconds.
      </p>
      {scaleDone ? (
        <div style={{ padding: 20, background: C.success, borderRadius: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.successText }}>Reading complete</div>
          {measurement?.weight && <div style={{ fontSize: 13, color: C.successText, marginTop: 6, opacity: 0.85 }}>{measurement.weight}kg logged</div>}
        </div>
      ) : (
        <>
          <Btn onClick={connectScale} disabled={scaleStatus === "scanning" || scaleStatus === "reading"}>
            {scaleStatus === "scanning" || scaleStatus === "reading" ? "Connecting..." : "Connect Renpho scale"}
          </Btn>
          {scaleStatus === "unsupported" && (
            <p style={{ fontSize: 12, color: C.error, marginTop: 12 }}>Web Bluetooth not available. Use Chrome on Android.</p>
          )}
        </>
      )}
      {!scaleDone && (
        <button type="button" onClick={() => finish()} style={{ marginTop: 20, background: "none", border: "none", color: C.onSurfaceVariant, fontSize: 15, fontFamily: "inherit", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
          Skip for now
        </button>
      )}
    </div>
  );
}
