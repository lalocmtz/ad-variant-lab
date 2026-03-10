import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
import StaticVariants from "./pages/StaticVariants";
import BofVideosPage from "./pages/BofVideosPage";
import BrandSystemPage from "./pages/BrandSystemPage";
import AssetsPage from "./pages/AssetsPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute><Layout>{children}</Layout></ProtectedRoute>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<Auth />} />
    <Route path="/" element={<Navigate to="/create/video" replace />} />
    <Route path="/dashboard" element={<Navigate to="/create/video" replace />} />
    <Route path="/create/video" element={<AppLayout><Index /></AppLayout>} />
    <Route path="/create/static" element={<AppLayout><StaticVariants /></AppLayout>} />
    <Route path="/library/brand" element={<AppLayout><BrandSystemPage /></AppLayout>} />
    <Route path="/library/assets" element={<AppLayout><AssetsPage /></AppLayout>} />
    <Route path="/library/history" element={<AppLayout><HistoryPage /></AppLayout>} />
    <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />
    {/* Legacy redirects */}
    <Route path="/static-ads" element={<Navigate to="/create/static" replace />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
