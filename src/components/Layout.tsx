import { useState, useEffect } from "react";
import { Video, Image, Palette, FolderOpen, Clock, Settings, Plus, LogOut, ShoppingBag, FlaskRound, Microscope, Gamepad2, Wand2, Music } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const createItems = [
  { title: "Video Variants", url: "/create/video", icon: Video },
  { title: "BOF Videos", url: "/create/bof", icon: ShoppingBag },
  { title: "Static Variants", url: "/create/static", icon: Image },
  { title: "B-Roll Lab 2.0", url: "/create/broll-lab-2", icon: FlaskRound },
  { title: "Viral JSON", url: "/create/prompt-lab", icon: Microscope },
  { title: "UGC Arcade", url: "/create/ugc-arcade", icon: Gamepad2 },
  { title: "Aigen", url: "/create/aigen", icon: Wand2 },
  { title: "AudioRoll", url: "/create/audioroll", icon: Music },
];

const libraryItems = [
  { title: "Brand System", url: "/library/brand", icon: Palette },
  { title: "Assets", url: "/library/assets", icon: FolderOpen },
  { title: "History", url: "/library/history", icon: Clock },
];

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="flex flex-col h-full bg-sidebar">
        {/* Logo */}
        <SidebarGroup>
          <div className="flex items-center gap-2.5 px-3 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground">
              <span className="text-xs font-bold text-background">TC</span>
            </div>
            {!collapsed && (
              <span className="text-sm font-semibold text-foreground tracking-tight">Tryholo Copilot</span>
            )}
          </div>
        </SidebarGroup>

        {/* Create */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-section-label px-3">Create</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {createItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <NavLink to={item.url} end className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-foreground font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Library */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-section-label px-3">Library</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {libraryItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <NavLink to={item.url} end className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-foreground font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bottom section */}
        <div className="mt-auto border-t border-sidebar-border p-2 space-y-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location.pathname === "/settings"}>
                <NavLink to="/settings" end className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-foreground font-medium">
                  <Settings className="mr-2 h-4 w-4" />
                  {!collapsed && <span>Settings</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} className="text-muted-foreground hover:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {!collapsed && <span>Log out</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {!collapsed && (
            <Button onClick={() => navigate("/create/video")} className="w-full gradient-cta text-white border-0 mt-2" size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Project
            </Button>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border/50 px-4 bg-card/50">
            <SidebarTrigger />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
