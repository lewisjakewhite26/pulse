"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveStravaTokens } from "../../../lib/storage";

function StravaCallbackInner() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      router.replace("/?tab=activity&strava=cancelled");
      return;
    }

    if (!code) {
      router.replace("/?tab=activity&strava=error");
      return;
    }

    const redirectUri = `${window.location.origin}/strava/callback`;

    fetch("/api/strava/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Connection failed.");
        saveStravaTokens(data);
        router.replace("/?tab=activity&strava=connected");
      })
      .catch(() => {
        router.replace("/?tab=activity&strava=error");
      });
  }, [params, router]);

  return (
    <div className="pulse-canvas" style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      color: "#6B7280", textAlign: "center", fontSize: 15,
    }}>
      Connecting to Strava…
    </div>
  );
}

export default function StravaCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="pulse-canvas" style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#FAFAFA", color: "#6B7280",
        }}>
          Connecting to Strava…
        </div>
      }
    >
      <StravaCallbackInner />
    </Suspense>
  );
}
