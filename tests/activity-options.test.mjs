import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Compile the isolated config modules in memory using the project's existing
// TypeScript dependency, so these tests also run on supported Node 20 versions.
async function loadConfig(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { activityCategories, activityCategoryNames } = await loadConfig('../src/lib/config/activity-categories.ts');
const { CUSTOM_LOCATION_ID, CUSTOM_LOCATION_LABEL, LOCATION_MAX_LENGTH,
  normalizeLocationText, resolveActivityLocation, umLocations } = await loadConfig('../src/lib/config/um-locations.ts');

test('catalog has the twelve requested active categories with unique stable identities', () => {
  assert.deepEqual(activityCategoryNames, ['Sports', 'Study', 'Food', 'Gaming', 'Events',
    'Fitness', 'Outdoor', 'Volunteering', 'Networking', 'Hobby', 'Entertainment', 'Other']);
  for (const field of ['id', 'slug', 'name', 'sortOrder']) {
    assert.equal(new Set(activityCategories.map(category => category[field])).size, 12);
  }
  for (const category of activityCategories) {
    assert.match(category.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match(category.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.equal(category.isActive, true);
  }
});

test('SQL seed matches the application catalog and preserves existing IDs', () => {
  const seed = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8').replace(/--[^\r\n]*/g, '');
  const rows = [...seed.matchAll(/\('([^']+)', '([^']+)', '([^']+)', (\d+), (true|false)\)/g)]
    .map(([, id, slug, name, order, active]) => ({ id, slug, name, sortOrder: Number(order), isActive: active === 'true' }));
  assert.deepEqual(rows, activityCategories);
  assert.match(seed, /ON CONFLICT \(slug\) DO UPDATE SET/);
  const update = seed.slice(seed.indexOf('DO UPDATE SET'));
  assert.doesNotMatch(update, /\bid\s*=/);
  assert.match(update, /IS DISTINCT FROM/);
  assert.equal([...seed.matchAll(/INSERT INTO /g)].length, 1);
  assert.doesNotMatch(seed, /\b(DROP|TRUNCATE|DELETE|auth\.users|public\.profiles|CREATE POLICY|GRANT)\b/i);
});

test('curated locations have unique IDs and resolve to their trusted labels', () => {
  assert.equal(CUSTOM_LOCATION_LABEL, 'Other / Custom Location');
  assert.equal(new Set(umLocations.map(location => location.id)).size, umLocations.length);
  for (const location of umLocations) {
    assert.match(location.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.notEqual(location.id, CUSTOM_LOCATION_ID);
    assert.equal(resolveActivityLocation(location.id, 'forged label'), location.label);
    assert.equal(normalizeLocationText(location.label), location.label);
  }
  assert.throws(() => resolveActivityLocation('unknown'), /Choose a location/);
  assert.throws(() => resolveActivityLocation(null), /Choose a location/);
});

test('custom locations stay free text and enforce normalized Unicode length bounds', () => {
  assert.equal(resolveActivityLocation(CUSTOM_LOCATION_ID, '  Meet outside KK8  '), 'Meet outside KK8');
  assert.equal(resolveActivityLocation(CUSTOM_LOCATION_ID, '咖啡厅入口'), '咖啡厅入口');
  assert.equal(normalizeLocationText('a'.repeat(LOCATION_MAX_LENGTH)).length, LOCATION_MAX_LENGTH);
  assert.throws(() => normalizeLocationText('a'.repeat(LOCATION_MAX_LENGTH + 1)), /150/);
  assert.equal(Array.from(normalizeLocationText('🌳'.repeat(150))).length, 150);
  assert.throws(() => normalizeLocationText('🌳'.repeat(151)), /150/);
  for (const invalid of ['', '   ', null, 42]) assert.throws(() => normalizeLocationText(invalid), /Enter a location/);
});

test('custom locations reject line breaks and controls before normalization', () => {
  for (const text of ['Meet\nthere', '\rKK1', 'KK\t1', 'KK\0' + '1', 'KK\u007f1', 'KK\u00851']) {
    assert.throws(() => normalizeLocationText(text), /control characters/);
  }
});
