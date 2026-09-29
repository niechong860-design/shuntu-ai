
-- 1. 在 app_role 枚举中加入 founder
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'founder';
