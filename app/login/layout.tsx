import type { ReactNode } from "react";
import "../globals.css";
export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      {children}
    </div>
  );
}
