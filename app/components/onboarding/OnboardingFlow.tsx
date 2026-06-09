"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { connectRenphoScale, isWebBluetoothAvailable } from "@/lib/renpho-bluetooth";
import {
  dobFromParts,
  EFFORT_LABELS,
  parseDobParts,
  snapTimeline,
  TIMELINE_OPTIONS,
  timelineLabel,
} from "@/lib/profile-helpers";
import type { PulseProfile } from "@/lib/types";
import { AUTH_THEME } from "../AuthShell";

const C = AUTH_THEME;

const ss: CSSProperties = {
  minHeight: "100vh",
  background: C.background,
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  color: C.onSurface,
  padding: "0 24px 48px",
  maxWidth: 480,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
};

function Btn({
  children,
  onClick,
  disabled,
  secondary,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
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
        background: disabled ? C.outlineVariant : secondary ? "transparent" : C.primary,
        color: secondary ? C.primary : "#fff",
        border: secondary ? `1.5px solid ${C.primary}` : "none",
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled || secondary ? "none" : `0 6px 20px ${C.primary}28`,
      }}
    >
      {children}
    </button>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ height: 4, background: C.outlineVariant, borderRadius: 2, marginBottom: 32, overflow: "hidden" }}>
      <div style={{ width: `${(step / total) * 100}%`, height: "100%", background: C.primary, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

interface OnboardingFlowProps {
  onComplete: (profile: PulseProfile) => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Lewis"); // DEBUG
  const dobParts = parseDobParts("");
  const [day, setDay] = useState(dobParts.day);
  const [month, setMonth] = useState(dobParts.month);
  const [year, setYear] = useState(1990);
  const [sex, setSex] = useState<"Male" | "Female" | "">("");
  const [currentSituation, setCurrentSituation] = useState("");
  const [goal, setGoal] = useState("");
  const [timeline, setTimeline] = useState(6);
  const [effortLevel, setEffortLevel] = useState<1 | 2 | 3 | 4>(2);
  const [scaleStatus, setScaleStatus] = useState("idle");
  const [scaleDone, setScaleDone] = useState(false);
  const [measurement, setMeasurement] = useState<PulseProfile["latestMeasurement"]>();

  const TOTAL = 5;
  const years = Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 15 - i);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const finish = (meas?: PulseProfile["latestMeasurement"]) => {
    const profile: PulseProfile = {
      name: name.trim(),
      dateOfBirth: dobFromParts(Math.min(day, daysInMonth), month, year),
      sex: sex || "Male",
      currentSituation: currentSituation.trim(),
      goal: goal.trim(),
      timeline: snapTimeline(timeline),
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
    await connectRenphoScale({
      userProfile: { sex: sex || "Male", age: "34", height: "180" },
      calcBIA: (w, z, age, h, male) => {
        const bmi = w / ((h / 100) ** 2);
        let bf = male ? 1.2 * bmi + 0.23 * age - 16.2 : 1.2 * bmi + 0.23 * age - 5.4;
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
      <div style={{ ...ss, paddingTop: 56 }}>
        <ProgressBar step={1} total={TOTAL} />
        <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>About you</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>What should we call you?</h1>
        <p style={{ fontSize: 14, color: C.onSurfaceVariant, marginBottom: 28 }}>Just your first name.</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lewis"
          style={{
            width: "100%", padding: "16px 18px", borderRadius: 14, boxSizing: "border-box",
            border: `2px solid ${name ? C.primary : C.outlineVariant}`, background: C.surface,
            fontSize: 16, fontFamily: "inherit", outline: "none", marginBottom: "auto",
          }}
        />
        <div style={{ marginTop: 32 }}>
          <Btn onClick={() => setStep(1)} disabled={!name.trim()}>Continue</Btn>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div style={{ ...ss, paddingTop: 56 }}>
        <ProgressBar step={2} total={TOTAL} />
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>A couple of quick ones</h1>
        <p style={{ fontSize: 14, color: C.onSurfaceVariant, marginBottom: 24 }}>Needed for body composition calculations. Nothing else.</p>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant, marginBottom: 8 }}>Date of birth</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 8, marginBottom: 24, minWidth: 0 }}>
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} style={{ padding: "12px 8px", borderRadius: 12, border: `1.5px solid ${C.outlineVariant}`, fontFamily: "inherit", fontSize: 14, minWidth: 0 }}>
            {days.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ padding: "12px 8px", borderRadius: 12, border: `1.5px solid ${C.outlineVariant}`, fontFamily: "inherit", fontSize: 14, minWidth: 0 }}>
            {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ padding: "12px 8px", borderRadius: 12, border: `1.5px solid ${C.outlineVariant}`, fontFamily: "inherit", fontSize: 14, minWidth: 0 }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant, marginBottom: 8 }}>Sex</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "auto" }}>
          {(["Male", "Female"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSex(opt)}
              style={{
                padding: "16px 20px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
                border: `2px solid ${sex === opt ? C.primary : C.outlineVariant}`,
                background: sex === opt ? `${C.primary}10` : C.surface,
                fontSize: 16, fontWeight: 700, color: sex === opt ? C.primary : C.onSurface, textAlign: "left",
              }}
            >
              {opt}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 24 }}>
          <Btn onClick={() => setStep(2)} disabled={!sex}>Continue</Btn>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div style={{ ...ss, paddingTop: 56 }}>
        <ProgressBar step={3} total={TOTAL} />
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>Tell me about yourself</h1>
        <p style={{ fontSize: 14, color: C.onSurfaceVariant, marginBottom: 20, lineHeight: 1.6 }}>
          Where are you at right now — your body, your health, your lifestyle. Be as honest as you want. Nobody else sees this.
        </p>
        <textarea
          value={currentSituation}
          onChange={(e) => setCurrentSituation(e.target.value)}
          placeholder="e.g. I'm about 85kg, probably carrying too much around my stomach. I drink most weekends, don't sleep great, play football on Sundays. Work is stressful. Not been to a gym in years but I'm fairly active day to day..."
          rows={8}
          style={{
            width: "100%", minHeight: 160, padding: "16px 18px", borderRadius: 14, boxSizing: "border-box",
            border: `2px solid ${currentSituation.length >= 20 ? C.primary : C.outlineVariant}`,
            background: C.surface, fontSize: 14, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", outline: "none",
            marginBottom: 16,
          }}
        />
        <Btn onClick={() => setStep(3)} disabled={currentSituation.trim().length < 20}>Continue</Btn>
        <button type="button" onClick={() => { setCurrentSituation(""); setStep(3); }} style={{ marginTop: 12, background: "none", border: "none", color: C.onSurfaceVariant, fontSize: 12, fontFamily: "inherit", cursor: "pointer", width: "100%", textAlign: "center" }}>
          Skip for now
        </button>
      </div>
    );
  }

  if (step === 3) {
    const effortColor = (level: number) => {
      const t = (level - 1) / 3;
      const r = Math.round(26 + (52 - 26) * t);
      const g = Math.round(115 + (168 - 115) * t);
      const b = Math.round(232 + (83 - 232) * t);
      return `rgb(${r},${g},${b})`;
    };

    return (
      <div style={{ ...ss, paddingTop: 56 }}>
        <ProgressBar step={4} total={TOTAL} />
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>Where do you want to get to?</h1>
        <p style={{ fontSize: 14, color: C.onSurfaceVariant, marginBottom: 20 }}>Be specific if you can. Vague goals get vague results.</p>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Want to get leaner, maybe 10% body fat. Want to last the full 90 minutes on the pitch..."
          rows={5}
          style={{
            width: "100%", padding: "16px 18px", borderRadius: 14, boxSizing: "border-box",
            border: `2px solid ${goal.trim() ? C.primary : C.outlineVariant}`,
            background: C.surface, fontSize: 14, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", outline: "none", marginBottom: 24,
          }}
        />
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurfaceVariant, marginBottom: 8 }}>How long are you giving this?</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, marginBottom: 8 }}>{timelineLabel(snapTimeline(timeline))}</div>
          <input
            type="range"
            min={1}
            max={18}
            value={timeline}
            onChange={(e) => setTimeline(Number(e.target.value))}
            onMouseUp={() => setTimeline(snapTimeline(timeline))}
            onTouchEnd={() => setTimeline(snapTimeline(timeline))}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.onSurfaceVariant, marginBottom: 8 }}>How hard are you willing to work?</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: effortColor(effortLevel), marginBottom: 8 }}>{EFFORT_LABELS[effortLevel]}</div>
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={effortLevel}
            onChange={(e) => setEffortLevel(Number(e.target.value) as 1 | 2 | 3 | 4)}
            style={{ width: "100%", accentColor: effortColor(effortLevel) }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.onSurfaceVariant, marginTop: 4 }}>
            <span>1</span><span>2</span><span>3</span><span>4</span>
          </div>
        </div>
        <Btn onClick={() => setStep(4)} disabled={!goal.trim()}>Continue</Btn>
      </div>
    );
  }

  return (
    <div style={{ ...ss, paddingTop: 56, justifyContent: "center", textAlign: "center" }}>
      <ProgressBar step={5} total={TOTAL} />
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>Want to grab your measurements?</h1>
      <p style={{ fontSize: 14, color: C.onSurfaceVariant, marginBottom: 32, lineHeight: 1.6 }}>
        Connect your Renpho scale and it&apos;ll pull your weight, body fat, and muscle mass automatically. Takes about 30 seconds.
      </p>
      {scaleDone ? (
        <div style={{ padding: 20, background: `${C.secondary}12`, borderRadius: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.secondary }}>Reading complete</div>
          {measurement?.weight && <div style={{ fontSize: 13, color: C.onSurfaceVariant, marginTop: 6 }}>{measurement.weight}kg logged</div>}
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
        <button type="button" onClick={() => finish()} style={{ marginTop: 20, background: "none", border: "none", color: C.onSurfaceVariant, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
          Skip for now — I&apos;ll add them manually
        </button>
      )}
    </div>
  );
}
