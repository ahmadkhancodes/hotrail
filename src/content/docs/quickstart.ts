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
        `The update API, the upload pipeline and the CLI work today, and every command on this page is run by our test suite against the app. The Swift and Kotlin code of @buffersol/hotrail-updater has not been compiled or tested on devices yet, so start with @capgo/capacitor-updater and the three URLs below.`,
      ],
    },
    {
      heading: "Change three URLs",
      body: [
        "If your app already runs @capgo/capacitor-updater in self-hosted mode, the plugin talks to three endpoints. Point them at your Hotrail app and keep the plugin as it is for now.",
        "Swap the plugin for @buffersol/hotrail-updater (MIT) at your next store build, once its native code is verified. Until then the stock plugin keeps working, because the update API answers the documented self-hosted protocol.",
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
        "Create a key in the dashboard (an empty Line view has a one-click button that fills it into these commands), then run init in your project folder. It finds your appId in the Capacitor config, creates your signing key, prints the exact URLs or plugin setup to paste, and offers migration mode if it sees @capgo/capacitor-updater in package.json.",
      ],
      code: { lang: "bash", code: "export HOTRAIL_API_KEY=hr_xxx\nnpx @buffersol/hotrail init" },
    },
    {
      heading: "Upload, release, roll back",
      body: [
        "Upload hashes your build folder, sends only files the server does not already have, signs the manifest and rejects native files. It uses the version in package.json. Release points a channel at a bundle; without --bundle or --version it releases the package.json version, so the two commands need no ids. Rollback reverses the channel to its previous bundle.",
      ],
      code: {
        lang: "bash",
        code: `npx @buffersol/hotrail upload --dir dist
npx @buffersol/hotrail release --channel production --percent 10 --autopause 0.02
npx @buffersol/hotrail status
npx @buffersol/hotrail rollback --channel production`,
      },
    },
    {
      heading: "CI recipe: GitHub Actions",
      body: [
        "A job that builds your web app, then uploads and releases it with an API key from your repository secrets. Create an Upload only key if the job should not release; this recipe releases, so it needs an All key. Upload and release both use the version in package.json.",
      ],
      code: {
        lang: "yaml",
        code: `# .github/workflows/hotrail.yml
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
      - run: npx @buffersol/hotrail release --channel beta`,
      },
    },
    {
      heading: "CI recipe: GitLab CI",
      body: ["Same steps in GitLab CI. Store the key as a masked CI/CD variable named HOTRAIL_API_KEY."],
      code: {
        lang: "yaml",
        code: `# .gitlab-ci.yml
hotrail:
  image: node:22
  script:
    - npm ci && npm run build
    - npx @buffersol/hotrail upload --dir dist
    - npx @buffersol/hotrail release --channel beta`,
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
