import type { PulseGoal, PulseProfile, PulseGoalMilestone } from "./types";
import {
  addChatMessage,
  getChatHistory,
  getProfile,
  saveGoals,
  saveProfile,
} from "./storage";

export async function runOnboardingBackgroundTasks(profile: PulseProfile): Promise<void> {
  await Promise.all([
    runGoalExtraction(profile),
    runWelcomeMessage(profile),
  ]);
}

async function runGoalExtraction(profile: PulseProfile): Promise<void> {
  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "extract_goal", profile }),
    });
    const data = await res.json();
    if (data.error) return;

    const current = getProfile() ?? profile;
    const milestones = (data.milestones ?? []) as PulseGoalMilestone[];
    const targets = [];
    if (data.targetBodyFat != null) {
      targets.push({
        metric: "body_fat_percentage",
        current: current.latestMeasurement?.bodyFat ?? current.extracted.currentBodyFat ?? 0,
        target: data.targetBodyFat,
        unit: "%",
      });
    }
    if (data.targetWeight != null) {
      targets.push({
        metric: "weight",
        current: current.latestMeasurement?.weight ?? current.extracted.currentWeight ?? 0,
        target: data.targetWeight,
        unit: "kg",
      });
    }

    const goals: PulseGoal = {
      raw: current.goal,
      targets,
      timeline: current.timeline,
      effortLevel: current.effortLevel,
      milestones,
      primaryGoal: data.primaryGoal,
      extractedGoals: data.extractedGoals,
      generatedAt: new Date().toISOString(),
    };
    saveGoals(goals);

    saveProfile({
      ...current,
      extracted: {
        ...current.extracted,
        targetBodyFat: data.targetBodyFat ?? current.extracted.targetBodyFat,
        targetWeight: data.targetWeight ?? current.extracted.targetWeight,
        sport: data.sport ?? current.extracted.sport,
        primaryGoal: data.primaryGoal,
        extractedGoals: data.extractedGoals,
        currentWeight: current.latestMeasurement?.weight ?? current.extracted.currentWeight,
        currentBodyFat: current.latestMeasurement?.bodyFat ?? current.extracted.currentBodyFat,
      },
    });
  } catch {
    // silent background task
  }
}

async function runWelcomeMessage(profile: PulseProfile): Promise<void> {
  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "welcome", profile }),
    });
    const data = await res.json();
    const message =
      data.message ||
      `Hey ${profile.name}. I'm your Pulse coach. I track your health, fitness, food, and lifestyle in the background while you just talk to me. How are things at the minute? Health, fitness, habits. Give me the honest version.`;

    const current = getProfile() ?? profile;
    saveProfile({ ...current, welcomeMessage: message });
  } catch {
    const fallback = `Hey ${profile.name}. I'm your Pulse coach. I track your health, fitness, food, and lifestyle in the background while you just talk to me. How are things at the minute? Health, fitness, habits. Give me the honest version.`;
    const current = getProfile() ?? profile;
    saveProfile({ ...current, welcomeMessage: fallback });
  }
}

export function ensureWelcomeInChatHistory(): void {
  const profile = getProfile();
  if (!profile?.welcomeMessage) return;
  const history = getChatHistory();
  if (history.some((m) => m.role === "coach")) return;
  addChatMessage({
    role: "coach",
    text: profile.welcomeMessage,
    timestamp: new Date().toISOString(),
  });
}

export async function sendCoachMessage(options: {
  input: string;
  profile: PulseProfile | null;
  dailyTotals: import("./types").DailyTotals;
  chatHistory: import("./types").ChatMessage[];
  fromVoice?: boolean;
  imageContext?: string;
}) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "chat",
      input: options.input,
      profile: options.profile,
      dailyTotals: options.dailyTotals,
      chatHistory: options.chatHistory,
      fromVoice: options.fromVoice,
      imageContext: options.imageContext,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(typeof data.error === "string" ? data.error : "Coach unavailable");
  return data as {
    message: string;
    parsed: import("./types").ParsedNutrition;
    profile_updates?: import("./types").PulseProfileLearned;
    should_log: boolean;
  };
}
