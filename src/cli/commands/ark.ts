import minimist from "minimist";

import { generateArkVideo } from "@/api/services/ark.ts";
import { ARK_DEFAULT_MODEL } from "@/api/constants/ark.ts";

type JsonRecord = Record<string, unknown>;

type ArkDeps = {
  usageArkGenerate: () => string;
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

function resolveApiKey(options: {
  apiKeyFromArg?: string;
  envKey: string;
  fail: (msg: string) => never;
}): string {
  if (options.apiKeyFromArg) return options.apiKeyFromArg;
  const envValue = process.env[options.envKey]?.trim();
  if (envValue) return envValue;
  options.fail(
    `Ark API Key is required. Set ${options.envKey} environment variable or pass --api-key.`,
  );
}

async function downloadBinary(
  url: string,
  deps: Pick<ArkDeps, "fail">,
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      deps.fail(`Download timed out after 120s: ${url}`);
    }
    throw err;
  }
  clearTimeout(timeout);
  if (!response.ok) {
    deps.fail(`Download failed (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export function createArkCommandHandlers(deps: ArkDeps): {
  handleArkGenerate: (argv: string[]) => Promise<void>;
} {
  const handleArkGenerate = async (argv: string[]): Promise<void> => {
    const usage = deps.usageArkGenerate();
    const args = minimist(argv, {
      string: [
        "api-key",
        "prompt",
        "model",
        "image-url",
        "video-url",
        "audio-url",
        "ratio",
        "duration",
        "wait-timeout-seconds",
        "poll-interval-ms",
        "output",
      ],
      boolean: [
        "help",
        "generate-audio",
        "no-audio",
        "watermark",
        "no-watermark",
        "wait",
        "no-wait",
        "json",
      ],
      default: { wait: true, "generate-audio": true },
      alias: { p: "prompt", o: "output" },
    });

    if (args.help) {
      console.log(usage);
      return;
    }

    const prompt: string | undefined = deps.getSingleString(args, "prompt");
    if (!prompt) deps.failWithUsage("Missing required --prompt.", usage);

    const imageUrls = deps.toStringList(args["image-url"]);
    const videoUrls = deps.toStringList(args["video-url"]);
    const audioUrls = deps.toStringList(args["audio-url"]);

    if (imageUrls.length > 9)
      deps.fail("At most 9 image URLs are supported.");
    if (videoUrls.length > 3)
      deps.fail("At most 3 video URLs are supported.");
    if (audioUrls.length > 3)
      deps.fail("At most 3 audio URLs are supported.");

    const apiKey = resolveApiKey({
      apiKeyFromArg: deps.getSingleString(args, "api-key"),
      envKey: "ARK_API_KEY",
      fail: deps.fail,
    });

    const model = deps.getSingleString(args, "model") || ARK_DEFAULT_MODEL;
    const ratio = deps.getSingleString(args, "ratio") || "16:9";
    const durationRaw = deps.getSingleString(args, "duration") || "11";
    const duration = Number(durationRaw);
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !Number.isInteger(duration)
    ) {
      deps.fail(
        `Invalid --duration: ${durationRaw}. Use a positive integer (seconds).`,
      );
    }
    const generateAudio = args["generate-audio"] !== false;
    const watermark = args.watermark === true;
    const wait = args.wait !== false;
    const isJson = Boolean(args.json);
    const outputPath = deps.getSingleString(args, "output");

    const result = await generateArkVideo(apiKey, {
      prompt,
      model,
      imageUrls,
      videoUrls,
      audioUrls,
      generateAudio,
      ratio,
      duration,
      watermark,
      wait,
      waitTimeoutSeconds: (() => {
        const raw = deps.getSingleString(args, "wait-timeout-seconds");
        if (!raw) return undefined;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          deps.fail(`Invalid --wait-timeout-seconds: ${raw}`);
        }
        return parsed;
      })(),
      pollIntervalMs: (() => {
        const raw = deps.getSingleString(args, "poll-interval-ms");
        if (!raw) return undefined;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          deps.fail(`Invalid --poll-interval-ms: ${raw}`);
        }
        return parsed;
      })(),
    });

    if (typeof result !== "string") {
      // 异步模式
      if (isJson)
        deps.printCommandJson("ark.generate", result, { wait });
      else
        console.log(`Task submitted: ${result.taskId}`);
      return;
    }

    const videoUrl: string = result;

    if (outputPath || !isJson) {
      const buffer = await downloadBinary(videoUrl, deps);
      const ext = "mp4";
      const { writeFile, mkdir } = await import("node:fs/promises");
      const path = await import("node:path");

      const filePath = outputPath
        ? outputPath
        : (() => {
            const dir = path.resolve("./pic/cli-ark-generate");
            const timestamp = new Date()
              .toISOString()
              .replace(/[-:.TZ]/g, "");
            return path.join(dir, `ark-video-${timestamp}.${ext}`);
          })();

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, buffer);

      if (isJson) {
        deps.printCommandJson(
          "ark.generate",
          { data: [{ url: videoUrl }], files: [filePath] },
          { wait },
        );
      } else {
        deps.printDownloadSummary("video", [filePath]);
      }
    } else {
      deps.printCommandJson(
        "ark.generate",
        { data: [{ url: videoUrl }] },
        { wait },
      );
    }
  };

  return { handleArkGenerate };
}
