import 'dotenv/config';

export default ({ config }) => {
  // Load environment variables
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

  // Warn if env vars are missing
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️  WARNING: Supabase environment variables are not set!');
    console.warn('Please create a .env file with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }

  const appVersion = "0.0.10";

  return {
    expo: {
      name: "AuraSpend",
      slug: "AuraSpend",
      version: appVersion,
      orientation: "portrait",
      icon: "./assets/images/icon.png",
      scheme: "auraspend",
      userInterfaceStyle: "automatic",
      newArchEnabled: true,
      ios: {
        supportsTablet: true
      },
      android: {
        adaptiveIcon: {
          backgroundColor: "#E6F4FE",
          // foregroundImage: "./assets/images/android-icon-foreground.png",
          foregroundImage: "./assets/images/icon.png",
          backgroundImage: "./assets/images/android-icon-background.png",
          monochromeImage: "./assets/images/android-icon-monochrome.png"
        },
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        permissions: [],
        package: "com.anonymous.AuraSpend"
      },
      web: {
        output: "static",
        favicon: "./assets/images/favicon.png"
      },
      plugins: [
        "expo-router",
        [
          "expo-splash-screen",
          {
            image: "./assets/images/splash-icon.png",
            imageWidth: 200,
            resizeMode: "contain",
            backgroundColor: "#ffffff",
            dark: {
              backgroundColor: "#000000"
            }
          }
        ],
        "expo-web-browser"
      ],
      experiments: {
        typedRoutes: true,
        reactCompiler: true
      },
      extra: {
        // Expose env vars through expo-constants
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
        supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        appVersion: appVersion
      }
    }
  };
};
