import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^\uFEFF/, ''));
export function matchQualityExamples(category = null) {
  const manifest = read('reference-library/quality-cases/manifest.json');
  const observations = read('reference-library/quality-cases/observations.json');
  const cases = manifest.cases.map(c => ({...c, ...observations.cases.find(x => x.case_id === c.case_id)}));
  if (category && !cases.some(c => c.product_category === category)) throw new Error('Unknown quality-library category');
  const household = new Set(['home_appliances', 'parenting', 'cleaning']);
  const selected = [];
  for (const label of ['好', '中', '差']) {
    const pool = cases.filter(c => c.split === 'calibration' && c.user_quality_label === label);
    pool.sort((a, b) => {
      const score = c => (category && c.product_category === category ? 10 : 0) + (household.has(category) && household.has(c.product_category) ? 3 : 0);
      return score(b) - score(a) || a.case_id.localeCompare(b.case_id);
    });
    const c = pool[0];
    if (c) selected.push({case_id: c.case_id, user_quality_label: c.user_quality_label, image_path: c.image_path,
      image_sha256: c.image_sha256, product_category: c.product_category,
      category_match: category ? c.product_category === category : null,
      dimension_observations: c.dimension_observations, limitations: c.limitations,
      modify_direction: c.modify_direction, dimension_scores: null, formal_pass: null});
  }
  return {schema_version: '1.0', product_category: category, label_source: 'user_folder',
    use_mode: 'preference_calibration_not_numeric_ground_truth', selected_cases: selected,
    warnings: ['仅选择calibration集，reserved_test不参与提示词。', '类别为用户整体偏好；分项观察由AI补充，不是人工逐维标注。',
      '跨品类仅比较视觉原则，缺少原商品母本与完整营销任务，不能判正式pass。',
      '好类并非全维达标；差类并非全维低分。禁止按标签预设评分或以接近参考图作为通过条件。']};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      if (!['--category', '--out'].includes(process.argv[i]) || !process.argv[i + 1]) throw new Error('Use [--category CATEGORY] [--out FILE]');
      args[process.argv[i].slice(2)] = process.argv[i + 1];
    }
    const result = JSON.stringify(matchQualityExamples(args.category || null), null, 2) + '\n';
    if (args.out) {fs.mkdirSync(path.dirname(path.resolve(args.out)), {recursive: true}); fs.writeFileSync(args.out, result, {encoding: 'utf8', flag: 'wx'});}
    process.stdout.write(result);
  } catch (e) {process.stderr.write(e.message + '\n'); process.exitCode = 1;}
}
