'use client';
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen">
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="flex-1 flex flex-col relative">
            <main className="flex-1 p-8 overflow-auto">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider> 
      </body>
    </html>
  );
}