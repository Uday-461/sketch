import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { LiteLLMManager } from "./manager";

function createMockProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as ChildProcess["stdout"];
  proc.stderr = new EventEmitter() as ChildProcess["stderr"];
  proc.kill = vi.fn().mockReturnValue(true);
  Object.defineProperty(proc, "killed", { value: false, writable: true });
  Object.defineProperty(proc, "pid", { value: 12345, writable: true });
  return proc;
}

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as never;

describe("LiteLLMManager", () => {
  let manager: LiteLLMManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new LiteLLMManager({ dataDir: "/tmp/test-data", port: 4000, logger });
  });

  afterEach(async () => {
    // Ensure manager is stopped to prevent lingering timers
    if (manager.isRunning()) {
      const proc = (manager as unknown as { process: ChildProcess }).process;
      if (proc) {
        const stopPromise = manager.stop();
        proc.emit("exit", 0, null);
        await stopPromise;
      }
    }
  });

  it("is not running initially", () => {
    expect(manager.isRunning()).toBe(false);
    expect(manager.getMasterKey()).toBeNull();
  });

  it("returns the configured port", () => {
    expect(manager.getPort()).toBe(4000);
  });

  it("throws descriptive error when litellm is not installed", async () => {
    const mockSpawn = vi.mocked(spawn);
    const versionProc = new EventEmitter() as ChildProcess;
    mockSpawn.mockReturnValueOnce(versionProc);

    const startPromise = manager.start({ apiKey: "sk-test", model: "openrouter/claude-sonnet" });
    const err = Object.assign(new Error("spawn litellm ENOENT"), { code: "ENOENT" });
    versionProc.emit("error", err);

    await expect(startPromise).rejects.toThrow("litellm is not installed");
  });

  it("generates multi-tier config yaml for openrouter model", async () => {
    const mockSpawn = vi.mocked(spawn);
    const mockWriteFile = vi.mocked(writeFile);

    const versionProc = new EventEmitter() as ChildProcess;
    mockSpawn.mockReturnValueOnce(versionProc);

    const mainProc = createMockProcess();
    mockSpawn.mockReturnValueOnce(mainProc);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const startPromise = manager.start({ apiKey: "sk-test-key", model: "openrouter/anthropic/claude-sonnet-4.6" });
    versionProc.emit("exit", 0, null);
    await startPromise;

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const yamlContent = mockWriteFile.mock.calls[0]?.[1] as string;

    // Should have 4 model entries: haiku, sonnet, opus, catch-all
    expect(yamlContent).toContain('model_name: "claude-haiku-*"');
    expect(yamlContent).toContain('model_name: "claude-sonnet-*"');
    expect(yamlContent).toContain('model_name: "claude-opus-*"');
    expect(yamlContent).toContain('model_name: "claude-*"');

    // Correct downstream models with openai/ prefix and api_base
    expect(yamlContent).toContain('model: "openai/anthropic/claude-haiku-4-5"');
    expect(yamlContent).toContain('model: "openai/anthropic/claude-sonnet-4.6"');
    expect(yamlContent).toContain('model: "openai/anthropic/claude-opus-4.6"');
    expect(yamlContent).toContain('api_base: "https://openrouter.ai/api/v1"');
    expect(yamlContent).toContain('api_key: "sk-test-key"');
    expect(yamlContent).toContain("master_key:");

    vi.restoreAllMocks();

    const stopPromise = manager.stop();
    mainProc.emit("exit", 0, null);
    await stopPromise;
  });

  it("passes through model as-is when prefix is not in provider map", async () => {
    const mockSpawn = vi.mocked(spawn);
    const mockWriteFile = vi.mocked(writeFile);

    const versionProc = new EventEmitter() as ChildProcess;
    mockSpawn.mockReturnValueOnce(versionProc);

    const mainProc = createMockProcess();
    mockSpawn.mockReturnValueOnce(mainProc);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const startPromise = manager.start({ apiKey: "sk-test-key", model: "anthropic/claude-sonnet-4.6" });
    versionProc.emit("exit", 0, null);
    await startPromise;

    const yamlContent = mockWriteFile.mock.calls[0]?.[1] as string;
    expect(yamlContent).toContain('model: "anthropic/claude-sonnet-4.6"');
    expect(yamlContent).not.toContain("api_base:");

    vi.restoreAllMocks();

    const stopPromise = manager.stop();
    mainProc.emit("exit", 0, null);
    await stopPromise;
  });

  it("generates single entry for bare model name without slash", async () => {
    const mockSpawn = vi.mocked(spawn);
    const mockWriteFile = vi.mocked(writeFile);

    const versionProc = new EventEmitter() as ChildProcess;
    mockSpawn.mockReturnValueOnce(versionProc);

    const mainProc = createMockProcess();
    mockSpawn.mockReturnValueOnce(mainProc);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const startPromise = manager.start({ apiKey: "sk-test-key", model: "claude-sonnet-4-6" });
    versionProc.emit("exit", 0, null);
    await startPromise;

    const yamlContent = mockWriteFile.mock.calls[0]?.[1] as string;
    expect(yamlContent).toContain('model_name: "claude-*"');
    expect(yamlContent).toContain('model: "claude-sonnet-4-6"');
    expect(yamlContent).not.toContain('model_name: "claude-haiku-*"');
    expect(yamlContent).not.toContain('model_name: "claude-sonnet-*"');
    expect(yamlContent).not.toContain('model_name: "claude-opus-*"');

    vi.restoreAllMocks();

    const stopPromise = manager.stop();
    mainProc.emit("exit", 0, null);
    await stopPromise;
  });

  it("querySpendLogs returns null when not running", async () => {
    const result = await manager.querySpendLogs("2026-03-17", "2026-03-17");
    expect(result).toBeNull();
  });

  it("querySpendLogs fetches and sums costs", async () => {
    const mockSpawn = vi.mocked(spawn);

    // Start the manager so it has a process and master key
    const versionProc = new EventEmitter() as ChildProcess;
    mockSpawn.mockReturnValueOnce(versionProc);
    const mainProc = createMockProcess();
    mockSpawn.mockReturnValueOnce(mainProc);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const startPromise = manager.start({ apiKey: "sk-test", model: "openrouter/anthropic/claude-sonnet-4.6" });
    versionProc.emit("exit", 0, null);
    await startPromise;

    vi.restoreAllMocks();

    // Mock the spend/logs response
    const spendLogs = [{ spend: 0.05 }, { spend: 0.03 }];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(spendLogs), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const result = await manager.querySpendLogs("2026-03-17", "2026-03-17");
    expect(result).not.toBeNull();
    expect(result?.totalCost).toBeCloseTo(0.08);
    expect(result?.logs).toHaveLength(2);

    // Verify correct URL and auth header
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/spend/logs?start_date=2026-03-17&end_date=2026-03-17"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringContaining("Bearer ") }),
      }),
    );

    vi.restoreAllMocks();

    const stopPromise = manager.stop();
    mainProc.emit("exit", 0, null);
    await stopPromise;
  });

  it("stop is a no-op when not running", async () => {
    await manager.stop();
    expect(manager.isRunning()).toBe(false);
  });
});
