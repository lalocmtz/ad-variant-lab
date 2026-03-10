CREATE POLICY "User update analysis_history"
ON public.analysis_history FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);