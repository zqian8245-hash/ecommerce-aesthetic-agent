import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchQualityExamples} from '../scripts/match-quality-examples.mjs';
test('one example per user label and no invented numeric score', () => {
  const x = matchQualityExamples('home_appliances');
  assert.deepEqual(x.selected_cases.map(c => c.user_quality_label), ['好', '中', '差']);
  for (const c of x.selected_cases) {assert.equal(c.dimension_scores, null); assert.equal(c.formal_pass, null); assert.equal(Object.keys(c.dimension_observations).length, 6);}
});
test('held-out cases cannot enter matcher output', () => {
  for (const category of [null, 'home_appliances', 'consumer_electronics', 'projector', 'cleaning', 'audio']) {
    for (const c of matchQualityExamples(category).selected_cases) assert.ok(!['G-003','G-006','M-003','P-002','P-005'].includes(c.case_id));
  }
});
test('source counts and split preserved', () => {
  const x = JSON.parse(fs.readFileSync(new URL('../reference-library/quality-cases/manifest.json', import.meta.url), 'utf8'));
  assert.equal(x.cases.length, 17);
  assert.deepEqual(['好','中','差'].map(label => x.cases.filter(c => c.user_quality_label === label).length), [9,3,5]);
  assert.equal(x.cases.filter(c => c.split === 'reserved_test').length, 5);
});
test('unknown category fails clearly', () => {assert.throws(() => matchQualityExamples('unknown'));});
