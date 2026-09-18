# Distribution

How to build, package, sign, and troubleshoot the Relay desktop app.

## Prerequisites

- macOS to build the `dmg` target. electron-builder produces macOS installers
  only on a macOS host; the configured targets are `dmg` and `zip`.
- Node.js: `package.json` does not declare an `engines` field, so there is no
  enforced version floor. Use a current Node LTS. The build was verified with
  Node v24.15.0 and npm 11.12.1 on macOS arm64.
- Network access on the first build. electron-builder downloads the Electron
  binary and its packaging tooling (for example the DMG builder) into its cache.
- For signed or notarized builds only: a paid Apple Developer account, a
  `Developer ID Application` certificate in the login keychain, and notarization
  credentials (described below).

## Commands

Run all commands from the repository root. These are the exact scripts defined
in `package.json`:

| Command | Script |
| --- | --- |
| `npm run dev` | `electron-vite dev` |
| `npm test` | `vitest run` |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json` |
| `npm run build` | `electron-vite build` |
| `npm run dist:dir` | `electron-vite build && electron-builder --dir` |
| `npm run dist` | `electron-vite build && electron-builder --publish never` |

`npm run dist` builds the app and produces the installers. `npm run dist:dir`
builds only the unpacked app bundle (faster, no installer), which is useful for
local smoke testing.

## Artifacts

`electron-builder.yml` sets `directories.output: dist` and `mac.target` to
`dmg` and `zip`. After `npm run dist` on an arm64 Mac the output is:

- `dist/Relay-0.1.0-arm64.dmg` (123,793,264 bytes, about 118 MiB) - disk image installer
- `dist/Relay-0.1.0-arm64-mac.zip` (123,787,773 bytes, about 118 MiB) - zipped app bundle
- `dist/Relay-0.1.0-arm64.dmg.blockmap` - update blockmap for the dmg
- `dist/Relay-0.1.0-arm64-mac.zip.blockmap` - update blockmap for the zip
- `dist/latest-mac.yml` - auto-update metadata
- `dist/builder-debug.yml` - electron-builder debug output
- `dist/mac-arm64/Relay.app` - the unpacked app bundle (the `--dir` output)

The version (`0.1.0`) and architecture (`arm64`) in the file names come from
`package.json` and the build host. `dist/` is listed in `.gitignore`, so build
output is never committed.

## Unsigned builds

`electron-builder.yml` sets `mac.identity: null`, so electron-builder skips code
signing entirely. The build log reports
`skipped macOS code signing reason=identity explicitly is set to null`.

An unsigned app is not notarized, so a copy downloaded from the internet carries
the macOS quarantine flag and Gatekeeper will refuse to open it with a message
such as "Relay is damaged and can't be opened" or "cannot be opened because the
developer cannot be verified". This does not mean the build is broken.

Remedies for a locally built or downloaded copy:

- Right-click (Control-click) the app in Finder and choose Open, then confirm in
  the dialog. This clears the one-time block for that copy.
- Or remove the quarantine attribute directly:

  ```
  xattr -dr com.apple.quarantine /Applications/Relay.app
  ```

## Signing and notarization

To sign, install a `Developer ID Application` certificate (Xcode > Settings >
Accounts > Manage Certificates, or from developer.apple.com) into the login
keychain. Then either:

- Remove `identity: null` from `electron-builder.yml`. electron-builder will
  auto-discover a valid `Developer ID Application` certificate; or
- Set the identity explicitly, for example
  `identity: "Developer ID Application: Your Name (TEAMID)"`; or
- Keep the file as-is and supply credentials through the environment with
  `CSC_LINK` (certificate file or base64) and `CSC_NAME`. Setting
  `CSC_IDENTITY_AUTO_DISCOVERY=false` disables the automatic discovery.

Notarization requires a paid Apple Developer account. electron-builder 26 has a
built-in `@electron/notarize` integration, enabled with `mac.notarize: true`.
Credentials must be supplied through environment variables, using one of these
sets:

- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`; or
- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`; or
- `APPLE_KEYCHAIN` and `APPLE_KEYCHAIN_PROFILE`.

Hardened runtime is required for notarization and electron-builder enables it by
default (`hardenedRuntime` defaults to `true`).

A signed and notarized `electron-builder.yml` looks like this:

```yaml
mac:
  category: public.app-category.developer-tools
  identity: "Developer ID Application: Your Name (TEAMID)"
  hardenedRuntime: true
  notarize: true
  target:
    - dmg
    - zip
```

with credentials exported before the build:

```sh
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID"
npm run dist
```

As an alternative to `mac.notarize`, use an `afterSign` hook that calls
`@electron/notarize`. That package is not a current dependency and would have to
be added before use.

## sql.js wasm must stay unpacked

`electron-builder.yml` contains:

```yaml
asarUnpack:
  - "**/node_modules/sql.js/**"
```

This is required. The main process loads the SQLite wasm from disk at runtime:
`src/main/db.ts` builds the database with
`readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"))`. If sql.js were
packed inside `app.asar`, the wasm would not be a real file on disk and the
packaged app would fail to initialize its database. Keep the `asarUnpack` entry
as-is, and after a build confirm the file exists at:

```
dist/mac-arm64/Relay.app/Contents/Resources/app.asar.unpacked/node_modules/sql.js/dist/sql-wasm.wasm
```

## Troubleshooting

### Gatekeeper reports the app is "damaged"

The build is unsigned because of `identity: null`, and the copy is quarantined.
Remove the quarantine attribute and reopen:

```
xattr -dr com.apple.quarantine /Applications/Relay.app
```

Right-clicking the app and choosing Open is an alternative for the first launch.
Signing and notarizing the app (see above) is the permanent fix for distributed
copies.

### Missing wasm or "Cannot find module" after packaging

Symptom: the packaged app starts but fails on the first database access, or
reports a module resolution error for sql.js. Cause: the `asarUnpack` rule was
removed or overridden, so sql.js was packed into `app.asar`. Fix: restore
`asarUnpack: ["**/node_modules/sql.js/**"]` in `electron-builder.yml`, rebuild,
and confirm `sql-wasm.wasm` is present under
`Contents/Resources/app.asar.unpacked/node_modules/sql.js/dist/`. Do not bundle
sql.js through Vite; it must remain an external module read from disk.

### Where the log lives

The main process writes a JSON-lines log to `relay.log` in the app's userData
directory (logger in `src/main/logger.ts`, path assembled in
`src/main/index.ts`):

- macOS default: `~/Library/Application Support/relay/relay.log`
- with `--user-data-dir=<dir>`: `<dir>/relay.log`
- the same directory also holds `relay.db`

`createLogger` creates the file lazily on the first write, so a clean launch with
no user actions and no errors produces no `relay.log`. Uncaught exceptions and
renderer/child-process crash events are written to it.

For an isolated smoke launch that does not touch the real userData directory:

```
dist/mac-arm64/Relay.app/Contents/MacOS/Relay --user-data-dir=/tmp/relay-pkg-smoke
```
