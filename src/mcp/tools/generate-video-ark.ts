import type { z } from "zod";

import { generateArkVideo } from "@/api/services/ark.ts";
import { assertRunConfirm } from "../guards.ts";
import { generateArkVideoInputSchema } from "../schemas.ts";
import type { ToolDeps } from "../types.ts";
import { registerSafeTool } from "../tool-factory.ts";

type GenerateArkVideoArgs = z.infer<typeof generateArkVideoInputSchema>;

export function registerGenerateArkVideoTool({
  server,
  config,
}: ToolDeps): void {
  registerSafeTool(
    server,
    "generate_video_ark",
    {
      title: "Generate Video via Ark API",
      description:
        "Generate video via Volcengine Ark API with multimodal inputs (text, images, video, audio). Supports seedance 2.0 models. Requires ARK_API_KEY env or api_key parameter.",
      inputSchema: generateArkVideoInputSchema,
    },
    async (args: GenerateArkVideoArgs) => {
      assertRunConfirm(config, args.confirm);

      const apiKey = args.api_key || config.arkApiKey;
      if (!apiKey) {
        throw new Error(
          "Ark API Key is required. Set ARK_API_KEY environment variable or pass api_key parameter.",
        );
      }

      const result = await generateArkVideo(apiKey, {
        prompt: args.prompt,
        model: args.model,
        imageUrls: args.image_urls,
        videoUrls: args.video_urls,
        audioUrls: args.audio_urls,
        generateAudio: args.generate_audio,
        ratio: args.ratio,
        duration: args.duration,
        watermark: args.watermark,
        wait: args.wait,
        waitTimeoutSeconds: args.wait_timeout_seconds,
        pollIntervalMs: args.poll_interval_ms,
      });

      // Generate video returns either a URL string (wait mode) or { taskId } (async mode)
      if (typeof result === "string") {
        return {
          created: Math.floor(Date.now() / 1000),
          data: [{ url: result, revised_prompt: args.prompt }],
        };
      }

      return {
        task_id: result.taskId,
        status: "pending",
      };
    },
  );
}
