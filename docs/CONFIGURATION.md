# 模型配置

OpenBuddy 需要支持 Responses API 的模型服务。公开仓库仅包含模板；API 地址、模型与密钥都需要使用者自行填写。

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

`base_url` 应为 API 基础路径，不要在 URL 中放用户名、密码、查询参数或片段。应用会添加 `/responses`，也接受末尾已包含 `/responses` 的地址。模型必须在服务端实际可用；仓库不预置某个私人服务商或模型。

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
