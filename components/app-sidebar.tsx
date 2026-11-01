'use client';
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Inbox,
  LayoutDashboard,
  List,
  Settings,
  SlidersHorizontal,
  Upload,
  Wallet,
} from "lucide-react"
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
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar"
import { LogOutButton } from "@/features/auth/LogOutButton"

const items = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Budget", url: "/budget", icon: Wallet },
  { title: "Transactions", icon: List },
  { title: "Review Inbox", icon: Inbox },
  { title: "Import", icon: Upload },
  { title: "Rules", url: "/rules", icon: SlidersHorizontal },
  { title: "Settings", url: "/settings", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

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
                    <SidebarMenuButton asChild isActive={pathname === item.url}>
                      <Link
                        href={item.url}
                        onClick={() => setOpenMobile(false)}
                      >
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
