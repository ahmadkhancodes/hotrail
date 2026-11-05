# Changelog

## 0.1.0

- First release: TypeScript updater core, Capacitor facade, web fallback.
- Strategies `background`, `immediate`, `prompt`.
- Signed manifest verification (Ed25519), delta assembly from unchanged files, zip fallback with SHA-256 check.
- Crash revert with a native crash guard and an `appReadyTimeoutMs` timer; failed versions are never re-downloaded.
- Kill switch (`kill_switch: true` in the update response).
- Beacons to `statsUrl`.
- Swift (iOS) and Kotlin (Android) sources. Written but not compiled in the authoring environment; first compile happens in `plugin-ci`.
