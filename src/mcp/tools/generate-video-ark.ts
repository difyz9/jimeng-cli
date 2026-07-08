import type { z } from "zod";

import {
  generateArkVideo,
  editArkVideo,
  extendArkVideo,
  generateArkImage,
} from "@/api/services/ark.ts";
import { assertRunConfirm } from "../guards.ts";
import {
  generateArkVideoInputSchema,
  editArkVideoInputSchema,
  extendArkVideoInputSchema,
  generateArkImageInputSchema,
} from "../schemas.ts";
import type { ToolDeps } from "../types.ts";
import { registerSafeTool } from "../tool-factory.ts";

type GenerateArgs = z.infer<typeof generateArkVideoInputSchema>;
type EditArgs = z.infer<typeof editArkVideoInputSchema>;
type ExtendArgs = z.infer<typeof extendArkVideoInputSchema>;
type ImageArgs = z.infer<typeof generateArkImageInputSchema>;

function resolveApiKey(args: { api_key?: string }, config: ToolDeps["config"]): string {
  const key = args.api_key || config.arkApiKey;
  if (!key) {
    throw new Error(
      "Ark API Key is required. Set ARK_API_KEY environment variable or pass api_key parameter.",
    );
  }
  return key;
}

function buildResult(
  result: string | { taskId: string },
  prompt: string,
): unknown {
  if (typeof result === "string") {
    return {
      created: Math.floor(Date.now() / 1000),
      data: [{ url: result, revised_prompt: prompt }],
    };
  }
  return { task_id: result.taskId, status: "pending" };
}

/** 注册 Ark MCP 工具（4 个: generate/edit/extend/image） */
export function registerArkVideoTools({ server, config }: ToolDeps): void {
  // 1. 多模态参考 / 文生视频 / 图生视频
  registerSafeTool(
    server,
    "ark_generate",
    {
      title: "Ark Video Generate",
      description:
        "Generate video via Volcengine Ark API with multimodal inputs (text, images, video, audio). Supports seedance 2.0 models. 多模态参考 / 文生视频 / 图生视频。",
      inputSchema: generateArkVideoInputSchema,
    },
    async (args: GenerateArgs) => {
      assertRunConfirm(config, args.confirm);
      const apiKey = resolveApiKey(args, config);
      const result = await generateArkVideo(apiKey, {
        prompt: args.prompt,
        imageUrls: args.image_urls,
        videoUrls: args.video_urls,
        audioUrls: args.audio_urls,
        generateAudio: args.generate_audio,
        ratio: args.ratio,
        duration: args.duration,
        resolution: args.resolution,
        watermark: args.watermark,
        returnLastFrame: args.return_last_frame,
        seed: args.seed,
        cameraFixed: args.camera_fixed,
        serviceTier: args.service_tier,
        callbackUrl: args.callback_url,
        wait: args.wait,
        waitTimeoutSeconds: args.wait_timeout_seconds,
        pollIntervalMs: args.poll_interval_ms,
      });
      return buildResult(result, args.prompt);
    },
  );

  // 2. 视频编辑
  registerSafeTool(
    server,
    "ark_edit",
    {
      title: "Ark Video Edit",
      description:
        "Edit a video using reference images/text via Volcengine Ark API. 视频编辑：替换视频主体、对象增删改、局部重绘等。",
      inputSchema: editArkVideoInputSchema,
    },
    async (args: EditArgs) => {
      assertRunConfirm(config, args.confirm);
      const apiKey = resolveApiKey(args, config);
      const result = await editArkVideo(apiKey, {
        prompt: args.prompt,
        videoUrls: args.video_urls,
        imageUrls: args.image_urls,
        audioUrls: args.audio_urls,
        generateAudio: args.generate_audio,
        ratio: args.ratio,
        duration: args.duration,
        resolution: args.resolution,
        watermark: args.watermark,
        returnLastFrame: args.return_last_frame,
        seed: args.seed,
        cameraFixed: args.camera_fixed,
        serviceTier: args.service_tier,
        callbackUrl: args.callback_url,
        wait: args.wait,
        waitTimeoutSeconds: args.wait_timeout_seconds,
        pollIntervalMs: args.poll_interval_ms,
      });
      return buildResult(result, args.prompt);
    },
  );

  // 3. 视频延长
  registerSafeTool(
    server,
    "ark_extend",
    {
      title: "Ark Video Extend",
      description:
        "Extend or stitch multiple videos into a coherent clip via Volcengine Ark API. 视频延长：向前/向后延长视频，或多个视频片段串联。",
      inputSchema: extendArkVideoInputSchema,
    },
    async (args: ExtendArgs) => {
      assertRunConfirm(config, args.confirm);
      const apiKey = resolveApiKey(args, config);
      const result = await extendArkVideo(apiKey, {
        prompt: args.prompt,
        videoUrls: args.video_urls,
        imageUrls: args.image_urls,
        audioUrls: args.audio_urls,
        generateAudio: args.generate_audio,
        ratio: args.ratio,
        duration: args.duration,
        resolution: args.resolution,
        watermark: args.watermark,
        returnLastFrame: args.return_last_frame,
        seed: args.seed,
        cameraFixed: args.camera_fixed,
        serviceTier: args.service_tier,
        callbackUrl: args.callback_url,
        wait: args.wait,
        waitTimeoutSeconds: args.wait_timeout_seconds,
        pollIntervalMs: args.poll_interval_ms,
      });
      return buildResult(result, args.prompt);
    },
  );

  // 4. 图片生成
  registerSafeTool(
    server,
    "ark_image",
    {
      title: "Ark Image Generate",
      description:
        "Generate images via Volcengine Ark Seedream API. Supports text-to-image, image-to-image, multi-image fusion, and sequential group image generation. 文生图 / 图文生图 / 多图融合 / 组图生成。",
      inputSchema: generateArkImageInputSchema,
    },
    async (args: ImageArgs) => {
      assertRunConfirm(config, args.confirm);
      const apiKey = resolveApiKey(args, config);
      const urls = await generateArkImage(apiKey, {
        prompt: args.prompt,
        model: args.model,
        image: args.image_urls,
        size: args.size,
        output_format: args.output_format,
        watermark: args.watermark,
        sequential_image_generation: args.sequential_image_generation,
        max_images: args.max_images,
      });
      return {
        created: Math.floor(Date.now() / 1000),
        data: urls.map((url) => ({ url, revised_prompt: args.prompt })),
      };
    },
  );
}
