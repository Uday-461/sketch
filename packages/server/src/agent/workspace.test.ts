import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestConfig } from "../test-utils";
import { ensureGroupWorkspace } from "./workspace";

describe("ensureGroupWorkspace", () => {
	const testDataDir = join(tmpdir(), `sketch-test-${Date.now()}`);
	const config = createTestConfig({ DATA_DIR: testDataDir });

	afterEach(async () => {
		await rm(testDataDir, { recursive: true, force: true });
	});

	it("creates workspace at wa-group-{groupId} path", async () => {
		const dir = await ensureGroupWorkspace(config, "120363123456789@g.us");
		expect(dir).toBe(join(testDataDir, "workspaces", "wa-group-120363123456789"));
		expect(existsSync(dir)).toBe(true);
	});

	it("strips @g.us suffix from JID", async () => {
		const dir = await ensureGroupWorkspace(config, "999@g.us");
		expect(dir).toContain("wa-group-999");
		expect(dir).not.toContain("@g.us");
	});

	it("is idempotent — calling twice returns the same path", async () => {
		const dir1 = await ensureGroupWorkspace(config, "123@g.us");
		const dir2 = await ensureGroupWorkspace(config, "123@g.us");
		expect(dir1).toBe(dir2);
		expect(existsSync(dir1)).toBe(true);
	});
});
