# Third party dependencies and licences

Only the packages below were added for M3. App dependencies are listed in `package.json`.

## packages/plugin (`@buffersol/hotrail-updater`, MIT)

| Dependency | Use | Licence |
| --- | --- | --- |
| `@capacitor/core` 6.x | peer + dev dependency (plugin registration, `WebPlugin`) | MIT |
| `@buffersol/hotrail-core` | workspace package (manifest, Ed25519 verify, delta plan) | MIT |
| `vitest`, `typescript`, `@types/node` | dev only | MIT, Apache-2.0, MIT |
| Capacitor Android / iOS (`capacitor-android`, `capacitor-swift-pm`) | native build dependency, resolved by the host app | MIT |
| `androidx.appcompat`, JUnit 4 | Android build and test | Apache-2.0, EPL-1.0 (test only) |

Native code uses only platform libraries (CryptoKit, Compression, java.security, java.util.zip). No code from
`@capgo/capacitor-updater` or any Cap-go repository was read or used (clean room).

## packages/mcp (`@buffersol/hotrail-mcp`, MIT)

| Package | Version | Licence | Use |
| --- | --- | --- | --- |
| `@modelcontextprotocol/sdk` | ^1.32.2 | MIT | MCP server and stdio transport (official SDK) |
| `zod` | ^4.6.7 | MIT | Tool input schemas (already used by the app) |
