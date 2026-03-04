import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Video, Image, Upload, ArrowRight, Clock, Download, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface RecentJob {
  id: string;
  tiktok_url: string;
  created_at: string | null;
  variant_count: number | null;
  results: any;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [videoUrl, setVideoUrl] = useState("");
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("analysis_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8);
      if (data) setRecentJobs(data as RecentJob[]);
      setLoading(false);
    };
    load();
  }, [user]);

  const handleVideoSubmit = () => {
    if (videoUrl.trim()) {
      navigate(`/create/video?url=${encodeURIComponent(videoUrl.trim())}`);
    } else {
      navigate("/create/video");
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10">
      {/* Hero */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Tryholo Copilot</h1>
        <p className="text-lg text-muted-foreground">Generate ad variants from winning creatives.</p>
      </div>

      {/* Action Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Video Variants Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card hover:shadow-card-hover transition-shadow space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
                  <Video className="h-4 w-4 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Create Video Variants</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Input a TikTok or Reels URL to generate high-performing video iterations using AI analysis.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">TikTok Video URL</label>
            <Input
              placeholder="https://tiktok.com/@user/video/..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="bg-background border-border"
            />
          </div>
          <Button onClick={handleVideoSubmit} className="gradient-cta text-white border-0 gap-2">
            Create Video Variants
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Static Variants Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card hover:shadow-card-hover transition-shadow space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
                  <Image className="h-4 w-4 text-purple-600" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Create Static Variants</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Upload your winning static ad creative to generate 10+ variations of hooks and layouts.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/create/static")}
            className="flex h-28 w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-background transition-colors hover:border-primary/30 hover:bg-muted/50"
          >
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-6 w-6" />
              <span className="text-sm">Drop files here or click to upload</span>
              <span className="text-xs">PNG, JPG, PSD (Max 25MB)</span>
            </div>
          </button>
          <Button onClick={() => navigate("/create/static")} className="gradient-cta text-white border-0 w-full">
            Upload to Start
          </Button>
        </div>
      </div>

      {/* Recent Jobs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Recent Jobs</h2>
          </div>
          <Button variant="link" onClick={() => navigate("/library/history")} className="text-sm text-primary p-0 h-auto">
            View all
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : recentJobs.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No jobs yet. Start by creating your first variant.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            {recentJobs.map((job, i) => {
              const coverUrl = job.results?.variants?.[0]?.generated_image_url;
              const date = job.created_at ? new Date(job.created_at) : null;
              const variantCount = job.variant_count || job.results?.variants?.length || 0;

              return (
                <div
                  key={job.id}
                  className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer ${
                    i < recentJobs.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Video className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {variantCount} variant{variantCount !== 1 ? "s" : ""} generated
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""} · Video
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Complete
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
