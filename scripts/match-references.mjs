import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const source = path.join(ROOT, 'assets/classification-source/classification');
const groups = {audience_id: 'audiences', motivation_id: 'purchase_motivations', scenario_id: 'scenarios'};

export function matchReferences(input, category = null) {
  const tags = input?.product_input?.scene_tags;
  if (!Array.isArray(tags) || tags.some(t => typeof t !== 'string')) throw new Error('scene_tags must be a string array');
  const taxonomy = read(path.join(source, 'taxonomy.json'));
  const library = read(path.join(ROOT, 'reference-library/index.json'));
  const rules = read(path.join(source, 'rules.json')).rules;
  if (category && !library.cases.some(c => c.product_category === category)) throw new Error('Unknown internal product category');
  const resolved = {}, warnings = [], unknown = [], signals = Object.fromEntries(Object.keys(groups).map(k => [k, new Set()]));
  for (const tag of tags) {
    const exact = [], aliases = [];
    for (const [key, group] of Object.entries(groups)) for (const label of taxonomy[group]) {
      if (tag === label.id || tag === label.name) exact.push({key, id: label.id});
      else if (label.positive_signals.includes(tag)) aliases.push({key, id: label.id});
    }
    const matches = exact.length ? exact : aliases;
    if (matches.length === 1) signals[matches[0].key].add(matches[0].id);
    else if (matches.length > 1) warnings.push(`标签“${tag}”存在歧义，未自动指定分类`);
    else unknown.push(tag);
  }
  for (const [key, ids] of Object.entries(signals)) {
    resolved[key] = ids.size === 1 ? [...ids][0] : null;
    if (ids.size > 1) warnings.push(`${key}包含多个候选，保留未确定状态`);
  }
  const matching = rules.filter(r => Object.entries(r.match).every(([key, value]) => value === '*' || value === resolved[key]));
  const specificity = r => Object.values(r.match).filter(v => v !== '*').length;
  matching.sort((a, b) => specificity(b) - specificity(a) || b.priority - a.priority || a.rule_id.localeCompare(b.rule_id));
  const rule = matching[0];
  if (!rule) throw new Error('No fallback rule');
  const recommended = new Set(rule.recommended_cases || rule.recommended_case_ids || []);
  const knownCount = Object.values(resolved).filter(Boolean).length;
  const ranked = library.cases.map(c => {
    const overlap = Object.entries(resolved).filter(([k, v]) => v && c.tags[k].id === v).length;
    return {c, overlap, category_match: category ? c.product_category === category : null,
      rank: overlap * 10 + (recommended.has(c.case_id) ? 5 : 0) + (category && c.product_category === category ? 40 : 0)};
  }).filter(x => x.overlap > 0 || x.category_match === true)
    .sort((a, b) => b.rank - a.rank || a.c.case_id.localeCompare(b.c.case_id));
  if (unknown.length) warnings.push(`未识别标签：${unknown.join('、')}；未按标签位置猜测分类`);
  if (!category) warnings.push('未提供内部商品品类；案例匹配只依据场景标签，须实际看图确认适用性');
  if (!ranked.length) warnings.push('没有足够依据选择案例；仅采用通用规则，不随机推荐图片');
  if (resolved.audience_id === 'P06') warnings.push('当前库没有银发人群专属案例，不视为完整覆盖');
  return {
    schema_version: '1.0', library_version: library.library_version,
    input_scene_tags: [...tags], product_category: category, resolved_tags: resolved,
    rule_id: rule.rule_id, rule_match_level: ['global', 'single_dimension', 'two_dimension', 'exact'][specificity(rule)],
    style_guidance: rule.style, warnings,
    cases: ranked.slice(0, 3).map(({c, overlap, category_match}) => ({
      case_id: c.case_id, image_path: c.image_path, image_sha256: c.image_sha256,
      style_family: c.style_family, observed_subject: c.observed_subject,
      matched_tag_count: overlap, category_match,
      match_level: overlap === 3 ? 'exact_tags' : overlap > 0 ? 'partial_tags' : 'category_only',
      cross_category_transfer_only: category_match === false,
      visual_strengths: c.visual_strengths, visual_risks: c.visual_risks,
      transferable_principles: c.transferable_principles, metadata_note: c.metadata_note,
      source_review_status: c.source_review_status, quality_label: null, eligible_for_score_calibration: false
    })), known_tag_count: knownCount
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      if (!['--input', '--category', '--out'].includes(process.argv[i]) || !process.argv[i + 1]) throw new Error('Use --input INPUT [--category CATEGORY] [--out FILE]');
      args[process.argv[i].slice(2)] = process.argv[i + 1];
    }
    if (!args.input) throw new Error('--input required');
    const output = JSON.stringify(matchReferences(read(args.input), args.category || null), null, 2) + '\n';
    if (args.out) {fs.mkdirSync(path.dirname(path.resolve(args.out)), {recursive: true}); fs.writeFileSync(args.out, output, {encoding: 'utf8', flag: 'wx'});}
    process.stdout.write(output);
  } catch (e) {process.stderr.write(e.message + '\n'); process.exitCode = 1;}
}
