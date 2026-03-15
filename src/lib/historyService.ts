import { supabase } from "@/integrations/supabase/client";

export interface HistoryRecord {
  id?: string;
  user_id: string;
  job_id: string;
  module: string;
  title?: string;
  status: string;
  preview_url?: string;
  input_summary_json?: Record<string, any>;
  output_summary_json?: Record<string, any>;
  provider_used?: string;
  fallback_chain_json?: any[];
  effective_prompt?: string;
  current_step?: string;
  error_summary?: string;
  resumable?: boolean;
  source_route?: string;
  resume_payload_json?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

/**
 * Create a new history record when a job starts.
 */
export async function createHistoryRecord(record: Omit<HistoryRecord, "id" | "created_at" | "updated_at">): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("generation_history" as any)
      .insert([record] as any)
      .select("id")
      .single();

    if (error) {
      console.warn("createHistoryRecord failed (table may not exist yet):", error.message);
      return null;
    }
    return (data as any)?.id || null;
  } catch (e) {
    console.warn("createHistoryRecord exception:", e);
    return null;
  }
}

/**
 * Update an existing history record (e.g., step change, completion, failure).
 */
export async function updateHistoryRecord(
  jobId: string,
  updates: Partial<HistoryRecord>
): Promise<void> {
  try {
    const { error } = await supabase
      .from("generation_history" as any)
      .update(updates as any)
      .eq("job_id", jobId);

    if (error) {
      console.warn("updateHistoryRecord failed:", error.message);
    }
  } catch (e) {
    console.warn("updateHistoryRecord exception:", e);
  }
}

/**
 * Fetch all history records for the current user, sorted by most recent.
 */
export async function fetchHistory(limit = 100): Promise<HistoryRecord[]> {
  try {
    const { data, error } = await supabase
      .from("generation_history" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("fetchHistory failed:", error.message);
      return [];
    }
    return (data || []) as unknown as HistoryRecord[];
  } catch (e) {
    console.warn("fetchHistory exception:", e);
    return [];
  }
}

/**
 * Fetch a single history record by job_id.
 */
export async function fetchHistoryByJobId(jobId: string): Promise<HistoryRecord | null> {
  try {
    const { data, error } = await supabase
      .from("generation_history" as any)
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    if (error) {
      console.warn("fetchHistoryByJobId failed:", error.message);
      return null;
    }
    return (data as unknown as HistoryRecord) || null;
  } catch (e) {
    console.warn("fetchHistoryByJobId exception:", e);
    return null;
  }
}
