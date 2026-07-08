import * as z from "zod";

function buildIndexedUrlFields(
  prefix: "image_file" | "video_file",
  max: number,
) {
  return Object.fromEntries(
    Array.from({ length: max }, (_, index) => [
      `${prefix}_${index + 1}`,
      z.string().url().optional(),
    ]),
  );
}

function normalizeUniqueValues(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

export const healthCheckInputSchema = z.object({});

export const listModelsInputSchema = z.object({
  token: z.string().optional(),
  include_manual: z.boolean().optional(),
});

export const generateImageInputSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  negative_prompt: z.string().optional(),
  ratio: z.string().optional(),
  resolution: z.string().optional(),
  intelligent_ratio: z.boolean().optional(),
  sample_strength: z.number().optional(),
  response_format: z.enum(["url", "b64_json"]).optional(),
  wait: z.boolean().optional(),
  wait_timeout_seconds: z.number().int().positive().optional(),
  poll_interval_ms: z.number().int().positive().optional(),
  token: z.string().optional(),
  confirm: z.string().optional(),
});

export const editImageInputSchema = z.object({
  prompt: z.string().min(1),
  images: z.array(z.string().url()).min(1).max(10),
  model: z.string().optional(),
  negative_prompt: z.string().optional(),
  ratio: z.string().optional(),
  resolution: z.string().optional(),
  intelligent_ratio: z.boolean().optional(),
  sample_strength: z.number().optional(),
  response_format: z.enum(["url", "b64_json"]).optional(),
  wait: z.boolean().optional(),
  wait_timeout_seconds: z.number().int().positive().optional(),
  poll_interval_ms: z.number().int().positive().optional(),
  token: z.string().optional(),
  confirm: z.string().optional(),
});

export const generateVideoInputSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  ratio: z.string().optional(),
  resolution: z.string().optional(),
  duration: z.number().int().min(4).max(15).optional(),
  wait: z.boolean().optional(),
  wait_timeout_seconds: z.number().int().positive().optional(),
  poll_interval_ms: z.number().int().positive().optional(),
  token: z.string().optional(),
  confirm: z.string().optional(),
});

export const generateVideoOmniInputSchema = z
  .object({
    prompt: z.string().min(1),
    model: z.string().optional(),
    ratio: z.string().optional(),
    resolution: z.string().optional(),
    duration: z.number().int().min(4).max(15).optional(),
    response_format: z.enum(["url", "b64_json"]).optional(),
    wait: z.boolean().optional(),
    wait_timeout_seconds: z.number().int().positive().optional(),
    poll_interval_ms: z.number().int().positive().optional(),
    file_paths: z.array(z.string().url()).max(9).optional(),
    filePaths: z.array(z.string().url()).max(9).optional(),
    image_urls: z.array(z.string().url()).max(9).optional(),
    video_urls: z.array(z.string().url()).max(3).optional(),
    image_files: z.array(z.string()).max(9).optional(),
    video_files: z.array(z.string()).max(3).optional(),
    ...buildIndexedUrlFields("image_file", 9),
    ...buildIndexedUrlFields("video_file", 3),
    token: z.string().optional(),
    confirm: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const imageSlotUrls = Array.from(
      { length: 9 },
      (_, index) => value[`image_file_${index + 1}`],
    );
    const videoSlotUrls = Array.from(
      { length: 3 },
      (_, index) => value[`video_file_${index + 1}`],
    );

    const imageCount =
      normalizeUniqueValues(value.image_urls || []).length +
      (value.image_files?.length || 0) +
      normalizeUniqueValues([
        ...(value.file_paths || []),
        ...(value.filePaths || []),
      ]).length +
      normalizeUniqueValues(
        imageSlotUrls.filter(
          (item): item is string => typeof item === "string",
        ),
      ).length;

    const videoCount =
      normalizeUniqueValues(value.video_urls || []).length +
      (value.video_files?.length || 0) +
      normalizeUniqueValues(
        videoSlotUrls.filter(
          (item): item is string => typeof item === "string",
        ),
      ).length;

    if (imageCount > 9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Omni mode supports at most 9 images.",
      });
    }
    if (videoCount > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Omni mode supports at most 3 videos.",
      });
    }
    if (imageCount + videoCount > 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Omni mode supports at most 12 total materials.",
      });
    }
    if (imageCount + videoCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Omni mode requires at least one material.",
      });
    }
  });

export const getTaskInputSchema = z.object({
  task_id: z.string().min(1),
  type: z.enum(["image", "video"]).optional(),
  response_format: z.enum(["url", "b64_json"]).optional(),
  token: z.string().optional(),
});

export const waitTaskInputSchema = z.object({
  task_id: z.string().min(1),
  type: z.enum(["image", "video"]).optional(),
  response_format: z.enum(["url", "b64_json"]).optional(),
  wait_timeout_seconds: z.number().int().positive().optional(),
  poll_interval_ms: z.number().int().positive().optional(),
  token: z.string().optional(),
});

export const upscaleImageInputSchema = z.object({
  image: z.string().min(1).describe("Image URL or local file path to upscale"),
  model: z.string().optional(),
  resolution: z.enum(["2k", "4k"]).optional(),
  response_format: z.enum(["url", "b64_json"]).optional(),
  wait: z.boolean().optional(),
  wait_timeout_seconds: z.number().int().positive().optional(),
  poll_interval_ms: z.number().int().positive().optional(),
  token: z.string().optional(),
  confirm: z.string().optional(),
});

export const listTasksInputSchema = z.object({
  type: z.enum(["image", "video", "all"]).optional(),
  count: z.number().int().positive().max(100).optional(),
  token: z.string().optional(),
});

// ============================== Ark API Schemas ==============================

/** Ark 视频任务共享参数 */
const arkCommonParams = {
  model: z
    .string()
    .optional()
    .describe(
      '模型 ID。doubao-seedance-2-0-260128 / doubao-seedance-2-0-fast-260128 / doubao-seedance-2-0-mini-260615（默认）',
    ),
  generate_audio: z
    .boolean()
    .optional()
    .describe("是否生成背景音频，默认 true"),
  ratio: z
    .string()
    .optional()
    .describe("画面比例：16:9, 9:16, 4:3, 3:4, 21:9, 1:1, adaptive。默认 16:9"),
  duration: z
    .number()
    .int()
    .min(4)
    .max(15)
    .optional()
    .describe("视频时长（秒），4~15，默认 5"),
  resolution: z
    .string()
    .optional()
    .describe("分辨率：480p, 720p（默认）, 1080p（仅 2.0）, 4k（仅 2.0）"),
  watermark: z
    .boolean()
    .optional()
    .describe("是否添加水印，默认 false"),
  return_last_frame: z
    .boolean()
    .optional()
    .describe("是否返回尾帧图像（PNG），默认 false"),
  seed: z
    .number()
    .int()
    .optional()
    .describe("随机种子，控制生成的一致性"),
  camera_fixed: z
    .boolean()
    .optional()
    .describe("是否固定镜头，默认 false"),
  service_tier: z
    .string()
    .optional()
    .describe('服务等级："standard"（在线推理、默认）, "flex"（离线推理）'),
  callback_url: z
    .string()
    .url()
    .optional()
    .describe("任务完成回调 URL"),
  api_key: z
    .string()
    .optional()
    .describe("Ark API Key，默认从环境变量 ARK_API_KEY 读取"),
  wait: z
    .boolean()
    .optional()
    .describe("是否等待任务完成，默认 true"),
  wait_timeout_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("等待超时秒数"),
  poll_interval_ms: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("轮询间隔毫秒数"),
  confirm: z
    .string()
    .optional()
    .describe("确认标记，设为 RUN 跳过确认"),
};

/** 多模态参考 / 文生视频 / 图生视频 */
export const generateArkVideoInputSchema = z.object({
  prompt: z.string().min(1).describe("文本 prompt"),
  image_urls: z
    .array(z.string().url())
    .max(9)
    .optional()
    .describe("参考图片 URL（多模态参考传 reference_image，图生视频首帧传 first_frame）"),
  video_urls: z
    .array(z.string().url())
    .max(3)
    .optional()
    .describe("参考视频 URL"),
  audio_urls: z
    .array(z.string().url())
    .max(3)
    .optional()
    .describe("参考音频 URL"),
  ...arkCommonParams,
});

/** 视频编辑 */
export const editArkVideoInputSchema = z.object({
  prompt: z.string().min(1).describe('编辑指令，例如："将视频1礼盒中的香水替换成图片1中的面霜"'),
  video_urls: z
    .array(z.string().url())
    .min(1)
    .max(3)
    .describe("待编辑的视频 URL（必填，至少 1 个）"),
  image_urls: z
    .array(z.string().url())
    .max(9)
    .optional()
    .describe("参考图片 URL（用于替换/参考内容）"),
  audio_urls: z
    .array(z.string().url())
    .max(3)
    .optional()
    .describe("参考音频 URL"),
  ...arkCommonParams,
});

/** 视频延长 */
export const extendArkVideoInputSchema = z.object({
  prompt: z.string().min(1).describe("视频连贯拼接的文本描述"),
  video_urls: z
    .array(z.string().url())
    .min(1)
    .max(3)
    .describe("待延长的视频 URL（最多 3 个，按顺序拼接）"),
  image_urls: z
    .array(z.string().url())
    .max(9)
    .optional()
    .describe("参考图片 URL"),
  audio_urls: z
    .array(z.string().url())
    .max(3)
    .optional()
    .describe("参考音频 URL"),
  ...arkCommonParams,
});

// ============================== Ark Image Generation Schema ==============================

/** 文生图 / 图文生图 / 多图融合 / 组图生成 */
export const generateArkImageInputSchema = z.object({
  prompt: z.string().min(1).describe("图片描述 prompt"),
  model: z
    .string()
    .optional()
    .describe(
      '模型 ID: doubao-seedream-5-0-pro-260628 / doubao-seedream-5-0-260128（默认） / doubao-seedream-4-5-251128 / doubao-seedream-4-0-250828',
    ),
  image_urls: z
    .union([z.string().url(), z.array(z.string().url()).max(15)])
    .optional()
    .describe("参考图片 URL（单张或多张，用于图文生图/多图融合）"),
  size: z
    .string()
    .optional()
    .describe("图片尺寸：1K, 2K（默认）, 3K, 4K"),
  output_format: z
    .enum(["png", "jpeg"])
    .optional()
    .describe("输出格式：png（默认）, jpeg"),
  watermark: z.boolean().optional().describe("是否添加水印，默认 false"),
  sequential_image_generation: z
    .string()
    .optional()
    .describe('组图模式："disabled"（默认单图）, "auto"（组图）'),
  max_images: z
    .number()
    .int()
    .min(2)
    .max(15)
    .optional()
    .describe("组图模式下的最大图片数量"),
  api_key: z
    .string()
    .optional()
    .describe("Ark API Key，默认从环境变量 ARK_API_KEY 读取"),
  confirm: z
    .string()
    .optional()
    .describe("确认标记，设为 RUN 跳过确认"),
});
