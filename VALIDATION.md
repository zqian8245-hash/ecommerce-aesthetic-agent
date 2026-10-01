# v2升级验证记录

日期：2026-10-01（Asia/Shanghai）。基于用户反馈：旧返图有明显生成模板感、改动过小；新输入包含原始商品母本与C组标签；固定输出为两类Agent共享JSON。

## 本次改动

- 对外业务输入严格使用poster_image与product_input五个指定字段，不要求用户增加run_id、版本、品牌规范或upstream。
- 对外响应严格为agent_name、score、pass、problem_list、modify_suggestion、protected_content、meta；meta只有judge_dimensions与confidence。本模块固定aesthetic_agent。
- score改为0—10，保留之前严格标准为8.5总分/8单项。问题和修改建议等长同序。
- 允许refine/rebuild/redesign；多个结构缺陷或严重材质问题不再锁定旧背景、布局和标题风格。
- 以原商品图与输入文案保护商品身份和事实，允许移动与等比缩放商品、重排文案和重建环境。
- 内部明细、重构计划与图片制作提示词使用独立文件，不增加公共JSON字段。
- 新增缺图/缺分的0分占位与confidence0状态约定；不用于质量排序。

## 已执行验证

- `node --test tests/evaluate.test.mjs`：20项通过、0项失败。
- 已执行演示CLI，输出6.7分、pass=false，并选择redesign；数据纯属虚构接口测试，不对应实际海报。
- 输入、内部评价、固定输出、内部计算结果均通过PowerShell Test-Json的JSON Schema校验。
- 已更新单文件完整可复制指令；脚本输出固定JSON和独立内部文件。
- 已检查简单YAML frontmatter、名称、描述长度和文件链接。

标准quick_validate.py已尝试执行，但Python环境缺PyYAML，因此该标准验证器未通过运行；独立静态检查覆盖本包实际使用的简单frontmatter与本地链接，没有安装额外依赖。

## 验证范围

暂无新版完整真实输入中的product_img及selling_points/price_text/marketing_target/scene_tags，未调用图像工具生成新版海报；不声称美学判断已校准或大改效果已改善。旧618记录仍为v1，标签变更问题和尺寸失败没有被升级过程改写。

此前整个包已保存为“电商海报美学专家Agent_v1_升级前存档_20261001.zip”。新包为“电商海报美学专家Agent_v2_统一接口与大改版.zip”。
