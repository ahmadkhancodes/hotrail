import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const quickstart: DocPage = {
  slug: "quickstart",
  title: "Quickstart: migrate from @capgo/capacitor-updater",
  description: `Move a Capacitor app from @capgo/capacitor-updater to ${p.fullName} by changing three URLs, then use the CLI and CI recipes.`,
  sections: [
    {
      heading: "Status",
      body: [
        `${p.fullName} is pre-launch. The update API and upload pipeline are being built (milestone M2), so the URLs and commands below are the planned contract. Anything marked coming is not shipped yet.`,
      ],
    },
    {
      heading: "Change three URLs",
      body: [
        "If your app already runs @capgo/capacitor-updater in self-hosted mode, the plugin talks to three endpoints. Point them at your Hotrail app and keep the plugin as it is for now.",
        "Swap the plugin for @buffersol/hotrail-updater (MIT, coming) at your next store build. Until then the stock plugin keeps working, because the update API answers the documented self-hosted protocol.",
      ],
      code: {
        lang: "ts",
        code: `// capacitor.config.ts
plugins: {
  CapacitorUpdater: {
    updateUrl: "${p.url}/api/v1/updates/check",
    statsUrl: "${p.url}/api/v1/updates/stats",
    channelUrl: "${p.url}/api/v1/updates/channel",
  },
}`,
      },
    },
    {
      heading: "Initialize the project",
      body: [
        "Run init in your project folder. It finds your appId in the Capacitor config, creates your signing key and offers migration mode if it sees @capgo/capacitor-updater in package.json.",
      ],
      code: { lang: "bash", code: "npx @buffersol/hotrail init" },
    },
    {
      heading: "Upload, release, roll back",
      body: [
        "Upload hashes your build folder, sends only files the server does not already have, signs the manifest and rejects native files. Release points a channel at a bundle. Rollback reverses the channel to its previous bundle.",
      ],
      code: {
        lang: "bash",
        code: `npx @buffersol/hotrail upload --dir dist
npx @buffersol/hotrail release --channel production --bundle 2K47 --percent 10 --autopause 0.02
npx @buffersol/hotrail status
npx @buffersol/hotrail rollback --channel production`,
      },
    },
    {
      heading: "CI recipe: GitHub Actions (coming)",
      body: [
        "A published recipe is coming with the update API. The shape will be a job that builds your web app, then runs upload and release with an API key from your repository secrets.",
      ],
      code: {
        lang: "yaml",
        code: `# .github/workflows/hotrail.yml (set APP_VERSION to your release version)
name: hotrail
on: { push: { branches: [main] } }
jobs:
  release:
    runs-on: ubuntu-latest
    env:
      HOTRAIL_API_KEY: \${{ secrets.HOTRAIL_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: npx @buffersol/hotrail upload --dir dist
      - run: npx @buffersol/hotrail release --channel beta --version "$APP_VERSION"`,
      },
    },
    {
      heading: "CI recipe: GitLab CI (coming)",
      body: ["Same steps in GitLab CI. Store the key as a masked CI/CD variable named HOTRAIL_API_KEY."],
      code: {
        lang: "yaml",
        code: `# .gitlab-ci.yml (set APP_VERSION as a CI variable)
hotrail:
  image: node:22
  script:
    - npm ci && npm run build
    - npx @buffersol/hotrail upload --dir dist
    - npx @buffersol/hotrail release --channel beta --version "$APP_VERSION"`,
      },
    },
    {
      heading: "Coming from Ionic Appflow",
      body: [
        "Ionic Appflow access ends 31 Dec 2027 (Ionic announcement, checked 3 Nov 2026). An import guide is coming. The web layer moves the same way as above: new channel, upload, release.",
      ],
    },
  ],
};
