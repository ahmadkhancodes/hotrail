# @buffersol/hotrail-updater

MIT licensed Capacitor plugin for Hotrail live updates: signed bundles, delta downloads, automatic crash revert.
Clean room implementation on Capacitor core APIs only.

> **Status: native code is unverified.** The Swift and Kotlin sources were written without Xcode or an Android SDK.
> The TypeScript logic is covered by unit tests; the native layer is compiled and unit tested for the first time by
> `.github/workflows/plugin-ci.yml`. Treat `0.1.0` as pre release until that workflow is green and you have run a
> real device test (crash revert especially).

## Install

```sh
npm i @buffersol/hotrail-updater
npx cap sync
```

## Use

```ts
import { HotrailUpdater } from "@buffersol/hotrail-updater";

await HotrailUpdater.configure({
  appId: "com.acme.app",
  updateUrl: "https://hotrail.buffersoltech.com/api/updates",
  statsUrl: "https://hotrail.buffersoltech.com/api/stats",
  channelUrl: "https://hotrail.buffersoltech.com/api/channel",
  publicKey: "<Ed25519 public key, base64>",   // optional but recommended
  strategy: "background",                       // "background" | "immediate" | "prompt"
  appReadyTimeoutMs: 10000,
  maxRetries: 3,
});

// As soon as your UI is healthy (every launch):
await HotrailUpdater.notifyAppReady();
// Then look for an update:
await HotrailUpdater.sync();
```

`configure()` must run first and as early as possible: it handles crash revert and applies a pending update.
`check()`, `sync()`, `notifyAppReady()` never throw into your app; any error means "no update".

### Config

| Field | Default | Meaning |
| --- | --- | --- |
| `appId` | required | Your app id, sent as `app_id`. |
| `updateUrl` | required | Update check endpoint (POST). |
| `statsUrl` | required | Beacon endpoint (POST). |
| `channelUrl` | none | Channel self assignment endpoint. |
| `publicKey` | none | Ed25519 raw public key, base64. When set, only signed manifest bundles are installed. |
| `strategy` | `background` | See below. |
| `appReadyTimeoutMs` | `10000` | Window to call `notifyAppReady()` after a new bundle starts. |
| `maxRetries` | `3` | Download retries after the first attempt, backoff `retryBaseDelayMs * 2^n` (default 500 ms). |

### Strategies

- `background`: download now, apply when the app goes to background or at the next launch.
- `immediate`: apply (reload) right after the download is verified.
- `prompt`: emits `updateAvailable` (after check) and `updateReady` (after download). Nothing is applied until you call `apply()`.

Events: `stateChanged`, `updateAvailable`, `updateReady`, `downloadFailed`, `applied`, `confirmed`, `reverted`, `killed`
via `HotrailUpdater.addListener(event, fn)`. States: `idle, checking, downloading, verifying, ready, applied, confirmed, reverted`.

Other API: `check()`, `download(update)`, `apply()`, `reload()`, `getCurrent()`, `list()`, `delete(version)`, `reset()`, `getState()`.

## Protocol

The check is a POST with `platform, app_id, device_id, version_name, version_build, version_os, plugin_version, custom_id, is_prod, is_emulator`.
The response is `{ version, url, checksum, session_key? }` or `{ message }`. Hotrail adds optional fields for delta
installs: `manifest_url` (a signed manifest JSON `{ manifest, signature, keyId }`) and `files_url` (blob base, default
`<origin of manifest_url>/f/`, files are fetched as `<files_url>/<sha256>`). `session_key` (encrypted bundles) is not supported yet.

## Signing

With `publicKey` set, the update must offer a `manifest_url`. The manifest signature is verified with the public key
(Ed25519 over the canonical manifest, via `@buffersol/hotrail-core`). The plugin then reuses unchanged files from the
current (or built-in) bundle, downloads only changed files, verifies every file's SHA-256, and refuses the whole bundle on
any mismatch. A bad signature, wrong key, tampered manifest, or hash mismatch sends a `*_fail` beacon and marks that version
as failed so it is not downloaded again. Without `publicKey`, zip bundles are verified by the `checksum` field only.

## Crash revert

A new bundle runs as a trial. Call `notifyAppReady()` to confirm it. The trial is reverted to the last good bundle (or
the built-in one) when:

- `appReadyTimeoutMs` elapses after launch without confirmation (JS timer), or
- the app is relaunched with the trial still unconfirmed (JS state), or
- the native crash guard sees a second process start with the trial unconfirmed. This runs before any JS, so a bundle that
  breaks the web view before the plugin loads is still reverted.

On revert a `rollback` beacon is sent and the version is remembered as failed.

## Kill switch

If the update response contains `kill_switch: true`, the plugin reverts to the built-in bundle (clearing any pending
bundle), sends a `revert` beacon, emits `killed`, reloads, and downloads nothing.

## Beacons

`POST statsUrl` with `{ action, app_id, device_id, version_name, version_build, platform }`. Actions: `download_complete`,
`set` (applied), `rollback`, `revert` (kill switch), and failures `download_fail`, `checksum_fail`, `signature_fail`,
`manifest_fail`, `unzip_fail`. Beacons are fire and forget and never throw.

## Migrating from Capgo

The check/stats wire format is the same public protocol, so only the URLs change: point `updateUrl`, `statsUrl` and
`channelUrl` at Hotrail. Keep your app's `notifyAppReady()` call. Signing keys are Hotrail Ed25519 keys; zip bundles
without `publicKey` keep working with checksum verification.

## Encrypted bundles (`session_key`)

If an update response carries `session_key`, the zip is encrypted with AES-CBC and the key is wrapped for your app:
`session_key = <iv base64>:<RSA-OAEP SHA-256 wrapped AES key base64>`. Set `privateKey` (RSA, PKCS#8, PEM or base64) in the
plugin config. The TypeScript layer unwraps the key (WebCrypto), asks the native bridge to decrypt the downloaded zip in
place (`decryptFile`), checks `checksum` against the **decrypted** zip, extracts it, and with a `publicKey` also checks every
extracted file against the signed manifest. Delta is not used for encrypted bundles. Without `privateKey`, or when the native
bridge has no `decryptFile`, the update is refused and a `decrypt_fail` beacon is sent. The server and CLI do not produce
encrypted bundles yet.

## What remains native only

- `decryptFile` (AES-CBC/PKCS7, in place) in Swift and Kotlin: not written yet, so encrypted bundles cannot install on a device.
- Everything under "Native layer" below is written but **not compiled or run**: the CI workflow has not run green yet.
- Real device behaviour of `setServerBasePath` and the crash guard.

## Native layer

Everything file related (download, unzip with zip-slip protection, SHA-256, atomic moves, persistent trial state,
`setServerBasePath`) lives behind the `NativeBridge` interface (`src/types.ts`), implemented in
`ios/Sources/HotrailUpdaterPlugin` (Swift) and `android/src/main/java/com/buffersol/hotrail` (Kotlin).

License: MIT.
