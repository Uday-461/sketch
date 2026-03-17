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

  private async writeConfigYaml(config: LiteLLMConfig): Promise<string> {
    const dir = join(this.dataDir, "litellm");
    await mkdir(dir, { recursive: true });

    const resolved = this.resolveModel(config.model);

    const lines = [
      "model_list:",
      '  - model_name: "claude-*"',
      "    litellm_params:",
      `      model: "${resolved.model}"`,
      `      api_key: "${config.apiKey}"`,
      ...resolved.extraParams,
      "",
      "general_settings:",
      `  master_key: "${this.masterKey}"`,
      "  allow_requests_on_db_unavailable: true",
      "",
    ];
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
