import { AuthCard } from "@/features/auth/AuthCard";
import { LogOutButton } from "@/features/auth/LogOutButton";
import { MfaVerifyForm } from "@/features/auth/MfaVerifyForm";

export default function Page() {
  return (
    <AuthCard
      title="Enter Code"
      description="Enter the 6-digit code from your authenticator app."
    >
      <MfaVerifyForm />
      <LogOutButton />
    </AuthCard>
  );
}
