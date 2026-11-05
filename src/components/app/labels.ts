import type { MeterId } from "@/config/product";

/** Product-facing names for each meter. A new product edits this map. */
export const METER_LABELS: Record<MeterId, { singular: string; plural: string; period: string }> = {
  mau: { singular: "monthly active user", plural: "monthly active users", period: "this month" },
  storage_gib: { singular: "GiB of storage", plural: "GiB of storage", period: "" },
  event_days: { singular: "day of event history", plural: "days of event history", period: "" },
  build_min: { singular: "build minute", plural: "build minutes", period: "this month" },
};

export const METERS_SHOWN: MeterId[] = ["mau"];
export const fmt = (n: number) => new Intl.NumberFormat("en").format(n);
