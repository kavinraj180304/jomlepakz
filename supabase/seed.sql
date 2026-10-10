-- Development/local reference data only. No users or example activities.
-- Ordinary migration pushes do not include this file. Never use --include-seed
-- against Production. See README.md for the loopback-only repeatable command.
-- One statement is atomic and safe to run repeatedly after initial migration.
INSERT INTO public.categories AS existing (id, slug, name, sort_order, is_active)
VALUES
  ('880cd028-bf0d-4f43-9ddc-000000000001', 'sports', 'Sports', 1, true),
  ('880cd028-bf0d-4f43-9ddc-000000000002', 'study', 'Study', 2, true),
  ('880cd028-bf0d-4f43-9ddc-000000000003', 'food', 'Food', 3, true),
  ('880cd028-bf0d-4f43-9ddc-000000000004', 'gaming', 'Gaming', 4, true),
  ('880cd028-bf0d-4f43-9ddc-000000000005', 'events', 'Events', 5, true),
  ('880cd028-bf0d-4f43-9ddc-000000000006', 'fitness', 'Fitness', 6, true),
  ('880cd028-bf0d-4f43-9ddc-000000000007', 'outdoor', 'Outdoor', 7, true),
  ('880cd028-bf0d-4f43-9ddc-000000000008', 'volunteering', 'Volunteering', 8, true),
  ('880cd028-bf0d-4f43-9ddc-000000000009', 'networking', 'Networking', 9, true),
  ('880cd028-bf0d-4f43-9ddc-000000000010', 'hobby', 'Hobby', 10, true),
  ('880cd028-bf0d-4f43-9ddc-000000000011', 'entertainment', 'Entertainment', 11, true),
  ('880cd028-bf0d-4f43-9ddc-000000000012', 'other', 'Other', 12, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active
WHERE (existing.name, existing.sort_order, existing.is_active)
  IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.sort_order, EXCLUDED.is_active);
