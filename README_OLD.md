# Project Introduction

This project is developed for **HKU COMP3330 25-26 sem 1, Group 20**.

## Group Members

- Xie Yee Lam
- Chen Yifan
- Zeng Ruo Xi

## Project Overview

AuraSpend is a money-management app built with Expo (React Native + Expo Router) and Supabase as the backend. Key features include multi-currency support, AI-assisted receipt parsing (external tool), budgets, and analytics.

## Quick setup

1. Install Node (recommended >= 20.19.4). Use nvm or Volta to manage versions.

	Example (nvm):

	```bash
	curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
	export NVM_DIR="$HOME/.nvm"
	[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
	nvm install 20.19.4
	nvm use 20.19.4
	node -v
	```

2. Copy `.env.example` to `.env` and fill in your Supabase values (do NOT commit `.env`):

	```text
	EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
	EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
	```

3. Install dependencies and start Expo:

	```bash
	npm install
	npm run start
	```

4. Use the Expo DevTools or the terminal shortcuts to open iOS/Android simulators or web.

## Notes for contributors

- The auth gating logic lives in `app/_layout.tsx` and relies on `useAuth()` from `src/providers/AuthProvider.tsx`.
- Supabase client is implemented in `src/services/supabase.ts` and reads env vars from `app.config.js` via `expo-constants.extra`.
- `TestTools/ReceiptSmartAnalyzer` is a separate Python tool for OCR and is not required to run the mobile app.

This README is a work in progress.
