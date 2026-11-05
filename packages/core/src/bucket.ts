import { sha256Hex } from "./hash";

/** Sticky bucket 0..99 = first 32 bits of SHA-256(deviceId + ":" + channelId) mod 100. */
export async function bucketOf(deviceId: string, channelId: string): Promise<number> {
  const hex = await sha256Hex(`${deviceId}:${channelId}`);
  return parseInt(hex.slice(0, 8), 16) % 100;
}

export async function inRollout(deviceId: string, channelId: string, percent: number): Promise<boolean> {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  return (await bucketOf(deviceId, channelId)) < percent;
}
