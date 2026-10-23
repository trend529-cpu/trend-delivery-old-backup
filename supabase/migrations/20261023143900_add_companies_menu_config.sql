-- Compatibility migration for application menu and company time-zone settings.
-- Additive and safe to rerun; existing company rows and settings are preserved.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS menu_config jsonb;
