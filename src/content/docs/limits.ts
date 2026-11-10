import { product as p, plans } from "@/config/product";
import type { DocPage } from "./types";

const mau = plans.map((x) => `${x.name} ${x.limits.mau.toLocaleString("en-US")}`).join(", ");
const days = plans.map((x) => `${x.name} ${x.limits.event_days}`).join(", ");

export const limits: DocPage = {
  slug: "limits",
  title: "Limits and usage",
  description: `What happens at your plan limits in ${p.name}: MAU, overage, storage, event retention and payment grace.`,
  sections: [
    {
      heading: "Monthly active users",
      body: [
        `MAU is the billing meter. It counts distinct devices that checked for an update in the month. Included MAU: ${mau}.`,
        "Usage emails go to the org owner at 50, 70, 90 and 100 percent, once per month for each threshold.",
      ],
    },
    {
      heading: "At 100 percent",
      body: [
        "New downloads pause. Apps that are already installed keep their current version and keep working. Upgrade your plan, or on a paid plan turn on overage, and downloads resume.",
      ],
    },
    {
      heading: "Overage",
      body: [
        "Paid plans can turn on overage and set a monthly cap. Extra MAU cost $0.0015 each. Overage is measured and reported in the console. It is not automatically billed yet.",
      ],
    },
    {
      heading: "Upload size",
      body: [
        "Uploads go through the API and are limited to 4.5 MB per file (per request) for now. Larger bodies are refused with HTTP 413 and the error request_too_large, and the CLI prints the same limit. A bigger limit arrives with object storage (R2).",
        "Nothing is truncated: an upload that is too large fails before anything is stored.",
      ],
    },
    {
      heading: "Storage and event history",
      body: [
        `Storage is fair use. Uploads are refused above the storage limit of your plan. Events are kept for a number of days by plan: ${days}.`,
        "Build minutes are part of the v1 plan and are not available yet.",
      ],
    },
    {
      heading: "Failed payments",
      body: [
        `If a card is declined you keep your plan for a ${p.graceDays} day grace period and updates keep serving. After the grace period the account falls back to the Free limits.`,
      ],
    },
  ],
};
