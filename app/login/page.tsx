import { AuthCard } from "@/features/auth/AuthCard";
import { LoginForm } from "@/features/auth/LoginForm";

export default function Page() {
  return (
    <AuthCard
      title="Log In to Budget Builder"
      description="Enter your email and password."
    >
      <LoginForm />
    </AuthCard>
  );
}
