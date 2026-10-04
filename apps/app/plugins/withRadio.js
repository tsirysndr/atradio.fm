const { withAndroidManifest } = require("expo/config-plugins");
module.exports = (config) =>
  withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    // Many public radio stations only provide HTTP streams.
    app.$["android:usesCleartextTraffic"] = "true";
    // OAuth session keys live in private native files; never include them in backups.
    app.$["android:allowBackup"] = "false";
    return config;
  });
