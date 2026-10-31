import type { ReactNode } from "react";
import "../globals.css";
export default function VisualizationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="w-full">
      {children}
    </div>
  );
}
