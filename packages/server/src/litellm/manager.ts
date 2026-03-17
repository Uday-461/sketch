import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../logger";

interface LiteLLMConfig {
  apiKey: string;
  model: string;
}

interface ProviderMapping {
  /** LiteLLM model prefix to use (replaces the original prefix) */
  litellmPrefix: string;
  /** api_base URL for the downstream provider */
  apiBase: string;
}

/**
 * Maps provider prefixes from the DB model string to LiteLLM config params.
 *
 * LiteLLM's /v1/messages passthrough doesn't strip provider-specific prefixes
 * (openrouter/, together/, etc.) before forwarding. Using "openai/" + api_base
 * forces LiteLLM to treat it as a generic OpenAI-compatible endpoint, which
 * correctly strips the prefix on both /v1/chat/completions and /v1/messages.
 */
const PROVIDER_MAP: Record<string, ProviderMapping> = {
  openrouter: {
    litellmPrefix: "openai",
    apiBase: "https://openrouter.ai/api/v1",
  },
  // Future providers — add here when needed:
  // together: { litellmPrefix: "openai", apiBase: "https://api.together.xyz/v1" },
  // groq: { litellmPrefix: "openai", apiBase: "https://api.groq.com/openai/v1" },
  // deepseek: { litellmPrefix: "openai", apiBase: "https://api.deepseek.com/v1" },
};

/**
 * Maps provider prefixes to per-tier downstream model IDs.
 * When a preset exists, writeConfigYaml() generates 4 entries (haiku/sonnet/opus/catch-all)
 * instead of a single catch-all, enabling the SDK's multi-model cost optimization.
 */
interface ProviderPreset {
  haiku: string;
  sonnet: string;
  opus: string;
}

const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openrouter: {
    haiku: "anthropic/claude-haiku-4-5",
    sonnet: "anthropic/claude-sonnet-4.6",
    opus: "anthropic/claude-opus-4.6",
  },
};

interface LiteLLMManagerOptions {
  dataDir: string;
  port: number;
  logger: Logger;
}

export class LiteLLMManager {
  private process: ChildProcess | null = null;
  private masterKey: string | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;
  private currentConfig: LiteLLMConfig | null = null;

  private readonly dataDir: string;
  private readonly port: number;
  private readonly logger: Logger;

  constructor(options: LiteLLMManagerOptions) {
    this.dataDir = options.dataDir;
    this.port = options.port;
    this.logger = options.logger;
  }

  async start(config: LiteLLMConfig): Promise<void> {
    if (this.process) {
      this.logger.warn("LiteLLM is already running; call stop() first or use restart()");
      return;
    }

    this.stopping = false;
    this.currentConfig = config;

    await this.checkInstalled();

    this.masterKey = `sk-litellm-${randomUUID()}`;
    const configPath = await this.writeConfigYaml(config);

    this.process = spawn("litellm", ["--config", configPath, "--port", String(this.port)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, LITELLM_MASTER_KEY: this.masterKey },
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.logger.debug({ component: "litellm" }, data.toString().trimEnd());
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      this.logger.debug({ component: "litellm" }, data.toString().trimEnd());
    });

    this.process.on("exit", (code, signal) => {
      this.process = null;
      if (this.stopping) return;

      this.logger.warn({ code, signal }, "LiteLLM process exited unexpectedly; restarting in 5s");
      this.restartTimer = setTimeout(() => {
        if (this.currentConfig && !this.stopping) {
          this.start(this.currentConfig).catch((err) => {
            this.logger.error({ err }, "Failed to restart LiteLLM");
          });
        }
      }, 5000);
    });

    await this.waitForHealth();
    this.logger.info({ port: this.port }, "LiteLLM proxy started");
  }

  async stop(): Promise<void> {
    this.stopping = true;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (!this.process) return;

    const child = this.process;
    this.process = null;

    const exited = new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
    });

    child.kill("SIGTERM");

    const forceKill = setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 5000);

    await exited;
    clearTimeout(forceKill);

    this.masterKey = null;
    this.currentConfig = null;
    this.logger.info("LiteLLM proxy stopped");
  }

  async restart(config: LiteLLMConfig): Promise<void> {
    await this.stop();
    await this.start(config);
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  configChanged(config: LiteLLMConfig): boolean {
    if (!this.currentConfig) return true;
    return this.currentConfig.apiKey !== config.apiKey || this.currentConfig.model !== config.model;
  }

  getMasterKey(): string | null {
    return this.masterKey;
  }

  getPort(): number {
    return this.port;
  }

  async querySpendLogs(startTime: string, endTime: string): Promise<{ totalCost: number; logs: unknown[] } | null> {
    if (!this.masterKey || !this.process) return null;
    try {
      const res = await fetch(`http://localhost:${this.port}/spend/logs?start_date=${startTime}&end_date=${endTime}`, {
        headers: { Authorization: `Bearer ${this.masterKey}` },
      });
      if (!res.ok) return null;
      const logs = (await res.json()) as unknown[];
      const totalCost = Array.isArray(logs)
        ? logs.reduce((sum: number, l) => sum + ((l as Record<string, number>).spend ?? 0), 0)
        : 0;
      return { totalCost, logs };
    } catch {
      return null;
    }
  }

  private async checkInstalled(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const check = spawn("litellm", ["--version"], { stdio: "ignore" });
      check.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          reject(new Error("litellm is not installed. Install it with: pip install 'litellm[proxy]'"));
        } else {
          reject(err);
        }
      });
      check.on("exit", () => resolve());
    });
  }

  private resolveModel(model: string): { model: string; extraParams: string[] } {
    const slashIndex = model.indexOf("/");
    if (slashIndex === -1) {
      return { model, extraParams: [] };
    }

    const prefix = model.slice(0, slashIndex);
    const mapping = PROVIDER_MAP[prefix];
    if (!mapping) {
      return { model, extraParams: [] };
    }

    const downstream = model.slice(slashIndex + 1);
    return {
      model: `${mapping.litellmPrefix}/${downstream}`,
      extraParams: [`      api_base: "${mapping.apiBase}"`],
    };
  }

  private deriveModelTiers(model: string): ProviderPreset | null {
    const slashIndex = model.indexOf("/");
    if (slashIndex === -1) return null;
    return PROVIDER_PRESETS[model.slice(0, slashIndex)] ?? null;
  }

  private buildModelEntry(modelName: string, fullModel: string, apiKey: string): string[] {
    const resolved = this.resolveModel(fullModel);
    return [
      `  - model_name: "${modelName}"`,
      "    litellm_params:",
      `      model: "${resolved.model}"`,
      `      api_key: "${apiKey}"`,
      ...resolved.extraParams,
    ];
  }

  private async writeConfigYaml(config: LiteLLMConfig): Promise<string> {
    const dir = join(this.dataDir, "litellm");
    await mkdir(dir, { recursive: true });

    const tiers = this.deriveModelTiers(config.model);
    const prefix = config.model.indexOf("/") !== -1 ? config.model.slice(0, config.model.indexOf("/")) : null;

    const lines = ["model_list:"];

    if (tiers && prefix) {
      lines.push(...this.buildModelEntry("claude-haiku-*", `${prefix}/${tiers.haiku}`, config.apiKey));
      lines.push(...this.buildModelEntry("claude-sonnet-*", `${prefix}/${tiers.sonnet}`, config.apiKey));
      lines.push(...this.buildModelEntry("claude-opus-*", `${prefix}/${tiers.opus}`, config.apiKey));
      lines.push(...this.buildModelEntry("claude-*", `${prefix}/${tiers.sonnet}`, config.apiKey));
    } else {
      lines.push(...this.buildModelEntry("claude-*", config.model, config.apiKey));
    }

    lines.push(
      "",
      "general_settings:",
      `  master_key: "${this.masterKey}"`,
      "  allow_requests_on_db_unavailable: true",
      "",
    );
    const yaml = lines.join("\n");

    const configPath = join(dir, "config.yaml");
    await writeFile(configPath, yaml, "utf-8");
    return configPath;
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + 30_000;
    const url = `http://localhost:${this.port}/health`;
    const headers: Record<string, string> = {};
    if (this.masterKey) {
      headers.Authorization = `Bearer ${this.masterKey}`;
    }

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, { headers });
        if (res.ok) return;
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    throw new Error(`LiteLLM failed to become healthy within 30s on port ${this.port}`);
  }
}
