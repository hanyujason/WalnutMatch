# WalnutMatch

中文文玩核桃配对桌面工具（Electron + React + TypeScript）。

## 第一版能做什么

- 导入一对同品种核桃的六面同框照片，填写两颗的边宽、肚宽、桩高。
- AI 分析形状与纹路，程序按固定规则计算百分制分数及 S/A/B/C/D 等级。
- 显示逐项扣分依据、拍摄质量和评价可信度，保存历史并导出中文报告。
- 自行配置 API 地址、模型及密钥；支持 Responses 和 Chat Completions 协议。

当前版本 **0.1.2**，提供 macOS Apple Silicon（M 系列芯片）安装包，见 [Releases](https://github.com/hanyujason/WalnutMatch/releases)。解压后打开 WalnutMatch.app；应用尚未签名和公证。Windows、Intel Mac 和 Linux 暂未提供经过验证的安装包。

[使用说明](docs/使用说明.md) · [验证记录](docs/验证记录.md) · [版本记录](CHANGELOG.md)

### API 配置示例

用户已使用 DeepSeek 完成一次真实六图评分：基础地址 `https://api.deepseek.com`，Chat Completions 协议，模型 `deepseek-flash`，取消勾选严格结构化输出。模型可用性和费用以服务商文档为准，密钥由使用者自行提供。

文本连接测试成功仅说明文本请求可用；视觉分析必须使用支持图像输入的模型。分析时照片发送到配置的服务商，报告与配置保存在本机，密钥使用 Electron safeStorage 加密保存。

### 本地目录与版本保存

持续在同一个 WalnutMatch 项目目录开发，`release/` 只存最新安装包。源码历史通过 Git 提交保存，完成检查后 push 到 GitHub；可运行版本通过 GitHub Releases 保存。安装包和源码分别管理，避免把大文件提交进 Git。

### 评分原则与边界

形状占 60 分、纹路占 40 分，尺寸差另外扣分；照片不完整时根据可判断项目折算估算分数和等级，明确标为暂评；全部无法判断时不出分。可信度表示照片支持判断的程度，不是准确率。价格、商家评级、色差、磕碰和黄尖不参与本版评分。

首个真实样本得到 88.5 分、A级，与用户的参考判断一致；这只证明一次实际流程已跑通，不代表评分准确率或重复稳定性已经验证。规则为实验草案，结果仅供配对参考，不构成鉴定或价格评估。

## 开发

需要 Node.js 22+ 和 npm。依赖版本以 package-lock.json 为准。

```sh
npm ci
npm start
```

构建与验证：

```sh
npm run build
npm test
npm run test:desktop
npm run pack
npm run dist
```

pack 生成本机 Apple Silicon 的 .app；dist 生成 ZIP 分发包。没有自动部署、自动更新或任何后台模型调用。

## 代码结构

- core/rules.ts：权重、差异档系数、尺寸扣分、等级与可信度。
- core/analysis.ts：中文视觉提示词、JSON Schema 和结果验证。
- core/provider.ts：Responses / Chat Completions 请求构造和解析。
- electron/main.ts：密钥保护、请求、本地存储、导出、窗口。
- electron/preload.ts：限量桌面接口。
- src/：中文界面。
- tests/：评分边界、结果验证、两种协议的本地模拟 HTTP 测试。
- docs/使用说明.md：用户说明。

规则和提示词版本分别记录在每份报告中。修改规则后旧报告不会被默默重算。价格与商家评级不进入视觉提示词。

开发专用环境变量 WALNUTMATCH_DATA_DIR 可指定隔离数据目录。WALNUTMATCH_SMOKE 用于启动截图检查，常规用户不需要设置。

自动测试使用本地模拟接口，不需要真实密钥或付费调用。不要提交商家原图、API 密钥或本地报告。

## 版权

Copyright © 2026 Han Yujie。当前未授予开源许可；公开代码用于展示与参考，复制、修改或再分发须获得作者授权。
