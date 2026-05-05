import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.chatrazze.app",
  appName: "Chatrazze",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#FF7A1A",
      showSpinner: false,
    },
  },
};

export default config;
