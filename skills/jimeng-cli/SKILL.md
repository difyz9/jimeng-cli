---
name: jimeng-cli
description: Use the local jimeng CLI to generate, edit, upscale, and query AI images or videos without MCP. Trigger when the user asks for Jimeng, Dreamina, CapCut, image generation, video generation, image-to-video, first/last-frame video, omni-reference video, token checks, model selection, or recovery from jimeng login/token errors such as "[登录失效]" or "check login error".
---

# Jimeng CLI

## Overview

Use the installed `jimeng` command directly. Prefer structured `--json` output for machine parsing, and use normal output only when the user wants a quick human-readable command.

This skill is for CLI use only. Do not use MCP tools for Jimeng tasks unless the user explicitly asks for MCP.

## Preflight

Before creating media, verify that the CLI and token pool are usable:

```bash
jimeng --help
jimeng get region --json
jimeng get ratio --json
jimeng token pool --json
```

If the pool is empty, all tokens are disabled, or the command returns `[登录失效]`, `check login error`, `refresh_token`, `No direct token available`, or `No token available`, stop and follow `references/troubleshooting.md`. Do not retry generation with the same token.

Use `jimeng set region <region>` once when the user wants a persistent default region. Use `jimeng set ratio <ratio>` once when the user wants a persistent default aspect ratio. After that, omit `--region` and `--ratio` unless the user asks for a different value for a specific command.

Token pool location defaults to `~/.jimeng/token-pool.json`. CLI config location defaults to `~/.jimeng/config.json`. Respect `TOKEN_POOL_FILE` and `JIMENG_CONFIG_FILE` when set.

## Region and Model Choices

Use the configured default region. If no default is set, the CLI falls back to `cn`. Use `-r <region>` only for per-command overrides.

- Image default: `jimeng-4.5`
- Upscale default: `jimeng-5.0`
- Video default: `jimeng-video-3.0`
- Omni-reference default: `jimeng-video-seedance-2.0-fast`
- VEO/Sora models: use `--region hk`, `--region jp`, or `--region sg`
- CN VIP Seedance models: use `--region cn`, but expect failure if the token lacks entitlement

When unsure which models a token can use, run:

```bash
jimeng models list --region cn --verbose --json
jimeng models list --all-known --region cn --verbose --json
```

Use `--all-known` only to discover locally mapped manual models. It does not prove the account has access.

## Ratio and Output

Supported ratios are `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `3:2`, `2:3`, and `21:9`.

Prefer setting a default once:

```bash
jimeng set ratio 16:9
```

Then omit `--ratio` in routine generation commands. Use `--ratio <ratio>` only for per-command overrides. `--ration <ratio>` is accepted as a typo-compatible alias, but do not emit it in new commands.

Always use `-o, --output <path>` for saved media.

## Image Tasks

Generate images:

```bash
jimeng image generate \
  -p "a cat sitting on a windowsill" \
  -m jimeng-4.5 \
  --resolution 2k \
  -o ./pic/cat.png \
  --json
```

When image generation returns multiple images, `-o ./pic/cat.png` saves `./pic/cat-01.png`, `./pic/cat-02.png`, and so on.

Edit images with either all local paths or all URLs. Do not mix local paths and URLs in one command:

```bash
jimeng image edit \
  -p "turn this into a cinematic poster" \
  --image ./input.png \
  -o ./pic/poster.png \
  --json
```

Upscale an image:

```bash
jimeng image upscale \
  --image ./input.png \
  --resolution 4k \
  -o ./pic/upscaled.png \
  --json
```

## Video Tasks

Text-to-video:

```bash
jimeng video generate \
  -p "ocean wave at sunset, cinematic, slow motion" \
  --mode text_to_video \
  --duration 5 \
  -o ./pic/ocean.mp4 \
  --json
```

Image-to-video:

```bash
jimeng video generate \
  -p "camera slowly pushes in" \
  --mode image_to_video \
  --image-file ./first.png \
  --json
```

First/last-frame video:

```bash
jimeng video generate \
  -p "transition from sunrise to night" \
  --mode first_last_frames \
  --image-file ./start.png \
  --image-file ./end.png \
  --json
```

Omni-reference video:

```bash
jimeng video generate \
  -p "Use @image_file_1 as the character and @video_file_1 as motion reference" \
  --mode omni_reference \
  -m jimeng-video-seedance-2.0-fast \
  --image-file ./character.png \
  --video-file ./motion.mp4 \
  --json
```

Omni-reference accepts 1-9 images and 0-3 videos, with at least one material. Use `@image_file_N` and `@video_file_N` in prompts when the relationship between materials matters.

## Async Tasks

Use `--no-wait --json` when the user wants a task ID quickly or video generation may take longer than the current session:

```bash
jimeng image generate --prompt "..." --no-wait --json
jimeng task wait --task-id <id> --type image --wait-timeout-seconds 300 --json
jimeng task get --task-id <id> --type image --json
```

Use `--type video` for video tasks. If type is unknown, try `jimeng task get --task-id <id> --json`, then retry with the specific type if required.

## Output Handling

With `--json`, parse the top-level payload:

- `object`: usually `jimeng_cli_result`
- `command`: command name such as `image.generate`
- `data.files` or `data.files[]`: downloaded local files
- `data.data[].url`: upstream media URLs
- `meta.wait`: whether the CLI waited for completion

When returning results to the user, report local file paths first. Do not expose full tokens or token pool contents.

## Failure Handling

Read `references/troubleshooting.md` when a command fails with authentication, token selection, region/model mismatch, missing entitlement, points, content filter, timeout, or local-file errors.
