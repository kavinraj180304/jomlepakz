import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const seed = readFileSync(new URL('../seed.sql', import.meta.url), 'utf8')
  .replace(/--[^\r\n]*/g, '').replace(/\r\n/g, '\n').trim();
const migration = readFileSync(new URL('../migrations/20261015160000_reference_categories.sql', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n').trim();

test('reference migration contains exactly the seed upsert inside a transaction', () => {
  assert.equal(migration, `BEGIN;\n\n${seed}\n\nCOMMIT;`);
  assert.equal(migration.split(';').filter(statement => statement.trim()).length, 3);
  assert.doesNotMatch(migration, /\b(?:GRANT|REVOKE|CREATE|ALTER|DROP|TRUNCATE|DELETE)\b/i);
  assert.doesNotMatch(migration, /\bauth\.|public\.(?:profiles|activities)\b/);
});

test('all twelve reference rows preserve approved UUIDs, slugs, names, ordering and active flags', () => {
  const rows = [...migration.matchAll(/\('([^']+)', '([^']+)', '([^']+)', (\d+), (true|false)\)/g)]
    .map(([, id, slug, name, order, active]) => ({ id, slug, name, order: Number(order), active }));
  const expected = [
    ['sports', 'Sports'], ['study', 'Study'], ['food', 'Food'], ['gaming', 'Gaming'],
    ['events', 'Events'], ['fitness', 'Fitness'], ['outdoor', 'Outdoor'],
    ['volunteering', 'Volunteering'], ['networking', 'Networking'], ['hobby', 'Hobby'],
    ['entertainment', 'Entertainment'], ['other', 'Other'],
  ].map(([slug, name], index) => ({
    id: `880cd028-bf0d-4f43-9ddc-${String(index + 1).padStart(12, '0')}`,
    slug, name, order: index + 1, active: 'true',
  }));
  assert.equal(rows.length, 12);
  assert.deepEqual(rows, expected);
});

test('upsert preserves existing IDs and skips unchanged category values', () => {
  assert.match(migration, /ON CONFLICT \(slug\) DO UPDATE SET\n  name = EXCLUDED\.name,\n  sort_order = EXCLUDED\.sort_order,\n  is_active = EXCLUDED\.is_active\nWHERE \(existing\.name, existing\.sort_order, existing\.is_active\)\n  IS DISTINCT FROM \(EXCLUDED\.name, EXCLUDED\.sort_order, EXCLUDED\.is_active\);/);
});
