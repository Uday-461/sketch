/**
 * Linear connector.
 *
 * Uses Linear's GraphQL API via direct HTTP calls.
 * Auth: API key (personal or workspace) or OAuth.
 *
 * Sync strategy:
 * - Full: paginate all issues, projects, and comments
 * - Incremental: filter by updatedAt >= lastSyncTimestamp
 * - Issues stored with title, description, metadata (status, assignee, labels, etc.)
 * - Projects stored as documents with description content
 *
 * Linear's API uses cursor-based pagination (first/after) and supports
 * efficient filtering via `updatedAt: { gte: timestamp }`.
 */
import { createHash } from "node:crypto";
import type { Logger } from "pino";
import type { Connector, ConnectorCredentials, OAuthCredentials, SyncedItem } from "./types";

const LINEAR_API = "https://api.linear.app/graphql";
const TOKEN_ENDPOINT = "https://api.linear.app/oauth/token";

/** Max items per GraphQL page. */
const PAGE_SIZE = 50;

/** Rate limit: ~1,500 req/hour, we stay conservative at ~20 req/s. */
const MIN_REQUEST_INTERVAL_MS = 50;

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url: string;
  state: { name: string; type: string } | null;
  priority: number;
  priorityLabel: string;
  assignee: { name: string; displayName: string } | null;
  labels: { nodes: Array<{ name: string }> };
  team: { name: string; key: string } | null;
  project: { name: string } | null;
  estimate: number | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  comments: { nodes: Array<{ body: string; user: { name: string } | null; createdAt: string }> };
}

interface LinearProject {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  state: string;
  lead: { name: string; displayName: string } | null;
  startDate: string | null;
  targetDate: string | null;
  teams: { nodes: Array<{ name: string; key: string }> };
  createdAt: string;
  updatedAt: string;
}

interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

let lastRequestTime = 0;

function getAccessToken(credentials: ConnectorCredentials): string {
  if (credentials.type === "api_key") return credentials.api_key;
  if (credentials.type === "oauth") return credentials.access_token;
  throw new Error("Linear connector requires api_key or oauth credentials");
}

async function linearRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
  logger: Logger,
): Promise<T> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();

  const response = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const waitMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 10_000;
    logger.debug({ waitMs }, "Rate limited, waiting");
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return linearRequest(query, variables, token, logger);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Linear API failed (${response.status}): ${body}`);
  }

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors && result.errors.length > 0) {
    throw new Error(`Linear GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
  }

  return result.data;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

function issueToSyncedItem(issue: LinearIssue): SyncedItem {
  const hasDescription = issue.description && issue.description.trim().length > 0;

  const metadata = [
    issue.state ? `Status: ${issue.state.name}` : null,
    `Priority: ${issue.priorityLabel || PRIORITY_LABELS[issue.priority] || "None"}`,
    issue.assignee ? `Assignee: ${issue.assignee.displayName}` : null,
    issue.labels.nodes.length > 0 ? `Labels: ${issue.labels.nodes.map((l) => l.name).join(", ")}` : null,
    issue.team ? `Team: ${issue.team.name}` : null,
    issue.project ? `Project: ${issue.project.name}` : null,
    issue.estimate != null ? `Estimate: ${issue.estimate}` : null,
    issue.dueDate ? `Due: ${issue.dueDate}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const parts = [`${issue.identifier}: ${issue.title}`, metadata];

  if (hasDescription) {
    parts.push(issue.description as string);
  }

  if (issue.comments.nodes.length > 0) {
    const commentText = issue.comments.nodes.map((c) => `[${c.user?.name ?? "Unknown"}] ${c.body}`).join("\n\n");
    parts.push(`--- Comments ---\n${commentText}`);
  }

  const content = parts.join("\n\n");
  const sourcePath = [issue.team?.name, issue.project?.name].filter(Boolean).join(" / ");

  return {
    providerFileId: issue.id,
    providerUrl: issue.url,
    fileName: `${issue.identifier}: ${issue.title}`,
    fileType: "issue",
    contentCategory: hasDescription ? "document" : "structured",
    content,
    sourcePath: sourcePath || null,
    contentHash: contentHash(content),
    sourceCreatedAt: issue.createdAt,
    sourceUpdatedAt: issue.updatedAt,
    accessibleBy: null, // TODO: populate from team membership + privacy
  };
}

function projectToSyncedItem(project: LinearProject): SyncedItem {
  const hasDescription = project.description && project.description.trim().length > 0;

  const metadata = [
    `State: ${project.state}`,
    project.lead ? `Lead: ${project.lead.displayName}` : null,
    project.teams.nodes.length > 0 ? `Teams: ${project.teams.nodes.map((t) => t.name).join(", ")}` : null,
    project.startDate ? `Start: ${project.startDate}` : null,
    project.targetDate ? `Target: ${project.targetDate}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const content = hasDescription
    ? `${project.name}\n\n${metadata}\n\n${project.description}`
    : `${project.name}\n\n${metadata}`;

  return {
    providerFileId: `project-${project.id}`,
    providerUrl: project.url,
    fileName: project.name,
    fileType: "project",
    contentCategory: hasDescription ? "document" : "structured",
    content,
    sourcePath: null,
    contentHash: contentHash(content),
    sourceCreatedAt: project.createdAt,
    sourceUpdatedAt: project.updatedAt,
    accessibleBy: null, // TODO: populate from team membership + privacy
  };
}

async function refreshLinearToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refresh_token,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Linear token refresh failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  return {
    ...credentials,
    access_token: data.access_token,
    token_type: data.token_type,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

const ISSUES_QUERY = `
query Issues($first: Int!, $after: String, $filter: IssueFilter) {
	issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt) {
		pageInfo {
			hasNextPage
			endCursor
		}
		nodes {
			id
			identifier
			title
			description
			url
			state { name type }
			priority
			priorityLabel
			assignee { name displayName }
			labels { nodes { name } }
			team { name key }
			project { name }
			estimate
			dueDate
			createdAt
			updatedAt
			comments {
				nodes {
					body
					user { name }
					createdAt
				}
			}
		}
	}
}`;

const PROJECTS_QUERY = `
query Projects($first: Int!, $after: String, $filter: ProjectFilter) {
	projects(first: $first, after: $after, filter: $filter) {
		pageInfo {
			hasNextPage
			endCursor
		}
		nodes {
			id
			name
			description
			url
			state
			lead { name displayName }
			startDate
			targetDate
			teams { nodes { name key } }
			createdAt
			updatedAt
		}
	}
}`;

export function createLinearConnector(): Connector {
  return {
    type: "linear",

    async validateCredentials(credentials) {
      const token = getAccessToken(credentials);
      const query = "query { viewer { id name } }";
      await linearRequest(query, {}, token, { debug: () => {}, warn: () => {} } as unknown as Logger);
    },

    async *sync({ credentials, scopeConfig, cursor, logger }) {
      const token = getAccessToken(credentials);
      const allowedTeams = (scopeConfig.teams as string[] | undefined) ?? [];
      const sinceDate = cursor ?? null;

      yield* syncIssues(token, sinceDate, allowedTeams, logger);
      yield* syncProjects(token, sinceDate, logger);
    },

    async getCursor({ currentCursor }) {
      return new Date().toISOString();
    },

    async refreshTokens(credentials) {
      return refreshLinearToken(credentials);
    },
  };
}

async function* syncIssues(
  token: string,
  since: string | null,
  allowedTeams: string[],
  logger: Logger,
): AsyncGenerator<SyncedItem> {
  let afterCursor: string | null = null;
  let totalIssues = 0;

  const filter: Record<string, unknown> = {};
  if (since) {
    filter.updatedAt = { gte: since };
  }
  if (allowedTeams.length > 0) {
    filter.team = { key: { in: allowedTeams } };
  }

  do {
    const variables: Record<string, unknown> = {
      first: PAGE_SIZE,
      after: afterCursor,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    };

    const data = await linearRequest<{
      issues: { pageInfo: PageInfo; nodes: LinearIssue[] };
    }>(ISSUES_QUERY, variables, token, logger);

    for (const issue of data.issues.nodes) {
      yield issueToSyncedItem(issue);
      totalIssues++;
    }

    afterCursor = data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null;
    logger.debug({ issuesProcessed: totalIssues, hasMore: !!afterCursor }, "Issues page complete");
  } while (afterCursor);

  logger.info({ totalIssues }, "Issues sync complete");
}

async function* syncProjects(token: string, since: string | null, logger: Logger): AsyncGenerator<SyncedItem> {
  let afterCursor: string | null = null;
  let totalProjects = 0;

  const filter: Record<string, unknown> = {};
  if (since) {
    filter.updatedAt = { gte: since };
  }

  do {
    const variables: Record<string, unknown> = {
      first: PAGE_SIZE,
      after: afterCursor,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    };

    const data = await linearRequest<{
      projects: { pageInfo: PageInfo; nodes: LinearProject[] };
    }>(PROJECTS_QUERY, variables, token, logger);

    for (const project of data.projects.nodes) {
      yield projectToSyncedItem(project);
      totalProjects++;
    }

    afterCursor = data.projects.pageInfo.hasNextPage ? data.projects.pageInfo.endCursor : null;
    logger.debug({ projectsProcessed: totalProjects, hasMore: !!afterCursor }, "Projects page complete");
  } while (afterCursor);

  logger.info({ totalProjects }, "Projects sync complete");
}
