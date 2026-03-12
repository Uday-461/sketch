# Changelog

All notable changes to this project are documented here.

## [0.9.0] — 2026-03-12

- Skill-provider bridge: `getProviderConfig` tool lets skills fetch org-level API key and user email at runtime
- MCP/skill mode toggle on integration providers (skill-mode providers excluded from MCP injection)
- Featured skills auto-sync from `canvasxai/sketch-skills` repo on server startup
- Auto-publish GitHub Action in canvas-ai for CLI generation and sketch-skills PR creation
- Integration provider system: generic provider abstraction, Canvas as first provider, OAuth flow, MCP injection
- RBAC with magic link auth: admin/member roles, passwordless login for members via email
- User email verification with SMTP transport and tokenized links
- WhatsApp group and Slack email-based user resolution for cross-platform identity
- Theme management: light/dark/system mode with logo and favicon switching
- Server bootstrap refactor: extracted `createServer()` from index.ts for testability
- Slack and WhatsApp adapter modules extracted from index.ts
- 724 tests (654 server + 70 frontend)

## [0.8.0] — 2026-03-09

- Skills management UI: listing, detail view, permissions surfaces, explore/marketplace view
- User email field support in team management
- Sender attribution fix for shared contexts

## [0.7.1] — 2026-03-04

- Fix sender attribution in shared contexts (channels/groups) persisting across SDK session resumes
- Remove dead recentMessages and groupContext.senderName code

## [0.7.0] — 2026-03-02

- WhatsApp group support with mention-only activation
- Persistent typing indicator for message processing feedback
- WhatsApp LID-format JID handling for DM messages
- Team page for managing workspace members
- Self-hosting guide

## [0.6.1] — 2026-03-02

- Fix non-null assertions in team page
- Fix WhatsApp LID-format JID handling

## [0.6.0] — 2026-03-02

- Persistent typing indicator while agent is processing

## [0.5.0] — 2026-02-28

- Cross-session memory via CLAUDE.md — personal, channel, and org layers
- DB-backed admin onboarding wizard for self-hosted setup
- JWT-based persistent admin authentication
- Channels page with Slack connect dialog and WhatsApp QR pairing
- WhatsApp adapter via Baileys with DB-backed auth and pairing
- SSE-based WhatsApp QR pairing with cancel support
- Slack disconnect flow

## [0.4.0] — 2026-02-26

- Streaming assistant messages via onMessage callback
- Control plane steel thread — admin login, app shell, channels page

## [0.3.0] — 2026-02-24

- Per-thread sessions and passive thread message buffering
- Inline buffered file attachments with sender's message

## [0.2.0] — 2026-02-23

- File support — receive, native vision, and send back
- MCP tools support in canUseTool permissions
- Node.js 24 upgrade

## [0.1.0] — 2026-02-19

- Slack channel @mentions with threaded replies
- Vitest unit tests for all server modules
- Skills support in agent runner
- Thread context support and configurable history limits

## [0.0.1] — 2026-02-17

- Initial steel thread — Slack DM to agent to response
- Monorepo scaffold with pnpm, Biome, TypeScript
