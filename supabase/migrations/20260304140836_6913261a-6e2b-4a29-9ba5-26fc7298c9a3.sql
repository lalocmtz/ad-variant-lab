
-- Add user_id to all relevant tables
ALTER TABLE public.analysis_history ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.brands ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.brand_assets ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.ad_templates ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.customer_profiles ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.campaigns ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.campaign_ads ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop all old policies and recreate with user scoping
DROP POLICY IF EXISTS "Public insert" ON public.analysis_history;
DROP POLICY IF EXISTS "Public read" ON public.analysis_history;
CREATE POLICY "User insert analysis_history" ON public.analysis_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User read analysis_history" ON public.analysis_history FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public insert brands" ON public.brands;
DROP POLICY IF EXISTS "Public read brands" ON public.brands;
DROP POLICY IF EXISTS "Public update brands" ON public.brands;
DROP POLICY IF EXISTS "Public delete brands" ON public.brands;
CREATE POLICY "User insert brands" ON public.brands FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User read brands" ON public.brands FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User update brands" ON public.brands FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User delete brands" ON public.brands FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public insert brand_assets" ON public.brand_assets;
DROP POLICY IF EXISTS "Public read brand_assets" ON public.brand_assets;
DROP POLICY IF EXISTS "Public delete brand_assets" ON public.brand_assets;
CREATE POLICY "User insert brand_assets" ON public.brand_assets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User read brand_assets" ON public.brand_assets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User delete brand_assets" ON public.brand_assets FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public insert ad_templates" ON public.ad_templates;
DROP POLICY IF EXISTS "Public read ad_templates" ON public.ad_templates;
DROP POLICY IF EXISTS "Public delete ad_templates" ON public.ad_templates;
CREATE POLICY "User insert ad_templates" ON public.ad_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User read ad_templates" ON public.ad_templates FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User delete ad_templates" ON public.ad_templates FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Public read customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Public update customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Public delete customer_profiles" ON public.customer_profiles;
CREATE POLICY "User insert customer_profiles" ON public.customer_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User read customer_profiles" ON public.customer_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User update customer_profiles" ON public.customer_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User delete customer_profiles" ON public.customer_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public insert campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Public read campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Public update campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Public delete campaigns" ON public.campaigns;
CREATE POLICY "User insert campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User read campaigns" ON public.campaigns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User update campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User delete campaigns" ON public.campaigns FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public insert campaign_ads" ON public.campaign_ads;
DROP POLICY IF EXISTS "Public read campaign_ads" ON public.campaign_ads;
DROP POLICY IF EXISTS "Public update campaign_ads" ON public.campaign_ads;
CREATE POLICY "User insert campaign_ads" ON public.campaign_ads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User read campaign_ads" ON public.campaign_ads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User update campaign_ads" ON public.campaign_ads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
