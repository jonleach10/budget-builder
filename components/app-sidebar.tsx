'use client';
import Link from "next/link"
import { Home, Landmark, LayoutTemplate, Settings, Wallpaper } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarFooter
} from "@/components/ui/sidebar"
import { LogOutButton } from "@/features/auth/LogOutButton"

const items = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Quick Start",
    url: "/visualization",
    icon: Wallpaper
  },
  {
    title: "Budgets",
    //url: "/budgets",
    icon: Landmark,
  },
  {
    title: "Templates",
    //url: "/templates",
    icon: LayoutTemplate,
  },
  {
    title: "Settings",
    //url: "/settings",
    icon: Settings,
  }
]

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Budget Builder</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.url ? (
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton disabled>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <LogOutButton />
      </SidebarFooter>
    </Sidebar>
  )
}