"use client";

import { useState } from "react";
import type { PulseGoal, PulseProfile } from "@/lib/types";
import { effortSummary } from "@/lib/profile-helpers";
import { getGoals } from "@/lib/storage";
import { COLORS, GLASS_CARD } from "@/lib/design-tokens";

const C = COLORS;

interface GoalJourneyProps {
  profile: PulseProfile;
}

export default function GoalJourney({ profile }: GoalJourneyProps) {
  const [expanded, setExpanded] = useState(false);
  const goals: PulseGoal | null = getGoals();
  const measurements = profile.latestMeasurement;

  if (!goals || !goals.milestones.length) {
    return (
      <div style={{ ...GLASS_CARD, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.primary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Your journey</div>
        <p style={{ fontSize: 15, color: C.onSurfaceVariant, lineHeight: 1.6 }}>
          Complete onboarding to see your goal projection.
        </p>
      </div>
    );
  }

  const primaryTarget = goals.targets[0];
  const currentVal = measurements?.bodyFat ?? primaryTarget?.current ?? profile.extracted.currentBodyFat;
  const targetVal = primaryTarget?.target ?? profile.extracted.targetBodyFat;
  const onTrack = currentVal != null && targetVal != null && currentVal <= targetVal + 1;

  return (
    <div style={{ marginBottom: 20, minWidth: 0 }}>
      <div style={{ ...GLASS_CARD, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.primary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Your journey</div>
        <p style={{
          fontSize: 15, lineHeight: 1.6, color: C.onSurface, marginBottom: 10,
          ...(expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }),
        }}>
          {goals.raw || profile.goal}
        </p>
        <button type="button" onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", color: C.primary, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>
          {expanded ? "Show less" : "Read more"}
        </button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant, background: C.glass, border: `1.5px solid ${C.glassBorder}`, borderRadius: 999, padding: "6px 12px" }}>
            {effortSummary(goals.timeline, goals.effortLevel)}
          </span>
        </div>
      </div>

      {primaryTarget && goals.milestones.length > 1 && (
        <div style={{ ...GLASS_CARD, padding: "12px 8px 8px", marginBottom: 12, height: 140 }}>
          <svg width="100%" height={100} viewBox="0 0 300 100" preserveAspectRatio="none">
            <polyline
              points={goals.milestones.map((m, i) => {
                const x = (i / (goals.milestones.length - 1)) * 300;
                const val = m.projectedBodyFat ?? m.projectedWeight ?? 0;
                const max = Math.max(...goals.milestones.map((x) => x.projectedBodyFat ?? x.projectedWeight ?? 0), 1);
                const y = 90 - (val / max) * 70;
                return `${x},${y}`;
              }).join(" ")}
              fill="none"
              stroke={C.primary}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={goals.milestones.slice(0, Math.ceil(goals.milestones.length / 2)).map((m, i, arr) => {
                const x = (i / (goals.milestones.length - 1)) * 300;
                const val = m.projectedBodyFat ?? m.projectedWeight ?? 0;
                const max = Math.max(...goals.milestones.map((x) => x.projectedBodyFat ?? x.projectedWeight ?? 0), 1);
                const y = 90 - (val / max) * 70;
                return `${x},${y}`;
              }).join(" ")}
              fill="none"
              stroke={C.primary}
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
            {goals.milestones.map((m, i) => {
              const x = (i / (goals.milestones.length - 1)) * 300;
              const val = m.projectedBodyFat ?? m.projectedWeight ?? 0;
              const max = Math.max(...goals.milestones.map((x) => x.projectedBodyFat ?? x.projectedWeight ?? 0), 1);
              const y = 90 - (val / max) * 70;
              const isCurrent = i === Math.floor(goals.milestones.length / 2);
              const dotColor = isCurrent ? (onTrack ? C.success : C.warning) : C.primary;
              return (
                <circle key={m.label} cx={x} cy={y} r={isCurrent ? 5 : 3} fill={dotColor} />
              );
            })}
          </svg>
        </div>
      )}

      <div className="hide-scrollbar" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
        {goals.milestones.map((m) => {
          const past = new Date(m.date) < new Date();
          const behind = past && !onTrack;
          return (
            <div key={m.label} style={{ ...GLASS_CARD, minWidth: 110, flexShrink: 0, padding: "12px 14px", borderRadius: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <i className={`ti ${past && onTrack ? "ti-check" : behind ? "ti-alert-triangle" : "ti-clock"}`} style={{
                  fontSize: 14,
                  color: past && onTrack ? C.successText : behind ? C.warning : C.onSurfaceVariant,
                }} />
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onSurfaceVariant }}>{m.label}</span>
              </div>
              {(m.projectedBodyFat ?? m.projectedWeight) != null && (
                <div style={{ fontSize: 18, fontWeight: 700, color: C.primary, marginBottom: 4, letterSpacing: "-0.01em" }}>
                  {m.projectedBodyFat ?? m.projectedWeight}{m.projectedBodyFat ? "%" : " kg"}
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 500, color: C.onSurfaceVariant, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
