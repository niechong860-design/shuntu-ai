UPDATE public.generation_tasks
SET
  status = 'canceled',
  completed_at = now(),
  updated_at = now()
WHERE user_id = (
  SELECT id
  FROM auth.users
  WHERE email = 'Niechong860@gmail.com'
  LIMIT 1
)
AND status IN ('queued', 'running')
AND deduction_status = 'not_charged';