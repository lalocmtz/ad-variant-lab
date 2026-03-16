CREATE TABLE public.generation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  job_id TEXT NOT NULL,
  module TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  preview_url TEXT,
  input_summary_json JSONB,
  output_summary_json JSONB,
  provider_used TEXT,
  fallback_chain_json JSONB,
  effective_prompt TEXT,
  current_step TEXT,
  error_summary TEXT,
  resumable BOOLEAN DEFAULT false,
  source_route TEXT,
  resume_payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own history"
  ON public.generation_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history"
  ON public.generation_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own history"
  ON public.generation_history FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);