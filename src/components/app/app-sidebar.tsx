"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { navItems } from "@/components/app/nav";
import { Palette, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

export function AppSidebar({ userName, userEmail }: { userName: string; userEmail: string }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
                <Palette className="size-4 text-primary" aria-hidden />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-heading font-semibold tracking-tight">Atelier</span>
                <span className="truncate text-xs text-muted-foreground">studio for making with AI</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Surfaces</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton isActive={active} tooltip={item.title} render={<Link href={item.href} />}>
                      <item.icon aria-hidden />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {item.badge ? <SidebarMenuBadge className="text-[10px]">{item.badge}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 pb-1 group-data-[collapsible=icon]:hidden">
          <div className="grid flex-1 leading-tight">
            <span className="truncate text-sm font-medium">{userName}</span>
            <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            title="Sign out"
            onClick={() => authClient.signOut()}
          >
            <LogOut className="size-4" aria-hidden />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
