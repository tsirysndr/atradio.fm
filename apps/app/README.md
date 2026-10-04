# atradio.fm Android app

Expo app with a Rust `rockbox-playback` engine and Android foreground media service.
Discover and favorites reuse `https://api.atradio.fm`; station search and genres use
Radio Browser. ATProto sign-in validates handles, suggests accounts, and opens the
embedded WebView for atcute OAuth. OAuth runs in a bundled, isolated WebView runtime;
credentials remain in app-private WebView storage and never cross the React Native bridge. A paused station reconnects at the live edge when resumed.

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
code. The pre-install hook installs pinned Rust and cargo-ndk versions. The app uses atcute for authentication; Rust is used only for playback.
The generated top-level Android project is ignored; the Expo module's Android
sources must be included in the build archive.

Radio playback continues through the native media session when JavaScript is
backgrounded. Notification permission is requested on Android 13+. HTTP is allowed
because some public stations do not provide HTTPS. Library favorites are read
from the existing service for the signed-in DID.

## Mobile features

Shared session, player and navigation state use Jotai; feeds and write mutations
use TanStack React Query. Registration uses React Hook Form with a shared Zod
schema. The center + button prompts guests to sign in before registration.
Profile tabs show favorites, registered stations and listening history.

Station discussions read the AppView and write comments, GIF embeds and emoji
reactions to the user's PDS through the existing TypeScript SDK and atcute.
Signing in requests only identity, comment, reaction and station permissions.
Accounts signed in before these scopes were added must sign in again to grant
writing permissions. No credentials or access tokens cross the WebView bridge.

GIF search uses `EXPO_PUBLIC_KLIPY_API_KEY` in the ignored `.env.local` file and
the EAS production/preview environments. It is a public client key embedded in
the bundle, as on the web. Do not commit environment files.

The ten-band equalizer and enable switch apply to rockbox-playback and persist
in native Android preferences. Native streaming uses the same media proxy as
the web player (`https://media.atradio.fm`); HLS manifests keep their original
origin for relative segment URLs. The canonical station URL remains unchanged
in ATProto records. Recent community plays and the web's 33 genre categories
are available on Discover; its directory currently uses getRecentStations.
