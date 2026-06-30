import path from "node:path";
import os from "node:os";

import fs from "fs-extra";

import { parseRegionCode, type RegionCode } from "@/api/services/core.ts";

export const SUPPORTED_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "21:9",
] as const;

export type SupportedRatio = (typeof SUPPORTED_RATIOS)[number];

export interface CliUserConfig {
  region?: RegionCode;
  ratio?: SupportedRatio;
  updatedAt?: number;
}

export function parseRatio(value: string | undefined): SupportedRatio | null {
  if (!value) return null;
  return SUPPORTED_RATIOS.includes(value as SupportedRatio)
    ? (value as SupportedRatio)
    : null;
}

export function getCliConfigFilePath(): string {
  return path.resolve(
    process.env.JIMENG_CONFIG_FILE ||
      path.join(os.homedir(), ".jimeng", "config.json"),
  );
}

export function readCliConfig(): CliUserConfig {
  const filePath = getCliConfigFilePath();
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readJsonSync(filePath) as Record<string, unknown>;
    const region =
      typeof raw.region === "string" ? parseRegionCode(raw.region) : undefined;
    const ratio =
      typeof raw.ratio === "string" ? parseRatio(raw.ratio) : undefined;
    return {
      ...(region ? { region } : {}),
      ...(ratio ? { ratio } : {}),
      ...(typeof raw.updatedAt === "number" ? { updatedAt: raw.updatedAt } : {}),
    };
  } catch {
    return {};
  }
}

export function writeCliConfig(config: CliUserConfig): CliUserConfig {
  const normalized: CliUserConfig = {
    ...config,
    updatedAt: Date.now(),
  };
  const filePath = getCliConfigFilePath();
  fs.ensureDirSync(path.dirname(filePath));
  fs.writeJsonSync(filePath, normalized, { spaces: 2 });
  return normalized;
}

export function getDefaultRegion(): RegionCode {
  return readCliConfig().region || "cn";
}

export function setDefaultRegion(region: RegionCode): CliUserConfig {
  return writeCliConfig({ ...readCliConfig(), region });
}

export function getDefaultRatio(): SupportedRatio {
  return readCliConfig().ratio || "1:1";
}

export function setDefaultRatio(ratio: SupportedRatio): CliUserConfig {
  return writeCliConfig({ ...readCliConfig(), ratio });
}
