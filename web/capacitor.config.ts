const config = {
  appId: "com.ghostzero.aistudycompanion",
  appName: "AI Study Companion",
  webDir: "mobile-dist",
  loggingBehavior: "debug",
  android: {
    minWebViewVersion: 60,
    minHuaweiWebViewVersion: 10,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_ai_reminder",
      iconColor: "#2563EB",
    },
  },
};

export default config;
