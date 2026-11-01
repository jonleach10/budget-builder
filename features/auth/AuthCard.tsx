import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="font-display text-heading-sm font-medium text-ice-highlight">
          {title}
        </h1>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function AuthError({ message }: { message: string | null }) {
  // Always rendered, so a screen reader announces a message when it appears.
  return (
    <div role="alert">
      {message && (
        <p className="flex items-start gap-2 text-body-sm text-ember-glow">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}
