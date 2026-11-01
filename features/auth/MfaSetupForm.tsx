"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { AuthError } from "./AuthCard";
import { browserMfa } from "./browserAuth";
import { confirmMfaCode, startMfaSetup, type MfaSetup } from "./mfa";
import { MfaCodeForm } from "./MfaCodeForm";

export function MfaSetupForm() {
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Effects run twice in development, and a second setup would replace the
    // QR code on screen with a different one.
    if (started.current) return;
    started.current = true;
    void startMfaSetup(browserMfa()).then(setSetup);
  }, []);

  async function handleRetry() {
    setSetup(null);
    setSetup(await startMfaSetup(browserMfa()));
  }

  if (setup === null) {
    return <p className="text-body-sm text-muted-foreground">Loading...</p>;
  }

  if (!setup.ok) {
    return (
      <div className="space-y-4">
        <AuthError message={setup.message} />
        <Button type="button" className="w-full" onClick={handleRetry}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scanners need dark squares on white, whatever the theme. */}
      <div className="mx-auto w-fit rounded-md bg-white p-2">
        <Image
          src={setup.qrCode}
          alt="QR code for your authenticator app"
          width={176}
          height={176}
          unoptimized
        />
      </div>
      <div className="space-y-1">
        <p className="text-body-sm text-muted-foreground">
          If you can&apos;t scan it, enter this key in the app:
        </p>
        <code className="block rounded-md bg-muted px-2.5 py-1.5 text-body-sm break-all text-foreground">
          {setup.secret}
        </code>
      </div>
      <MfaCodeForm
        submit={(code) => confirmMfaCode(browserMfa(), setup.factorId, code)}
      />
    </div>
  );
}
