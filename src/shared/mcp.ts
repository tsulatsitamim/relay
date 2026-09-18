export type McpEnvVar = { name: string; value: string };

export type McpHeader = { name: string; value: string };

export type McpServerConfig =
  | {
      kind: "stdio";
      name: string;
      command: string;
      args: string[];
      env: McpEnvVar[];
    }
  | {
      kind: "http" | "sse";
      name: string;
      url: string;
      headers: McpHeader[];
    };

export type AcpMcpServer =
  | { name: string; command: string; args: string[]; env: McpEnvVar[] }
  | { name: string; url: string; headers: McpHeader[]; type: "http" | "sse" };

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const values: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const value = entry.trim();
    if (value) values.push(value);
  }
  return values;
}

function pairs(raw: unknown): { name: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  const values: { name: string; value: string }[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name = trimmed(record.name);
    if (!name || typeof record.value !== "string") continue;
    values.push({ name, value: record.value.trim() });
  }
  return values;
}

export function mcpServersFrom(raw: unknown): McpServerConfig[] {
  if (!Array.isArray(raw)) return [];
  const servers: McpServerConfig[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name = trimmed(record.name);
    if (!name) continue;
    if (record.kind === "stdio") {
      const command = trimmed(record.command);
      if (!command) continue;
      servers.push({
        kind: "stdio",
        name,
        command,
        args: stringList(record.args),
        env: pairs(record.env),
      });
    } else if (record.kind === "http" || record.kind === "sse") {
      const url = trimmed(record.url);
      if (!url) continue;
      servers.push({
        kind: record.kind,
        name,
        url,
        headers: pairs(record.headers),
      });
    }
  }
  return servers;
}

export function mcpServersToAcp(configs: McpServerConfig[]): AcpMcpServer[] {
  return configs.map((config) =>
    config.kind === "stdio"
      ? {
          name: config.name,
          command: config.command,
          args: config.args,
          env: config.env,
        }
      : {
          name: config.name,
          url: config.url,
          headers: config.headers,
          type: config.kind,
        },
  );
}
