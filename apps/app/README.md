# atradio.fm Android app

Expo app with a Rust `rockbox-playback` engine and Android foreground media service.
Discover and favorites reuse `https://api.atradio.fm`; station search and genres use
Radio Browser. ATProto sign-in validates handles, suggests accounts, and opens the
system browser for OAuth. Session credentials stay in Android's private no-backup
directory. A paused station reconnects at the live edge when resumed.

## Development

From the repository root, run `bun install`. From `apps/app`:

```sh
bash scripts/eas-pre-install.sh
bun run prebuild --platform android
bun run android
bun run typecheck
bun test tests
```

Use Java 17 and Android NDK 27.1.12297006. The native Gradle module invokes
`cargo ndk ... build --release --locked` for arm64-v8a and x86_64 and validates
16 KB ELF alignment. Expo Go does not include the custom native module; use a
native Android build. iOS playback is not implemented yet.

## Release builds

```sh
cd android
./gradlew :app:assembleRelease
```

The local APK is `android/app/build/outputs/apk/release/app-release.apk` and uses
the generated development signing key for device testing. Use EAS-managed signing
for distribution:

```sh
bunx eas-cli build --platform android --profile preview
bunx eas-cli build --platform android --profile production
```

The project is linked to `tsirysndr/atradio-fm`. Preview produces an installable
APK; production produces a Play Store AAB with an incrementing remote version
code. The pre-install hook installs pinned Rust and cargo-ndk versions. Keep this
app inside the monorepo: native authentication uses `../../../../crates/atradio-sdk`.
The generated top-level Android project is ignored; the Expo module's Android
sources must be included in the build archive.

Radio playback continues through the native media session when JavaScript is
backgrounded. Notification permission is requested on Android 13+. HTTP is allowed
because some public stations do not provide HTTPS. Library favorites are read
from the existing service for the signed-in DID.
