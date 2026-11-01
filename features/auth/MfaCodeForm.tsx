"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthError } from "./AuthCard";
import type { AuthResult } from "./mfa";
import { HOME_PATH } from "./routeFor";

type MfaCodeFormProps = {
  submit: (code: string) => Promise<AuthResult>;
};

export function MfaCodeForm({ submit }: MfaCodeFormProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await submit(code);
    if (result.ok) {
      window.location.assign(HOME_PATH);
      return;
    }
    setCode("");
    setError(result.message);
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
      </div>
      <AuthError message={error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Verifying..." : "Verify Code"}
      </Button>
    </form>
  );
}
