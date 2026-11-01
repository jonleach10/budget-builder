"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthError } from "./AuthCard";
import { signOut } from "./browserAuth";
import { LOGIN_PATH } from "./routeFor";

export function LogOutButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleLogOut() {
    setPending(true);
    setError(null);

    const result = await signOut();
    if (result.ok) {
      window.location.assign(LOGIN_PATH);
      return;
    }
    setError(result.message);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <AuthError message={error} />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={handleLogOut}
      >
        {pending ? "Logging Out..." : "Log Out"}
      </Button>
    </div>
  );
}
