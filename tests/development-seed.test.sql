-- Local pgTAP seed replay inside a rollback-only transaction. No user fixtures.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(5);
CREATE TEMP TABLE expected_category_slugs (slug text PRIMARY KEY);
INSERT INTO expected_category_slugs VALUES
  ('sports'), ('study'), ('food'), ('gaming'), ('events'), ('fitness'),
  ('outdoor'), ('volunteering'), ('networking'), ('hobby'), ('entertainment'), ('other');

\ir ../supabase/seed.sql
CREATE TEMP TABLE first_seed AS
  SELECT c.* FROM public.categories c JOIN expected_category_slugs e USING (slug);
\ir ../supabase/seed.sql

SELECT is((SELECT count(*)::integer FROM public.categories c
  JOIN expected_category_slugs e USING (slug)), 12, 'all twelve requested categories exist');
SELECT ok(NOT EXISTS (
  SELECT c.slug FROM public.categories c JOIN expected_category_slugs e USING (slug)
  GROUP BY c.slug HAVING count(*) <> 1
), 'second seed run creates no duplicate slugs');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM first_seed first_run FULL OUTER JOIN (
    SELECT c.* FROM public.categories c JOIN expected_category_slugs e USING (slug)
  ) second_run USING (slug)
  WHERE (first_run.id, first_run.name, first_run.sort_order, first_run.is_active, first_run.created_at, first_run.updated_at)
    IS DISTINCT FROM (second_run.id, second_run.name, second_run.sort_order, second_run.is_active, second_run.created_at, second_run.updated_at)
), 'replay preserves IDs, values, created_at and updated_at');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.categories c
  JOIN expected_category_slugs e USING (slug) WHERE NOT c.is_active), 'seeded categories are active');
UPDATE public.categories SET is_active = false, sort_order = 99 WHERE slug = 'sports';
\ir ../supabase/seed.sql
SELECT ok((SELECT is_active AND sort_order = 1 FROM public.categories WHERE slug = 'sports'),
  'seed restores curated active/order values after Development data drifts');
SELECT * FROM finish();
ROLLBACK;
