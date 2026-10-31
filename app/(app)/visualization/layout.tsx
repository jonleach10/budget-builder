import type { ReactNode } from "react";
export default function VisualizationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="w-full">
      {children}
    </div>
  );
}
