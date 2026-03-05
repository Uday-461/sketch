/**
 * Quick smoke test for the ClickUp connector.
 * Run: npx tsx packages/server/src/connectors/test-clickup.ts
 *
 * Set CLICKUP_API_KEY env var or pass as first argument.
 */
import pino from "pino";
import { createClickUpConnector } from "./clickup";

const apiKey = process.argv[2] || process.env.CLICKUP_API_KEY;

if (!apiKey) {
  console.error("Usage: npx tsx packages/server/src/connectors/test-clickup.ts <API_KEY>");
  console.error("  or set CLICKUP_API_KEY env var");
  process.exit(1);
}

const logger = pino({ level: "debug", transport: { target: "pino-pretty" } });
const connector = createClickUpConnector();

async function main() {
  logger.info("Validating credentials...");
  await connector.validateCredentials({ type: "api_key", api_key: apiKey as string });
  logger.info("Credentials valid ✓");

  logger.info("Starting sync...");
  let count = 0;
  for await (const item of connector.sync({
    credentials: { type: "api_key", api_key: apiKey as string },
    scopeConfig: {},
    cursor: null,
    logger,
  })) {
    count++;
    console.log(`[${count}] ${item.fileType}: ${item.fileName}`);
    console.log(`     path: ${item.sourcePath}`);
    console.log(`     category: ${item.contentCategory}`);
    console.log(`     url: ${item.providerUrl}`);
    if (item.content && item.content.length > 200) {
      console.log(`     content: ${item.content.slice(0, 200)}...`);
    } else if (item.content) {
      console.log(`     content: ${item.content}`);
    }
    console.log();
  }

  logger.info({ total: count }, "Sync complete");
}

main().catch((err) => {
  logger.error({ err }, "Test failed");
  process.exit(1);
});
