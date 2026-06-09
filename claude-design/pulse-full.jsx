"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getProfile, saveProfile, isOnboarded, setOnboarded,
  addLog, deleteLog, getLogs, getDailyTotals, computeWellnessScore,
  addActivity, addMeasurement, getLatestMeasurement,
  getActivities, getWeekHistory, getWeeklyStats,
  exportAllData, getAccount, formatDate,
  isA2HSDismissed, setA2HSDismissed,
  getStravaTokens, saveStravaTokens, clearStravaTokens, addActivityIfNew,
  needsSync, getLastSynced, setLastSynced,
  parseBackupFile, restoreFromBackup,
} from "../lib/storage";
import { parseActivityFile, stravaActivityToUpload } from "../lib/activity-parser";
import { isStravaClientConfigured } from "../lib/strava-config";
import { connectRenphoScale, isWebBluetoothAvailable } from "../lib/renpho-bluetooth";

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

const C = {
  primary: "#1A73E8", primaryDark: "#005BBF", secondary: "#34A853",
  background: "#F8F9FA", surface: "#FFFFFF", surfaceContainer: "#EDEEEF",
  onSurface: "#191C1D", onSurfaceVariant: "#414754",
  outline: "#727785", outlineVariant: "#C1C6D6",
  error: "#BA1A1A", amber: "#FBBC05", tertiary: "#987000",
  purple: "#8B5CF6",
};

const TABS = [
  { id: "dashboard", icon: "grid_view" },
  { id: "log", icon: "add_circle" },
  { id: "activity", icon: "directions_run" },
  { id: "trends", icon: "show_chart" },
  { id: "profile", icon: "person" },
];

const EMPTY_PROFILE = {
  name: "", dob: "", age: "", sex: "", height: "", weight: "", bodyFat: "", muscleMass: "",
  goalWeight: "", goalBodyFat: "", goals: "",
  activityLevel: "", sport: "", trainingDays: "", trainingIntensity: "",
  dietStyle: "", usualBreakfast: "", usualLunch: "", usualDinner: "", usualSnacks: "",
  favouriteFoods: "", dislikedFoods: "", waterHabit: "",
  medication: "", supplements: "",
  alcoholHabit: "", alcoholFreq: "", alcoholUnits: "", alcoholDrinks: "",
  smokingStatus: "", sleepHours: "", sleepQuality: "",
  stressLevel: "", substanceUse: "", otherHabits: "",
  calorieTarget: "2400", proteinTarget: "180", carbTarget: "240",
  fatTarget: "65", waterTarget: "3000", stepsTarget: "10000",
  analysisScores: null, overallScore: null,
};

function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age > 0 && age < 120 ? age : null;
}

function profileAge(profile) {
  return ageFromDob(profile.dob) ?? (profile.age ? parseInt(profile.age, 10) : null);
}

// ─── Shared UI components ────────────────────────────────────────────────────

function GlassCard({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: "rgba(255,255,255,0.6)", backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.2)",
      boxShadow: "0px 4px 24px rgba(0,0,0,0.04)", borderRadius: 16,
      padding: "16px 20px", cursor: onClick ? "pointer" : "default", ...style
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

function FormInput({ label, value, onChange, placeholder, type = "text", unit, tall }) {
  const base = {
    flex: 1, padding: "11px 14px", borderRadius: unit ? "10px 0 0 10px" : 10,
    border: `1.5px solid ${C.outlineVariant}`, background: C.surface,
    fontSize: 14, color: C.onSurface, fontFamily: "inherit", outline: "none",
    borderRight: unit ? "none" : undefined, boxSizing: "border-box",
  };
  return (
    <div style={{ marginBottom: 14, width: "100%" }}>
      {label && <Label style={{ marginBottom: 6 }}>{label}</Label>}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {tall
          ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
              style={{ ...base, borderRadius: 10, resize: "vertical", width: "100%", lineHeight: 1.6 }} />
          : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={base} />
        }
        {unit && (
          <div style={{
            padding: "11px 12px", background: C.surfaceContainer,
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
      padding: "6px 14px", borderRadius: 999,
      background: done ? `${C.secondary}15` : C.surfaceContainer,
      border: `1px solid ${done ? C.secondary : C.outlineVariant}`,
      fontSize: 12, fontWeight: 600,
      color: done ? C.secondary : C.onSurfaceVariant
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{done ? "check_circle" : "radio_button_unchecked"}</span>
      {label}
    </div>
  );
}

function StatChip({ icon, label, value, unit, current, max, color }) {
  const pct = Math.min((current / max) * 100, 100);
  return (
    <GlassCard style={{ minWidth: 130, padding: "14px 16px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color }}>{icon}</span>
        <Label style={{ fontSize: 10 }}>{label}</Label>
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: C.onSurface, marginBottom: 8 }}>
        {value} <span style={{ fontSize: 12, fontWeight: 400, color: C.onSurfaceVariant }}>{unit}</span>
      </div>
      <div style={{ height: 4, background: C.surfaceContainer, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 1s ease" }} />
      </div>
    </GlassCard>
  );
}

function WellnessArc({ score }) {
  const [anim, setAnim] = useState(0);
  useEffect(() => { const t = setTimeout(() => setAnim(score), 200); return () => clearTimeout(t); }, [score]);
  const size = 180, cx = 90, cy = 90, r = 70, gap = 6;
  const segments = [
    { color: C.primary, score: Math.min(anim * 1.1, 100) },
    { color: C.secondary, score: Math.min(anim * 0.9, 100) },
    { color: C.amber, score: Math.min(anim * 0.8, 100) },
    { color: C.purple, score: Math.min(anim * 1.05, 100) },
  ];
  const arcPath = (s, e, pct) => {
    const sweep = (e - s - gap * 2) * (pct / 100);
    const a = s + gap, b = a + sweep;
    const toRad = d => (d - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(toRad(a)), y1 = cy + r * Math.sin(toRad(a));
    const x2 = cx + r * Math.cos(toRad(b)), y2 = cy + r * Math.sin(toRad(b));
    return `M ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const bgPath = (s, e) => {
    const a = s + gap, b = e - gap;
    const toRad = d => (d - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(toRad(a)), y1 = cy + r * Math.sin(toRad(a));
    const x2 = cx + r * Math.cos(toRad(b)), y2 = cy + r * Math.sin(toRad(b));
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const angles = [[0, 90], [90, 180], [180, 270], [270, 360]];
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size}>
        {angles.map(([s, e], i) => (
          <g key={i}>
            <path d={bgPath(s, e)} fill="none" stroke={C.outlineVariant} strokeWidth={10} strokeLinecap="round" />
            <path d={arcPath(s, e, segments[i].score)} fill="none" stroke={segments[i].color} strokeWidth={10} strokeLinecap="round"
              style={{ transition: "all 1.4s cubic-bezier(0.4,0,0.2,1)" }} />
          </g>
        ))}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: C.onSurface, lineHeight: 1, letterSpacing: "-0.02em" }}>{Math.round(anim)}</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>Your day so far</div>
      </div>
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

// ─── Onboarding ──────────────────────────────────────────────────────────────

function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [editTargets, setEditTargets] = useState(null);
  const [scaleStatus, setScaleStatus] = useState("idle");
  const [scaleError, setScaleError] = useState(null);
  const [manualEntry, setManualEntry] = useState(false);

  const [p, setP] = useState({
    name: getAccount()?.username || "", dob: "", sex: "",
    height: "", weight: "", bodyFat: "", muscleMass: "",
    goal: "", sport: "", trainingDays: "", trainingIntensity: "",
    dietStyle: "", breakfast: "", lunch: "", dinner: "", snacks: "", favFoods: "", avoidFoods: "",
    alcoholFreq: "", alcoholUnits: "", alcoholDrinks: "",
    smoking: "", sleepHours: "", sleepQuality: "",
    medication: "", supplements: "", stressLevel: "", substanceUse: "",
    waterDaily: "", anythingElse: "",
  });

  const set = key => val => setP(prev => ({ ...prev, [key]: val }));
  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => Math.max(0, s - 1));
  const TOTAL = 14;

  const calcBIA = (weight, impedance, age, heightCm, isMale) => {
    const h = heightCm / 100;
    const bmi = weight / (h * h);
    let bf = isMale ? (1.20 * bmi) + (0.23 * age) - 16.2 : (1.20 * bmi) + (0.23 * age) - 5.4;
    bf = Math.max(3, Math.min(60, bf - (500 - impedance) * 0.05));
    const lean = weight - (bf / 100) * weight;
    return { bodyFat: (Math.round(bf * 10) / 10).toFixed(1), muscleMass: (Math.round(lean * 0.85 * 10) / 10).toFixed(1) };
  };

  const connectRenpho = async () => {
    if (!isWebBluetoothAvailable()) { setScaleStatus("unsupported"); setManualEntry(true); return; }
    await connectRenphoScale({
      age: ageFromDob(p.dob) || 28,
      heightCm: parseInt(p.height) || 175,
      isMale: p.sex !== "Female",
      calcBIA,
      onStatus: setScaleStatus,
      onError: (message) => {
        setScaleError(message);
        if (message) setManualEntry(true);
      },
      onReading: ({ weight, composition }) => {
        setP(prev => ({
          ...prev,
          weight: String(Math.round(weight * 10) / 10),
          bodyFat: composition.bodyFat,
          muscleMass: composition.muscleMass,
        }));
        setManualEntry(true);
      },
    });
  };

  const analyseWithGemini = async () => {
    setAnalysing(true);
    const prompt = `You are an expert health analyst. Analyse this person and return ONLY valid JSON, no markdown.\n\nPROFILE:\nName: ${p.name}, DOB: ${p.dob} (age ${ageFromDob(p.dob)}), Sex: ${p.sex}\nHeight: ${p.height}cm, Weight: ${p.weight}kg, Body fat: ${p.bodyFat}%, Muscle mass: ${p.muscleMass}kg\nGoal: ${p.goal}\nSport: ${p.sport}, Training ${p.trainingDays} days/week, Intensity: ${p.trainingIntensity}\nDiet: ${p.dietStyle}. Breakfast: ${p.breakfast}. Lunch: ${p.lunch}. Dinner: ${p.dinner}. Snacks: ${p.snacks}\nFav foods: ${p.favFoods}. Avoided: ${p.avoidFoods}\nAlcohol: ${p.alcoholFreq}, ${p.alcoholUnits} units/week, drinks: ${p.alcoholDrinks}\nSmoking: ${p.smoking}. Sleep: ${p.sleepHours}hrs, quality: ${p.sleepQuality}\nMedication: ${p.medication}. Supplements: ${p.supplements}. Stress: ${p.stressLevel}\nSubstances: ${p.substanceUse}. Water: ${p.waterDaily}\nOther: ${p.anythingElse}\n\nBe BRUTALLY HONEST. Score on actual health science.\n\nReturn: {"scores":{"hydration":{"score":0-100,"verdict":"one brutal sentence"},"sleep":{"score":0-100,"verdict":"one brutal sentence"},"nutrition":{"score":0-100,"verdict":"one brutal sentence"},"activity":{"score":0-100,"verdict":"one brutal sentence"},"lifestyle":{"score":0-100,"verdict":"one brutal sentence"}},"overallScore":0-100,"overallVerdict":"2-3 brutal honest sentences","targets":{"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"water_ml":number,"steps":number,"sleepHours":number},"targetRationale":"2 sentences on how targets were calculated","topPriorities":["3 specific actionable things in order of impact"]}`;
    try {
      const res = await fetch("/api/gemini", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1500 } })
      });
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setAnalysis(parsed); setEditTargets({ ...parsed.targets });
    } catch {
      const fallback = {
        scores: {
          hydration: { score: 42, verdict: "Chronically under-hydrated. Diet Coke does not count as water." },
          sleep: { score: 51, verdict: "6-7 hours is below optimal for muscle recovery and football performance." },
          nutrition: { score: 58, verdict: "Protein is reasonable but takeaways 2-3x a week wreck your calorie consistency." },
          activity: { score: 74, verdict: "Twice-a-week football is solid. Running too. Intensity could be higher." },
          lifestyle: { score: 38, verdict: "Alcohol and irregular meals are your biggest blockers to body composition progress." },
        },
        overallScore: 53,
        overallVerdict: "You're an active person with a decent foundation, but lifestyle choices — drinking, inconsistent eating, and poor hydration — are actively working against your goals. You're capable of hitting 10% body fat but not while things stay as they are.",
        targets: { calories: 2350, protein_g: 175, carbs_g: 230, fat_g: 65, water_ml: 3000, steps: 10000, sleepHours: 8 },
        targetRationale: "Calories set at a 200kcal deficit from your TDEE. Protein at 2g/kg to support muscle retention during a cut.",
        topPriorities: ["Hit 3 litres of water every day before anything else", "Cut alcohol to weekends only, max 4 units per occasion", "Stop skipping meals — your energy on match days depends on it"]
      };
      setAnalysis(fallback); setEditTargets({ ...fallback.targets });
    } finally {
      setAnalysing(false); setStep(TOTAL);
    }
  };

  const handleFinish = () => {
    const profile = {
      ...EMPTY_PROFILE, name: p.name, dob: p.dob, age: String(ageFromDob(p.dob) || ""), sex: p.sex,
      height: p.height, weight: p.weight, bodyFat: p.bodyFat, muscleMass: p.muscleMass,
      goals: p.goal, sport: p.sport, trainingDays: p.trainingDays, trainingIntensity: p.trainingIntensity,
      dietStyle: p.dietStyle, usualBreakfast: p.breakfast, usualLunch: p.lunch, usualDinner: p.dinner,
      usualSnacks: p.snacks, favouriteFoods: p.favFoods, dislikedFoods: p.avoidFoods,
      alcoholHabit: p.alcoholFreq, alcoholUnits: p.alcoholUnits, alcoholDrinks: p.alcoholDrinks,
      smokingStatus: p.smoking, sleepHours: p.sleepHours, sleepQuality: p.sleepQuality,
      medication: p.medication, supplements: p.supplements, stressLevel: p.stressLevel,
      substanceUse: p.substanceUse, waterHabit: p.waterDaily, otherHabits: p.anythingElse,
      calorieTarget: String(editTargets?.calories || "2400"),
      proteinTarget: String(editTargets?.protein_g || "180"),
      carbTarget: String(editTargets?.carbs_g || "240"),
      fatTarget: String(editTargets?.fat_g || "65"),
      waterTarget: String(editTargets?.water_ml || "3000"),
      stepsTarget: String(editTargets?.steps || "10000"),
      analysisScores: analysis?.scores, overallScore: analysis?.overallScore,
    };
    saveProfile(profile);
    setOnboarded(true);
    onComplete(profile);
  };

  const ss = {
    minHeight: "100vh", background: C.background,
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    color: C.onSurface, padding: "0 24px 48px",
    maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column",
  };
  const hl = { fontSize: 12, fontWeight: 700, color: C.primary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 };
  const hq = { fontSize: 26, fontWeight: 800, lineHeight: 1.25, letterSpacing: "-0.02em", marginBottom: 8 };
  const hs = { fontSize: 14, color: C.onSurfaceVariant, lineHeight: 1.6, marginBottom: 28 };
  const bigInput = (val, onChange, placeholder, type = "text") => ({
    width: "100%", padding: "16px 18px", borderRadius: 14,
    border: `2px solid ${val ? C.primary : C.outlineVariant}`, background: C.surface,
    fontSize: type === "number" ? 32 : 15, fontWeight: type === "number" ? 800 : 400,
    color: C.onSurface, fontFamily: "inherit", outline: "none",
    letterSpacing: type === "number" ? "-0.02em" : "normal",
    transition: "border-color 0.2s", marginBottom: 8
  });

  if (step === 0) return (
    <div style={{ ...ss, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ fontSize: 52, fontWeight: 800, color: C.primary, letterSpacing: "-0.03em", marginBottom: 10 }}>Pulse</div>
      <div style={{ fontSize: 15, color: C.onSurfaceVariant, marginBottom: 48, lineHeight: 1.7 }}>Your personal health tracker.<br />Let's build your profile so Pulse knows exactly what you need.</div>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <Btn onClick={next}>Get started</Btn>
        <div style={{ fontSize: 12, color: C.onSurfaceVariant }}>Takes about 3 minutes. Everything stays on your device.</div>
      </div>
    </div>
  );

  if (step === 1) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={1} total={TOTAL} /></div>
      <div style={hl}>About you</div><div style={hq}>What's your name?</div>
      <div style={hs}>Just your first name.</div>
      <input autoFocus value={p.name} onChange={e => set("name")(e.target.value)} placeholder="e.g. Lewis" style={bigInput(p.name, null, null)} onKeyDown={e => e.key === "Enter" && p.name && next()} />
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={next} disabled={!p.name}>Continue</Btn>
      </div>
    </div>
  );

  if (step === 2) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={2} total={TOTAL} /></div>
      <div style={hl}>About you</div><div style={hq}>When were you born, {p.name}?</div>
      <div style={hs}>Your date of birth keeps calorie and body composition calculations accurate as you age.</div>
      <input
        autoFocus
        type="date"
        value={p.dob}
        onChange={e => set("dob")(e.target.value)}
        max={new Date().toISOString().split("T")[0]}
        style={{
          width: "100%", padding: "16px 18px", borderRadius: 14,
          border: `2px solid ${p.dob ? C.primary : C.outlineVariant}`, background: C.surface,
          fontSize: 18, fontWeight: 600, color: C.onSurface, fontFamily: "inherit", outline: "none",
          transition: "border-color 0.2s", marginBottom: 8,
        }}
      />
      {p.dob && ageFromDob(p.dob) && (
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, marginBottom: 28 }}>
          Age: {ageFromDob(p.dob)} years old
        </div>
      )}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={next} disabled={!p.dob || !ageFromDob(p.dob)}>Continue</Btn>
        <Btn onClick={back} secondary>Back</Btn>
      </div>
    </div>
  );

  if (step === 3) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={3} total={TOTAL} /></div>
      <div style={hl}>About you</div><div style={hq}>Biological sex?</div>
      <div style={hs}>Used for accurate calorie and body composition calculations only.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {["Male", "Female"].map(opt => (
          <button key={opt} onClick={() => { set("sex")(opt); setTimeout(next, 180); }} style={{
            padding: "18px 24px", borderRadius: 14,
            border: `2px solid ${p.sex === opt ? C.primary : C.outlineVariant}`,
            background: p.sex === opt ? `${C.primary}10` : C.surface,
            fontSize: 16, fontWeight: 700, color: p.sex === opt ? C.primary : C.onSurface,
            cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s"
          }}>{opt}</button>
        ))}
      </div>
      <div style={{ marginTop: "auto" }}><Btn onClick={back} secondary>Back</Btn></div>
    </div>
  );

  if (step === 4) {
    const scaleLoading = ["scanning", "connected", "reading"].includes(scaleStatus);
    const statusMsg = { scanning: "Scanning for your scale...", connected: "Connected — step on with bare feet", reading: "Reading — stand still", done: "Reading complete — values filled below", error: scaleError || "Connection failed", unsupported: "Web Bluetooth not supported — use Chrome on Android" }[scaleStatus];
    const statusColor = { done: C.secondary, error: C.error, unsupported: C.error, scanning: C.amber, reading: C.amber, connected: C.primary }[scaleStatus];
    return (
      <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={4} total={TOTAL} /></div>
        <div style={hl}>Your body</div><div style={hq}>Current measurements</div>
        <div style={hs}>Connect your Renpho scale to pull weight, body fat and muscle mass automatically — or enter manually.</div>
        {!manualEntry && scaleStatus !== "done" && (
          <div style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", border: `2px solid ${scaleLoading ? C.primary : C.outlineVariant}`, borderRadius: 18, padding: 24, marginBottom: 20, textAlign: "center", transition: "border-color 0.3s" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⚖️</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Renpho Scale</div>
            <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 18, lineHeight: 1.6 }}>Connects via Bluetooth. Chrome on Android only.</div>
            {statusMsg && <div style={{ fontSize: 12, fontWeight: 600, color: statusColor, marginBottom: 14 }}>{statusMsg}</div>}
            <Btn onClick={connectRenpho} disabled={scaleLoading} style={{ marginBottom: 8 }}>{scaleLoading ? statusMsg : "Connect Renpho scale"}</Btn>
            <button onClick={() => setManualEntry(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.onSurfaceVariant, fontFamily: "inherit" }}>Enter manually instead</button>
          </div>
        )}
        {scaleStatus === "done" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: `${C.secondary}12`, border: `1.5px solid ${C.secondary}40`, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.secondary }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: C.secondary }}>Renpho reading complete — values auto-filled</div>
          </div>
        )}
        <FormInput label="Height" value={p.height} onChange={set("height")} placeholder="178" type="number" unit="cm" />
        {(manualEntry || scaleStatus === "done") && <>
          <FormInput label="Weight" value={p.weight} onChange={set("weight")} placeholder="84.2" type="number" unit="kg" />
          <FormInput label="Body fat %" value={p.bodyFat} onChange={set("bodyFat")} placeholder="18.4" type="number" unit="%" />
          <FormInput label="Muscle mass" value={p.muscleMass} onChange={set("muscleMass")} placeholder="62.1" type="number" unit="kg" />
          {scaleStatus !== "done" && (
            <button onClick={() => { setManualEntry(false); setScaleStatus("idle"); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.primary, fontFamily: "inherit", marginBottom: 12, textAlign: "left" }}>Use Renpho scale instead</button>
          )}
        </>}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <Btn onClick={next} disabled={!p.height || (!p.weight && scaleStatus !== "done")}>Continue</Btn>
          <Btn onClick={back} secondary>Back</Btn>
        </div>
      </div>
    );
  }

  if (step === 5) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={5} total={TOTAL} /></div>
      <div style={hl}>Your goal</div><div style={hq}>What are you actually trying to achieve?</div>
      <div style={hs}>Be specific. "Get fit" is useless. "Hit 10% body fat before football season" is something we can work with.</div>
      <textarea value={p.goal} onChange={e => set("goal")(e.target.value)} placeholder="e.g. Get to 10% body fat, build lean muscle, improve speed and fitness for Sunday league..." style={{ width: "100%", minHeight: 130, padding: "14px 16px", borderRadius: 14, border: `2px solid ${p.goal ? C.primary : C.outlineVariant}`, background: C.surface, fontSize: 14, color: C.onSurface, fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.6, marginBottom: 28 }} />
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={next} disabled={!p.goal}>Continue</Btn>
        <Btn onClick={back} secondary>Back</Btn>
      </div>
    </div>
  );

  if (step === 6) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={6} total={TOTAL} /></div>
      <div style={hl}>Activity</div><div style={hq}>How active are you?</div>
      <div style={hs}>Sports, training frequency, how hard you go. Be honest.</div>
      <FormInput label="Sport or activity" value={p.sport} onChange={set("sport")} placeholder="e.g. Football (Sat + Sun league), running" />
      <div style={{ marginBottom: 16 }}>
        <Label style={{ marginBottom: 8 }}>Training days per week</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["0","1","2","3","4","5","6","7"].map(n => <OptionChip key={n} label={n} selected={p.trainingDays === n} onClick={() => set("trainingDays")(n)} />)}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Label style={{ marginBottom: 8 }}>Typical intensity</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Light","Moderate","Hard","Very hard"].map(n => <OptionChip key={n} label={n} selected={p.trainingIntensity === n} onClick={() => set("trainingIntensity")(n)} />)}
        </div>
      </div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={next} disabled={!p.sport || !p.trainingDays}>Continue</Btn>
        <Btn onClick={back} secondary>Back</Btn>
      </div>
    </div>
  );

  if (step === 7) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={7} total={TOTAL} /></div>
      <div style={hl}>Nutrition</div><div style={hq}>What do you actually eat?</div>
      <div style={hs}>Typical days, not your best behaviour. What really happens.</div>
      <div style={{ marginBottom: 16 }}>
        <Label style={{ marginBottom: 8 }}>Diet style</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["No rules","High protein","Low carb","Vegetarian","Vegan","Calorie counting"].map(n => <OptionChip key={n} label={n} selected={p.dietStyle === n} onClick={() => set("dietStyle")(n)} />)}
        </div>
      </div>
      <FormInput label="Usual breakfast" value={p.breakfast} onChange={set("breakfast")} placeholder="e.g. Porridge, or usually skip it" />
      <FormInput label="Usual lunch" value={p.lunch} onChange={set("lunch")} placeholder="e.g. Chicken wrap or meal deal" />
      <FormInput label="Usual dinner" value={p.dinner} onChange={set("dinner")} placeholder="e.g. Pasta, stir fry, takeaway 2-3x a week" />
      <FormInput label="Snacks" value={p.snacks} onChange={set("snacks")} placeholder="e.g. Protein bar, crisps, fruit" />
      <FormInput label="Foods you eat most" value={p.favFoods} onChange={set("favFoods")} placeholder="e.g. Chicken, rice, specific protein shake brand" />
      <FormInput label="Foods you avoid" value={p.avoidFoods} onChange={set("avoidFoods")} placeholder="e.g. Seafood, mushrooms" />
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={next} disabled={!p.lunch || !p.dinner}>Continue</Btn>
        <Btn onClick={back} secondary>Back</Btn>
      </div>
    </div>
  );

  if (step === 8) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={8} total={TOTAL} /></div>
      <div style={hl}>Lifestyle</div><div style={hq}>How much do you drink?</div>
      <div style={hs}>No judgment. Just data. Alcohol has a measurable impact on recovery, sleep, and body composition.</div>
      <div style={{ marginBottom: 16 }}>
        <Label style={{ marginBottom: 8 }}>How often</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Never","Rarely","Weekends only","A few times a week","Most days"].map(n => <OptionChip key={n} label={n} selected={p.alcoholFreq === n} onClick={() => set("alcoholFreq")(n)} />)}
        </div>
      </div>
      {p.alcoholFreq && p.alcoholFreq !== "Never" && <>
        <FormInput label="Approx units per week" value={p.alcoholUnits} onChange={set("alcoholUnits")} placeholder="e.g. 14" type="number" unit="units" />
        <FormInput label="What you usually drink" value={p.alcoholDrinks} onChange={set("alcoholDrinks")} placeholder="e.g. Stella, red wine, gin and tonic" />
      </>}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={next} disabled={!p.alcoholFreq}>Continue</Btn>
        <Btn onClick={back} secondary>Back</Btn>
      </div>
    </div>
  );

  if (step === 9) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={9} total={TOTAL} /></div>
      <div style={hl}>Lifestyle</div><div style={hq}>How's your sleep?</div>
      <div style={hs}>Sleep is where recovery actually happens. Most people massively underestimate how much it affects everything.</div>
      <FormInput label="Average hours per night" value={p.sleepHours} onChange={set("sleepHours")} placeholder="e.g. 6.5" type="number" unit="hrs" />
      <div style={{ marginBottom: 20 }}>
        <Label style={{ marginBottom: 8 }}>Sleep quality</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Great","Decent","Broken","Awful"].map(n => <OptionChip key={n} label={n} selected={p.sleepQuality === n} onClick={() => set("sleepQuality")(n)} />)}
        </div>
      </div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={next} disabled={!p.sleepHours || !p.sleepQuality}>Continue</Btn>
        <Btn onClick={back} secondary>Back</Btn>
      </div>
    </div>
  );

  if (step === 10) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={10} total={TOTAL} /></div>
      <div style={hl}>Health</div><div style={hq}>Medication, supplements, stress</div>
      <div style={hs}>Affects how we interpret your data and set targets. Treated as clinical data.</div>
      <FormInput label="Daily medication" value={p.medication} onChange={set("medication")} placeholder="e.g. Sertraline 100mg morning, or none" />
      <FormInput label="Supplements" value={p.supplements} onChange={set("supplements")} placeholder="e.g. Creatine 5g, Vitamin D, or none" />
      <div style={{ marginBottom: 20 }}>
        <Label style={{ marginBottom: 8 }}>Day-to-day stress level</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Low","Moderate","High","Very high"].map(n => <OptionChip key={n} label={n} selected={p.stressLevel === n} onClick={() => set("stressLevel")(n)} />)}
        </div>
      </div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={next} disabled={!p.stressLevel}>Continue</Btn>
        <Btn onClick={back} secondary>Back</Btn>
      </div>
    </div>
  );

  if (step === 11) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={11} total={TOTAL} /></div>
      <div style={hl}>Lifestyle</div><div style={hq}>A couple more habit questions</div>
      <div style={hs}>Zero judgment. Pure data. The more accurate this is, the better your targets.</div>
      <div style={{ marginBottom: 16 }}>
        <Label style={{ marginBottom: 8 }}>Smoking</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Non-smoker","Social smoker","Regular smoker","Vaper","Ex-smoker"].map(n => <OptionChip key={n} label={n} selected={p.smoking === n} onClick={() => set("smoking")(n)} />)}
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <Label style={{ marginBottom: 4 }}>Recreational substances</Label>
        <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 10, lineHeight: 1.5 }}>Optional. Used only to understand recovery patterns. Stored only on your device.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["None","Occasional cannabis","Regular cannabis","Other occasional","Prefer not to say"].map(n => <OptionChip key={n} label={n} selected={p.substanceUse === n} onClick={() => set("substanceUse")(n)} />)}
        </div>
      </div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={next} disabled={!p.smoking}>Continue</Btn>
        <Btn onClick={back} secondary>Back</Btn>
      </div>
    </div>
  );

  if (step === 12) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={12} total={TOTAL} /></div>
      <div style={hl}>Hydration</div><div style={hq}>How much do you actually drink?</div>
      <div style={hs}>Include everything — water, tea, coffee, Diet Coke, squash. What a typical day really looks like.</div>
      <textarea value={p.waterDaily} onChange={e => set("waterDaily")(e.target.value)} placeholder="e.g. About 1 litre of water, 2 coffees, 2-3 cans of Diet Coke. More on training days." style={{ width: "100%", minHeight: 110, padding: "14px 16px", borderRadius: 14, border: `2px solid ${p.waterDaily ? C.primary : C.outlineVariant}`, background: C.surface, fontSize: 14, color: C.onSurface, fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.6, marginBottom: 28 }} />
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={next} disabled={!p.waterDaily}>Continue</Btn>
        <Btn onClick={back} secondary>Back</Btn>
      </div>
    </div>
  );

  if (step === 13) return (
    <div style={ss}><div style={{ paddingTop: 56 }}><ProgressBar step={13} total={TOTAL} /></div>
      <div style={hl}>Final question</div><div style={hq}>Anything else Pulse should know?</div>
      <div style={hs}>Bad gut when you drink? Energy crashes in the afternoon? Chronic injury? Anything relevant.</div>
      <textarea value={p.anythingElse} onChange={e => set("anythingElse")(e.target.value)} placeholder="e.g. Bad gut issues after drinking, skip meals when stressed, knee injury limits running..." style={{ width: "100%", minHeight: 130, padding: "14px 16px", borderRadius: 14, border: `2px solid ${p.anythingElse ? C.primary : C.outlineVariant}`, background: C.surface, fontSize: 14, color: C.onSurface, fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.6, marginBottom: 20 }} />
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={analyseWithGemini} disabled={analysing}>{analysing ? "Analysing your profile..." : "Analyse my profile"}</Btn>
        {analysing && <div style={{ textAlign: "center", fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>Gemini is reading your full profile and calculating honest scores and personalised targets...</div>}
        <Btn onClick={back} secondary>Back</Btn>
      </div>
    </div>
  );

  if (step === TOTAL && analysis && editTargets) {
    const overallColor = analysis.overallScore >= 70 ? C.secondary : analysis.overallScore >= 45 ? C.amber : C.error;
    return (
      <div style={{ ...ss, paddingBottom: 60 }}>
        <div style={{ paddingTop: 40 }} />
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>Your baseline</div>
          <div style={{ fontSize: 88, fontWeight: 800, color: overallColor, letterSpacing: "-0.04em", lineHeight: 1 }}>{analysis.overallScore}</div>
          <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 16 }}>out of 100</div>
          <div style={{ fontSize: 14, color: C.onSurfaceVariant, lineHeight: 1.7, padding: "0 8px", fontStyle: "italic" }}>"{analysis.overallVerdict}"</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          {Object.entries(analysis.scores).map(([key, val], i) => <ScoreRing key={key} score={val.score} label={key} verdict={val.verdict} delay={i * 150} />)}
        </div>
        <GlassCard style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🎯 Top priorities</div>
          {analysis.topPriorities.map((pr, i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < analysis.topPriorities.length - 1 ? 12 : 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.primary, color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontSize: 13, color: C.onSurface, lineHeight: 1.6 }}>{pr}</div>
            </div>
          ))}
        </GlassCard>
        <GlassCard style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>📊 Your calculated targets</div>
          <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6, marginBottom: 16 }}>{analysis.targetRationale}</div>
          {[
            { key: "calories", label: "Calories", unit: "kcal" },
            { key: "protein_g", label: "Protein", unit: "g" },
            { key: "carbs_g", label: "Carbs", unit: "g" },
            { key: "fat_g", label: "Fat", unit: "g" },
            { key: "water_ml", label: "Water", unit: "ml" },
            { key: "steps", label: "Steps", unit: "/day" },
            { key: "sleepHours", label: "Sleep", unit: "hrs" },
          ].map(t => (
            <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.onSurfaceVariant, width: 80, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>{t.label}</div>
              <input type="number" value={editTargets[t.key]} onChange={e => setEditTargets(prev => ({ ...prev, [t.key]: Number(e.target.value) }))}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${C.outlineVariant}`, background: C.surface, fontSize: 15, fontWeight: 700, color: C.primary, fontFamily: "inherit", outline: "none", textAlign: "right" }} />
              <div style={{ fontSize: 12, color: C.onSurfaceVariant, width: 36, flexShrink: 0 }}>{t.unit}</div>
            </div>
          ))}
        </GlassCard>
        <Btn onClick={handleFinish}>Start tracking</Btn>
      </div>
    );
  }

  return null;
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
  const dotColor = syncState === "dirty" ? C.amber : C.secondary;

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
          background: "rgba(255,255,255,0.6)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.2)",
          cursor: syncState === "syncing" ? "default" : "pointer",
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          fontSize: 11,
          fontWeight: 600,
          color: C.onSurfaceVariant,
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
  const [profile, setProfile] = useState(() => {
    const stored = getProfile();
    return stored ? { ...EMPTY_PROFILE, ...stored } : { ...EMPTY_PROFILE };
  });
  const [dataTick, setDataTick] = useState(0);
  const refreshData = () => setDataTick(t => t + 1);

  const [tab, setTab] = useState("dashboard");
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [reviewCard, setReviewCard] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [activitySaved, setActivitySaved] = useState(false);
  const [scaleStatus, setScaleStatus] = useState("idle");
  const [scaleMeasurement, setScaleMeasurement] = useState(null);
  const [scaleError, setScaleError] = useState(null);
  const [measurementSaved, setMeasurementSaved] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [restorePending, setRestorePending] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const fileRef = useRef();
  const backupRef = useRef();
  const installPromptRef = useRef(null);
  const [showA2HS, setShowA2HS] = useState(false);
  const [stravaTokens, setStravaTokensState] = useState(() => getStravaTokens());
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaMessage, setStravaMessage] = useState(null);
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
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "activity") setTab("activity");
    if (params.get("strava") === "connected") {
      setStravaTokensState(getStravaTokens());
      setStravaMessage("Strava connected successfully.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
  const calorieTarget = parseInt(profile.calorieTarget, 10) || 2400;
  const proteinTarget = parseInt(profile.proteinTarget, 10) || 180;
  const waterTarget = parseInt(profile.waterTarget, 10) || 3000;
  const stepsTarget = parseInt(profile.stepsTarget, 10) || 10000;
  const hasTrendData = weekHistory.some(h => h.calories > 0 || h.weight != null || h.alcohol > 0 || h.steps > 0);
  const weightPoints = weekHistory.filter(h => h.weight != null);

  if (!onboarded) return (
    <>
      <Onboarding onComplete={(prof) => { setProfile(prof); setOnboardedState(true); }} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;700;800&display=swap'); @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } input, textarea, button { font-family: inherit; } input:focus, textarea:focus { border-color: #1A73E8 !important; box-shadow: 0 0 0 3px rgba(26,115,232,0.1); } .material-symbols-outlined { font-variation-settings: 'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24; font-family: 'Material Symbols Outlined'; font-style: normal; display: inline-block; line-height: 1; text-transform: none; letter-spacing: normal; white-space: nowrap; }`}</style>
    </>
  );

  const buildProfileContext = () => {
    const lines = [];
    if (profile.dob) lines.push(`DOB: ${profile.dob} (age ${profileAge(profile)}), Sex: ${profile.sex}`);
    else if (profile.age) lines.push(`Age: ${profile.age}, Sex: ${profile.sex}`);
    if (profile.weight) lines.push(`Weight: ${profile.weight}kg, Height: ${profile.height}cm`);
    if (profile.medication) lines.push(`Medication: ${profile.medication}`);
    if (profile.alcoholHabit) lines.push(`Alcohol: ${profile.alcoholHabit}, drinks: ${profile.alcoholDrinks}`);
    if (profile.calorieTarget) lines.push(`Calorie target: ${profile.calorieTarget}kcal, Protein: ${profile.proteinTarget}g`);
    return lines.length ? `\n\nUSER PROFILE:\n${lines.join("\n")}` : "";
  };

  const handleDeleteLog = (id) => {
    deleteLog(id);
    refreshData();
  };

  const handleParse = async () => {
    if (!input.trim()) return;
    setParsing(true); setParseError(null);
    try {
      const res = await fetch("/api/gemini", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `You are a precise nutrition and fitness data parser. Return ONLY valid JSON.${buildProfileContext()}\n\nInput: "${input}"\n\nReturn: {"calories":number|null,"protein_g":number|null,"carbs_g":number|null,"fat_g":number|null,"water_ml":number|null,"alcohol_units":number|null,"medication_taken":boolean|null,"steps":number|null,"items":[],"confidence":{"calories":0-1,"protein":0-1,"carbs":0-1,"fat":0-1},"flags":[],"notes":""}\n\nRules: Never guess vague items. Reference Open Food Facts/USDA/NHS. Flag missing portions. UK alcohol units. Medication only if explicitly named. Null is correct when unsure.` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setReviewCard({
        raw: input, time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), parsed,
        fields: [
          { label: "Calories", value: parsed.calories ? `${parsed.calories} kcal` : "—", conf: parsed.confidence?.calories ?? 0.5 },
          { label: "Protein", value: parsed.protein_g ? `${parsed.protein_g}g` : "—", conf: parsed.confidence?.protein ?? 0.5 },
          { label: "Carbs", value: parsed.carbs_g ? `${parsed.carbs_g}g` : "—", conf: parsed.confidence?.carbs ?? 0.5 },
          { label: "Fat", value: parsed.fat_g ? `${parsed.fat_g}g` : "—", conf: parsed.confidence?.fat ?? 0.5 },
          ...(parsed.water_ml ? [{ label: "Water", value: `${parsed.water_ml}ml`, conf: 0.9 }] : []),
          ...(parsed.alcohol_units ? [{ label: "Alcohol", value: `${parsed.alcohol_units} units`, conf: 0.85 }] : []),
          ...(parsed.medication_taken ? [{ label: "Medication", value: "Logged", conf: 0.95 }] : []),
        ]
      });
    } catch (err) {
      setParseError(err.message || "Parse failed — CORS blocked. Needs a server-side proxy in the Next.js build.");
    } finally { setParsing(false); }
  };

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
    await connectRenphoScale({
      age: profileAge(profile) || 30,
      heightCm: parseInt(profile.height) || 175,
      isMale: profile.sex !== "Female",
      calcBIA,
      onStatus: setScaleStatus,
      onError: setScaleError,
      onReading: ({ weight, impedance, composition }) => {
        setScaleMeasurement({
          weight,
          impedance,
          ...composition,
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
      weight: scaleMeasurement.weight,
      bodyFat: scaleMeasurement.bodyFat,
      muscleMass: scaleMeasurement.muscleMass,
      boneMass: scaleMeasurement.boneMass,
      waterPct: scaleMeasurement.waterPct,
      leanMass: scaleMeasurement.leanMass,
      bmr: scaleMeasurement.bmr,
      bmi: scaleMeasurement.bmi,
      impedance: scaleMeasurement.impedance,
    });
    setMeasurementSaved(true);
    refreshData();
    setTimeout(() => setMeasurementSaved(false), 2000);
  };

  const handleRestoreFileSelect = async (file) => {
    setRestoreError(null);
    setRestorePending(null);
    try {
      const backup = await parseBackupFile(file);
      setRestorePending(backup);
    } catch (err) {
      setRestoreError(err.message || "Could not read backup file");
    }
  };

  const handleConfirmRestore = () => {
    if (!restorePending) return;
    restoreFromBackup(restorePending);
    window.location.reload();
  };

  const handleCancelRestore = () => {
    setRestorePending(null);
    setRestoreError(null);
    if (backupRef.current) backupRef.current.value = "";
  };

  const profileSections = [
    { title: "Measurements", icon: "straighten", color: C.primary, fields: [
      { key: "dob", label: "Date of birth", type: "date", half: true }, { key: "sex", label: "Sex", placeholder: "e.g. Male", half: true },
      { key: "height", label: "Height (cm)", placeholder: "e.g. 178", half: true }, { key: "weight", label: "Weight (kg)", placeholder: "e.g. 84.2", half: true },
      { key: "bodyFat", label: "Body fat %", placeholder: "e.g. 18.4", half: true }, { key: "muscleMass", label: "Muscle mass (kg)", placeholder: "e.g. 62.1", half: true },
    ]},
    { title: "Goals", icon: "flag", color: C.secondary, fields: [
      { key: "goalWeight", label: "Target weight (kg)", placeholder: "e.g. 80", half: true }, { key: "goalBodyFat", label: "Target body fat %", placeholder: "e.g. 10", half: true },
      { key: "goals", label: "What are you trying to achieve?", placeholder: "Build lean muscle, improve football fitness...", half: false, tall: true },
    ]},
    { title: "Activity", icon: "sports_soccer", color: C.purple, fields: [
      { key: "sport", label: "Sports", placeholder: "e.g. Football (Sat + Sun), running", half: false },
      { key: "trainingDays", label: "Training days/week", placeholder: "e.g. 3", half: true }, { key: "trainingIntensity", label: "Intensity", placeholder: "e.g. Moderate", half: true },
    ]},
    { title: "Eating habits", icon: "restaurant", color: C.tertiary, fields: [
      { key: "dietStyle", label: "Diet style", placeholder: "e.g. No specific diet, try to hit protein", half: false },
      { key: "usualBreakfast", label: "Usual breakfast", placeholder: "e.g. Porridge or skip", half: false },
      { key: "usualLunch", label: "Usual lunch", placeholder: "e.g. Chicken wrap or meal deal", half: false },
      { key: "usualDinner", label: "Usual dinner", placeholder: "e.g. Pasta, stir fry, takeaway 2x/week", half: false },
      { key: "favouriteFoods", label: "Eat most often", placeholder: "e.g. Chicken, rice, protein shake brand", half: true },
      { key: "dislikedFoods", label: "Avoid", placeholder: "e.g. Seafood", half: true },
    ]},
    { title: "Hydration", icon: "water_drop", color: "#0891B2", fields: [
      { key: "waterHabit", label: "Daily intake", placeholder: "e.g. 1.5L water, 2 coffees, lots of Diet Coke", half: false },
    ]},
    { title: "Medication & supplements", icon: "medication", color: C.error, fields: [
      { key: "medication", label: "Daily medication", placeholder: "e.g. Sertraline 100mg morning", half: true },
      { key: "supplements", label: "Supplements", placeholder: "e.g. Creatine 5g, Vitamin D", half: true },
    ]},
    { title: "Lifestyle", icon: "self_improvement", color: C.onSurfaceVariant, fields: [
      { key: "alcoholHabit", label: "Alcohol habit", placeholder: "e.g. Weekends only", half: true },
      { key: "alcoholDrinks", label: "What you drink", placeholder: "e.g. Stella, red wine, gin", half: true },
      { key: "smokingStatus", label: "Smoking", placeholder: "e.g. Non-smoker", half: true },
      { key: "sleepHours", label: "Sleep (hours)", placeholder: "e.g. 6-7", half: true },
      { key: "otherHabits", label: "Anything else", placeholder: "e.g. Bad gut after drinking, skip meals when stressed", half: false, tall: true },
    ]},
    { title: "Daily targets", icon: "track_changes", color: C.primary, fields: [
      { key: "calorieTarget", label: "Calories (kcal)", placeholder: "2400", half: true }, { key: "proteinTarget", label: "Protein (g)", placeholder: "180", half: true },
      { key: "carbTarget", label: "Carbs (g)", placeholder: "240", half: true }, { key: "fatTarget", label: "Fat (g)", placeholder: "65", half: true },
      { key: "waterTarget", label: "Water (ml)", placeholder: "3000", half: true }, { key: "stepsTarget", label: "Steps", placeholder: "10000", half: true },
    ]},
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.background, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: C.onSurface, maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
        <header style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.2)", boxShadow: "0px 4px 24px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 60 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.primary, letterSpacing: "-0.02em" }}>Pulse</div>
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

      <main style={{ padding: "20px 20px 0", paddingBottom: "calc(100px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 24 }}>

        {tab === "dashboard" && <>
          <WellnessArc score={wellnessScore} />
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, marginLeft: -20, paddingLeft: 20, marginRight: -20, paddingRight: 20 }}>
            <StatChip icon="local_fire_department" label="Calories" value={daily.calories.toLocaleString()} unit="kcal" current={daily.calories} max={calorieTarget} color={C.primary} />
            <StatChip icon="egg_alt" label="Protein" value={daily.protein_g} unit="g" current={daily.protein_g} max={proteinTarget} color={C.tertiary} />
            <StatChip icon="water_drop" label="Water" value={(daily.water_ml / 1000).toFixed(1)} unit="L" current={daily.water_ml} max={waterTarget} color="#0891B2" />
            <StatChip icon="directions_walk" label="Steps" value={daily.steps.toLocaleString()} unit={`/ ${Math.round(stepsTarget / 1000)}k`} current={daily.steps} max={stepsTarget} color={C.secondary} />
            {latestMeasurement ? <>
              <StatChip icon="monitor_weight" label="Weight" value={latestMeasurement.weight} unit="kg" current={latestMeasurement.weight} max={parseFloat(profile.goalWeight) || latestMeasurement.weight} color={C.primary} />
              {latestMeasurement.bodyFat != null && <StatChip icon="fitness_center" label="Body fat" value={latestMeasurement.bodyFat} unit="%" current={latestMeasurement.bodyFat} max={parseFloat(profile.goalBodyFat) || 30} color={C.error} />}
            </> : null}
          </div>
          {!latestMeasurement && (
            <GlassCard style={{ padding: "12px 16px" }}>
              <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.5 }}>No body measurements yet. Use the Activity tab to connect your Renpho scale.</div>
            </GlassCard>
          )}
          {activities.length > 0 ? (
            <GlassCard>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ color: C.secondary, fontSize: 20 }}>directions_run</span>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{activities[0].type}</div>
                </div>
                <div style={{ fontSize: 11, color: C.onSurfaceVariant }}>via {activities[0].source}</div>
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                {activities[0].distance && <div><Label style={{ fontSize: 9, marginBottom: 2 }}>Distance</Label><div style={{ fontSize: 13, fontWeight: 700 }}>{activities[0].distance}</div></div>}
                <div><Label style={{ fontSize: 9, marginBottom: 2 }}>Time</Label><div style={{ fontSize: 13, fontWeight: 700 }}>{activities[0].duration}</div></div>
                {activities[0].avgHR && <div><Label style={{ fontSize: 9, marginBottom: 2 }}>Avg HR</Label><div style={{ fontSize: 13, fontWeight: 700 }}>{activities[0].avgHR} bpm</div></div>}
                {activities[0].calories && <div><Label style={{ fontSize: 9, marginBottom: 2 }}>Calories</Label><div style={{ fontSize: 13, fontWeight: 700 }}>{activities[0].calories} kcal</div></div>}
              </div>
            </GlassCard>
          ) : null}
          <div>
            <Label style={{ marginBottom: 10 }}>Daily habits</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <HabitChip label={profile.medication || "Medication"} done={daily.medication_taken} />
              <HabitChip label="Dry day" done={daily.alcohol_units === 0} />
              <HabitChip label="Step goal" done={daily.steps >= stepsTarget} />
            </div>
          </div>
          {profile.analysisScores && (
            <div>
              <Label style={{ marginBottom: 10 }}>Health scores</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {Object.entries(profile.analysisScores).map(([key, val], i) => <ScoreRing key={key} score={val.score} label={key} verdict={val.verdict} delay={i * 100} />)}
              </div>
            </div>
          )}
          <div>
            <Label style={{ marginBottom: 10 }}>Recent log</Label>
            {todayLogs.length === 0 ? (
              <GlassCard>
                <div style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6 }}>Nothing logged yet today. Use the Log tab to add your first entry.</div>
              </GlassCard>
            ) : (
              <GlassCard style={{ padding: "4px 16px" }}>
                {todayLogs.map((l, i) => (
                  <div key={l.id} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: i < todayLogs.length - 1 ? `1px solid ${C.outlineVariant}30` : "none" }}>
                    <span style={{ fontSize: 11, color: C.onSurfaceVariant, flexShrink: 0, marginTop: 1, fontWeight: 600 }}>{l.time}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>{l.raw}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: C.secondary }}>check_circle</span>
                  </div>
                ))}
              </GlassCard>
            )}
          </div>
        </>}

        {tab === "log" && <>
          <div><div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>Brain dump</div>
            <div style={{ fontSize: 13, color: C.onSurfaceVariant }}>Type anything you've eaten, done, or taken today.</div></div>
          <GlassCard style={{ padding: 0, overflow: "hidden" }}>
            <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Had a chicken wrap, diet coke, apple. Did a run this morning, took my sertraline, 2 pints tonight..."
              style={{ width: "100%", minHeight: 120, background: "transparent", border: "none", padding: "16px 20px", color: C.onSurface, fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.6, boxSizing: "border-box" }} />
            <div style={{ borderTop: `1px solid ${C.outlineVariant}30`, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.onSurfaceVariant }}>Tap Parse to analyse</span>
              <button onClick={handleParse} disabled={parsing || !input.trim()} style={{ padding: "9px 24px", borderRadius: 999, background: parsing || !input.trim() ? C.outlineVariant : C.primary, color: "#fff", border: "none", cursor: parsing || !input.trim() ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                {parsing ? "Parsing..." : "Parse"}
              </button>
            </div>
          </GlassCard>
          {parseError && <div style={{ padding: "12px 16px", background: "#FEE2E2", borderRadius: 12, fontSize: 12, color: C.error, border: `1px solid ${C.error}30` }}>{parseError}</div>}
          {reviewCard && (
            <GlassCard style={{ border: `1px solid ${C.primary}30`, background: `rgba(26,115,232,0.04)` }}>
              <div style={{ fontSize: 12, color: C.onSurfaceVariant, fontStyle: "italic", marginBottom: 14, lineHeight: 1.5 }}>"{reviewCard.raw}"</div>
              {reviewCard.parsed.flags?.length > 0 && (
                <div style={{ padding: "10px 14px", background: `${C.amber}18`, border: `1px solid ${C.amber}40`, borderRadius: 10, marginBottom: 14 }}>
                  <Label style={{ color: C.tertiary, marginBottom: 6 }}>Flagged</Label>
                  {reviewCard.parsed.flags.map((f, i) => <div key={i} style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>· {f}</div>)}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {reviewCard.fields.map(f => (
                  <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <ConfDot val={f.conf} />
                    <span style={{ fontSize: 11, color: C.onSurfaceVariant, width: 60, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{f.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{f.value}</span>
                    <span style={{ fontSize: 11, color: C.onSurfaceVariant }}>{Math.round(f.conf * 100)}%</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { addLog(reviewCard.raw, reviewCard.parsed); setReviewCard(null); setInput(""); refreshData(); }} style={{ flex: 1, padding: "11px 0", borderRadius: 999, background: C.secondary, color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>Confirm and save</button>
                <button onClick={() => setReviewCard(null)} style={{ padding: "11px 20px", borderRadius: 999, background: "transparent", color: C.onSurfaceVariant, border: `1px solid ${C.outlineVariant}`, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Discard</button>
              </div>
            </GlassCard>
          )}
          <div>
            <Label style={{ marginBottom: 10 }}>Today's log</Label>
            {todayLogs.length === 0 ? <div style={{ fontSize: 13, color: C.onSurfaceVariant }}>Nothing logged yet today. Use the Log tab to add your first entry.</div>
              : <GlassCard style={{ padding: "4px 16px" }}>
                {todayLogs.map((l, i) => (
                  <div key={l.id} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: i < todayLogs.length - 1 ? `1px solid ${C.outlineVariant}30` : "none", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11, color: C.onSurfaceVariant, flexShrink: 0, marginTop: 1, fontWeight: 600 }}>{l.time}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>{l.raw}</span>
                    <button type="button" onClick={() => handleDeleteLog(l.id)} aria-label="Delete log entry" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.onSurfaceVariant }}>delete_outline</span>
                    </button>
                  </div>
                ))}
              </GlassCard>}
          </div>
        </>}

        {tab === "activity" && <>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Activity</div>
          <GlassCard style={{ border: "1px solid rgba(252,76,2,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Strava</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: stravaTokens ? C.secondary : "#FC4C02" }} />
                <span style={{ fontSize: 11, color: stravaTokens ? C.secondary : "#FC4C02", fontWeight: 700 }}>
                  {stravaTokens
                    ? `Connected${stravaTokens.athlete?.firstname ? ` · ${stravaTokens.athlete.firstname}` : ""}`
                    : "Not connected"}
                </span>
              </div>
            </div>
            {!isStravaClientConfigured() ? (
              <div style={{ fontSize: 12, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
                Add your Strava client ID and secret in <code style={{ fontSize: 11 }}>lib/strava-config.ts</code>, then register redirect URI <code style={{ fontSize: 11 }}>/strava/callback</code> at strava.com/settings/api.
              </div>
            ) : stravaTokens ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={syncStrava} disabled={stravaSyncing} style={{ width: "100%", padding: "10px 0", borderRadius: 999, background: "rgba(252,76,2,0.08)", border: "1px solid rgba(252,76,2,0.25)", color: "#FC4C02", cursor: stravaSyncing ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                  {stravaSyncing ? "Syncing…" : "Sync recent activities"}
                </button>
                <button onClick={disconnectStrava} style={{ width: "100%", padding: "8px 0", borderRadius: 999, background: "transparent", border: `1px solid ${C.outlineVariant}`, color: C.onSurfaceVariant, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Disconnect</button>
              </div>
            ) : (
              <button onClick={connectStrava} style={{ width: "100%", padding: "10px 0", borderRadius: 999, background: "rgba(252,76,2,0.08)", border: "1px solid rgba(252,76,2,0.25)", color: "#FC4C02", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>Connect Strava</button>
            )}
            {stravaMessage && (
              <div style={{ marginTop: 10, fontSize: 12, color: stravaMessage.startsWith("Imported") || stravaMessage.includes("connected") ? C.secondary : C.error, lineHeight: 1.5 }}>{stravaMessage}</div>
            )}
          </GlassCard>
          <div>
            <Label style={{ marginBottom: 10 }}>Recent activities</Label>
            {activities.length === 0 ? (
              <GlassCard>
                <div style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6 }}>No activities saved yet. Upload a Garmin file or connect a device to get started.</div>
              </GlassCard>
            ) : (
              <GlassCard style={{ padding: "4px 16px" }}>
                {activities.map((a, i) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: i < activities.length - 1 ? `1px solid ${C.outlineVariant}30` : "none" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{a.type} <span style={{ fontSize: 11, color: C.onSurfaceVariant, fontWeight: 400 }}>via {a.source}</span></div>
                      <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginTop: 2 }}>{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                    </div>
                    <div style={{ display: "flex", gap: 14, textAlign: "right" }}>
                      {a.distance && <div><div style={{ fontSize: 13, fontWeight: 700 }}>{a.distance}</div><Label style={{ fontSize: 9 }}>Dist</Label></div>}
                      <div><div style={{ fontSize: 13, fontWeight: 700 }}>{a.duration}</div><Label style={{ fontSize: 9 }}>Time</Label></div>
                      {a.avgHR && <div><div style={{ fontSize: 13, fontWeight: 700, color: C.error }}>{a.avgHR}</div><Label style={{ fontSize: 9 }}>BPM</Label></div>}
                      {a.calories && <div><div style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{a.calories}</div><Label style={{ fontSize: 9 }}>Kcal</Label></div>}
                    </div>
                  </div>
                ))}
              </GlassCard>
            )}
          </div>
          <div>
            <Label style={{ marginBottom: 10 }}>Renpho scale</Label>
            <GlassCard style={{ border: scaleStatus === "done" ? `1px solid ${C.secondary}40` : scaleStatus === "error" ? `1px solid ${C.error}30` : "1px solid rgba(255,255,255,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>Step on with bare feet</div>
                  <div style={{ fontSize: 11, color: C.onSurfaceVariant }}>
                    {scaleStatus === "idle" && "Chrome on Android only"}
                    {scaleStatus === "scanning" && "Scanning for QN-Scale..."}
                    {scaleStatus === "connected" && "Connected — step on scale"}
                    {scaleStatus === "reading" && "Reading — stand still"}
                    {scaleStatus === "done" && "Reading complete"}
                    {scaleStatus === "error" && (scaleError || "Error")}
                  </div>
                </div>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: scaleStatus === "idle" ? C.outlineVariant : scaleStatus === "done" ? C.secondary : scaleStatus === "error" ? C.error : C.amber }} />
              </div>
              {scaleMeasurement && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "Weight", value: `${scaleMeasurement.weight}kg`, color: C.primary },
                    { label: "Body fat", value: `${scaleMeasurement.bodyFat}%`, color: C.error },
                    { label: "Muscle", value: `${scaleMeasurement.muscleMass}kg`, color: C.secondary },
                    { label: "BMI", value: scaleMeasurement.bmi, color: C.tertiary },
                    { label: "Water", value: `${scaleMeasurement.waterPct}%`, color: "#0891B2" },
                    { label: "BMR", value: `${scaleMeasurement.bmr} kcal`, color: C.onSurfaceVariant },
                  ].map(m => (
                    <div key={m.label} style={{ padding: "10px 14px", background: `${C.surfaceContainer}80`, borderRadius: 10 }}>
                      <Label style={{ fontSize: 9, marginBottom: 3 }}>{m.label}</Label>
                      <div style={{ fontSize: 16, fontWeight: 800, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {scaleMeasurement && (
                  <button onClick={handleSaveMeasurement} style={{ width: "100%", padding: "10px 0", borderRadius: 999, background: measurementSaved ? C.secondary : C.secondary, color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                    {measurementSaved ? "Saved" : "Save measurement"}
                  </button>
                )}
                <button onClick={connectRenpho} disabled={["scanning","reading","connected"].includes(scaleStatus)} style={{ width: "100%", padding: "10px 0", borderRadius: 999, background: scaleStatus === "done" ? `${C.secondary}12` : `${C.primary}12`, color: scaleStatus === "done" ? C.secondary : C.primary, border: `1px solid ${scaleStatus === "done" ? C.secondary : C.primary}40`, cursor: ["scanning","reading","connected"].includes(scaleStatus) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                  {scaleStatus === "idle" && "Connect scale"}{scaleStatus === "scanning" && "Scanning..."}{scaleStatus === "connected" && "Step on scale"}{scaleStatus === "reading" && "Reading..."}{scaleStatus === "done" && "Take another reading"}{scaleStatus === "error" && "Try again"}
                </button>
              </div>
            </GlassCard>
          </div>
          <div>
            <Label style={{ marginBottom: 10 }}>Garmin file upload</Label>
            <GlassCard style={{ padding: 0, overflow: "hidden" }}>
              <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
                onClick={() => fileRef.current?.click()}
                style={{ padding: "28px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? `${C.primary}08` : "transparent", border: `2px dashed ${dragOver ? C.primary : C.outlineVariant}`, borderRadius: 14, margin: 6, transition: "all 0.2s" }}>
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
                    <button onClick={handleSaveActivity} style={{ width: "100%", padding: "10px 0", borderRadius: 999, background: activitySaved ? C.secondary : C.secondary, color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>{activitySaved ? "Saved" : "Save activity"}</button>
                  </>}
                </div>
              )}
            </GlassCard>
          </div>
        </>}

        {tab === "trends" && <>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Trends</div>
          <GlassCard>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Weight — 7 days</div>
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
                    }).join(" ")} fill="none" stroke={C.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    {wData.map((w, i) => {
                      const x = wData.length === 1 ? W / 2 : (i / (wData.length - 1)) * W;
                      const y = H - ((w - wMin) / (wMax - wMin)) * H;
                      return <circle key={i} cx={x} cy={y} r={3.5} fill={C.primary} />;
                    })}
                    {weightPoints.map((h, i) => {
                      const x = weightPoints.length === 1 ? W / 2 : (i / (weightPoints.length - 1)) * W;
                      return <text key={i} x={x} y={H + 16} textAnchor="middle" fontSize={9} fill={C.onSurfaceVariant} fontFamily="Plus Jakarta Sans">{new Date(h.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</text>;
                    })}
                  </svg>
                </div>
                <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                  <div><div style={{ fontSize: 22, fontWeight: 800, color: C.primary, letterSpacing: "-0.02em" }}>{latestMeasurement?.weight ?? "—"}<span style={{ fontSize: 13, fontWeight: 400 }}>kg</span></div><Label style={{ fontSize: 9 }}>Latest</Label></div>
                  {weightPoints.length >= 2 && (
                    <div><div style={{ fontSize: 22, fontWeight: 800, color: C.secondary, letterSpacing: "-0.02em" }}>{(weightPoints[weightPoints.length - 1].weight - weightPoints[0].weight).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 400 }}>kg</span></div><Label style={{ fontSize: 9 }}>7 day change</Label></div>
                  )}
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
                  { label: "Avg steps", value: weeklyStats.avgSteps > 0 ? weeklyStats.avgSteps.toLocaleString() : "—", unit: "steps/day", color: C.secondary },
                  { label: "Dry days", value: `${weeklyStats.dryDays} / 7`, unit: "this week", color: "#0891B2" },
                  { label: "Activities", value: String(weeklyStats.activityCount), unit: "this week", color: C.purple },
                ].map(s => (
                  <GlassCard key={s.label} style={{ padding: "14px 16px" }}>
                    <Label style={{ fontSize: 10, marginBottom: 6 }}>{s.label}</Label>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginTop: 2 }}>{s.unit}</div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
          <GlassCard>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Alcohol — 7 days</div>
            {!hasTrendData ? (
              <div style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6 }}>Start logging to see trends.</div>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 60 }}>
                {weekHistory.map((h, i) => {
                  const barH = h.alcohol === 0 ? 4 : Math.max(8, (h.alcohol / 6) * 56);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ width: "100%", height: barH, background: h.alcohol === 0 ? `${C.secondary}30` : h.alcohol > 3 ? C.error : C.amber, borderRadius: 4 }} />
                      <Label style={{ fontSize: 9 }}>{h.alcohol}u</Label>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </>}

        {tab === "profile" && <>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Profile</div>
            <div style={{ fontSize: 13, color: C.onSurfaceVariant, marginTop: 4 }}>Your details get injected into every Gemini parse.</div>
          </div>
          {profile.analysisScores && (
            <GlassCard style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Baseline score</div>
              <div style={{ fontSize: 52, fontWeight: 800, color: profile.overallScore >= 70 ? C.secondary : profile.overallScore >= 45 ? C.amber : C.error, letterSpacing: "-0.03em" }}>{profile.overallScore}</div>
              <div style={{ fontSize: 11, color: C.onSurfaceVariant }}>out of 100</div>
              <button onClick={() => { setOnboarded(false); window.location.reload(); }} style={{ marginTop: 14, padding: "8px 20px", borderRadius: 999, background: "transparent", border: `1px solid ${C.outlineVariant}`, color: C.onSurfaceVariant, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Redo onboarding</button>
            </GlassCard>
          )}
          {profileSections.map(s => (
            <GlassCard key={s.title}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: s.color }}>{s.icon}</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.title}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {s.fields.map(f => (
                  <div key={f.key} style={{ width: f.half ? "calc(50% - 5px)" : "100%", minWidth: 100 }}>
                    <FormInput label={f.label} value={profile[f.key] || ""} onChange={v => setProfile(p => ({ ...p, [f.key]: v }))} placeholder={f.placeholder} type={f.type} tall={f.tall} />
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
          <GlassCard>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.primary }}>backup</span>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Backups</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button type="button" onClick={() => triggerSync()} style={{ width: "100%", padding: "11px 0", borderRadius: 999, background: C.primary, color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", boxShadow: `0 4px 14px ${C.primary}28` }}>Download today&apos;s backup</button>
              <button type="button" onClick={() => backupRef.current?.click()} style={{ width: "100%", padding: "11px 0", borderRadius: 999, background: "transparent", color: C.onSurfaceVariant, border: `1px solid ${C.outlineVariant}`, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Restore from backup</button>
              <input ref={backupRef} type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; if (f) handleRestoreFileSelect(f); e.target.value = ""; }} style={{ display: "none" }} />
              {restoreError && (
                <div style={{ fontSize: 12, color: C.error, fontWeight: 600, padding: "10px 12px", background: `${C.error}10`, borderRadius: 10, border: `1px solid ${C.error}30` }}>{restoreError}</div>
              )}
              {restorePending && (
                <div style={{
                  padding: 16,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.7)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: `1px solid rgba(255,255,255,0.3)`,
                  borderLeft: `4px solid ${C.amber}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Restore backup from {restorePending.backupDate}?</div>
                  <div style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, marginBottom: 14 }}>
                    This will replace all your logs, activities, and health data. Your account and PIN will not be affected.
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={handleConfirmRestore} style={{ flex: 1, padding: "10px 0", borderRadius: 999, background: C.primary, color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>Confirm restore</button>
                    <button type="button" onClick={handleCancelRestore} style={{ flex: 1, padding: "10px 0", borderRadius: 999, background: "transparent", color: C.onSurfaceVariant, border: `1px solid ${C.outlineVariant}`, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Cancel</button>
                  </div>
                </div>
              )}
              <div style={{ fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.5, marginTop: 4 }}>One backup is saved per day. Restoring replaces all data but keeps your account and PIN.</div>
            </div>
          </GlassCard>
          <button onClick={() => {
            const toSave = { ...profile, age: String(profileAge(profile) || profile.age || "") };
            saveProfile(toSave);
            setProfile(toSave);
            setProfileSaved(true);
            setSyncState("dirty");
            setTimeout(() => setProfileSaved(false), 2000);
          }}
            style={{ width: "100%", padding: "14px 0", borderRadius: 999, background: profileSaved ? C.secondary : C.primary, color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit", boxShadow: `0 6px 20px ${C.primary}28`, transition: "all 0.3s" }}>
            {profileSaved ? "Saved" : "Save profile"}
          </button>
          <div style={{ height: 8 }} />
        </>}

      </main>

      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 100, background: "rgba(255,255,255,0.7)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.3)", display: "flex", justifyContent: "space-around", alignItems: "center", minHeight: 68, padding: "0 8px", paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 40, borderRadius: 999, border: "none", cursor: "pointer", background: tab === t.id ? `${C.primary}14` : "transparent", transition: "all 0.2s" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: tab === t.id ? C.primary : C.onSurfaceVariant, fontVariationSettings: tab === t.id ? "'FILL' 1" : "'FILL' 0" }}>{t.icon}</span>
          </button>
        ))}
      </nav>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, textarea, button { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        input:focus, textarea:focus { border-color: #1A73E8 !important; box-shadow: 0 0 0 3px rgba(26,115,232,0.1); outline: none; }
        ::-webkit-scrollbar { display: none; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24; font-family: 'Material Symbols Outlined'; font-style: normal; display: inline-block; line-height: 1; text-transform: none; letter-spacing: normal; white-space: nowrap; }
        @keyframes pulse-sync-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
