# jimeng-cli

[![npm version](https://img.shields.io/npm/v/jimeng-cli.svg)](https://www.npmjs.com/package/jimeng-cli)

即梦/CapCut 图像与视频生成 CLI 工具。支持多区域（CN/US/HK/JP/SG）；大部分常规模型可直接配合普通账号使用，部分模型则依赖额外权益。

## 安装

```bash
npm install -g jimeng-cli
```

## 快速开始

```bash
# 登录并添加 token 到池中（交互式，默认 CN 区）
jimeng login

# 设置默认区域（后续命令可省略 --region）
jimeng set region cn

# 登录指定区域
jimeng login --region us

# 生成图片
jimeng image generate -p "a red fox in snow" -o ./pic/fox.png

# 生成视频
jimeng video generate -p "ocean wave at sunset" -o ./pic/ocean.mp4 --wait

# 查看可用模型
jimeng models list --verbose

# 查看本地已知但上游未公开枚举的模型
jimeng models list --all-known --region cn --verbose
```

## 多区域

支持 5 个区域，各有不同的模型和端点：

| 区域 | 代码 | 端点 | 额外视频模型 |
|------|------|------|-------------|
| 中国大陆 | `cn` | jimeng.jianying.com | seedance 2.0/2.0-fast, 3.x 全系列 |
| 美国 | `us` | dreamina.capcut.com | seedance 2.0/2.0-fast |
| 香港 | `hk` | dreamina.capcut.com | veo3, veo3.1, sora2, seedance 2.0 |
| 日本 | `jp` | dreamina.capcut.com | veo3, veo3.1, sora2, seedance 2.0 |
| 新加坡 | `sg` | dreamina.capcut.com | veo3, veo3.1, sora2, seedance 2.0 |

### 默认区域与比例

可以通过 `set` 命令设置一次默认区域和默认宽高比，之后生成、登录、模型查询和任务查询都可以省略 `--region`，生成命令也可以省略 `--ratio`。

```bash
jimeng set region cn
jimeng set ratio 16:9
jimeng get region
jimeng get ratio
jimeng config list
```

显式 `--region` / `--ratio` 优先级高于默认配置；未设置时区域回退到 `cn`，比例回退到 `1:1`。默认配置保存在 `~/.jimeng/config.json`，也可以通过 `JIMENG_CONFIG_FILE` 指定路径。

### Token 与区域绑定

每个 token 在池中绑定一个区域，API 请求自动路由到对应端点。生成时通过 `--region` 选择目标区域，系统从该区域的 token 中自动选取。

```bash
# 添加 US 区 token
jimeng token add --token <token> --region us

# 添加 JP 区 token
jimeng token add --token <token> --region jp

# 用 US 区 token 生成图片
jimeng image generate --prompt "..." --region us

# 用 JP 区生成 veo3 视频
jimeng video generate --prompt "..." --model jimeng-video-veo3 --region jp --wait
```

### 跨区域查询

```bash
# 查看所有区域 token 的模型列表
jimeng models list --all --verbose

# 查看特定区域的模型
jimeng models list --region hk --verbose

# 查看某个区域的本地已知模型（含 manual/hidden models）
jimeng models list --region cn --all-known --verbose

# 查询所有 token 的积分
jimeng token points --all
```

## Token 管理

Token 池是核心机制，管理多个区域的 token 并自动轮换。

```bash
# 查看池状态
jimeng token pool

# 添加 token
jimeng token add --token <token> --region cn
jimeng token add --token-file tokens.txt --region us

# 验证 token 有效性
jimeng token check
jimeng token check --region us    # 只检查 US 区

# 查询积分
jimeng token points

# 领取每日免费积分
jimeng token receive

# 启用/禁用 token
jimeng token enable --token <token>
jimeng token disable --token <token>

# 移除 token
jimeng token remove --token <token>

# 手动健康检查
jimeng token pool-check
```

所有命令支持 `--json` 输出结构化 JSON。

### Token 池配置

默认配置文件 `configs/token-pool.json`，可通过 `TOKEN_POOL_FILE` 环境变量覆盖。

```json
{
  "updatedAt": 0,
  "tokens": [
    {
      "token": "your_token_here",
      "region": "us",
      "enabled": true
    }
  ]
}
```

环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TOKEN_POOL_ENABLED` | 启用/禁用 token 池 | `true` |
| `TOKEN_POOL_FILE` | 配置文件路径 | `configs/token-pool.json` |
| `TOKEN_POOL_HEALTHCHECK_INTERVAL_MS` | 健康检查间隔 | `300000` (5 min) |
| `TOKEN_POOL_FETCH_CREDIT` | 检查时获取积分 | `true` |
| `TOKEN_POOL_AUTO_DISABLE` | 连续失败后自动禁用 | `true` |
| `TOKEN_POOL_AUTO_DISABLE_FAILURES` | 触发禁用的失败次数 | `2` |
| `TOKEN_POOL_STRATEGY` | 选 token 策略 | `random` (`round_robin`) |

## 模型

### 查看模型

```bash
# 列出模型 ID
jimeng models list

# 显示详细信息（能力、参数范围）
jimeng models list --verbose

# 查看指定区域
jimeng models list --region jp --verbose

# 查看所有 token 的模型（按 token/region 分组）
jimeng models list --all

# 查看本地已知模型（包含上游未公开枚举的 manual models）
jimeng models list --all-known --region cn --verbose

# 刷新模型能力缓存
jimeng models refresh
```

`jimeng models list` 默认只显示上游配置实际返回的 discoverable models。  
`jimeng models list --all-known` 会额外显示本地已知但上游未公开枚举的 manual models。后者可以被手动指定尝试调用，但并不代表当前 token 一定具备对应权益。

### 可用模型

**图像模型**（CN 区全部可用，国际区部分可用）：

| 模型 | CN | US | HK/JP/SG |
|------|:--:|:--:|:--------:|
| jimeng-5.0 | ✓ | ✓ | ✓ |
| jimeng-4.6 | ✓ | ✓ | ✓ |
| jimeng-4.5 | ✓ | ✓ | ✓ |
| jimeng-4.1 | ✓ | ✓ | ✓ |
| jimeng-4.0 | ✓ | ✓ | ✓ |
| jimeng-3.1 | ✓ | - | ✓ |
| jimeng-3.0 | ✓ | ✓ | ✓ |
| nanobanana | - | ✓ | ✓ |

**视频模型**：

| 模型 | CN | US | HK/JP/SG |
|------|:--:|:--:|:--------:|
| jimeng-video-seedance-2.0 | ✓ | ✓ | ✓ |
| jimeng-video-seedance-2.0-fast | ✓ | ✓ | ✓ |
| jimeng-video-seedance-2.0-vip | manual | - | - |
| jimeng-video-seedance-2.0-fast-vip | manual | - | - |
| jimeng-video-veo3 | - | - | ✓ |
| jimeng-video-veo3.1 | - | - | ✓ |
| jimeng-video-sora2 | - | - | ✓ |
| jimeng-video-3.5-pro | ✓ | ✓ | ✓ |

说明：

- `manual` 表示该模型在本地映射表中已知，但默认不会出现在上游 discoverable model 列表里。
- 这类模型需要通过 `jimeng models list --all-known` 查看。
- `jimeng-video-seedance-2.0-vip` 和 `jimeng-video-seedance-2.0-fast-vip` 当前只在 `cn` 区作为 manual model 暴露。
- 即使模型名可见，实际生成仍取决于当前 token 是否具备对应权益，例如 `vip`。

## 图像生成

```bash
# 文生图
jimeng image generate -p "a cat sitting on a windowsill" -o ./pic/cat.png

# 指定模型和比例
jimeng image generate -p "..." -m jimeng-5.0 --ratio 16:9 -o ./pic/result.png

# 指定区域
jimeng image generate -p "..." -r us

# 不等待，直接返回 task ID
jimeng image generate -p "..." --no-wait

# 高分辨率
jimeng image generate -p "..." --resolution 4k

# 图生图编辑（1-10 张图）
jimeng image edit -p "blend into poster" --image photo1.jpg --image photo2.jpg -o ./pic/poster.png

# 图片放大
jimeng image upscale --image photo.jpg --resolution 4k -o ./pic/photo-4k.png
```

`-o, --output <path>` 用于指定输出文件路径。图片生成通常返回多张图，因此 `-o ./pic/cat.png` 会保存为 `./pic/cat-01.png`, `./pic/cat-02.png` 等；单个输出则直接使用指定路径。

通用选项：

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--model` | 模型 | `jimeng-4.5` |
| `--ratio` | 宽高比 | `jimeng set ratio` 或 `1:1` |
| `--resolution` | 分辨率 | `2k` |
| `--negative-prompt` | 负面提示词 | - |
| `--region` | 区域 | `jimeng set region` 或 `cn` |
| `--token` | 指定 token | 自动选取 |
| `--wait` / `--no-wait` | 等待完成 | `--wait` |
| `--json` | JSON 输出 | - |
| `-o, --output` | 输出文件路径 | 自动生成 |

支持的比例：`1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `3:2`, `2:3`, `21:9`

## 视频生成

```bash
# 文生视频
jimeng video generate -p "ocean wave at sunset" -o ./pic/ocean.mp4 --wait

# 图生视频
jimeng video generate -p "..." --mode image_to_video --image-file photo.jpg --wait

# 首尾帧
jimeng video generate -p "..." --mode first_last_frames --image-file start.jpg --image-file end.jpg --wait

# omni_reference 模式（1-9 图 + 0-3 视频）
jimeng video generate -p "..." --mode omni_reference --image-file ref1.jpg --video-file ref1.mp4 --wait

# 指定区域和模型
jimeng video generate -p "..." -m jimeng-video-veo3 -r jp --wait

# 手动尝试 CN VIP model（需要 token 具备对应权益）
jimeng video generate -p "..." -m jimeng-video-seedance-2.0-vip -r cn --wait

# 指定时长和比例
jimeng video generate -p "..." --duration 10 --ratio 16:9 --wait
```

视频模式：

| 模式 | 说明 | 图片输入 | 视频输入 |
|------|------|:--------:|:--------:|
| `text_to_video` | 文生视频 | 0 | 0 |
| `image_to_video` | 图生视频 | 1 | 0 |
| `first_last_frames` | 首尾帧 | 1-2 | 0 |
| `omni_reference` | 多参考 | 1-9 | 0-3 |

通用选项：

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--model` | 模型 | 按模式自动选择 |
| `--mode` | 生成模式 | `text_to_video` |
| `--ratio` | 宽高比 | `jimeng set ratio` 或 `1:1` |
| `--duration` | 时长（秒） | `5` |
| `--resolution` | 分辨率 | `720p` |
| `--region` | 区域 | `jimeng set region` 或 `cn` |
| `--token` | 指定 token | 自动选取 |
| `--wait` / `--no-wait` | 等待完成 | `--wait` |
| `--json` | JSON 输出 | - |
| `-o, --output` | 输出文件路径 | 自动生成 |

## 任务查询

```bash
# 查询任务状态
jimeng task get --task-id <id>
jimeng task get --task-id <id> --type video --json

# 等待任务完成
jimeng task wait --task-id <id>
jimeng task wait --task-id <id> --wait-timeout-seconds 120

# 查看历史任务
jimeng task list
jimeng task list --type video --count 50 --json
```

## Ark API（火山引擎 Seedance / Seedream）

当前项目同时集成了火山引擎 Ark API 的视频与图像生成能力，通过独立的 `ark` 子命令和对应的 MCP 工具对外暴露。与即梦（Dreamina）API 使用不同的认证方式——只需一个 **API Key**。

### 配置

```bash
# 设置 API Key（建议写入 shell 配置文件）
export ARK_API_KEY="your_api_key_here"

# 或每次命令指定
jimeng ark generate -p "..." --api-key "your_api_key_here"
```

获取 API Key：访问 [火山引擎方舟平台 API Key 管理](https://console.volcengine.com/ark/region:ark+cn-beijing/apikey)。

### 可用模型

**视频生成（Seedance 2.0 系列）：**

| 模型 | Model ID | 分辨率 | 说明 |
|------|---------|--------|------|
| Seedance 2.0 | `doubao-seedance-2-0-260128` | 480p~4K | 最高品质 |
| Seedance 2.0 Fast | `doubao-seedance-2-0-fast-260128` | 480p~720p | 速度优先 |
| Seedance 2.0 Mini | `doubao-seedance-2-0-mini-260615` | 480p~720p | 低成本（默认） |

**图像生成（Seedream 系列）：**

| 模型 | Model ID | 分辨率 | 说明 |
|------|---------|--------|------|
| Seedream 5.0 Pro | `doubao-seedream-5-0-pro-260628` | 1K~2K | 高精度，图文/多图 |
| Seedream 5.0 Lite | `doubao-seedream-5-0-260128` | 2K~4K | 默认，支持组图 |
| Seedream 4.5 | `doubao-seedream-4-5-251128` | 2K~4K | 稳定版 |
| Seedream 4.0 | `doubao-seedream-4-0-250828` | 1K~4K | 经典版 |

---

### 视频生成 — `jimeng ark generate`

多模态参考 / 文生视频 / 图生视频。支持文本 + 图片(0~9) + 视频(0~3) + 音频(0~3) 任意组合输入。

```bash
# 文生视频
jimeng ark generate -p "海边日落" --duration 5 --ratio 16:9

# 多模态参考（图片 + 视频 + 音频）
jimeng ark generate -p "全程使用视频1的第一视角构图" \
  --image-url https://...pic1.jpg \
  --image-url https://...pic2.jpg \
  --video-url https://...video.mp4 \
  --audio-url https://...audio.mp3 \
  --ratio 16:9 --duration 11 --generate-audio

# 图生视频-首帧
jimeng ark generate -p "镜头推近" --image-url https://...start.jpg

# 图生视频-首尾帧
jimeng ark generate -p "转场" --image-url https://...first.jpg --image-url https://...last.jpg

# 异步提交（不等待）
jimeng ark generate -p "一只猫" --no-wait
```

可选参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--model` | 模型 ID | `doubao-seedance-2-0-mini-260615` |
| `--ratio` | 画面比例 | `16:9` |
| `--duration` | 视频时长（秒），4~15 | `5` |
| `--resolution` | 分辨率：480p/720p/1080p/4K | `720p` |
| `--generate-audio` / `--no-audio` | 是否生成背景音频 | 开启 |
| `--watermark` | 是否添加水印 | 不添加 |
| `--return-last-frame` | 返回尾帧 PNG | 不返回 |
| `--seed` | 随机种子 | - |
| `--camera-fixed` | 固定镜头 | 不固定 |
| `--service-tier` | standard / flex（离线推理） | standard |
| `--callback-url` | 任务回调 URL | - |

---

### 视频编辑 — `jimeng ark edit`

基于参考图片和文本指令编辑视频（替换主体、增删元素等）。

```bash
# 替换视频中的元素
jimeng ark edit -p "将视频1中的香水替换成图片1中的面霜" \
  --video-url https://...video.mp4 \
  --image-url https://...product.jpg

# 增/删元素
jimeng ark edit -p "在台面上添加炸鸡和披萨" \
  --video-url https://...video.mp4
```

---

### 视频延长 — `jimeng ark extend`

向前/向后延长视频，或将多个视频片段串联。

```bash
# 向后延长
jimeng ark extend -p "生成视频1之后的内容" \
  --video-url https://...video.mp4

# 多个视频拼接
jimeng ark extend -p "接视频2" \
  --video-url https://...part1.mp4 \
  --video-url https://...part2.mp4
```

---

### 图像生成 — `jimeng ark image`

OpenAI 兼容的文生图 / 图文生图 / 多图融合 / 组图生成。使用 Seedream 系列模型。

```bash
# 文生图
jimeng ark image -p "一只猫在阳光下"

# 单参考图编辑
jimeng ark image -p "将服装材质改为透明清水" \
  --image-url https://...photo.jpg

# 多图融合（换装/融合风格）
jimeng ark image -p "将图1的服装换为图2的服装" \
  --image-url https://...model.png \
  --image-url https://...cloth.png

# 组图生成（4 张电影分镜）
jimeng ark image -p "4张科幻片分镜..." \
  --sequential-image-generation auto \
  --max-images 4

# 指定型号和参数
jimeng ark image -p "产品图" \
  --model doubao-seedream-5-0-pro-260628 \
  --size 4K --output-format png --json
```

可选参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--model` | 模型 ID | `doubao-seedream-5-0-260128` |
| `--size` | 图片尺寸：1K/2K/3K/4K | `2K` |
| `--output-format` | 输出格式：png/jpeg | `png` |
| `--watermark` | 添加水印 | 不添加 |
| `--sequential-image-generation` | 组图模式：disabled/auto | `disabled` |
| `--max-images` | 组图最大图片数 | - |

---

### MCP 工具

当通过 MCP Server 使用时，以下工具可用（需要在环境变量中设置 `ARK_API_KEY` 或在工具参数中传入 `api_key`）：

| 工具名 | 说明 |
|--------|------|
| `ark_generate` | 多模态视频生成 |
| `ark_edit` | 视频编辑 |
| `ark_extend` | 视频延长 |
| `ark_image` | 文生图 / 图文生图 / 多图融合 / 组图 |

MCP Server 环境变量：

| 变量 | 说明 |
|------|------|
| `ARK_API_KEY` | Ark API Key，工具调用时可省略 `api_key` 参数 |
| `JIMENG_API_TOKEN` | 即梦 API Token |
| `MCP_REQUIRE_RUN_CONFIRM` | 运行前确认 | `true` |

## Hermes Agent / Skills

如果通过 hermes-agent 使用 CLI，请加载项目内的 skill 文档：

```text
skills/jimeng-cli/SKILL.md
```

该 skill 只走 `jimeng` 命令行，不依赖 MCP；它包含生成前 token 预检、模型/区域选择、JSON 输出解析，以及 `[登录失效]: check login error` 这类登录失效问题的恢复流程。

## MCP Server

`jimeng-mcp` 通过 stdio 启动，供 Claude Desktop / Codex 等 MCP Client 接入。

```bash
npm run build
node dist/mcp/index.js
```

Claude Desktop 配置示例：

```json
{
  "mcpServers": {
    "jimeng": {
      "command": "node",
      "args": ["/path/to/jimeng-cli/dist/mcp/index.js"],
      "env": {
        "JIMENG_API_TOKEN": "your_token"
      }
    }
  }
}
```

环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `JIMENG_API_TOKEN` | 默认 API token | - |
| `MCP_HTTP_TIMEOUT_MS` | HTTP 超时 | `120000` |
| `MCP_ENABLE_ADVANCED_TOOLS` | 启用高级工具 | `true` |
| `MCP_REQUIRE_RUN_CONFIRM` | 运行前确认 | `true` |

## 其他环境变量

| 变量 | 说明 |
|------|------|
| `JIMENG_CLI_VERBOSE_LOGS` | 启用详细日志 (`true`/`false`) |

## 开发

```bash
npm install
npm run build
npm run dev          # 开发模式
npm run type-check   # 类型检查
npm run cli:smoke    # CLI 冒烟测试
npm run mcp:dev      # MCP 开发模式
npm run mcp:smoke    # MCP 冒烟测试
```

## 许可证

GPL-3.0
