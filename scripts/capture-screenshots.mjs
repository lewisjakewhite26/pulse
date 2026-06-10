import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, process.env.SCREENSHOTS_DIR || "screenshotsnew");
const PORT = process.env.PULSE_PORT || "3099";
const BASE = process.env.PULSE_URL || `http://localhost:${PORT}`;

mkdirSync(OUT, { recursive: true });

const DEMO_GOAL =
  "Want to get to 10% body fat and last the full 90 minutes on the pitch. Play Sunday league football, want to feel fitter and leaner.";

const DEMO_PROFILE = {
  name: "Lewis",
  dateOfBirth: "1990-06-15",
  sex: "Male",
  currentSituation: "",
  goal: DEMO_GOAL,
  timeline: 6,
  effortLevel: 3,
  extracted: {
    sport: "Football",
    targetBodyFat: 10,
    medication: ["Sertraline"],
  },
  learned: {
    usualLunch: "Chicken wrap",
    alcoholPattern: "Weekends only",
    medicationMentioned: ["Sertraline"],
  },
  targets: {
    calculated: true,
    calories: 2400,
    protein_g: 180,
    water_ml: 3000,
    steps: 10000,
  },
  latestMeasurement: {
    weight: 84.2,
    bodyFat: 18.4,
    muscleMass: 62.1,
    date: new Date().toISOString(),
  },
  welcomeMessage:
    "Hey Lewis. Good to have you here. Log whatever you eat or do today and I'll pick up the patterns. How are things at the minute?",
};

const DEMO_GOALS = {
  raw: DEMO_GOAL,
  timeline: 6,
  effortLevel: 3,
  generatedAt: new Date().toISOString(),
  targets: [{ metric: "body_fat_pct", current: 18.4, target: 10, unit: "%" }],
  milestones: [
    { label: "Week 2", date: "2026-06-22", projectedBodyFat: 17.5, description: "First visible shift in energy and recovery." },
    { label: "Week 6", date: "2026-07-20", projectedBodyFat: 15.2, description: "Training sessions feel easier to finish." },
    { label: "Week 12", date: "2026-09-01", projectedBodyFat: 12.8, description: "Match fitness noticeably improved." },
    { label: "Week 24", date: "2026-12-01", projectedBodyFat: 10.5, description: "Target range for body composition." },
  ],
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function waitForApp(page) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  await waitForApp(page);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("Saved", file);
}

async function clearStorage(page) {
  await page.goto(BASE, { waitUntil: "load" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "load" });
  await waitForApp(page);
}

async function enterPin(page) {
  const first = page.locator('input[aria-label="Digit 1 of 4"]');
  await first.click();
  await first.fill("0000");
  await page.waitForTimeout(500);
}

function buildDailyRecord(date, overrides = {}) {
  return {
    date,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    water_ml: 0,
    alcohol_units: 0,
    steps: 0,
    medication_taken: false,
    ...overrides,
  };
}

async function seedDemoApp(page) {
  const today = todayStr();
  await page.evaluate(
    ({ profile, goals, todayDate }) => {
      const pin = btoa("pulse:0000");
      localStorage.setItem(
        "pulse_account",
        JSON.stringify({ username: "Lewis", pin, created_at: new Date().toISOString() })
      );
      localStorage.setItem("pulse_session_unlocked", "true");
      localStorage.setItem("pulse_onboarded", "true");
      localStorage.setItem("pulse_profile", JSON.stringify(profile));
      localStorage.setItem("pulse_goals", JSON.stringify(goals));
      localStorage.setItem("pulse_last_synced", new Date().toISOString());

      const logs = [
        {
          id: "log-1",
          date: todayDate,
          time: "08:15",
          raw: "Porridge with banana and coffee",
          parsed: { calories: 380, protein_g: 14, carbs_g: 52, fat_g: 9, confidence: {}, flags: [], notes: "" },
          created_at: new Date().toISOString(),
        },
        {
          id: "log-2",
          date: todayDate,
          time: "12:40",
          raw: "Chicken wrap and water",
          parsed: { calories: 520, protein_g: 42, carbs_g: 38, fat_g: 14, confidence: {}, flags: [], notes: "" },
          created_at: new Date().toISOString(),
        },
        {
          id: "log-3",
          date: todayDate,
          time: "15:20",
          raw: "Protein bar after training",
          parsed: { calories: 210, protein_g: 20, carbs_g: 18, fat_g: 7, confidence: {}, flags: [], notes: "" },
          created_at: new Date().toISOString(),
        },
      ];
      localStorage.setItem("pulse_logs", JSON.stringify(logs));

      const daily = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        daily[key] = {
          date: key,
          calories: key === todayDate ? 1680 : 2100 + i * 40,
          protein_g: key === todayDate ? 118 : 140,
          carbs_g: 180,
          fat_g: 55,
          water_ml: key === todayDate ? 1800 : 2200,
          alcohol_units: i === 0 ? 0 : i % 3 === 0 ? 4 : i % 2 === 0 ? 2 : 0,
          steps: key === todayDate ? 6420 : 7800 + i * 200,
          medication_taken: key === todayDate,
        };
      }
      localStorage.setItem("pulse_daily", JSON.stringify(daily));

      const measurements = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        measurements.push({
          id: `m-${i}`,
          date: d.toISOString().slice(0, 10),
          time: "07:30",
          weight: 85.1 - i * 0.15,
          bodyFat: 18.8 - i * 0.1,
          muscleMass: 61.8,
          created_at: d.toISOString(),
        });
      }
      localStorage.setItem("pulse_measurements", JSON.stringify(measurements));

      localStorage.setItem(
        "pulse_activities",
        JSON.stringify([
          {
            id: "act-1",
            type: "Run",
            source: "Garmin",
            date: todayDate,
            duration: "42:18",
            distance: "7.2 km",
            avgHR: 156,
            calories: 520,
            created_at: new Date().toISOString(),
          },
          {
            id: "act-2",
            type: "Football",
            source: "Manual",
            date: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString().slice(0, 10); })(),
            duration: "90:00",
            distance: "9.4 km",
            avgHR: 162,
            calories: 780,
            created_at: new Date().toISOString(),
          },
        ])
      );

      localStorage.setItem(
        "pulse_chat_history",
        JSON.stringify([
          {
            id: "c-1",
            role: "coach",
            text: profile.welcomeMessage,
            timestamp: new Date(Date.now() - 3600000).toISOString(),
          },
          {
            id: "c-2",
            role: "user",
            text: "Had porridge and a chicken wrap so far. Training tonight.",
            timestamp: new Date(Date.now() - 1800000).toISOString(),
          },
          {
            id: "c-3",
            role: "coach",
            text: "Solid start. You're on track for protein. Hydrate before training and log whatever you eat after.",
            timestamp: new Date(Date.now() - 900000).toISOString(),
          },
        ])
      );
    },
    { profile: DEMO_PROFILE, goals: DEMO_GOALS, todayDate: today }
  );
}

async function captureOnboarding(page) {
  await clearStorage(page);
  await page.getByPlaceholder(/Lewis/i).waitFor({ timeout: 30000 });
  await shot(page, "01-onboarding-basics");

  await page.getByRole("button", { name: "Male", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Where do you want to get to?").waitFor({ timeout: 15000 });
  await shot(page, "02-onboarding-goal");

  await page.locator("textarea").fill(DEMO_GOAL);
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Want to grab your measurements?").waitFor({ timeout: 15000 });
  await shot(page, "03-onboarding-renpho");
}

async function captureAccountSetup(page) {
  await clearStorage(page);
  await page.evaluate(({ profile }) => {
    localStorage.setItem("pulse_onboarded", "true");
    localStorage.setItem("pulse_profile", JSON.stringify(profile));
  }, { profile: DEMO_PROFILE });
  await page.reload();
  await waitForApp(page);
  await shot(page, "04-account-setup-name");

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForTimeout(500);
  await shot(page, "05-account-setup-pin");
  await enterPin(page);
  await page.waitForTimeout(600);
  await shot(page, "06-account-setup-confirm-pin");
}

async function capturePinLock(page) {
  await clearStorage(page);
  await page.evaluate(() => {
    const pin = btoa("pulse:0000");
    localStorage.setItem(
      "pulse_account",
      JSON.stringify({ username: "Lewis", pin, created_at: new Date().toISOString() })
    );
    localStorage.setItem("pulse_onboarded", "true");
    localStorage.removeItem("pulse_session_unlocked");
  });
  await page.reload();
  await shot(page, "07-pin-lock");
}

async function captureMainTabs(page) {
  await clearStorage(page);
  await seedDemoApp(page);
  await page.reload();
  await waitForApp(page);

  const tabs = [
    "08-tab-dashboard",
    "09-tab-log",
    "10-tab-activity",
    "11-tab-trends",
    "12-tab-profile",
  ];

  for (let i = 0; i < tabs.length; i++) {
    await page.locator("nav button").nth(i).click();
    await page.waitForTimeout(700);
    await shot(page, tabs[i]);
  }
}

async function captureStravaToast(page) {
  await clearStorage(page);
  await seedDemoApp(page);
  await page.goto(`${BASE}?tab=activity&strava=connected`);
  await page.waitForTimeout(800);
  await shot(page, "13-activity-strava-toast");
}

function writeGalleryIndex() {
  const shots = [
    ["01-onboarding-basics", "Onboarding — name, DOB and sex"],
    ["02-onboarding-goal", "Onboarding — goal and sliders"],
    ["03-onboarding-renpho", "Onboarding — Renpho scale"],
    ["04-account-setup-name", "Account setup — name"],
    ["05-account-setup-pin", "Account setup — set PIN"],
    ["06-account-setup-confirm-pin", "Account setup — confirm PIN"],
    ["07-pin-lock", "PIN lock"],
    ["08-tab-dashboard", "Dashboard"],
    ["09-tab-log", "Log / coach chat"],
    ["10-tab-activity", "Activity"],
    ["11-tab-trends", "Trends"],
    ["12-tab-profile", "Profile"],
    ["13-activity-strava-toast", "Activity — Strava connected toast"],
  ];

  const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pulse — Screen Gallery (new design)</title>
  <style>
    body { font-family: "Plus Jakarta Sans", system-ui, sans-serif; background: #FAFAFA; color: #1A1D24; margin: 0; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 8px; letter-spacing: -0.02em; }
    p { color: #6B7280; margin-top: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; max-width: 1200px; }
    figure { margin: 0; background: rgba(255,255,255,0.7); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(26,29,36,0.04); border: 1.5px solid rgba(255,255,255,0.4); }
    img { width: 100%; display: block; }
    figcaption { padding: 12px 14px; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Pulse screen gallery</h1>
  <p>New Stitch design system · 480×900 viewport · ${new Date().toISOString().slice(0, 10)}</p>
  <div class="grid">${shots
    .map(
      ([file, label]) =>
        `<figure><a href="${file}.png" target="_blank"><img src="${file}.png" alt="${label}" loading="lazy" /></a><figcaption>${label}</figcaption></figure>`
    )
    .join("")}</div>
</body>
</html>`;
  writeFileSync(path.join(OUT, "index.html"), html);
}

async function startServer() {
  return spawn("npm", ["run", "start"], {
    cwd: ROOT,
    shell: true,
    stdio: "pipe",
    env: { ...process.env, PORT },
  });
}

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Server did not start");
}

async function main() {
  if (!process.env.SKIP_BUILD) {
    console.log("Building app...");
    await new Promise((resolve, reject) => {
      const build = spawn("npm", ["run", "build"], { cwd: ROOT, shell: true, stdio: "inherit" });
      build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("build failed"))));
    });
  }

  console.log("Starting server...");
  const server = await startServer();
  await waitForServer();

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 480, height: 900 },
    deviceScaleFactor: 2,
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  try {
    await captureOnboarding(page);
    await captureAccountSetup(page);
    await capturePinLock(page);
    await captureMainTabs(page);
    await captureStravaToast(page);
    writeGalleryIndex();
  } finally {
    await context.close();
    await browser.close();
    server.kill();
  }

  console.log(`Done. Screenshots saved to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
