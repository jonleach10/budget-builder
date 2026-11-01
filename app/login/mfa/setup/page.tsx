import { AuthCard } from "@/features/auth/AuthCard";
import { LogOutButton } from "@/features/auth/LogOutButton";
import { MfaSetupForm } from "@/features/auth/MfaSetupForm";

export default function Page() {
  return (
    <AuthCard
      title="Set Up Authenticator"
      description="Scan this QR code with your authenticator app, then enter the 6-digit code it shows."
    >
      <MfaSetupForm />
      <LogOutButton />
    </AuthCard>
  );
}
