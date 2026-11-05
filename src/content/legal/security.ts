import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const security: LegalDoc = {
  slug: "security",
  title: "Security",
  description: `How ${p.name} protects your account, your bundles and your device data.`,
  sections: [
    {
      id: "overview",
      title: "Overview",
      body: [`We design ${p.name} so that a mistake in one place does not expose everything. This page lists what we do today, and nothing we do not do.`],
    },
    {
      id: "data-protection",
      title: "Data protection",
      body: [
        {
          list: [
            "All traffic uses TLS.",
            "Data is encrypted at rest by our database and hosting providers.",
            "API keys and webhook secrets are shown once. API keys are stored as hashes.",
            "Every query is scoped to your organization.",
            "An audit log records sensitive actions on every plan.",
          ],
        },
      ],
    },
    {
      id: "access",
      title: "Access control",
      body: [
        {
          list: [
            "Sign in with magic link or passkey, with optional two factor authentication.",
            "Roles limit what each team member can change.",
            "Staff access to production data is limited, logged and used only for support you request or to fix incidents.",
          ],
        },
      ],
    },
    {
      id: "application",
      title: "Application security",
      body: [
        {
          list: [
            "Rate limiting on public endpoints and on the API.",
            "Abuse filtering on sign up and public forms.",
            "Bundle manifests are signed with Ed25519 keys that you hold, and the plugin rejects a tampered manifest (shipping with the update API).",
            "Native files are rejected at upload, so a live update changes only the web layer.",
            "There is no third party in the update delivery path.",
            "Outbound webhooks are signed so you can verify them.",
            "Dependencies are updated regularly and checked for known vulnerabilities.",
          ],
        },
      ],
    },
    {
      id: "certifications",
      title: "Certifications",
      body: ["We do not have SOC 2 or ISO 27001 yet. We publish this page, the data processing addendum and the sub-processor list, and we plan an external penetration test before the Team plan launches."],
    },
    {
      id: "infrastructure",
      title: "Infrastructure",
      body: ["We run on the providers listed on the subprocessors page. We rely on their physical and network security controls."],
    },
    {
      id: "incidents",
      title: "Incident response",
      body: ["If a breach affects your data we will tell you without undue delay and share what happened, what data was involved and what we are doing about it."],
    },
    {
      id: "reporting",
      title: "Report a vulnerability",
      body: [`Email ${p.legalEmail} with the details and steps to reproduce. Please give us reasonable time to fix the issue before you disclose it. We will not take legal action against honest research.`],
    },
  ],
};
