/**
 * 火山引擎 Ark API 常量
 * 文档: https://www.volcengine.com/docs/82379/2291680
 * API 参考: https://www.volcengine.com/docs/82379/1520757
 */

// ============================== 基础端点 ==============================

export const ARK_BASE_URL = "https://ark.cn-beijing.volces.com";
export const ARK_API_PREFIX = "/api/v3";
export const ARK_ENDPOINT_CREATE_TASK = "/contents/generations/tasks";
export const ARK_ENDPOINT_GET_TASK = "/contents/generations/tasks";
export const ARK_ENDPOINT_IMAGE_GENERATIONS = "/images/generations";

// ============================== 模型 ID ==============================

export const ARK_MODEL_IDS = {
  // Seedance 视频生成
  SEEDANCE_2_0: "doubao-seedance-2-0-260128",
  SEEDANCE_2_0_FAST: "doubao-seedance-2-0-fast-260128",
  SEEDANCE_2_0_MINI: "doubao-seedance-2-0-mini-260615",
  // Seedream 图片生成
  SEEDREAM_5_0_PRO: "doubao-seedream-5-0-pro-260628",
  SEEDREAM_5_0_LITE: "doubao-seedream-5-0-260128",
  SEEDREAM_4_5: "doubao-seedream-4-5-251128",
  SEEDREAM_4_0: "doubao-seedream-4-0-250828",
} as const;

export const ARK_DEFAULT_MODEL = ARK_MODEL_IDS.SEEDANCE_2_0_MINI;
export const ARK_DEFAULT_IMAGE_MODEL = ARK_MODEL_IDS.SEEDREAM_5_0_LITE;

// ============================== 分辨率 ==============================
// Seedance 2.0: 480p, 720p, 1080p, 4k
// Seedance 2.0 Fast/Mini: 480p, 720p

export const ARK_RESOLUTIONS = ["480p", "720p", "1080p", "4k"] as const;
export const ARK_DEFAULT_RESOLUTION = "720p";

// ============================== 宽高比 ==============================

export const ARK_RATIOS = [
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "adaptive",
] as const;

export const ARK_DEFAULT_RATIO = "16:9";

// ============================== 时长 ==============================

export const ARK_DEFAULT_DURATION = 5;
export const ARK_MIN_DURATION = 4;
export const ARK_MAX_DURATION = 15;

// ============================== 内容类型 & 角色 ==============================

export const ARK_CONTENT_TYPES = [
  "text",
  "image_url",
  "video_url",
  "audio_url",
] as const;

/** content 中 image_url 支持的 role 值 */
export const ARK_IMAGE_ROLES = [
  "first_frame", // 首帧
  "last_frame", // 尾帧
  "reference_image", // 图片参考
] as const;

/** content 中 video_url 支持的 role 值 */
export const ARK_VIDEO_ROLES = [
  "reference_video", // 视频参考
] as const;

/** content 中 audio_url 支持的 role 值 */
export const ARK_AUDIO_ROLES = [
  "reference_audio", // 音频参考
] as const;

// ============================== 任务状态 ==============================

export const ARK_TASK_STATUS = {
  RUNNING: "running",
  SUCCEED: "succeeded",
  FAILED: "failed",
} as const;

// ============================== 轮询设置 ==============================

export const ARK_POLLING = {
  MAX_POLL_COUNT: 360,
  POLL_INTERVAL_MS: 5000,
  TIMEOUT_SECONDS: 1800,
} as const;

// ============================== 限制 ==============================

export const ARK_LIMITS = {
  MAX_IMAGES: 9,
  MAX_VIDEOS: 3,
  MAX_AUDIOS: 3,
  MAX_EXTEND_VIDEOS: 3,
} as const;

// ============================== 图片生成 (Seedream) ==============================

/** Seedream 支持的图片尺寸 */
export const ARK_IMAGE_SIZES = ["1K", "2K", "3K", "4K"] as const;
export const ARK_DEFAULT_IMAGE_SIZE = "2K";

/** Seedream 支持的输出格式 */
export const ARK_IMAGE_OUTPUT_FORMATS = ["png", "jpeg"] as const;
export const ARK_DEFAULT_IMAGE_FORMAT = "png";

/** Seedream 连续图片生成模式 */
export const ARK_SEQUENTIAL_MODES = ["disabled", "auto"] as const;

// ============================== 视频生成限制 ==============================

export const ARK_VIDEO_MIN_IMAGES = 0;
export const ARK_VIDEO_MAX_IMAGES = 9;
export const ARK_VIDEO_MIN_VIDEOS = 0;
export const ARK_VIDEO_MAX_VIDEOS = 3;
export const ARK_VIDEO_MIN_AUDIOS = 0;
export const ARK_VIDEO_MAX_AUDIOS = 3;
