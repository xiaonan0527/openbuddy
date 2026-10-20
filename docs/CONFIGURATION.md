# 模型配置

OpenBuddy 支持 Responses API 和 OpenAI Chat Completions 兼容接口。设置页可保存多个模型供应商；公开仓库仅包含配置模板，不含私人 API 地址、密钥或本机模型清单。

## 添加供应商

进入“设置 → 模型 → 添加模型”，选智谱、Kimi 中国版、MiniMax 中国版、DeepSeek 或自定义兼容服务。填 Base URL、该地址对应的 API Key 和模型 ID。先测试连接，再保存并切换。可以尝试获取账号可用的模型列表；接口不可用时手动输入模型 ID。

预设地址仅供填写起点。Coding Plan/Token 套餐与普通 API 套餐可能采用不同地址和凭据；请以你所购套餐的供应商控制台文档为准。任务会绑定创建时使用的供应商和模型，切换默认供应商只影响新任务。

新增密钥保存在应用本机数据目录的 `model-providers.json`，文件权限为 `0600`，不返回给前端，也不会写到 `state.json` 或仓库。此文件采用本机权限保护，当前不使用系统钥匙串或额外静态加密。可从模型设置删除配置，删除后绑定该配置的未完成任务无法继续运行。删除配置不撤销供应商侧的密钥，如需吊销请到供应商控制台操作。

预设的地址和示例模型名称核对自下列文档；供应商模型上架与账户权限可能变化，可在添加页获取实际列表或覆盖 ID：

- [智谱 API 文档](https://open.bigmodel.cn/dev/api)
- [Kimi Chat Completions](https://platform.moonshot.cn/docs/api/chat)
- [MiniMax OpenAI 兼容接口](https://platform.minimaxi.com/docs/api-reference/text-openai-api)
- [DeepSeek 思考模式与工具调用](https://api-docs.deepseek.com/guides/thinking_mode/)

## TOML 配置

源码运行时，将根目录 `config.example.toml` 复制为 `config.local.toml`。桌面运行时，将模板复制为 `~/.config/openbuddy/config.toml`。两者都不会被本项目的桌面打包清单包含，项目私有配置也被 `.gitignore` 排除。

```toml
model = "YOUR_MODEL_ID"
model_provider = "custom"

[model_providers.custom]
base_url = "https://api.example.com/v1"
wire_api = "responses"
env_key = "OPENBUDDY_API_KEY"
```

此时从启动应用的进程环境读取 `OPENBUDDY_API_KEY`。不要把密钥写入命令参数或发布到 Issue。若 Finder 启动的桌面应用无法继承这个变量，可仅在私有配置中将 `env_key` 替换为：

```toml
experimental_bearer_token = "YOUR_API_KEY"
```

将占位符替换为自己的值。Unix 系统建议仅允许当前用户读取配置，例如 `chmod 600 config.local.toml`。不要修改或提交示例文件来保存真实值。

`base_url` 应为 API 基础路径，不要在 URL 中放用户名、密码、查询参数或片段。`wire_api = "responses"` 时应用添加 `/responses`；`wire_api = "chat_completions"` 时添加 `/chat/completions`。也接受已经包含对应完整路径的地址。模型必须在服务端实际可用；仓库不预置某个私人服务商或模型。

## 优先级

1. `OPENBUDDY_CONFIG_PATH`：显式指定私有 TOML 文件。文件不存在或解析失败时报告错误，不悄悄使用其他账户。
2. 项目根目录 `config.local.toml`。
3. `~/.config/openbuddy/config.toml`。
4. 环境变量，优先 `OPENBUDDY_*`，兼容 `OPENAI_*`：`API_KEY`、`BASE_URL`、`MODEL`。
5. 兼容 Codex：从 `CODEX_HOME` 或 `~/.codex` 读取 `config.toml` 中的当前 provider。只对标准 OpenAI API、且未显式指定 `env_key` 的 Codex 配置，允许读取其 `auth.json` 的 API Key。

在设置页保存的模型覆盖会优先于默认模型；每个任务也可以选模型。不同 API 地址的模型名称可能不兼容。

## .env 配置

复制 `.env.example` 为 `.env`，本地填好后：

```sh
npm run build
node --env-file=.env server/index.js
```

Node.js 22 的这个命令会加载 `.env`。普通 `npm run dev` 或 Finder 桌面启动不会自动加载 `.env`。已有 TOML 配置的优先级高于环境变量，排查时应注意这一点。

## 数据边界

- 密钥仅用于后端 HTTP 认证，不通过配置状态 API 返回给前端。
- 公开仓库不包含本地会话、工作空间、记忆、连接器配置、应用数据、日志、打包产物或个人 Codex 配置。
- 当前设置页会显示实际使用的 API 地址和模型。分享截图前自行遮盖私人地址、文件路径和会话内容。
- 不要把真实配置或任务记录作为缺陷复现附件。可复制模板、保留字段名并删除真实值后提交。
