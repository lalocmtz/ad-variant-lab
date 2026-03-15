
CREATE TABLE public.generation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  stage text NOT NULL,
  provider text,
  status text NOT NULL,
  message text,
  raw_error text,
  request_payload_json jsonb,
  response_payload_json jsonb,
  prompt_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User insert generation_logs"
  ON public.generation_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User read generation_logs"
  ON public.generation_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_generation_logs_job_id ON public.generation_logs(job_id);
CREATE INDEX idx_generation_logs_created_at ON public.generation_logs(created_at DESC);
