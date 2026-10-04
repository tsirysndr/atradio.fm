module.exports = {
  name: "atradio.fm",
  slug: "atradio-fm",
  owner: "tsirysndr",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "atradio",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  icon: "./assets/pwa-512x512.png",
  backgroundColor: "#080d1b",
  extra: { eas: { projectId: "a61f9785-ef08-4c87-8e90-2bfbdf15d56a" } },
  android: {
    package: "fm.atradio.app",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/maskable-icon-512x512.png",
      backgroundColor: "#080d1b",
    },
    permissions: [
      "INTERNET",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "WAKE_LOCK",
      "POST_NOTIFICATIONS",
    ],
    softwareKeyboardLayoutMode: "resize",
  },
  plugins: [
    "./plugins/withRustEngine",
    "./plugins/withReleaseOptimization",
    "./plugins/withRadio",
    [
      "expo-splash-screen",
      {
        image: "./assets/pwa-512x512.png",
        imageWidth: 144,
        backgroundColor: "#080d1b",
      },
    ],
  ],
};
