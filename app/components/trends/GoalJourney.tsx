"use client";

import { useState } from "react";
import type { PulseGoal, PulseProfile } from "@/lib/types";
import { effortSummary } from "@/lib/profile-helpers";
import { getGoals } from "@/lib/storage";
import { AUTH_THEME } from "../AuthShell";

const C = AUTH_THEME;

interface GoalJourneyProps {
  profile: PulseProfile;
}

export default function GoalJourney({ profile }: GoalJourneyProps) {
  const [expanded, setExpanded] = useState(false);
  const goals: PulseGoal | null = getGoals();
  const measurements = profile.latestMeasurement;

  if (!goals || !goals.milestones.length) {
    return (
      <div style={{ padding: 16, background: "rgba(255,255,255,0.6)", borderRadius: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Your journey</div>
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
          Goal milestones are being prepared. Check back shortly after onboarding.
        </p>
      </div>
    );
  }

  const primaryTarget = goals.targets[0];
  const currentVal = measurements?.bodyFat ?? primaryTarget?.current ?? profile.extracted.currentBodyFat;
  const targetVal = primaryTarget?.target ?? profile.extracted.targetBodyFat;

  let coachLine = "You're where you should be. Keep it consistent.";
  if (currentVal && targetVal && currentVal > targetVal + 2) {
    coachLine = "You're a bit behind the curve. Not a disaster, a consistent week will sort it.";
  } else if (currentVal && targetVal && currentVal < targetVal) {
    coachLine = "Ahead of where I expected. Either the data is looking good or you've been properly at it.";
  }

  return (
    <div style={{ marginBottom: 20, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Your journey</div>
      <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: 16, padding: 16, marginBottom: 12, minWidth: 0 }}>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: C.onSurface, marginBottom: 8, ...(expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>
          {goals.raw || profile.goal}
        </p>
        <button type="button" onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", color: C.primary, fontSize: 12, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>
          {expanded ? "Show less" : "Read more"}
        </button>
        <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginTop: 10 }}>{effortSummary(goals.timeline, goals.effortLevel)}</div>
      </div>

      {primaryTarget && (
        <div style={{ background: C.surface, borderRadius: 12, padding: 16, marginBottom: 12, height: 120, position: "relative", overflow: "hidden" }}>
          <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginBottom: 8 }}>{primaryTarget.metric.replace(/_/g, " ")}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 70 }}>
            {goals.milestones.slice(0, 6).map((m, i) => {
              const proj = m.projectedBodyFat ?? m.projectedWeight ?? 0;
              const max = Math.max(...goals.milestones.map((x) => x.projectedBodyFat ?? x.projectedWeight ?? 0), 1);
              const h = Math.max(8, (proj / max) * 60);
              const past = new Date(m.date) < new Date();
              return (
                <div key={m.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: "100%", height: h, background: past ? C.secondary : `${C.primary}40`, borderRadius: 4, border: past ? "none" : `1px dashed ${C.primary}` }} />
                  <span style={{ fontSize: 9, color: C.onSurfaceVariant, textAlign: "center" }}>{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
        {goals.milestones.map((m) => {
          const past = new Date(m.date) < new Date();
          return (
            <div key={m.label} style={{ minWidth: 140, flexShrink: 0, background: "rgba(255,255,255,0.7)", borderRadius: 12, padding: 12, border: `1px solid ${C.outlineVariant}40` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: past ? C.secondary : C.onSurfaceVariant }}>{past ? "check_circle" : "schedule"}</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{m.label}</span>
              </div>
              {(m.projectedBodyFat ?? m.projectedWeight) != null && (
                <div style={{ fontSize: 16, fontWeight: 800, color: C.primary, marginBottom: 4 }}>
                  {m.projectedBodyFat ?? m.projectedWeight}{m.projectedBodyFat ? "%" : " kg"}
                </div>
              )}
              <div style={{ fontSize: 11, color: C.onSurfaceVariant, lineHeight: 1.4 }}>{m.description}</div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "12px 14px", background: `${C.primary}08`, borderRadius: 12, fontSize: 13, color: C.onSurface, lineHeight: 1.55, border: `1px solid ${C.primary}20` }}>
        {coachLine}
      </div>
    </div>
  );
}
