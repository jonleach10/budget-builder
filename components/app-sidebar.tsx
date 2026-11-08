'use client';
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Inbox,
  Landmark,
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
  { title: "Accounts", url: "/accounts", icon: Landmark },
  { title: "Transactions", url: "/transactions", icon: List },
  { title: "Review Inbox", url: "/review", icon: Inbox },
  { title: "Import", url: "/import", icon: Upload },
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
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link href={item.url} onClick={() => setOpenMobile(false)}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
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
