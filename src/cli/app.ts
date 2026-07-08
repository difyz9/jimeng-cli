import process from "node:process";

import minimist from "minimist";

import config from "@/core/config/config.ts";
import logger from "@/core/utils/logger.ts";
import tokenPool from "@/core/runtime/session-pool.ts";
import { parseRegionCode, type RegionCode } from "@/api/services/core.ts";
import {
  createTokenSubcommands,
  type TokenSubcommandDef,
  type TokenSubcommandName,
} from "@/cli/commands/token.ts";
import { createQueryCommandHandlers } from "@/cli/commands/query.ts";
import { createMediaCommandHandlers } from "@/cli/commands/media.ts";
import { createLoginCommandHandler } from "@/cli/commands/login.ts";
import { createArkCommandHandlers } from "@/cli/commands/ark.ts";
import {
  getCliConfigFilePath,
  getDefaultRatio,
  getDefaultRegion,
  parseRatio,
  readCliConfig,
  setDefaultRatio,
  setDefaultRegion,
  SUPPORTED_RATIOS,
} from "@/cli/config-store.ts";

type JsonRecord = Record<string, unknown>;
type CliHandler = (argv: string[]) => Promise<void>;
type UsageSection = { title: string; lines: string[] };

const JSON_OPTION = "  --json                   Output structured JSON";
const HELP_OPTION = "  --help                   Show help";

function buildUsageText(
  usageLine: string,
  options: string[],
  sections?: UsageSection[],
): string {
  const lines = ["Usage:", usageLine, "", "Options:", ...options];
  if (sections && sections.length > 0) {
    for (const section of sections) {
      lines.push("", section.title, ...section.lines);
    }
  }
  return lines.join("\n");
}

function usageRoot(): string {
  const commandLines = ROOT_COMMAND_ENTRIES.map(
    (entry) => `  ${entry.path.padEnd(32)}${entry.description}`,
  );
  return [
    "Usage:",
    "  jimeng <command> [subcommand] [options]",
    "",
    "Commands:",
    ...commandLines,
    "",
    ...ROOT_HELP_HINT_LINES,
  ].join("\n");
}

function usageModelsList(): string {
  return buildUsageText(
    "  jimeng models list [options]",
    [
      "  --token <token>          Query with specific token",
      "  --region <region>        Query with specific region (cn/us/hk/jp/sg)",
      "  --all                    Query all tokens in pool, grouped by token/region",
      "  --all-known              Include manual/hidden models known locally",
      "  --verbose                Print rich model fields",
      "  --json                   Print full JSON response",
      HELP_OPTION,
    ],
    [
      {
        title: "Notes:",
        lines: [
          "  Without --token, --region, or --all, uses the first available token in pool.",
          "  With --all, queries every enabled+live token and groups results by token/region.",
          "  --all-known includes models that are mapped locally but not returned by upstream config.",
        ],
      },
    ],
  );
}

function usageModelsRefresh(): string {
  return buildUsageText(
    "  jimeng models refresh [options]",
    ["  --json                   Output structured JSON", HELP_OPTION],
    [
      {
        title: "Notes:",
        lines: [
          "  - Refreshes dynamicCapabilities (imageModels, videoModels, capabilityTags) for",
          "    all enabled+live tokens in the token pool.",
          "  - Results are persisted to token-pool.json automatically.",
        ],
      },
    ],
  );
}

function usageTokenSubcommand(name: TokenSubcommandName): string {
  const subcommand = TOKEN_SUBCOMMANDS_BY_NAME[name];
  return buildUsageText(
    subcommand.usageLine,
    subcommand.options,
    subcommand.sections,
  );
}

function usageTokenRoot(): string {
  const subcommandLines = TOKEN_SUBCOMMANDS.map(
    (subcommand) => `  ${subcommand.name.padEnd(24)}${subcommand.description}`,
  );
  return [
    "Usage:",
    "  jimeng token <subcommand> [options]",
    "",
    "Subcommands:",
    ...subcommandLines,
    "",
    "Run `jimeng token <subcommand> --help` for details.",
  ].join("\n");
}

function usageSet(): string {
  return buildUsageText("  jimeng set <key> <value> [options]", [
    "  region <region>          Set default region (cn/us/hk/jp/sg)",
    `  ratio <ratio>            Set default ratio (${SUPPORTED_RATIOS.join(", ")})`,
    JSON_OPTION,
    HELP_OPTION,
  ]);
}

function usageGet(): string {
  return buildUsageText("  jimeng get <key> [options]", [
    "  region                   Get default region",
    "  ratio                    Get default ratio",
    JSON_OPTION,
    HELP_OPTION,
  ]);
}

function usageConfigRoot(): string {
  return buildUsageText("  jimeng config <subcommand> [options]", [
    "  list                     Show CLI config",
    JSON_OPTION,
    HELP_OPTION,
  ]);
}

function usageImageGenerate(): string {
  return buildUsageText("  jimeng image generate --prompt <text> [options]", [
    "  --token <token>          Optional, override token-pool selection",
    "  -r, --region <region>    X-Region header, default from `jimeng set region` or cn",
    "  -p, --prompt <text>      Required",
    "  -m, --model <model>      Default jimeng-4.5",
    "  --ratio <ratio>          Default from `jimeng set ratio` or 1:1",
    "  --resolution <res>       Default 2k",
    "  --negative-prompt <text> Optional",
    "  --sample-strength <num>  Optional, 0-1",
    "  --intelligent-ratio      Optional, enable intelligent ratio",
    "  --wait / --no-wait       Default wait; --no-wait returns task only",
    "  --wait-timeout-seconds   Optional wait timeout override",
    "  --poll-interval-ms       Optional poll interval override",
    JSON_OPTION,
    "  -o, --output <path>      Save to file path; multiple images add -01 suffix",
    HELP_OPTION,
  ]);
}

function usageImageEdit(): string {
  return buildUsageText(
    "  jimeng image edit --prompt <text> --image <path_or_url> [--image <path_or_url> ...] [options]",
    [
      "  --token <token>          Optional, override token-pool selection",
      "  -r, --region <region>    X-Region header, default from `jimeng set region` or cn",
      "  -p, --prompt <text>      Required",
      "  --image <path_or_url>    Required, can be repeated (1-10)",
      "  -m, --model <model>      Default jimeng-4.5",
      "  --ratio <ratio>          Default from `jimeng set ratio` or 1:1",
      "  --resolution <res>       Default 2k",
      "  --negative-prompt <text> Optional",
      "  --sample-strength <num>  Optional, 0-1",
      "  --intelligent-ratio      Optional, enable intelligent ratio",
      "  --wait / --no-wait       Default wait; --no-wait returns task only",
      "  --wait-timeout-seconds   Optional wait timeout override",
      "  --poll-interval-ms       Optional poll interval override",
      JSON_OPTION,
      "  -o, --output <path>      Save to file path; multiple images add -01 suffix",
      HELP_OPTION,
    ],
    [
      {
        title: "Notes:",
        lines: [
          "  - Image sources must be all local files or all URLs in one command.",
        ],
      },
    ],
  );
}

function usageImageUpscale(): string {
  return buildUsageText(
    "  jimeng image upscale --image <path_or_url> [options]",
    [
      "  --token <token>          Optional, override token-pool selection",
      "  -r, --region <region>    X-Region header, default from `jimeng set region` or cn",
      "  --image <path_or_url>    Required, local file or URL",
      "  -m, --model <model>      Default jimeng-5.0",
      "  --resolution <res>       Default 4k (target resolution)",
      "  --wait / --no-wait       Default wait; --no-wait returns task only",
      "  --wait-timeout-seconds   Optional wait timeout override",
      "  --poll-interval-ms       Optional poll interval override",
      JSON_OPTION,
      "  -o, --output <path>      Save to file path",
      HELP_OPTION,
    ],
    [
      {
        title: "Notes:",
        lines: [
          "  - Upscales an existing image to higher resolution using super_resolution.",
          "  - Supports 2k and 4k target resolutions.",
          "  - Image source can be a local file path or HTTP URL.",
        ],
      },
    ],
  );
}

function usageVideoGenerate(): string {
  return buildUsageText(
    "  jimeng video generate --prompt <text> [options]",
    [
      "  --token <token>          Optional, override token-pool selection",
      "  -r, --region <region>    X-Region header, default from `jimeng set region` or cn",
      "  -p, --prompt <text>      Required",
      "  --mode <mode>            Optional, text_to_video (default), image_to_video, first_last_frames, or omni_reference",
      "  --image-file <input>     Image input, can be repeated (path or URL)",
      "  --video-file <input>     Video input, can be repeated (path or URL, omni only)",
      "  --image-file-1 <input>   Explicit image slot (1-9) for omni_reference",
      "  --image-file-2 ... -9    More explicit image slots for omni_reference",
      "  --video-file-1 <input>   Explicit video slot (1-3) for omni_reference",
      "  --video-file-2 ... -3    More explicit video slots for omni_reference",
      "  -m, --model <model>      Default jimeng-video-3.0 (jimeng-video-seedance-2.0-fast in omni_reference)",
      "  --ratio <ratio>          Default from `jimeng set ratio` or 1:1",
      "  --resolution <res>       Default 720p",
      "  --duration <seconds>     Default 5",
      "  --wait / --no-wait       Default wait; --no-wait returns task only",
      "  --wait-timeout-seconds   Optional wait timeout override",
      "  --poll-interval-ms       Optional poll interval override",
      JSON_OPTION,
      "  -o, --output <path>      Save to file path",
      HELP_OPTION,
    ],
    [
      {
        title: "Examples:",
        lines: [
          '  jimeng video generate --mode text_to_video --prompt "A fox runs in snow"',
          '  jimeng video generate --mode image_to_video --prompt "Camera slowly pushes in" --image-file ./first.png',
          '  jimeng video generate --mode first_last_frames --prompt "Transition day to night" --image-file ./first.png --image-file ./last.png',
          '  jimeng video generate --mode omni_reference --model jimeng-video-seedance-2.0-fast --prompt "Use @image_file_1 for character and @video_file_1 for motion" --image-file ./character.png --video-file ./motion.mp4',
        ],
      },
      {
        title: "Notes:",
        lines: [
          "  - text_to_video: no image/video input allowed.",
          "  - image_to_video: exactly 1 --image-file input, no --video-file.",
          "  - first_last_frames: 1-2 --image-file inputs, no --video-file.",
          "  - omni_reference: 1-9 images and 0-3 videos (at least one material).",
          "  - omni_reference supports model jimeng-video-seedance-2.0 or jimeng-video-seedance-2.0-fast.",
          "  - Use @image_file_N / @video_file_N in prompt for omni_reference.",
        ],
      },
    ],
  );
}

function usageArkGenerate(): string {
  return buildUsageText(
    "  jimeng ark generate --prompt <text> [options]",
    [
      "  --api-key <key>           Ark API Key，默认从环境变量 ARK_API_KEY 读取",
      "  -p, --prompt <text>       必填，文本描述",
      "  --model <model>           模型 ID",
      "                             doubao-seedance-2-0-260128",
      "                             doubao-seedance-2-0-fast-260128",
      "                             doubao-seedance-2-0-mini-260615（默认）",
      "  --image-url <url>         参考图片 URL，可重复（最多 9 个）",
      "                             - 多模态参考传 reference_image",
      "                             - 图生视频首帧传 first_frame（1 个）",
      "                             - 首尾帧传 first_frame + last_frame（2 个）",
      "  --video-url <url>         参考视频 URL，可重复（最多 3 个）",
      "  --audio-url <url>         参考音频 URL，可重复（最多 3 个）",
      "  --generate-audio          开启背景音频生成（默认开启）",
      "  --no-audio                关闭背景音频生成",
      "  --ratio <ratio>           画面比例：16:9, 9:16, 4:3, 3:4, 21:9, 1:1, adaptive",
      "                             默认 16:9",
      "  --duration <seconds>      视频时长（秒），4~15，默认 5",
      "  --resolution <res>        分辨率：480p, 720p（默认）, 1080p, 4k",
      "                             1080p/4k 仅 Seedance 2.0 支持",
      "  --watermark               添加水印（默认不添加）",
      "  --return-last-frame       返回尾帧 PNG 图像（默认不返回）",
      "  --seed <num>              随机种子，控制生成一致性",
      "  --camera-fixed            固定镜头（默认不固定）",
      "  --service-tier <tier>     服务等级：standard（默认）、flex（离线推理）",
      "  --callback-url <url>      任务完成回调 URL",
      "  --wait / --no-wait        默认等待完成；--no-wait 仅返回 taskId",
      "  --wait-timeout-seconds    可选，等待超时秒数",
      "  --poll-interval-ms        可选，轮询间隔毫秒数",
      JSON_OPTION,
      "  -o, --output <path>       保存到文件路径",
      HELP_OPTION,
    ],
    [
      {
        title: "示例:",
        lines: [
          '  jimeng ark generate -p "茶饮宣传视频" --image-url https://...jpg --video-url https://...mp4',
          '  jimeng ark generate -p "一只猫" --no-wait',
          '  jimeng ark generate -p "向日葵" --image-url https://...jpg --image-role first_frame --duration 8 --resolution 1080p',
        ],
      },
    ],
  );
}

function usageArkEdit(): string {
  return buildUsageText(
    "  jimeng ark edit --prompt <text> --video-url <url> [options]",
    [
      "  --api-key <key>           Ark API Key，默认从环境变量 ARK_API_KEY 读取",
      '  -p, --prompt <text>       必填，编辑指令（如"将礼盒中的香水替换成面霜"）',
      "  --video-url <url>         必填，待编辑的视频 URL（至少 1 个）",
      "  --image-url <url>         参考图片 URL，可重复（最多 9 个）",
      "  --audio-url <url>         参考音频 URL，可重复（最多 3 个）",
      "  --model <model>           模型 ID，默认 doubao-seedance-2-0-mini-260615",
      "  --generate-audio          开启背景音频生成（默认开启）",
      "  --no-audio                关闭背景音频生成",
      "  --ratio <ratio>           画面比例，默认 16:9",
      "  --duration <seconds>      视频时长（秒），4~15，默认 5",
      "  --resolution <res>        分辨率：480p, 720p（默认）, 1080p, 4k",
      "  --watermark               添加水印",
      "  --return-last-frame       返回尾帧 PNG",
      "  --seed <num>              随机种子",
      "  --camera-fixed            固定镜头",
      "  --wait / --no-wait        默认等待完成",
      JSON_OPTION,
      "  -o, --output <path>       保存到文件路径",
      HELP_OPTION,
    ],
    [
      {
        title: "示例:",
        lines: [
          '  jimeng ark edit -p "将视频1中的香水替换成图片1中的面霜" --video-url https://...mp4 --image-url https://...jpg',
        ],
      },
    ],
  );
}

function usageArkExtend(): string {
  return buildUsageText(
    "  jimeng ark extend --prompt <text> --video-url <url> [options]",
    [
      "  --api-key <key>           Ark API Key，默认从环境变量 ARK_API_KEY 读取",
      "  -p, --prompt <text>       必填，视频延长描述",
      "  --video-url <url>         必填，待延长的视频 URL（1~3 个，按顺序串联）",
      "  --image-url <url>         参考图片 URL，可重复（最多 9 个）",
      "  --audio-url <url>         参考音频 URL，可重复（最多 3 个）",
      "  --model <model>           模型 ID，默认 doubao-seedance-2-0-mini-260615",
      "  --generate-audio          开启背景音频生成（默认开启）",
      "  --no-audio                关闭背景音频生成",
      "  --ratio <ratio>           画面比例，默认 16:9",
      "  --duration <seconds>      视频时长（秒），4~15，默认 5",
      "  --resolution <res>        分辨率：480p, 720p（默认）, 1080p, 4k",
      "  --watermark               添加水印",
      "  --seed <num>              随机种子",
      "  --wait / --no-wait        默认等待完成",
      JSON_OPTION,
      "  -o, --output <path>       保存到文件路径",
      HELP_OPTION,
    ],
    [
      {
        title: "示例:",
        lines: [
          '  jimeng ark extend -p "窗户打开进入室内接视频2" --video-url https://...1.mp4 --video-url https://...2.mp4',
        ],
      },
    ],
  );
}

function usageArkImage(): string {
  return buildUsageText(
    "  jimeng ark image --prompt <text> [options]",
    [
      "  --api-key <key>            Ark API Key，默认从环境变量 ARK_API_KEY 读取",
      "  -p, --prompt <text>        必填，图片描述",
      "  --model <model>            模型 ID",
      "                              doubao-seedream-5-0-pro-260628",
      "                              doubao-seedream-5-0-260128（默认）",
      "                              doubao-seedream-4-5-251128",
      "                              doubao-seedream-4-0-250828",
      "  --image-url <url>          参考图片 URL（单张或多张，用于图生图 / 多图融合）",
      "  --size <size>              图片尺寸：1K, 2K（默认）, 3K, 4K",
      "  --output-format <fmt>      输出格式：png（默认）, jpeg",
      "  --watermark                添加水印（默认不添加）",
      "  --sequential-image-generation <mode>",
      "                              组图模式：disabled（默认单图）, auto（组图）",
      "  --max-images <num>         组图模式最大图片数（默认 4）",
      JSON_OPTION,
      HELP_OPTION,
    ],
    [
      {
        title: "示例:",
        lines: [
          '  jimeng ark image -p "一只猫在阳光下"',
          '  jimeng ark image -p "换装" --image-url https://...model.png --image-url https://...cloth.png',
          '  jimeng ark image -p "4张分镜" --sequential-image-generation auto --max-images 4',
        ],
      },
    ],
  );
}

function usageTaskGet(): string {
  return buildUsageText("  jimeng task get --task-id <id> [options]", [
    "  --token <token>          Optional, override token-pool selection",
    "  --region <region>        Filter token by region (cn/us/hk/jp/sg)",
    "  --task-id <id>           Required history/task id",
    "  --type <type>            Optional image or video",
    "  --response-format <fmt>  Optional url or b64_json",
    JSON_OPTION,
    HELP_OPTION,
  ]);
}

function usageTaskWait(): string {
  return buildUsageText("  jimeng task wait --task-id <id> [options]", [
    "  --token <token>          Optional, override token-pool selection",
    "  --region <region>        Filter token by region (cn/us/hk/jp/sg)",
    "  --task-id <id>           Required history/task id",
    "  --type <type>            Optional image or video",
    "  --response-format <fmt>  Optional url or b64_json",
    "  --wait-timeout-seconds   Optional wait timeout override",
    "  --poll-interval-ms       Optional poll interval override",
    JSON_OPTION,
    HELP_OPTION,
  ]);
}

function usageTaskList(): string {
  return buildUsageText("  jimeng task list [options]", [
    "  --token <token>          Optional, override token-pool selection",
    "  --region <region>        Filter token by region (cn/us/hk/jp/sg)",
    "  --type <type>            Filter by type: image, video, or all (default all)",
    "  --count <num>            Number of items per page (default 20)",
    JSON_OPTION,
    HELP_OPTION,
  ]);
}

function configureCliLogging(command: string | undefined): void {
  if (process.env.JIMENG_CLI_VERBOSE_LOGS === "true") {
    process.env.JIMENG_CLI_SILENT_LOGS = "false";
    return;
  }
  process.env.JIMENG_CLI_SILENT_LOGS = "true";
  config.system.log_level = "fatal";
  config.system.debug = false;
  config.system.requestLog = false;
  logger.info = () => undefined;
  logger.debug = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
  console.info = () => undefined;
  console.debug = () => undefined;
  console.warn = () => undefined;
}

function fail(message: string): never {
  throw new Error(message);
}

function failWithUsage(reason: string, usage: string): never {
  fail(`${reason}\n\n${usage}`);
}

function getSingleString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const raw = args[key];
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return undefined;
}

function getRegionWithDefault(args: Record<string, unknown>): string {
  return getSingleString(args, "region") || getDefaultRegion();
}

function getRatioWithDefault(args: Record<string, unknown>): string {
  const value = getSingleString(args, "ratio") || getSingleString(args, "ration");
  const ratio = parseRatio(value || getDefaultRatio());
  if (!ratio) {
    fail(
      `Invalid --ratio: ${value}. Use one of: ${SUPPORTED_RATIOS.join(", ")}`,
    );
  }
  return ratio;
}

function toStringList(raw: unknown): string[] {
  if (typeof raw === "string")
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  if (Array.isArray(raw)) {
    return raw
      .flatMap((item) => (typeof item === "string" ? item.split(",") : []))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

let tokenPoolReady = false;
async function ensureTokenPoolReady(): Promise<void> {
  if (tokenPoolReady) return;
  await tokenPool.init();
  tokenPoolReady = true;
}

function parseRegionOrFail(region: string | undefined): RegionCode | undefined {
  if (!region) return undefined;
  const parsed = parseRegionCode(region);
  if (!parsed) fail("Invalid --region. Use cn/us/hk/jp/sg.");
  return parsed;
}

async function pickDirectTokenForGeneration(
  token: string | undefined,
  region: string | undefined,
  requestedModel: string,
  taskType: "image" | "video",
  requiredCapabilityTags: string[] = [],
): Promise<{ token: string; region: RegionCode }> {
  await ensureTokenPoolReady();
  const tokenPick = tokenPool.pickTokenForRequest({
    authorization: token ? `Bearer ${token}` : undefined,
    requestedModel,
    taskType,
    requiredCapabilityTags,
    xRegion: region,
  });
  if (!tokenPick.token || !tokenPick.region) {
    fail(
      tokenPick.reason ||
        "No direct token available. Provide --token and --region, or configure token-pool.",
    );
  }
  return { token: tokenPick.token, region: tokenPick.region };
}

async function pickDirectTokenForTask(
  token: string | undefined,
  region: string | undefined,
): Promise<{ token: string; region: RegionCode }> {
  await ensureTokenPoolReady();
  const parsedRegion = parseRegionOrFail(region);

  if (token) {
    const fromPool = tokenPool.getTokenEntry(token)?.region;
    const finalRegion = parsedRegion || fromPool;
    if (!finalRegion) {
      fail(
        "Missing region for direct task mode. Provide --region or register token region in token-pool.",
      );
    }
    return { token, region: finalRegion };
  }

  const candidates = tokenPool
    .getEntries(false)
    .filter((item) => item.enabled && item.live !== false && item.region)
    .filter((item) => (parsedRegion ? item.region === parsedRegion : true));
  if (candidates.length === 0) {
    fail(
      "No token available for direct task mode. Provide --token --region or configure token-pool.",
    );
  }
  return { token: candidates[0].token, region: candidates[0].region! };
}

function unwrapBody(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const body = payload as JsonRecord;
  if ("data" in body && ("code" in body || "message" in body)) {
    return body.data;
  }
  return payload;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printCommandJson(
  command: string,
  data: unknown,
  meta?: JsonRecord,
): void {
  const payload: JsonRecord = {
    object: "jimeng_cli_result",
    command,
    data,
  };
  if (meta && Object.keys(meta).length > 0) {
    payload.meta = meta;
  }
  printJson(payload);
}

function printDownloadSummary(kind: "image" | "video", files: string[]): void {
  const label = kind === "image" ? "images" : "video";
  console.log(`Downloaded ${files.length} ${label}.`);
  for (const file of files) {
    console.log(`- ${file}`);
  }
}

function isHelpKeyword(value: string | undefined): boolean {
  return value === "--help" || value === "-h" || value === "help";
}

function createConfigPayload() {
  const userConfig = readCliConfig();
  return {
    region: userConfig.region || "cn",
    ratio: userConfig.ratio || "1:1",
    filePath: getCliConfigFilePath(),
    updatedAt: userConfig.updatedAt || null,
  };
}

function parseSimpleCommandArgs(argv: string[]) {
  return minimist(argv, {
    boolean: ["help", "json"],
  });
}

async function handleSetCommand(argv: string[]): Promise<void> {
  const args = parseSimpleCommandArgs(argv);
  if (args.help) {
    console.log(usageSet());
    return;
  }
  const [key, value] = args._.map(String);
  if (key === "region") {
    const region = parseRegionOrFail(value);
    if (!region) failWithUsage("Missing region value.", usageSet());
    const saved = setDefaultRegion(region);
    const payload = {
      region: saved.region || "cn",
      ratio: saved.ratio || "1:1",
      filePath: getCliConfigFilePath(),
      updatedAt: saved.updatedAt || null,
    };
    if (args.json) printCommandJson("config.set", payload);
    else console.log(`Default region set to ${payload.region}`);
    return;
  }
  if (key === "ratio") {
    const ratio = parseRatio(value);
    if (!ratio) {
      failWithUsage(
        `Invalid ratio: ${value || ""}. Use one of: ${SUPPORTED_RATIOS.join(", ")}`,
        usageSet(),
      );
    }
    const saved = setDefaultRatio(ratio);
    const payload = {
      region: saved.region || "cn",
      ratio: saved.ratio || "1:1",
      filePath: getCliConfigFilePath(),
      updatedAt: saved.updatedAt || null,
    };
    if (args.json) printCommandJson("config.set", payload);
    else console.log(`Default ratio set to ${payload.ratio}`);
    return;
  }
  {
    failWithUsage(`Unknown config key: ${key || ""}`, usageSet());
  }
}

async function handleGetCommand(argv: string[]): Promise<void> {
  const args = parseSimpleCommandArgs(argv);
  if (args.help) {
    console.log(usageGet());
    return;
  }
  const [key] = args._.map(String);
  if (key !== "region" && key !== "ratio") {
    failWithUsage(`Unknown config key: ${key || ""}`, usageGet());
  }
  const payload = createConfigPayload();
  if (args.json) printCommandJson("config.get", payload);
  else console.log(key === "ratio" ? payload.ratio : payload.region);
}

async function handleConfigListCommand(argv: string[]): Promise<void> {
  const args = parseSimpleCommandArgs(argv);
  if (args.help) {
    console.log(usageConfigRoot());
    return;
  }
  const payload = createConfigPayload();
  if (args.json) printCommandJson("config.list", payload);
  else printJson(payload);
}

const TOKEN_SUBCOMMANDS: TokenSubcommandDef[] = createTokenSubcommands({
  getUsage: (name) => usageTokenSubcommand(name),
  getSingleString,
  getRegionWithDefault,
  toStringList,
  parseRegionOrFail,
  ensureTokenPoolReady,
  fail,
  failWithUsage,
  printJson,
  printCommandJson,
  unwrapBody,
  jsonOption: JSON_OPTION,
  helpOption: HELP_OPTION,
});

const queryHandlers = createQueryCommandHandlers({
  usageModelsList,
  usageModelsRefresh,
  usageTaskGet,
  usageTaskWait,
  usageTaskList,
  getSingleString,
  getRegionWithDefault,
  parseRegionOrFail,
  ensureTokenPoolReady,
  pickDirectTokenForTask,
  fail,
  printJson,
  printCommandJson,
  unwrapBody,
});

const arkHandlers = createArkCommandHandlers({
  usageArkGenerate,
  usageArkEdit,
  usageArkExtend,
  usageArkImage,
  getSingleString,
  toStringList,
  fail,
  failWithUsage,
  printCommandJson,
  printDownloadSummary: (kind, files) => {
    if (kind === "video") {
      const label = "video";
      console.log(`Downloaded ${files.length} ${label}.`);
      for (const file of files) {
        console.log(`- ${file}`);
      }
    }
  },
});

const mediaHandlers = createMediaCommandHandlers({
  usageImageGenerate,
  usageImageEdit,
  usageImageUpscale,
  usageVideoGenerate,
  getSingleString,
  getRegionWithDefault,
  getRatioWithDefault,
  toStringList,
  fail,
  failWithUsage,
  pickDirectTokenForGeneration,
  printCommandJson,
  printDownloadSummary,
  printTaskInfo: (task) => queryHandlers.printTaskInfo(task),
});

const TOKEN_SUBCOMMANDS_BY_NAME: Record<
  TokenSubcommandName,
  TokenSubcommandDef
> = Object.fromEntries(
  TOKEN_SUBCOMMANDS.map((subcommand) => [subcommand.name, subcommand]),
) as Record<TokenSubcommandName, TokenSubcommandDef>;

function buildHandlersMap(
  subcommands: Array<{ name: string; handler: CliHandler }>,
): Record<string, CliHandler> {
  return Object.fromEntries(
    subcommands.map((item) => [item.name, item.handler]),
  );
}

type CommandSubcommandDef = {
  name: string;
  description: string;
  handler: CliHandler;
};

type CommandSpec = {
  name: string;
  description: string;
  handler?: CliHandler;
  subcommands?: CommandSubcommandDef[];
  usage?: () => string;
  showAsGrouped?: boolean;
};

const COMMAND_SPECS: CommandSpec[] = [
  {
    name: "ark",
    description: "Ark API (Volcengine Seedance/Seedream)",
    subcommands: [
      {
        name: "generate",
        description: "Generate video via Ark API with multimodal inputs",
        handler: arkHandlers.handleArkGenerate,
      },
      {
        name: "edit",
        description: "Edit video via Ark API (replace/alter content)",
        handler: arkHandlers.handleArkEdit,
      },
      {
        name: "extend",
        description: "Extend/stitch videos via Ark API",
        handler: arkHandlers.handleArkExtend,
      },
      {
        name: "image",
        description: "Generate image via Ark Seedream API",
        handler: arkHandlers.handleArkImage,
      },
    ],
    usage: usageRoot,
  },
  {
    name: "set",
    description: "Set CLI preferences",
    handler: handleSetCommand,
  },
  {
    name: "get",
    description: "Get CLI preferences",
    handler: handleGetCommand,
  },
  {
    name: "config",
    description: "Config commands",
    subcommands: [
      {
        name: "list",
        description: "Show CLI config",
        handler: handleConfigListCommand,
      },
    ],
    usage: usageConfigRoot,
  },
  {
    name: "login",
    description: "Login and add session to token pool",
    handler: createLoginCommandHandler({
      getSingleString,
      getRegionWithDefault,
      parseRegionOrFail,
      ensureTokenPoolReady,
      fail,
      printJson,
      printCommandJson,
    }),
  },
  {
    name: "models",
    description: "Model commands",
    subcommands: [
      {
        name: "list",
        description: "List available models",
        handler: queryHandlers.handleModelsList,
      },
      {
        name: "refresh",
        description: "Refresh token dynamic capabilities (model list)",
        handler: queryHandlers.handleModelsRefresh,
      },
    ],
    usage: usageRoot,
  },
  {
    name: "image",
    description: "Image commands",
    subcommands: [
      {
        name: "generate",
        description: "Generate image from text",
        handler: mediaHandlers.handleImageGenerate,
      },
      {
        name: "edit",
        description: "Edit image(s) with prompt",
        handler: mediaHandlers.handleImageEdit,
      },
      {
        name: "upscale",
        description: "Upscale image to higher resolution",
        handler: mediaHandlers.handleImageUpscale,
      },
    ],
    usage: usageRoot,
  },
  {
    name: "video",
    description: "Video commands",
    subcommands: [
      {
        name: "generate",
        description: "Generate video from multimodal references",
        handler: mediaHandlers.handleVideoGenerate,
      },
    ],
    usage: usageRoot,
  },
  {
    name: "task",
    description: "Task commands",
    subcommands: [
      {
        name: "get",
        description: "Get task status",
        handler: queryHandlers.handleTaskGet,
      },
      {
        name: "wait",
        description: "Wait until task completion",
        handler: queryHandlers.handleTaskWait,
      },
      {
        name: "list",
        description: "List task history",
        handler: queryHandlers.handleTaskList,
      },
    ],
    usage: usageRoot,
  },
  {
    name: "token",
    description: "Token management commands",
    subcommands: TOKEN_SUBCOMMANDS.map((subcommand) => ({
      name: subcommand.name,
      description: subcommand.description,
      handler: subcommand.handler,
    })),
    usage: usageTokenRoot,
    showAsGrouped: true,
  },
];

const COMMAND_SPECS_BY_NAME: Record<string, CommandSpec> = Object.fromEntries(
  COMMAND_SPECS.map((spec) => [spec.name, spec]),
);

const ROOT_COMMAND_ENTRIES: Array<{ path: string; description: string }> =
  COMMAND_SPECS.flatMap((spec) => {
    if (spec.handler) {
      return [{ path: spec.name, description: spec.description }];
    }
    if (!spec.subcommands || spec.subcommands.length === 0) {
      return [{ path: spec.name, description: spec.description }];
    }
    if (spec.showAsGrouped) {
      return [
        { path: `${spec.name} <subcommand>`, description: spec.description },
      ];
    }
    return spec.subcommands.map((subcommand) => ({
      path: `${spec.name} ${subcommand.name}`,
      description: subcommand.description,
    }));
  });

const ROOT_HELP_HINT_LINES: string[] = [
  "Run `jimeng <command> --help` for command details.",
  ...COMMAND_SPECS.filter((spec) => spec.showAsGrouped).map(
    (spec) =>
      `Run \`jimeng ${spec.name} --help\` for ${spec.name} subcommands.`,
  ),
];

async function dispatchSubcommand(
  subcommand: string | undefined,
  argv: string[],
  handlers: Record<string, CliHandler>,
  usage: string,
  unknownLabel: string,
): Promise<boolean> {
  if (!subcommand || isHelpKeyword(subcommand)) {
    console.log(usage);
    return true;
  }
  const handler = handlers[subcommand];
  if (!handler) {
    failWithUsage(`Unknown ${unknownLabel}: ${subcommand}`, usage);
  }
  await handler(argv);
  return true;
}

async function run(): Promise<void> {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  configureCliLogging(command);

  if (!command || isHelpKeyword(command)) {
    console.log(usageRoot());
    return;
  }
  const spec = COMMAND_SPECS_BY_NAME[command];
  if (!spec) {
    failWithUsage(
      `Unknown command: ${[command, subcommand].filter(Boolean).join(" ")}`,
      usageRoot(),
    );
  }

  if (spec.handler) {
    await spec.handler(subcommand ? [subcommand, ...rest] : rest);
    return;
  }

  if (spec.subcommands) {
    const handlers = buildHandlersMap(spec.subcommands);
    if (
      await dispatchSubcommand(
        subcommand,
        process.argv.slice(3),
        handlers,
        spec.usage ? spec.usage() : usageRoot(),
        `${command} subcommand`,
      )
    ) {
      return;
    }
  }

  failWithUsage(
    `Unknown command: ${[command, subcommand].filter(Boolean).join(" ")}`,
    usageRoot(),
  );
}

export function runCli(): void {
  run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const isJson = process.argv.includes("--json");
    if (isJson) {
      printCommandJson("error", { message });
    } else {
      console.error(`Error: ${message}`);
    }
    process.exit(1);
  });
}
