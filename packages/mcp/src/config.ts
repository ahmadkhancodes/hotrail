export const DEFAULT_API_URL = "https://hotrail.buffersoltech.com";

export interface McpConfig { apiKey: string; apiUrl: string }

export function configFromEnv(env: Record<string, string | undefined>): McpConfig {
  const apiKey = env.HOTRAIL_API_KEY?.trim();
  if (!apiKey) throw new Error("HOTRAIL_API_KEY is not set. Create an API key in the Hotrail dashboard and pass it in the MCP server env.");
  const apiUrl = (env.HOTRAIL_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, "");
  try { new URL(apiUrl); } catch { throw new Error("HOTRAIL_API_URL is not a valid URL."); }
  return { apiKey, apiUrl };
}
