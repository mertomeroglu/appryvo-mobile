# Appryvo Mobile

Official cross-platform mobile application for **Appryvo**, built with React 19, TypeScript, Vite, and Capacitor 7 with native iOS and Android wrappers.

---

## 📱 Tech Stack

- **Frontend Core:** React 19, TypeScript 5.7, Vite 6
- **Styling & Animations:** Tailwind CSS 4, Motion (Framer Motion)
- **State Management:** Zustand, TanStack React Query
- **Mobile Runtime:** Capacitor 7 (`@capacitor/ios`, `@capacitor/android`, `@capacitor/core`)
- **Native iOS Project:** `ios/App/App.xcworkspace` (Swift, CocoaPods)
- **Native Android Project:** `android/` (Gradle, Kotlin/Java)
- **App ID / Bundle Identifier:** `com.appryvo.ryvo`
- **App Name:** `Appryvo`

---

## 🚀 Prerequisites

### General
- **Node.js:** 20.x or higher
- **npm:** 10.x or higher

### iOS (macOS only)
- **macOS:** Sonoma 14+ or Sequoia 15+
- **Xcode:** 15.x or 16.x (with Command Line Tools installed)
- **CocoaPods:** 1.14+ (`sudo gem install cocoapods` or `brew install cocoapods`)

### Android
- **Android Studio:** Ladybug / Meerkat (latest)
- **JDK:** OpenJDK 21
- **Android SDK:** API Level 34 / 36

---

## 🛠️ Quick Start

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/mertomeroglu/appryvo-mobile.git
cd appryvo-mobile
npm ci
```

### 2. Environment Configuration

Copy the example environment configuration file:

```bash
cp .env.example .env
```

Default contents:
```env
VITE_API_BASE_URL=https://api.appryvo.online
```

### 3. Development Server (Browser Mode)

```bash
npm run dev
```

---

## 🍏 iOS Development & Build (macOS)

Follow this streamlined workflow on macOS to build and run on iOS Simulator or physical devices:

```bash
# 1. Install dependencies
npm ci

# 2. Build production web bundle
npm run build

# 3. Synchronize assets and native plugins to iOS
npx cap sync ios

# 4. Open project in Xcode
npx cap open ios
```

Alternatively, work directly with CocoaPods & Xcode:

```bash
cd ios/App
pod install
open App.xcworkspace
```

> **Important:** Always open `ios/App/App.xcworkspace` (never the `.xcodeproj` file) in Xcode so that CocoaPods dependencies are correctly linked.

---

## 🤖 Android Development & Build

```bash
# 1. Build production web bundle
npm run build

# 2. Synchronize assets and native plugins to Android
npx cap sync android

# 3. Open project in Android Studio
npx cap open android
```

---

## 🧪 Testing & Verification

```bash
# Typecheck TypeScript codebase
npm run typecheck

# Run ESLint
npm run lint

# Run Unit & Integration Tests (Vitest)
npm test

# Build production bundle
npm run build
```

---

## 📁 Repository Structure

```text
appryvo-mobile/
├── src/                      # React frontend application source
│   ├── app/                  # App shell, error boundaries, session gates
│   ├── components/           # Reusable UI & modal components
│   ├── features/             # Feature modules (auth, chat, discovery, likes, map, profile, etc.)
│   ├── hooks/                # Custom React query & lifecycle hooks
│   ├── lib/                  # Utilities, constants, labels, country flags
│   ├── motion/               # Motion animation tokens and variants
│   ├── native/               # Capacitor native bridge abstractions
│   ├── routes/               # React Router route definitions
│   ├── services/             # API client, WebRTC call services, sockets
│   ├── stores/               # Zustand state stores
│   └── styles/               # Global CSS & Tailwind styles
├── public/                   # Public static assets & brand graphics
├── ios/                      # Native iOS Capacitor Project
│   └── App/
│       ├── App/              # AppDelegate, Info.plist, Assets, Storyboards
│       ├── App.xcodeproj     # Xcode project
│       ├── App.xcworkspace   # Xcode workspace (CocoaPods)
│       └── Podfile           # CocoaPods dependency specification
├── android/                  # Native Android Capacitor Project
│   ├── app/                  # Android application module, manifests, resources
│   └── build.gradle          # Root Gradle build script
├── tests/                    # Vitest test suites
├── capacitor.config.ts       # Capacitor configuration
├── package.json              # Project dependencies & scripts
├── vite.config.ts            # Vite configuration
└── tsconfig.json             # TypeScript configuration
```

---

## 🔒 Security & Privacy

- Sensitive credentials, signing keys, and `.env` files are ignored by default.
- Android release signing keys should be configured via `android/key.properties` (see `android/key.properties.example`).
- iOS signing identities should be configured directly in Xcode Signing & Capabilities settings.

---

## 📄 License

Proprietary © Appryvo. All rights reserved.
