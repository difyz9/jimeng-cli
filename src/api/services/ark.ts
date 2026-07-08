import axios from "axios";

import {
  ARK_BASE_URL,
  ARK_API_PREFIX,
  ARK_ENDPOINT_CREATE_TASK,
  ARK_ENDPOINT_GET_TASK,
  ARK_ENDPOINT_IMAGE_GENERATIONS,
  ARK_DEFAULT_MODEL,
  ARK_DEFAULT_IMAGE_MODEL,
  ARK_DEFAULT_IMAGE_SIZE,
  ARK_DEFAULT_IMAGE_FORMAT,
  ARK_RATIOS,
  ARK_DEFAULT_RATIO,
  ARK_DEFAULT_DURATION,
  ARK_DEFAULT_RESOLUTION,
  ARK_POLLING,
  ARK_TASK_STATUS,
  ARK_LIMITS,
} from "@/api/constants/ark.ts";
import APIException from "@/core/errors/api-exception.ts";
import EX from "@/api/constants/error-codes.ts";
import logger from "@/core/utils/logger.ts";

// ============================== Types ==============================

/** content 内容项 */
export interface ArkContentItem {
  type: "text" | "image_url" | "video_url" | "audio_url";
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  audio_url?: { url: string };
  role?:
    | "first_frame"
    | "last_frame"
    | "reference_image"
    | "reference_video"
    | "reference_audio";
}

/** 创建任务请求参数 */
export interface ArkCreateTaskParams {
  model?: string;
  prompt: string;
  imageUrls?: string[];
  videoUrls?: string[];
  audioUrls?: string[];
  /** image_url 的 role: 不传=文本生视频参考图; "first_frame"/"last_frame"=图生视频首尾帧; "reference_image"=多模态参考 */
  imageRoles?: string[];
  /** video_url 的 role: "reference_video" */
  videoRoles?: string[];
  /** audio_url 的 role: "reference_audio" */
  audioRoles?: string[];
  generateAudio?: boolean;
  ratio?: string;
  duration?: number;
  resolution?: string;
  watermark?: boolean;
  returnLastFrame?: boolean;
  seed?: number;
  cameraFixed?: boolean;
  callbackUrl?: string;
  /** "standard"(默认) | "flex"(离线推理) */
  serviceTier?: string;
}

/** Ark API 原始响应 (create & get) */
export interface ArkApiResponse {
  id: string;
  status?: string;
  model?: string;
  content?: {
    video_url?: string;
    image_url?: string;
    audio_url?: string;
    /** 当 return_last_frame=true 时返回 */
    last_frame_url?: string;
  };
  error?: {
    code: string;
    message: string;
  };
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
  };
  created_at?: number;
  updated_at?: number;
  seed?: number;
  resolution?: string;
  ratio?: string;
  duration?: number;
  framespersecond?: number;
  service_tier?: string;
  execution_expires_after?: number;
}

/** 生成结果（成功时） */
export interface ArkGenerationResult {
  taskId: string;
  videoUrl: string;
  lastFrameUrl?: string;
  /** 任务耗时（秒） */
  elapsed?: number;
}

export type ArkMode = "generate" | "edit" | "extend";

// ============================== Helpers ==============================

function buildArkUrl(path: string): string {
  return `${ARK_BASE_URL}${ARK_API_PREFIX}${path}`;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * 构建 content 数组
 * 支持三种场景：
 *   1. 多模态参考 (reference_*)
 *   2. 图生视频-首帧/首尾帧 (first_frame / last_frame)
 *   3. 视频编辑 (reference_video + reference_image)
 *   4. 视频延长 (多个 reference_video)
 */
function buildContent(
  prompt: string,
  imageUrls: string[],
  videoUrls: string[],
  audioUrls: string[],
  imageRoles: string[],
  videoRoles: string[],
  audioRoles: string[],
): ArkContentItem[] {
  const content: ArkContentItem[] = [];

  // 1. 文本 prompt
  if (prompt) {
    content.push({ type: "text", text: prompt });
  }

  // 2. 图片
  for (let i = 0; i < imageUrls.length; i++) {
    const role = imageRoles[i] || "reference_image";
    content.push({
      type: "image_url",
      image_url: { url: imageUrls[i] },
      role: role as ArkContentItem["role"],
    });
  }

  // 3. 视频
  for (let i = 0; i < videoUrls.length; i++) {
    const role = videoRoles[i] || "reference_video";
    content.push({
      type: "video_url",
      video_url: { url: videoUrls[i] },
      role: role as ArkContentItem["role"],
    });
  }

  // 4. 音频
  for (let i = 0; i < audioUrls.length; i++) {
    const role = audioRoles[i] || "reference_audio";
    content.push({
      type: "audio_url",
      audio_url: { url: audioUrls[i] },
      role: role as ArkContentItem["role"],
    });
  }

  return content;
}

function buildRequestBody(
  params: ArkCreateTaskParams,
  mode: ArkMode,
): Record<string, unknown> {
  const {
    model,
    prompt,
    imageUrls = [],
    videoUrls = [],
    audioUrls = [],
    imageRoles = [],
    videoRoles = [],
    audioRoles = [],
    generateAudio,
    ratio,
    duration,
    resolution,
    watermark,
    returnLastFrame,
    seed,
    cameraFixed,
    callbackUrl,
    serviceTier,
  } = params;

  const content = buildContent(
    prompt,
    imageUrls,
    videoUrls,
    audioUrls,
    imageRoles,
    videoRoles,
    audioRoles,
  );

  const body: Record<string, unknown> = {
    model: model || ARK_DEFAULT_MODEL,
    content,
  };

  if (generateAudio !== undefined) body.generate_audio = generateAudio;
  if (ratio) body.ratio = ratio;
  if (duration) body.duration = duration;
  if (resolution) body.resolution = resolution;
  if (watermark !== undefined) body.watermark = watermark;
  if (returnLastFrame !== undefined) body.return_last_frame = returnLastFrame;
  if (seed !== undefined) body.seed = seed;
  if (cameraFixed !== undefined) body.camera_fixed = cameraFixed;
  if (callbackUrl) body.callback_url = callbackUrl;
  if (serviceTier) body.service_tier = serviceTier;

  return body;
}

// ============================== Core API Calls ==============================

/**
 * 创建 Ark 生成任务
 * POST /api/v3/contents/generations/tasks
 */
export async function createArkTask(
  apiKey: string,
  params: ArkCreateTaskParams,
  mode: ArkMode = "generate",
): Promise<string> {
  validateParams(params, mode);

  const body = buildRequestBody(params, mode);
  const url = buildArkUrl(ARK_ENDPOINT_CREATE_TASK);
  const headers = buildHeaders(apiKey);

  const modeLabel = { generate: "生成", edit: "编辑", extend: "延长" }[mode];
  logger.info(
    `[Ark] 创建${modeLabel}任务: model=${body.model}, prompt="${params.prompt.slice(0, 60)}..."`,
  );

  const response = await axios.post<ArkApiResponse>(url, body, {
    headers,
    timeout: 60000,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    const err = response.data?.error;
    const detail = err ? `${err.code}: ${err.message}` : JSON.stringify(response.data);
    throw new APIException(
      EX.API_REQUEST_FAILED,
      `Ark 创建任务失败 (HTTP ${response.status}): ${detail}`,
    );
  }

  const taskId = response.data?.id;
  if (!taskId) {
    throw new APIException(
      EX.API_REQUEST_FAILED,
      `Ark 响应中缺少 task id: ${JSON.stringify(response.data)}`,
    );
  }

  logger.info(`[Ark] 任务创建成功: taskId=${taskId}`);
  return taskId;
}

/**
 * 查询 Ark 任务状态
 * GET /api/v3/contents/generations/tasks/{taskId}
 */
export async function getArkTask(
  apiKey: string,
  taskId: string,
): Promise<ArkApiResponse> {
  const url = buildArkUrl(`${ARK_ENDPOINT_GET_TASK}/${taskId}`);
  const headers = buildHeaders(apiKey);

  const response = await axios.get<ArkApiResponse>(url, {
    headers,
    timeout: 30000,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    const err = response.data?.error;
    const detail = err ? `${err.code}: ${err.message}` : `HTTP ${response.status}`;
    throw new APIException(EX.API_REQUEST_FAILED, `Ark 查询任务失败: ${detail}`);
  }

  return response.data;
}

/**
 * 轮询等待任务完成
 */
export async function pollArkTask(
  apiKey: string,
  taskId: string,
  options: {
    timeoutSeconds?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<ArkGenerationResult> {
  const timeoutMs =
    (options.timeoutSeconds || ARK_POLLING.TIMEOUT_SECONDS) * 1000;
  const pollInterval = options.pollIntervalMs || ARK_POLLING.POLL_INTERVAL_MS;
  const maxAttempts = Math.ceil(timeoutMs / pollInterval);
  const startTime = Date.now();

  logger.info(
    `[Ark] 轮询任务: taskId=${taskId}, timeout=${Math.round(timeoutMs / 1000)}s, interval=${pollInterval}ms`,
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (Date.now() - startTime > timeoutMs) {
      throw new APIException(
        EX.API_REQUEST_TIMEOUT,
        `Ark 任务超时 (已等待 ${Math.round((Date.now() - startTime) / 1000)}s)`,
      );
    }

    if (attempt > 1) {
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    try {
      const task = await getArkTask(apiKey, taskId);
      const { status } = task;

      logger.info(
        `[Ark] 轮询[${attempt}] taskId=${taskId}, status=${status}, elapsed=${Math.round((Date.now() - startTime) / 1000)}s`,
      );

      if (status === ARK_TASK_STATUS.SUCCEED) {
        // 响应格式: { content: { video_url: "https://..." } }
        const videoUrl = task.content?.video_url;

        if (!videoUrl) {
          throw new APIException(
            EX.API_REQUEST_FAILED,
            "Ark 任务成功但未找到视频 URL",
          );
        }

        return {
          taskId,
          videoUrl,
          lastFrameUrl: task.content?.last_frame_url,
          elapsed: Math.round((Date.now() - startTime) / 1000),
        };
      }

      if (status === ARK_TASK_STATUS.FAILED) {
        const errMsg = task.error?.message || "未知错误";
        throw new APIException(EX.API_REQUEST_FAILED, `Ark 任务失败: ${errMsg}`);
      }
      // running / queued — 继续轮询
    } catch (error: any) {
      if (error instanceof APIException) throw error;
      logger.warn(`[Ark] 轮询出错 [${attempt}]: ${error.message}`);
    }
  }

  throw new APIException(
    EX.API_REQUEST_TIMEOUT,
    `Ark 任务未在预期时间内完成 (已等待 ${Math.round((Date.now() - startTime) / 1000)}s)`,
  );
}

// ============================== 参数校验 ==============================

function validateParams(params: ArkCreateTaskParams, mode: ArkMode): void {
  const { imageUrls = [], videoUrls = [], audioUrls = [] } = params;

  if (imageUrls.length > ARK_LIMITS.MAX_IMAGES) {
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, `图片最多 ${ARK_LIMITS.MAX_IMAGES} 张`);
  }
  if (videoUrls.length > ARK_LIMITS.MAX_VIDEOS) {
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, `视频最多 ${ARK_LIMITS.MAX_VIDEOS} 个`);
  }
  if (audioUrls.length > ARK_LIMITS.MAX_AUDIOS) {
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, `音频最多 ${ARK_LIMITS.MAX_AUDIOS} 个`);
  }

  if (mode === "edit") {
    if (videoUrls.length < 1) {
      throw new APIException(EX.API_REQUEST_PARAMS_INVALID, "视频编辑模式至少需要 1 个参考视频");
    }
  }

  if (mode === "extend") {
    if (videoUrls.length < 1 || videoUrls.length > ARK_LIMITS.MAX_EXTEND_VIDEOS) {
      throw new APIException(
        EX.API_REQUEST_PARAMS_INVALID,
        `视频延长需要 1~${ARK_LIMITS.MAX_EXTEND_VIDEOS} 个参考视频`,
      );
    }
  }
}

// ============================== 一站式接口 ==============================

export type ArkVideoOptions = Omit<ArkCreateTaskParams, "model" | "prompt"> & {
  wait?: boolean;
  waitTimeoutSeconds?: number;
  pollIntervalMs?: number;
};

/**
 * 多模态参考 / 文生视频 / 图生视频
 */
export async function generateArkVideo(
  apiKey: string,
  params: ArkCreateTaskParams & ArkVideoOptions,
): Promise<string | { taskId: string }> {
  const taskId = await createArkTask(apiKey, params, "generate");

  if (params.wait === false) {
    logger.info(`[Ark] 任务已提交（异步），taskId=${taskId}`);
    return { taskId };
  }

  logger.info(`[Ark] 任务已提交，等待完成: taskId=${taskId}`);
  const result = await pollArkTask(apiKey, taskId, {
    timeoutSeconds: params.waitTimeoutSeconds,
    pollIntervalMs: params.pollIntervalMs,
  });
  return result.videoUrl;
}

/**
 * 视频编辑
 */
export async function editArkVideo(
  apiKey: string,
  params: ArkCreateTaskParams & ArkVideoOptions,
): Promise<string | { taskId: string }> {
  const taskId = await createArkTask(apiKey, params, "edit");

  if (params.wait === false) {
    return { taskId };
  }

  const result = await pollArkTask(apiKey, taskId, {
    timeoutSeconds: params.waitTimeoutSeconds,
    pollIntervalMs: params.pollIntervalMs,
  });
  return result.videoUrl;
}

/**
 * 视频延长
 */
export async function extendArkVideo(
  apiKey: string,
  params: ArkCreateTaskParams & ArkVideoOptions,
): Promise<string | { taskId: string }> {
  const taskId = await createArkTask(apiKey, params, "extend");

  if (params.wait === false) {
    return { taskId };
  }

  const result = await pollArkTask(apiKey, taskId, {
    timeoutSeconds: params.waitTimeoutSeconds,
    pollIntervalMs: params.pollIntervalMs,
  });
  return result.videoUrl;
}

// ============================== 图片生成 (Seedream — OpenAI 兼容) ==============================

export interface ArkImageResponse {
  data: Array<{
    url?: string;
    b64_json?: string;
    size?: string;
  }>;
  error?: {
    code: string;
    message: string;
  };
}

export interface ArkImageParams {
  prompt: string;
  model?: string;
  /** 单张图片 URL 或 URL 数组 */
  image?: string | string[];
  size?: string;
  output_format?: string;
  watermark?: boolean;
  /** "disabled"(默认) | "auto"(组图) */
  sequential_image_generation?: string;
  /** sequential_image_generation="auto" 时的选项 */
  max_images?: number;
  stream?: boolean;
  response_format?: "url" | "b64_json";
}

/**
 * 生成图片 (OpenAI 兼容接口)
 * POST /api/v3/images/generations
 *
 * 支持: 文生图 / 图文生图 / 多图融合 / 组图生成
 */
export async function generateArkImage(
  apiKey: string,
  params: ArkImageParams,
): Promise<string[]> {
  const model = params.model || ARK_DEFAULT_IMAGE_MODEL;
  const body: Record<string, unknown> = {
    model,
    prompt: params.prompt,
    size: params.size || ARK_DEFAULT_IMAGE_SIZE,
    output_format: params.output_format || ARK_DEFAULT_IMAGE_FORMAT,
    response_format: params.response_format || "url",
  };

  if (params.watermark !== undefined) body.watermark = params.watermark;
  if (params.stream !== undefined) body.stream = params.stream;
  if (params.sequential_image_generation) {
    body.sequential_image_generation = params.sequential_image_generation;
    if (params.max_images) {
      body.sequential_image_generation_options = { max_images: params.max_images };
    }
  }

  // image 参数：支持单 URL(string) 或 URL 数组(string[])
  if (params.image) {
    body.image = Array.isArray(params.image) ? params.image : params.image;
  }

  const url = buildArkUrl(ARK_ENDPOINT_IMAGE_GENERATIONS);
  const headers = buildHeaders(apiKey);

  logger.info(
    `[Ark] 生成图片: model=${model}, size=${body.size}, format=${body.output_format}`,
  );

  const response = await axios.post<ArkImageResponse>(url, body, {
    headers,
    timeout: 120000,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    const err = response.data?.error;
    const detail = err
      ? `${err.code}: ${err.message}`
      : JSON.stringify(response.data);
    throw new APIException(
      EX.API_REQUEST_FAILED,
      `Ark 图片生成失败 (HTTP ${response.status}): ${detail}`,
    );
  }

  const items = response.data?.data;
  if (!items || items.length === 0) {
    throw new APIException(
      EX.API_REQUEST_FAILED,
      `Ark 图片生成响应中无数据: ${JSON.stringify(response.data)}`,
    );
  }

  const urls: string[] = [];
  for (const item of items) {
    if (item.url) urls.push(item.url);
  }

  if (urls.length === 0) {
    throw new APIException(
      EX.API_REQUEST_FAILED,
      "Ark 图片生成响应中无图片 URL",
    );
  }

  logger.info(`[Ark] 图片生成成功: ${urls.length} 张`);
  return urls;
}
