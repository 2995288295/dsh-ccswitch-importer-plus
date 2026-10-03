# DSH CCSwitch 导入器（社区增强版）

将 CCSwitch 里的 Codex、Claude、Claude Desktop 与 OpenCode provider 导入 DeepSeek Harness，并在同一个「设置 -> 模型」页面管理每个模型的推理深度。

[English README](./README.en.md)

> **衍生作品说明**：本插件是 [wtiaw/dsh-ccswitch-importer](https://github.com/wtiaw/dsh-ccswitch-importer)（Apache-2.0）的**衍生版**，由第三方维护，**不是原作者的官方版本**。上游版本面向 DSH 0.1.x；本版本针对 **DSH 0.2.0-rc.2** 重写了 Host/Client 接线，并修复了批量导入、凭据脱敏、多语言等问题。npm 包名为 `dsh-ccswitch-importer-plus`，插件 ID 与 loader ID 与包名一致。完整变更清单见[与上游的差异](#与上游的差异)。

## 功能

- 只读扫描 `~/.cc-switch/cc-switch.db`，识别自定义 **Codex**、**Claude**、**Claude Desktop** 与 **OpenCode** provider；官方和默认 profile 会跳过。
- 将 endpoint、协议、模型 ID 和 API key 导入 DSH 的 `llm-pi-ai` 设置。
- API key 只在 Host 进程中读取，并通过 DSH credentials 服务保存为 `apiKeyEnv` 引用；扫描和导入响应不包含 key。
- 从 Codex TOML 顶层 `model_reasoning_effort` 预填模型推理配置，同时允许之后在 DSH 中修改。
- `none` 映射为关闭；已知模型使用保守目录；未知模型只生成导入值对应的单个等级；非法值安全关闭并给出警告。
- 重新导入不会覆盖已有的推理等级、route 默认值、headers、容量字段或未出现在 CCSwitch 的额外模型。
- 原生 Models 页面、CCSwitch 导入区和模型推理编辑器共存于同一个 Models 页面。
- CCSwitch 导入区、模型推理面板和每个模型卡片都支持收纳折叠，折叠偏好会保存在当前浏览器。

CCSwitch 是只读导入源。首次导入后，DSH 设置和 credentials 服务成为配置事实来源；不会写回 CCSwitch 数据库。

## 安装

从 GitHub 安装：

```bash
dsh plugin --profile desktop add github:2995288295/dsh-ccswitch-importer-plus
```

从本地源码安装：

```bash
dsh plugin --profile desktop add ./dsh-ccswitch-importer-plus
```

安装或更新后刷新 DSH Web 页面，打开 **设置 -> 模型**。

## 使用

1. 在 Models 页面打开「CCSwitch 导入」并点击「扫描」。
2. 选择需要导入的 provider，点击「导入选中」。
3. 检查导入结果和 provider 模型列表。
4. 在同页的模型推理区域确认已预填的等级；第三方网关需要自定义 wire value 时直接编辑并保存。
5. 使用各面板标题栏或模型卡片右侧的箭头收纳/展开内容；折叠偏好会自动记住。
6. 在输入框模型选择器中使用保存后的推理等级。

导入会在设置 revision 冲突时停止并恢复本次写入的 credential；已有 credential 会恢复原值。

## 推理目录

当前保守目录包含：

- GPT-5.6 系列：`off: none`、`low`、`medium`、`high`、`xhigh`、`max`。
- OpenAI o-series（`o1`、`o3`、`o4-mini` 及变体）：`off: null`、`low`、`medium`、`high`。

目录只是默认值，保存后的 DSH 字段由用户控制。

## DSH Community Market 目录

本插件按 [目录适配器指南（路径 A：标准来源）](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/dsh-community-market/docs/catalog-adapter-guide.zh.md) 提供可接入 DSH Community Market 的标准目录。仓库内包含：

- `scripts/build-catalog.mjs` —— 从 `package.json` 元数据生成 `catalog-source` manifest 与 `/v1/plugins` 条目页；
- `scripts/deploy-catalog.sh` —— 一键部署到 Cloudflare Pages（含 JSON Content-Type 重写规则）；
- `test/catalog.test.mjs` —— 用官方 Schema 校验生成结果并断言元数据一致；
- [docs/catalog.md](./docs/catalog.md) —— 部署方式、Content-Type 要求与来源登记说明。

同时，本插件仓库已添加 GitHub topic `dsh-plugin`，会被 [dshfind](https://dshfind.com) 目录来源按 topic 自动收录。

生成与部署：

```bash
DSH_CATALOG_ORIGIN=https://catalog.example.com npm run build:catalog
```

## 安全边界与限制

- Host 路由只接受 loopback、same-origin 请求；API key 不进入浏览器、日志、摘要或错误文本。
- 读取需要 Node.js 22.19 或更高版本，以支持只读 SQLite API。
- 插件只处理 CCSwitch 的自定义 Codex / Claude / Claude Desktop / OpenCode provider 和当前数据库字段；不会探测第三方 API 的真实推理能力。
- 未知模型和不合法等级默认关闭，避免向网关发送未确认的 reasoning 参数。

## 与上游的差异

相对 [wtiaw/dsh-ccswitch-importer](https://github.com/wtiaw/dsh-ccswitch-importer)（`0.1.3`，2026-09-24，面向 DSH 0.1.x），本版本的主要改动：

**针对 DSH 0.2.0-rc.2 的兼容性重写**

- peer 依赖改为 `^0.2.0-rc.2`，移除 0.2.0 已废弃的 `@deepseek-ai/dsh-client-runtime` 注入。
- 适配 0.2.0 的 `{ ok, value }` 远端信封与 `settings.describe()` 命名空间视图。
- 导入源从 Codex 扩展到 Codex、Claude、Claude Desktop 与 OpenCode。
- 新增模型目录回退、模型探测（probe）与 loopback 错误透出。
- 插件挂载到原生「模型」页面底部的 footer 槽位，与原生 UI 共存。

**缺陷修复**

- 批量导入此前只成功第一条：现在每次写入成功后重新读取 settings revision，作为下一条的并发前置条件。
- 凭据脱敏从「按 `sk-` 形状匹配」改为「按已知密钥的值脱敏」，导入响应与 stderr 都不再回显 API key。
- `POST /import` 现在强制要求同源 `Origin` 头；超长请求体会销毁连接而不是静默忽略。
- 保存推理等级期间若又产生新改动，状态显示为「已保存（有未保存修改）」而不是「已保存」。
- 空扫描结果现在区分「未安装 CCSwitch / 无 profile / 数据库不可读 / Node 版本过低」，并回显探测路径。
- `node:sqlite` 改为懒加载，Node 版本不足时给出可读提示，而不是整个插件加载失败。
- 界面文案全部走 zh/en 语言目录，不再硬编码中文。

上游版权与许可证原样保留在 `LICENSE`；改动声明见 `NOTICE`，且每个被改动的源文件头部都带改动提示。

## 开发与验证

要求 Node.js 22.19 或更高版本：

```bash
npm install
npm test
npm run pack:check
```

`npm run build` 生成 DSH Host bundle 和带有 `window.__ModuleLoader__.load` 注册的 Client bundle。发布包只包含 `dist`、patch、README、NOTICE 和许可证，不包含源码与测试。
