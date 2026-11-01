import type { ReactNode } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { requireSession } from "@/features/auth/requireSession";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex-1 flex flex-col relative">
        {/* On a phone the sidebar is a closed sheet, so its own trigger can't show. */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 md:hidden">
          <SidebarTrigger className="size-11" />
          <span className="text-body-sm font-medium text-moon-mist">
            Budget Builder
          </span>
        </header>
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
