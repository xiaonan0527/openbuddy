# OpenBuddy

独立实现的中文本地 AI 工作台，使用 MIT 许可证开源。支持任务和工作空间、真实 Agent 工具执行、Office 文件生成、技能与专家、MCP、资料库、自动化和 Electron 桌面运行。

这不是腾讯 WorkBuddy 客户端，也不使用原程序的代码、资源、账号或后端。完整覆盖说明见 [功能矩阵](docs/FEATURE-MATRIX.md)。

## 运行

需要 Node.js 22 或更新版本，以及支持 Responses API 的模型服务。仓库不包含任何可用密钥、个人 API 地址、会话或工作空间数据。

```sh
git clone https://github.com/xiaonan0527/openbuddy.git
cd openbuddy
npm ci
cp config.example.toml config.local.toml
# 在 config.local.toml 中填写自己的 API 地址、模型与密钥配置
npm run dev
```

开发模式启动后，打开终端中 Vite 显示的本地网址。后端单独运行时，先构建前端：

```sh
npm run build
npm start
```

桌面窗口：

```sh
npm run desktop
```

生成 macOS Apple Silicon 应用目录：

```sh
npm run package:mac
```

打包结果位于 `release-final/mac-arm64/OpenBuddy.app`。本地开发版本不含 Apple 公证与自动更新服务。

## 模型配置

复制 [config.example.toml](config.example.toml) 为 `config.local.toml`，把 `https://api.example.com/v1`、`YOUR_MODEL_ID` 替换为自己的服务与模型。模板默认从环境变量 `OPENBUDDY_API_KEY` 读取密钥。桌面版通常不会继承终端环境，可将同一模板保存在 `~/.config/openbuddy/config.toml`，在这个仅本机使用的文件中，用 `experimental_bearer_token = "你的密钥"` 替换 `env_key`。

配置按以下优先级读取：

1. `OPENBUDDY_CONFIG_PATH` 指定的 TOML 文件。
2. 项目 `config.local.toml`。
3. `~/.config/openbuddy/config.toml`。
4. 模型环境变量：`OPENBUDDY_API_KEY`、`OPENBUDDY_BASE_URL`、`OPENBUDDY_MODEL`，也兼容 `OPENAI_*` 对应变量。
5. 兼容读取 `~/.codex/config.toml` 当前 provider，方便已有 Codex 配置的用户。

也提供 [.env.example](.env.example)。复制为 `.env` 并填写后，可先运行 `npm run build`，再通过 `node --env-file=.env server/index.js` 启动；普通 `npm run dev` 不会自动加载 `.env`，优先使用 TOML 配置。配置格式详见 [配置说明](docs/CONFIGURATION.md)。

真实配置被 Git 和桌面打包规则排除。密钥只由后端读取，不通过 `/api/state` 返回给界面；模型和服务地址会在本机设置页显示。不同来源的配置不会借用 Codex 账户的 `auth.json` 去认证自定义 API。

如果连接失败，检查服务是否支持 Responses API、模型名称、密钥权限和网络。不要在聊天、截图或日志中粘贴密钥。密钥读取与协议适配见 `server/provider.js`。

## 第一次使用

1. 在设置页测试模型连接。
2. 创建一个独立工作空间，避免使用用户主目录或磁盘根目录。
3. 在办公、开发或设计场景中输入目标，例如“读取这个工作空间的资料，整理一份 Markdown 摘要”。
4. Agent 工具事件显示执行过程。需要写入、命令或外部 MCP 操作时，在对话中查看参数后批准或拒绝。
5. 在右侧文件栏预览、下载产物；Office 文件可用本机 Word、Excel、PowerPoint 或 WPS 打开。

示例任务：

```text
创建一份三页的产品介绍 PPTX，主题是本地 AI 工作台。
每页分别说明：用户问题、主要能力、开始使用。
把文件保存到 outputs/产品介绍.pptx，并告诉我实际文件路径。
```

```text
只读检查当前工作空间的项目结构，找出入口、依赖和构建命令。
不要运行命令或修改文件。给出有文件路径依据的说明。
```

## 技能、专家与连接器

技能是可复用工作指令，专家是角色指令和技能组合。内置内容为本项目独立编写，可自行创建和修改。它们需要真实工具支持，不会凭空添加媒体生成、联网搜索等服务。

连接器支持 Streamable HTTP MCP 和本地 stdio MCP。添加配置后需手动连接，应用不会在启动时自动运行连接器进程。只有连接成功返回的工具才会进入 Agent 的可用工具清单。此版本不包含 OAuth 登录，也不导入腾讯连接器凭据。

## 自动化

可设置分钟间隔、工作空间和提示词，暂停/恢复或手动立即运行。每次运行产生一个独立任务，便于追溯。

后台任务固定使用只读模式，不能自动批准命令、文件写入或外部 MCP 操作。应用进程关闭期间不会运行，也不会把错过的计划批量补跑。需要生成文件或发送消息的无人值守流程，应另行实现明确的工具和权限策略。

## 本地数据与安全

- Web 开发版默认数据保存在项目 `.data/`，包含会话、设置、资料记录与默认工作空间；桌面版使用 macOS 应用数据目录 `~/Library/Application Support/OpenBuddy/openbuddy-data/`。两种运行方式的数据独立，请备份后再删除。
- 自选工作空间中的文件保留在你选择的目录。
- 已选的模型 API 会收到任务消息、记忆和相关文件/工具内容；请按你使用的服务处理数据。
- 文件工具阻止目录越界、受保护的凭据文件和符号链接。批准的 Shell 命令以你的用户身份运行，并非操作系统沙箱。
- 不建议将本地服务公开到公网；本项目面向单用户本机运行。
- HTML 产物以隔离 iframe 预览；执行型网页建议经代码检查后另行启动。

## 验证

```sh
npm test
npm run build
```

真实模型连通性需在本机执行设置页连接测试；不使用假回复冒充 API 成功。接口及模块约定见 [开发契约](docs/CONTRACT.md)。

## 贡献与隐私

贡献前请阅读 [贡献指南](CONTRIBUTING.md) 和 [安全说明](SECURITY.md)。提交代码前运行 `npm run check:public`，检查已跟踪文件中的常见密钥、私人路径与数据文件。GitHub Actions 会执行测试、构建及发布文件检查。

本项目没有遥测或官方账号服务；你选择的模型服务与 MCP 工具仍可能接收任务和文件内容。不要将本机服务开放到公网。许可证为 [MIT](LICENSE)，依赖仍遵循各自许可证。
