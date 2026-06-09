"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveStravaTokens } from "../../../lib/storage";

function StravaCallbackInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("Connecting to Strava…");

  useEffect(() => {
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      setMessage("Strava authorisation was cancelled.");
      return;
    }

    if (!code) {
      setMessage("No authorisation code received from Strava.");
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
      .catch((err: Error) => {
        setMessage(err.message || "Could not connect to Strava.");
      });
  }, [params, router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#F8F9FA",
        fontFamily: "system-ui, sans-serif",
        color: "#414754",
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}

export default function StravaCallbackPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F8F9FA",
            color: "#414754",
          }}
        >
          Connecting to Strava…
        </div>
      }
    >
      <StravaCallbackInner />
    </Suspense>
  );
}
