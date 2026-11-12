/** Production host the CLI talks to when HOTRAIL_API_URL is not set (matches packages/cli DEFAULT_URL). */
export const CLI_DEFAULT_URL = "https://hotrail.buffersoltech.com";
export const KEY_PLACEHOLDER = "<create a key below>";

/**
 * The first-run commands shown on an empty Line view, personalised with the user's real key and host.
 * Every line is a real CLI command; `tests/unit/docs-samples.test.ts` runs them against the in-process API.
 */
export function setupSnippet(opts: { apiKey?: string | null; baseUrl: string }): string {
  const base = opts.baseUrl.replace(/\/$/, "");
  const lines = [`export HOTRAIL_API_KEY=${opts.apiKey || KEY_PLACEHOLDER}`];
  if (base !== CLI_DEFAULT_URL) lines.push(`export HOTRAIL_API_URL=${base}`);
  lines.push(
    "npx @buffersol/hotrail init",
    "npx @buffersol/hotrail upload",
    "npx @buffersol/hotrail release --channel production",
  );
  return lines.join("\n");
}

/** Key name for the one-click setup key; unique per day so a second click is easy to tell apart. */
export const setupKeyName = (now = new Date()) => `CLI setup ${now.toISOString().slice(0, 10)}`;
