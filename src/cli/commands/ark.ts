import minimist from "minimist";

import {
  generateArkVideo,
  editArkVideo,
  extendArkVideo,
  generateArkImage,
} from "@/api/services/ark.ts";
import {
  ARK_DEFAULT_MODEL,
  ARK_DEFAULT_IMAGE_MODEL,
  ARK_MODEL_IDS,
} from "@/api/constants/ark.ts";

type JsonRecord = Record<string, unknown>;
type CliMode = "generate" | "edit" | "extend" | "image";

type ArkDeps = {
  usageArkGenerate: () => string;
  usageArkEdit: () => string;
  usageArkExtend: () => string;
  usageArkImage: () => string;
  getSingleString: (
    args: Record<string, unknown>,
    key: string,
  ) => string | undefined;
  toStringList: (raw: unknown) => string[];
  fail: (message: string) => never;
  failWithUsage: (reason: string, usage: string) => never;
  printCommandJson: (command: string, data: unknown, meta?: JsonRecord) => void;
  printDownloadSummary: (kind: "video", files: string[]) => void;
};

function resolveApiKey(
  apiKeyFromArg: string | undefined,
  fail: (msg: string) => never,
): string {
  if (apiKeyFromArg) return apiKeyFromArg;
  const envValue = process.env.ARK_API_KEY?.trim();
  if (envValue) return envValue;
  fail(
    "Ark API Key is required. Set ARK_API_KEY environment variable or pass --api-key.",
  );
}

async function downloadBinary(
  url: string,
  fail: (msg: string) => never,
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      fail(`Download timed out after 120s: ${url}`);
    }
    throw err;
  }
  clearTimeout(timeout);
  if (!response.ok) {
    fail(`Download failed (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function parsePositiveNumber(
  raw: string | undefined,
  label: string,
  fail: (msg: string) => never,
): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`Invalid --${label}: ${raw}`);
  }
  return parsed;
}

type ArgMap = Record<string, unknown>;

function parseArkArgs(
  argv: string[],
  mode: CliMode,
  usage: string,
  deps: Pick<
    ArkDeps,
    | "getSingleString"
    | "toStringList"
    | "fail"
    | "failWithUsage"
  >,
) {
  const stringArgs = [
    "api-key",
    "prompt",
    "model",
    "image-url",
    "video-url",
    "audio-url",
    "ratio",
    "resolution",
    "duration",
    "wait-timeout-seconds",
    "poll-interval-ms",
    "output",
    "service-tier",
    "callback-url",
    "seed",
  ];
  const booleanArgs = [
    "help",
    "generate-audio",
    "no-audio",
    "watermark",
    "no-watermark",
    "return-last-frame",
    "camera-fixed",
    "wait",
    "no-wait",
    "json",
  ];

  const args = minimist(argv, {
    string: stringArgs,
    boolean: booleanArgs,
    default: { wait: true, "generate-audio": true },
    alias: { p: "prompt", o: "output" },
  });

  const prompt = deps.getSingleString(args, "prompt");
  if (!prompt) deps.failWithUsage("Missing required --prompt.", usage);

  const imageUrls = deps.toStringList(args["image-url"]);
  const videoUrls = deps.toStringList(args["video-url"]);
  const audioUrls = deps.toStringList(args["audio-url"]);

  if (imageUrls.length > 9) deps.fail("At most 9 image URLs are supported.");
  if (videoUrls.length > 3) deps.fail("At most 3 video URLs are supported.");
  if (audioUrls.length > 3) deps.fail("At most 3 audio URLs are supported.");

  // mode 特定校验
  if (mode === "edit" && videoUrls.length < 1) {
    deps.fail("Video edit mode requires at least 1 --video-url.");
  }
  if (mode === "extend" && (videoUrls.length < 1 || videoUrls.length > 3)) {
    deps.fail("Video extend mode requires 1~3 --video-url(s).");
  }

  return {
    args,
    prompt,
    imageUrls,
    videoUrls,
    audioUrls,
    model: deps.getSingleString(args, "model") || ARK_DEFAULT_MODEL,
    ratio: deps.getSingleString(args, "ratio") || "16:9",
    resolution: deps.getSingleString(args, "resolution") || "720p",
    generateAudio: args["generate-audio"] !== false,
    watermark: args.watermark === true,
    returnLastFrame: args["return-last-frame"] === true,
    cameraFixed: args["camera-fixed"] === true,
    serviceTier: deps.getSingleString(args, "service-tier"),
    callbackUrl: deps.getSingleString(args, "callback-url"),
    seed: parsePositiveNumber(
      deps.getSingleString(args, "seed"),
      "seed",
      deps.fail,
    ),
    wait: args.wait !== false,
    isJson: Boolean(args.json),
    outputPath: deps.getSingleString(args, "output"),
    waitTimeoutSeconds: parsePositiveNumber(
      deps.getSingleString(args, "wait-timeout-seconds"),
      "wait-timeout-seconds",
      deps.fail,
    ),
    pollIntervalMs: parsePositiveNumber(
      deps.getSingleString(args, "poll-interval-ms"),
      "poll-interval-ms",
      deps.fail,
    ),
    duration: (() => {
      const raw = deps.getSingleString(args, "duration") || "5";
      const parsed = Number(raw);
      if (
        !Number.isFinite(parsed) ||
        parsed <= 0 ||
        !Number.isInteger(parsed)
      ) {
        deps.fail(`Invalid --duration: ${raw}. Use a positive integer.`);
      }
      return parsed;
    })(),
  };
}

async function handleResult(
  result: string | { taskId: string },
  prompt: string,
  mode: CliMode,
  isJson: boolean,
  outputPath: string | undefined,
  deps: Pick<ArkDeps, "fail" | "printCommandJson" | "printDownloadSummary">,
): Promise<void> {
  if (typeof result !== "string") {
    if (isJson)
      deps.printCommandJson(`ark.${mode}`, result, { wait: false });
    else console.log(`Task submitted: ${result.taskId}`);
    return;
  }

  const videoUrl = result;

  if (outputPath || !isJson) {
    const buffer = await downloadBinary(videoUrl, deps.fail);
    const ext = "mp4";
    const { writeFile, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");

    const filePath =
      outputPath ||
      path.join(
        "./pic/cli-ark-generate",
        `ark-${mode}-${new Date().toISOString().replace(/[-:.TZ]/g, "")}.${ext}`,
      );

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);

    if (isJson) {
      deps.printCommandJson(
        `ark.${mode}`,
        { data: [{ url: videoUrl }], files: [filePath] },
        { wait: true },
      );
    } else {
      deps.printDownloadSummary("video", [filePath]);
    }
  } else {
    deps.printCommandJson(
      `ark.${mode}`,
      { data: [{ url: videoUrl }] },
      { wait: true },
    );
  }
}

export function createArkCommandHandlers(deps: ArkDeps) {
  function printHelpOrParse(argv: string[], mode: CliMode, usage: string) {
    const hasHelp = argv.includes("--help") || argv.includes("-h");
    if (hasHelp) {
      console.log(usage);
      return null;
    }
    return parseArkArgs(argv, mode, usage, deps);
  }

  const handleArkGenerate = async (argv: string[]) => {
    const usage = deps.usageArkGenerate();
    const p = printHelpOrParse(argv, "generate", usage);
    if (!p) return;

    const apiKey = resolveApiKey(p.args["api-key"] ?? undefined, deps.fail);

    const result = await generateArkVideo(apiKey, {
      prompt: p.prompt,
      model: p.model,
      imageUrls: p.imageUrls,
      videoUrls: p.videoUrls,
      audioUrls: p.audioUrls,
      generateAudio: p.generateAudio,
      ratio: p.ratio,
      duration: p.duration,
      resolution: p.resolution,
      watermark: p.watermark,
      returnLastFrame: p.returnLastFrame,
      seed: p.seed,
      cameraFixed: p.cameraFixed,
      serviceTier: p.serviceTier,
      callbackUrl: p.callbackUrl,
      wait: p.wait,
      waitTimeoutSeconds: p.waitTimeoutSeconds,
      pollIntervalMs: p.pollIntervalMs,
    });

    await handleResult(result, p.prompt, "generate", p.isJson, p.outputPath, deps);
  };

  const handleArkEdit = async (argv: string[]) => {
    const usage = deps.usageArkEdit();
    const p = printHelpOrParse(argv, "edit", usage);
    if (!p) return;

    const apiKey = resolveApiKey(p.args["api-key"] ?? undefined, deps.fail);

    const result = await editArkVideo(apiKey, {
      prompt: p.prompt,
      model: p.model,
      videoUrls: p.videoUrls,
      imageUrls: p.imageUrls,
      audioUrls: p.audioUrls,
      generateAudio: p.generateAudio,
      ratio: p.ratio,
      duration: p.duration,
      resolution: p.resolution,
      watermark: p.watermark,
      returnLastFrame: p.returnLastFrame,
      seed: p.seed,
      cameraFixed: p.cameraFixed,
      serviceTier: p.serviceTier,
      callbackUrl: p.callbackUrl,
      wait: p.wait,
      waitTimeoutSeconds: p.waitTimeoutSeconds,
      pollIntervalMs: p.pollIntervalMs,
    });

    await handleResult(result, p.prompt, "edit", p.isJson, p.outputPath, deps);
  };

  const handleArkExtend = async (argv: string[]) => {
    const usage = deps.usageArkExtend();
    const p = printHelpOrParse(argv, "extend", usage);
    if (!p) return;

    const apiKey = resolveApiKey(p.args["api-key"] ?? undefined, deps.fail);

    const result = await extendArkVideo(apiKey, {
      prompt: p.prompt,
      model: p.model,
      videoUrls: p.videoUrls,
      imageUrls: p.imageUrls,
      audioUrls: p.audioUrls,
      generateAudio: p.generateAudio,
      ratio: p.ratio,
      duration: p.duration,
      resolution: p.resolution,
      watermark: p.watermark,
      returnLastFrame: p.returnLastFrame,
      seed: p.seed,
      cameraFixed: p.cameraFixed,
      serviceTier: p.serviceTier,
      callbackUrl: p.callbackUrl,
      wait: p.wait,
      waitTimeoutSeconds: p.waitTimeoutSeconds,
      pollIntervalMs: p.pollIntervalMs,
    });

    await handleResult(result, p.prompt, "extend", p.isJson, p.outputPath, deps);
  };

  const handleArkImage = async (argv: string[]) => {
    const usage = deps.usageArkImage();
    const parsed = printHelpOrParse(argv, "image", usage);
    if (!parsed) return;

    const apiKey = resolveApiKey(parsed.args["api-key"] ?? undefined, deps.fail);

    const result = await generateArkImage(apiKey, {
      prompt: parsed.prompt,
      model: parsed.model || ARK_DEFAULT_IMAGE_MODEL,
      image: parsed.imageUrls.length > 0
        ? (parsed.imageUrls.length === 1 ? parsed.imageUrls[0] : parsed.imageUrls)
        : undefined,
      size: parsed.args["size"] as string | undefined || "2K",
      output_format: parsed.args["output-format"] as string | undefined || "png",
      watermark: parsed.args.watermark as boolean | undefined,
      sequential_image_generation: parsed.args["sequential-image-generation"] as string | undefined,
      max_images: parsed.args["max-images"] as number | undefined,
    });

    if (parsed.isJson) {
      deps.printCommandJson(
        "ark.image",
        { data: result.map((url) => ({ url })) },
      );
    } else {
      console.log(`Generated ${result.length} image(s):`);
      for (const url of result) {
        console.log(`  ${url}`);
      }
    }
  };

  return { handleArkGenerate, handleArkEdit, handleArkExtend, handleArkImage };
}
