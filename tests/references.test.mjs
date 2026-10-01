import test from 'node:test';
import assert from 'node:assert/strict';
import {matchReferences} from '../scripts/match-references.mjs';
const input = tags => ({product_input: {scene_tags: tags}});
test('exact classification retrieves skincare reference with preserved draft status', () => {
  const x = matchReferences(input(['S01', 'P04', 'M02']), 'skincare');
  assert.equal(x.rule_id, 'R-012'); assert.equal(x.rule_match_level, 'exact');
  assert.equal(x.cases[0].case_id, 'C-023');
  assert.equal(x.cases[0].source_review_status, 'draft');
  assert.equal(x.cases[0].quality_label, null); assert.equal(x.cases[0].eligible_for_score_calibration, false);
});
test('canonical names and IDs match identically', () => {
  assert.equal(matchReferences(input(['成熟品质人群', '功能效率', '居家生活'])).rule_id, 'R-012');
});
test('two dimensional fallback', () => {
  assert.equal(matchReferences(input(['P04', 'M06', 'S04'])).rule_id, 'R-105');
});
test('single dimensional fallback', () => {
  assert.equal(matchReferences(input(['M01'])).rule_id, 'R-201');
});
test('unknown tags do not cause invented case recommendations', () => {
  const x = matchReferences(input(['未知人群', '未知动机', '618']));
  assert.equal(x.rule_match_level, 'global'); assert.equal(x.cases.length, 0);
  assert.equal(x.known_tag_count, 0);
});
test('conflicting audience tags remain unresolved', () => {
  const x = matchReferences(input(['P03', 'P06', 'M03']));
  assert.equal(x.resolved_tags.audience_id, null); assert.ok(x.warnings.length);
});
test('category-only retrieval explicitly records missing tag agreement', () => {
  const x = matchReferences(input([]), 'skincare');
  assert.equal(x.cases[0].case_id, 'C-023'); assert.equal(x.cases[0].match_level, 'category_only');
  assert.throws(() => matchReferences(input([]), 'nonexistent'));
});
