import type { DocPage } from "./types";

export const cli: DocPage = {
  slug: "cli",
  title: "CLI",
  description: `Reference for the @buffersol/hotrail command line tool: init, upload, release, rollback, native register and status.`,
  sections: [
    {
      heading: "Setup",
      body: [
        "Run it with npx, nothing to install. Set HOTRAIL_API_KEY, which you create in Settings, API keys. HOTRAIL_API_URL is optional and defaults to the production host. Commands read hotrail.json in the current folder, which init creates.",
      ],
      code: { lang: "bash", code: `export HOTRAIL_API_KEY=hr_xxx\nnpx @buffersol/hotrail init` },
    },
    {
      heading: "init and upload",
      body: [
        "init detects your Capacitor appId and web directory, writes hotrail.json and creates a signing key. It stops with a message if there is no Capacitor config.",
        "upload hashes and signs a web build and sends only new files. Flags: --dir for the build folder, --version for a semver version (default is the version in package.json), and --unsigned to skip signing. Uploads that contain native files are refused, because Hotrail ships the web layer only. Upload does not release.",
      ],
      code: { lang: "bash", code: "npx @buffersol/hotrail upload --dir dist --version 2.14.1" },
    },
    {
      heading: "release and rollback",
      body: [
        "release points a channel at a bundle. Flags: --channel, --bundle (headcode) or --version, --percent (0 to 100, default 100) and --autopause (0 to 1).",
        "rollback --channel reverses a channel to its previous bundle.",
      ],
      code: {
        lang: "bash",
        code: `npx @buffersol/hotrail release --channel production --bundle 2K47 --percent 10 --autopause 0.02
npx @buffersol/hotrail rollback --channel production`,
      },
    },
    {
      heading: "native register and status",
      body: [
        "native register --build 41 records the native fingerprint of a store build. Add --platform ios or --platform android if needed. Run it after each store release.",
        "status lists channels with their bundle, percent and state.",
      ],
      code: { lang: "bash", code: "npx @buffersol/hotrail native register --build 41\nnpx @buffersol/hotrail status" },
    },
  ],
};
