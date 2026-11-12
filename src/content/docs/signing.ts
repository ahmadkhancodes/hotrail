import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const signing: DocPage = {
  slug: "signing",
  title: "Signing and encryption",
  description: `How ${p.name} signs bundle manifests, how devices verify them, and what encrypted bundles need.`,
  sections: [
    {
      heading: "Signing is on by default",
      body: [
        "The init command creates an Ed25519 key pair in .hotrail/signing-key.json and adds that folder to .gitignore. Keep the private key out of source control. init then prints a HotrailUpdater.configure block with your appId and the public key as publicKey, ready to paste into your app.",
        "On the first signed upload the public key is registered for the app. Every later upload is verified against it.",
      ],
    },
    {
      heading: "What is signed",
      body: [
        "Upload hashes every file with SHA-256, builds a manifest of paths and hashes, and signs the manifest. Only files the server does not already have are sent. The plugin verifies the signature, then verifies the hash of every file it downloads.",
        "upload --unsigned skips signing. It only works for an app that has never had a signed upload, such as a throwaway test app id. Once an app has a signing key, unsigned uploads are refused with unsigned_not_allowed.",
      ],
      code: {
        lang: "bash",
        code: "npx @buffersol/hotrail upload",
      },
    },
    {
      heading: "Device checks",
      body: [
        "With publicKey set in the plugin, only bundles that offer a signed manifest are installed. A bad signature, a wrong key, a changed manifest or a hash mismatch rejects the whole bundle, sends a failure beacon and marks that version as failed so it is not downloaded again. Unsigned bundles are rejected by devices that check signatures.",
      ],
    },
    {
      heading: "Encrypted bundles",
      body: [
        "The update response can carry a session_key, which is AES-CBC key material. The plugin TypeScript layer reads it. Decryption of the zip or files happens in native code, and that native code has not been compiled or tested on devices yet. Do not rely on encrypted bundles in production until the plugin CI is green and you have tested on a device.",
      ],
    },
  ],
};
