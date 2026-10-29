-- D1 stores only a non-secret reference. Worker credentials remain in Secrets.
ALTER TABLE models_config ADD COLUMN secret_ref TEXT;
