/**
 * 火山引擎 Ark API 常量
 */

export const ARK_BASE_URL = "https://ark.cn-beijing.volces.com";
export const ARK_API_PREFIX = "/api/v3";
export const ARK_ENDPOINT_CREATE_TASK = "/contents/generations/tasks";
export const ARK_ENDPOINT_GET_TASK = "/contents/generations/tasks";

export const ARK_DEFAULT_MODEL = "doubao-seedance-2-0-mini-260615";

export const ARK_SUPPORTED_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;

export const ARK_DEFAULT_RATIO = "9:16";
export const ARK_DEFAULT_DURATION = 5;
export const ARK_MIN_DURATION = 4;
export const ARK_MAX_DURATION = 15;

export const ARK_CONTENT_TYPES = [
  "text",
  "image_url",
  "video_url",
  "audio_url",
] as const;

export const ARK_ROLES = [
  "reference_image",
  "reference_video",
  "reference_audio",
] as const;

/** 任务状态 */
export const ARK_TASK_STATUS = {
  RUNNING: "running",
  SUCCEED: "succeed",
  FAILED: "failed",
} as const;

/** 轮询配置 */
export const ARK_POLLING = {
  MAX_POLL_COUNT: 180,
  POLL_INTERVAL_MS: 5000,
  TIMEOUT_SECONDS: 900,
} as const;
