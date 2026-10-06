# WalnutMatch

中文文玩核桃配对桌面工具（Electron + React + TypeScript）。当前版本 **0.2.0**。

## 当前功能

- 两棱六视角、三棱八视角，至少一张整体同框照片即可提交。三棱重点比较三条棱布局是否对应，参考正奔对正奔、Y字对Y字。
- AI分析形状与纹路，固定程序规则计算百分制分数及S/A/B/C/D等级；缺图时标记暂评，全部无法判断则不出分。
- 尺寸选填：全空仅视觉评级，部分填写仅比较双方都填的项目。40与40.0相等，缺失不当成0。
- 中文拍照提示、最多8条选填细节文字／图片／位置／所属核桃。用户描述与模型观察分开，黄、磕碰等仅备注，不直接扣配对分。
- 历史保存、中文Markdown和JSON导出，旧报告兼容；自配API，支持Responses和Chat Completions协议。

[下载安装包](https://github.com/hanyujason/WalnutMatch/releases) · [使用说明](docs/使用说明.md) · [验证记录](docs/验证记录.md) · [版本记录](CHANGELOG.md)

提供macOS Apple Silicon（M系列）程序，ZIP解压后打开WalnutMatch.app。尚未签名、公证，其他系统暂未验证。

## 评分与数据

形状60分、纹路40分，已填且可比较的尺寸差另外扣分；缺图估分按已评项目得分／满分折算到100分，标记暂评及低照片可信度。未填写尺寸或细节本身不降低照片可信度。细节图不能代替缺失整体视角。

照片可信度表示证据充分程度，不是准确率。规则尚未通过大规模样本校准；首个真实DeepSeek样本得到88.5分、A级只证明一次流程跑通，新三棱与细节分析仍需实测。结果仅供配对参考，不构成鉴定或价格评估。

照片在点击分析时发送到自配服务商，报告保存在本机，密钥用Electron safeStorage加密。不要提交商家原图、密钥或个人报告。

已使用的DeepSeek配置示例：基础地址 https://api.deepseek.com，Chat Completions，模型deepseek-flash，取消严格结构化输出。模型可用性与费用以服务商文档为准；文本连接测试成功不代表图像能力可用。

## 开发

需要Node.js 22+和npm，依赖以package-lock.json为准。

```sh
npm ci
npm start
npm test
npm run test:desktop
npm run build
npm run dist
```

固定在一个项目目录开发，release/只保存本机最新版。源码通过commit和push保存到GitHub，可下载版本通过GitHub Releases保存。上传确认后才清理本地旧包；安装包不进入Git。

- core/types.ts：两棱／三棱模板及报告类型。
- core/input.ts：可选尺寸、整体和细节输入校验。
- core/rules.ts：权重、尺寸扣分、估分、等级和照片可信度。
- core/analysis.ts：中文提示、动态JSON结构与证据校验。
- core/provider.ts：两种API协议。
- electron/：密钥、存储、桌面窗口与导出。
- src/：中文界面；tests/和scripts/smoke.cjs：本地模拟测试。

规则与提示版本保存在每份报告中，旧报告不重算。WALNUTMATCH_DATA_DIR指定隔离测试目录；桌面测试用项目自有图标作模拟图片，无需密钥、付费接口或商家照片。

## 版权

Copyright © 2026 Han Yujie。当前未授予开源许可；公开代码用于展示与参考，复制、修改或再分发须获得作者授权。
