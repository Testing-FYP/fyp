"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function GoogleCallbackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [error, setError] = useState("");
  const hasCompletedBridge = useRef(false);

  useEffect(() => {
    if (status === "loading" || hasCompletedBridge.current) return;

    if (status === "unauthenticated") {
      router.replace("/auth");
      return;
    }

    if (status === "authenticated" && session?.user) {
      hasCompletedBridge.current = true;
      const u = session.user as any;

      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleId: u.googleId,
          email: u.email,
          firstName: u.firstName || u.name?.split(" ")[0] || "",
          lastName: u.lastName || u.name?.split(" ").slice(1).join(" ") || "",
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.token) {
            localStorage.setItem("travel_token", data.token);
            localStorage.setItem("travel_user", JSON.stringify(data.user));
            window.location.href = "/";
          } else {
            hasCompletedBridge.current = false;
            setError(data.error || "Sign-in failed");
          }
        })
        .catch(() => {
          hasCompletedBridge.current = false;
          setError("Network error during Google sign-in");
        });
    }
  }, [status, session, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <a href="/auth" className="text-blue-500 underline">
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Completing sign-in...</p>
    </div>
  );
}
