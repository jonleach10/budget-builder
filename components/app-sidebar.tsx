'use client';
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
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabaseClient"

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
  const handleSignOut = async function() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error)
    } else {
      console.log("User successfully signed out")
    }
  }
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
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button variant="outline" className="w-full" onClick={handleSignOut}>
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}