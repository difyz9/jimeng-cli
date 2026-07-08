import axios, { AxiosRequestConfig } from "axios";

import {
  ARK_BASE_URL,
  ARK_API_PREFIX,
  ARK_ENDPOINT_CREATE_TASK,
  ARK_ENDPOINT_GET_TASK,
  ARK_DEFAULT_MODEL,
  ARK_DEFAULT_RATIO,
  ARK_DEFAULT_DURATION,
  ARK_POLLING,
  ARK_TASK_STATUS,
} from "@/api/constants/ark.ts";
import APIException from "@/core/errors/api-exception.ts";
import EX from "@/api/constants/error-codes.ts";
import logger from "@/core/utils/logger.ts";

// ============================== Types ==============================

export interface ArkContentText {
  type: "text";
  text: string;
}

export interface ArkContentImageUrl {
  type: "image_url";
  image_url: { url: string };
  role?: "reference_image";
}

export interface ArkContentVideoUrl {
  type: "video_url";
  video_url: { url: string };
  role?: "reference_video";
}

export interface ArkContentAudioUrl {
  type: "audio_url";
  audio_url: { url: string };
  role?: "reference_audio";
}

export type ArkContentItem =
  | ArkContentText
  | ArkContentImageUrl
  | ArkContentVideoUrl
  | ArkContentAudioUrl;

export interface ArkGenerationRequest {
  model: string;
  content: ArkContentItem[];
  generate_audio?: boolean;
  ratio?: string;
  duration?: number;
  watermark?: boolean;
}

export interface ArkTaskResponse {
  id: string;
  status: string;
  model: string;
  created_at?: number;
  completed_at?: number;
  output?: {
    content?: Array<{
      type: string;
      video_url?: { url: string };
      image_url?: { url: string };
      audio_url?: { url: string };
    }>;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface ArkGenerationResult {
  taskId: string;
  videoUrl: string;
}

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

function buildContentItems(
  prompt: string,
  imageUrls?: string[],
  videoUrls?: string[],
  audioUrls?: string[],
): ArkContentItem[] {
  const content: ArkContentItem[] = [];

  // 主文本 prompt
  content.push({ type: "text", text: prompt });

  // 参考图片
  if (imageUrls) {
    for (const url of imageUrls) {
      content.push({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      });
    }
  }

  // 参考视频
  if (videoUrls) {
    for (const url of videoUrls) {
      content.push({
        type: "video_url",
        video_url: { url },
        role: "reference_video",
      });
    }
  }

  // 参考音频
  if (audioUrls) {
    for (const url of audioUrls) {
      content.push({
        type: "audio_url",
        audio_url: { url },
        role: "reference_audio",
      });
    }
  }

  return content;
}

// ============================== API Calls ==============================

/**
 * 创建 Ark 生成任务
 * POST /api/v3/contents/generations/tasks
 */
export async function createArkGenerationTask(
  apiKey: string,
  params: {
    prompt: string;
    model?: string;
    imageUrls?: string[];
    videoUrls?: string[];
    audioUrls?: string[];
    generateAudio?: boolean;
    ratio?: string;
    duration?: number;
    watermark?: boolean;
  },
): Promise<string> {
  const model = params.model || ARK_DEFAULT_MODEL;
  const content = buildContentItems(
    params.prompt,
    params.imageUrls,
    params.videoUrls,
    params.audioUrls,
  );

  const requestBody: ArkGenerationRequest = {
    model,
    content,
    generate_audio: params.generateAudio ?? true,
    ratio: params.ratio || ARK_DEFAULT_RATIO,
    duration: params.duration || ARK_DEFAULT_DURATION,
    watermark: params.watermark ?? false,
  };

  const url = buildArkUrl(ARK_ENDPOINT_CREATE_TASK);
  const headers = buildHeaders(apiKey);

  logger.info(`[Ark] 创建生成任务: model=${model}, ratio=${requestBody.ratio}, duration=${requestBody.duration}s`);

  const response = await axios.post<ArkTaskResponse>(url, requestBody, {
    headers,
    timeout: 60000,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    logger.error(`[Ark] 创建任务失败: HTTP ${response.status}`);
    throw new APIException(
      EX.API_REQUEST_FAILED,
      `Ark 创建任务失败: HTTP ${response.status} ${JSON.stringify(response.data)}`,
    );
  }

  const taskId = response.data?.id;
  if (!taskId) {
    logger.error(`[Ark] 响应中缺少 task id: ${JSON.stringify(response.data)}`);
    throw new APIException(
      EX.API_REQUEST_FAILED,
      "Ark 响应中缺少 task id",
    );
  }

  logger.info(`[Ark] 任务创建成功: taskId=${taskId}, status=${response.data.status}`);
  return taskId;
}

/**
 * 查询 Ark 任务状态
 * GET /api/v3/contents/generations/tasks/{task_id}
 */
export async function getArkTask(
  apiKey: string,
  taskId: string,
): Promise<ArkTaskResponse> {
  const url = buildArkUrl(`${ARK_ENDPOINT_GET_TASK}/${taskId}`);
  const headers = buildHeaders(apiKey);

  const response = await axios.get<ArkTaskResponse>(url, {
    headers,
    timeout: 30000,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    logger.error(`[Ark] 查询任务失败: HTTP ${response.status}`);
    throw new APIException(
      EX.API_REQUEST_FAILED,
      `Ark 查询任务失败: HTTP ${response.status}`,
    );
  }

  return response.data;
}

/**
 * 轮询等待 Ark 任务完成
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

  logger.info(`[Ark] 开始轮询任务: taskId=${taskId}, timeout=${timeoutMs}ms, interval=${pollInterval}ms`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 检查是否超时
    if (Date.now() - startTime > timeoutMs) {
      throw new APIException(
        EX.API_REQUEST_TIMEOUT,
        `Ark 任务轮询超时 (已等待 ${Math.round((Date.now() - startTime) / 1000)}s)`,
      );
    }

    // 等待轮询间隔
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    try {
      const task = await getArkTask(apiKey, taskId);
      const status = task.status;

      logger.info(
        `[Ark] 轮询[${attempt}/${maxAttempts}] taskId=${taskId}, status=${status}, elapsed=${Math.round((Date.now() - startTime) / 1000)}s`,
      );

      if (status === ARK_TASK_STATUS.SUCCEED) {
        // 提取视频 URL
        const videoContent = task.output?.content?.find(
          (c) => c.type === "video_url" || c.type === "video",
        );
        const videoUrl =
          videoContent?.video_url?.url ||
          videoContent?.video_url?.url;

        if (!videoUrl) {
          throw new APIException(
            EX.API_REQUEST_FAILED,
            "Ark 任务成功但未找到视频 URL",
          );
        }

        logger.info(`[Ark] 任务完成: taskId=${taskId}, videoUrl=${videoUrl}`);
        return { taskId, videoUrl };
      }

      if (status === ARK_TASK_STATUS.FAILED) {
        const errMsg = task.error?.message || "未知错误";
        throw new APIException(
          EX.API_REQUEST_FAILED,
          `Ark 任务失败: ${errMsg}`,
        );
      }

      // running 或其他状态继续轮询
    } catch (error: any) {
      // APIException 直接抛出（任务失败/超时）
      if (error instanceof APIException) throw error;

      // 网络错误等记录日志并继续重试
      logger.warn(
        `[Ark] 轮询出错 (尝试 ${attempt}/${maxAttempts}): ${error.message}`,
      );
    }
  }

  throw new APIException(
    EX.API_REQUEST_TIMEOUT,
    `Ark 任务未在预期时间内完成 (最大尝试 ${maxAttempts} 次)`,
  );
}

/**
 * 一站式生成视频：创建任务并等待完成
 */
export async function generateArkVideo(
  apiKey: string,
  params: {
    prompt: string;
    model?: string;
    imageUrls?: string[];
    videoUrls?: string[];
    audioUrls?: string[];
    generateAudio?: boolean;
    ratio?: string;
    duration?: number;
    watermark?: boolean;
    wait?: boolean;
    waitTimeoutSeconds?: number;
    pollIntervalMs?: number;
  },
): Promise<string | { taskId: string }> {
  const taskId = await createArkGenerationTask(apiKey, params);

  if (params.wait === false) {
    logger.info(`[Ark] 任务已提交（异步模式），taskId: ${taskId}`);
    return { taskId };
  }

  logger.info(`[Ark] 任务已提交，等待完成: taskId=${taskId}`);
  const result = await pollArkTask(apiKey, taskId, {
    timeoutSeconds: params.waitTimeoutSeconds,
    pollIntervalMs: params.pollIntervalMs,
  });
  return result.videoUrl;
}
