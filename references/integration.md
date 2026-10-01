# v2固定接口与主流程对接

外部输入精确为poster_image、product_input；product_input含product_img、selling_points、price_text、marketing_target、scene_tags。JSON不能含注释。两图由宿主解析成真实可读取资源，Node脚本不从路径执行视觉理解。

外部输出精确为agent_name、score、pass、problem_list、modify_suggestion、protected_content、meta；meta只有judge_dimensions、confidence。共享output.schema允许consumer_agent和aesthetic_agent，本模块只返回后者。字段不增不减；问题与动作同序。

score是0—10小数，总分阈值8.5，单项门槛8。舍入只影响展示，pass按原值。score0/confidence0且问题以“无法评价”开头表示未评价占位，循环不能把它当真实0分加入比较。此约定是固定数字接口的状态编码限制，正式项目需一致遵守。

## 内部数据

internal-review.json：图像是否实际查看、六维分数/证据/置信度、内容保护检查、问题/对应动作、design_plan。详见schemas/review.schema.json。该文件是视觉模型的内部产物，不是用户业务输入。

context.json是调度器上下文，可包含version、mode、hard_check、consumer和输出画布；不注入业务输入。每个上游结果携带同版本version、status和report_ref。mode=integrated时缺少同版本真实通过记录，本模块对外pass=false并给补齐提示；standalone默认不需要上下文。不用旧版上游通过记录验收新图。

## 命令

```powershell
node scripts/evaluate.mjs --input templates/input.json --review examples/review-v2.demo.json --out runs/demo-v2
```

主流程接入可附`--context runtime/context.json`及`--config config.json`。默认外部响应写agent-result.json，另写assessment-internal.json、report-internal.md、redesign-plan.json、redesign-prompt.txt。标准输出仅同一个agent-result JSON，故调度器可以直接解析。

脚本校验JSON结构、计算分数和重构强度、整理提示词，不读取图片、不运行消费者Agent、不生成海报。

## 图片与提示词为什么独立

用户统一JSON没有图片、提示词和分项分数字段。评价Agent只返回固定响应；主流程根据modify_suggestion和内部design_plan制作海报。新图、提示词、详细分数放版本文件，不往meta塞额外字段。也不能把很长的图片数据塞入modify_suggestion。

## 循环

主流程：生成→硬性检查→消费者Agent→美学Agent→（通过选版/失败修改）。美学修改允许重构；消费者已经理解的事实信息必须保留，但并不冻结信息位置/大小。修改后重新跑全部检查。

每轮用同一product_input母本、量表和阈值。未评价/等待上游/内容失败不作为分数提升的证据。默认未达标就继续，直到通过、遇到明确阻塞或达到预算；最多8次制作；仅在有明确宿主预算时附加时间限制。连续两轮相对历史最佳视觉分提升<0.2时自动换设计方向并继续剩余轮数，不将停止写成通过。缺原素材且生成反复改写标签时，优先转素材合成修复；不能继续整图重绘后仅按美学分数选版。

## v1迁移

旧run_id、poster_version、brief、upstream不是v2业务字段。旧total_score/100不直接返回，v2 score按10分制。历史runs和examples/demo-output保留为v1记录，禁止用新版schema校验或“重新解释”旧报告。升级前完整包已另存ZIP。


8轮规则：每轮保存图、依据、评分及身份核验状态；始终保留历史最佳版本，不以最新替代最佳。正式成功必须总分≥8.5、各项≥8且内容保护通过；达到8轮仍失败时返回最佳候选与未达标原因。缺原商品图时允许用户授权的视觉诊断迭代，但身份未经核验的图不得称为正式合格。
