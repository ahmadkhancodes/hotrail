const PROBE_TIMEOUT_MS = 2000;

/** One cheap indexed read, bounded by a timeout, so an unreachable database turns the probe red instead of hanging. */
export async function probeDb(read: () => Promise<unknown>, timeoutMs = PROBE_TIMEOUT_MS): Promise<{ ok: boolean; ms: number; error?: string }> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      read(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); }),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: (e as Error).message === "timeout" ? "timeout" : "unreachable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
