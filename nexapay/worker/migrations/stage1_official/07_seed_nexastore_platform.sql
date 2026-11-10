-- Optional seed after 01–06. Safe to re-run.
INSERT INTO public.platforms (name, slug, status, description)
VALUES ('NexaStore', 'nexastore', 'active', 'NexaPulse app marketplace')
ON CONFLICT (slug) DO UPDATE SET status = EXCLUDED.status, updated_at = now();
