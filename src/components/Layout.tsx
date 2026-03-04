import { useState, useEffect } from "react";
import { Video, Image, LogOut, ExternalLink, Loader2 } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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

const modules = [
  { title: "Video Variants", url: "/", icon: Video },
  { title: "Static Ads", url: "/static-ads", icon: Image },
];

interface HistoryEntry {
  id: string;
  tiktok_url: string;
  created_at: string;
  variant_count: number;
  results: any;
}

function HistorySidebar({ onLoad }: { onLoad: (r: any) => void }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("analysis_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      if (data) setEntries(data as unknown as HistoryEntry[]);
      setLoading(false);
    };
    fetch();
  }, [user]);

  if (loading) return <Loader2 className="mx-auto mt-4 h-4 w-4 animate-spin text-muted-foreground" />;
  if (entries.length === 0) return <p className="px-2 text-xs text-muted-foreground">Sin historial</p>;

  return (
    <div className="space-y-1 px-1">
      {entries.map((e) => {
        const coverUrl = e.results?.variants?.[0]?.generated_image_url;
        const date = new Date(e.created_at!);
        return (
          <button
            key={e.id}
            onClick={() => onLoad(e.results)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
          >
            {coverUrl ? (
              <img src={coverUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary">
                <Video className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-foreground">{e.variant_count} variantes</p>
              <p className="text-[10px] text-muted-foreground">{date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="flex flex-col h-full">
        <SidebarGroup>
          <div className="flex items-center gap-2 px-2 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-primary">
              <span className="text-sm font-bold text-primary-foreground">PV</span>
            </div>
            {!collapsed && (
              <span className="text-sm font-semibold text-foreground truncate">Perfect Variant</span>
            )}
          </div>
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {modules.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <NavLink to={item.url} end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && location.pathname === "/" && (
          <SidebarGroup className="flex-1 overflow-auto">
            <SidebarGroupLabel>Historial</SidebarGroupLabel>
            <SidebarGroupContent>
              <HistorySidebar onLoad={() => {
                // Will be handled via event
                window.dispatchEvent(new CustomEvent("load-history", { detail: arguments[0] }));
              }} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <div className="mt-auto border-t border-border p-2">
          {!collapsed && user && (
            <div className="mb-2 truncate px-2 text-[11px] text-muted-foreground">{user.email}</div>
          )}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} className="text-muted-foreground hover:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {!collapsed && <span>Cerrar sesión</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-10 flex items-center border-b border-border/50 px-4">
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
