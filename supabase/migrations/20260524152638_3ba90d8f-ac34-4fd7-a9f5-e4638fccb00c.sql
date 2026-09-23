-- 1. 清理导入过程留下的测试行
DELETE FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000099';

-- 2. 重建 auth.users 条目（保留原 UUID 与邮箱）。密码留空 -> 用户需使用"忘记密码"重置。
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN
    SELECT * FROM (VALUES
      ('f5cc7f3b-815d-44ac-8107-2aab1c5972c1'::uuid, '2177543133@qq.com'),
      ('d0eaad40-1300-48d9-8109-5ac5cc98db26'::uuid, '956498688@qq.com'),
      ('d5ca937b-37a2-4c53-9bbf-3040c5895a69'::uuid, 'www.1214851704@qq.com'),
      ('be8c4685-5452-4f84-8bc6-6cec0327589c'::uuid, '2336067318@qq.com'),
      ('9265dc14-10e7-4d8d-a986-2b00d21d9516'::uuid, 'www.2635322620@qq.com')
    ) AS t(id, email)
  LOOP
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
      crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), u.id,
            jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', u.id::text, now(), now(), now())
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;