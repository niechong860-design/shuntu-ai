-- Keep the credit grants aligned with the server-side package mapping.
UPDATE public.recharge_packages
SET credits = CASE price
  WHEN '9.9' THEN 1000
  WHEN '29.9' THEN 3180
  WHEN '69.9' THEN 7560
  WHEN '129' THEN 14170
  WHEN '199' THEN 22000
END
WHERE price IN ('9.9', '29.9', '69.9', '129', '199');
