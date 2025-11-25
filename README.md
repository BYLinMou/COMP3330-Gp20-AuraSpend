# AuraSpend - Smart Budgeting Companion

**HKU COMP3330 (25-26 Sem 1) - Group 20**

AuraSpend is a gamified, AI-powered expense tracking application built with React Native (Expo) and Supabase. It combines financial management with a digital pet companion to encourage healthy spending habits.

## 👥 Group Members

- **Xie Yee Lam**
- **Chen Yifan**
- **Zeng Ruo Xi**

---

## ✨ Key Features

### 💰 Smart Finance Management
- **Multi-Currency Support**: Real-time currency conversion powered by Frankfurter API (Supports HKD, USD, CNY, JPY, etc.).
- **AI Receipt Scanning**: Upload or take photos of receipts. The app uses multimodal LLMs (OpenAI/Gemini) to automatically extract merchant, items, amount, and categories.
- **Budget Tracking**: Set monthly or yearly budgets with visual progress bars and alerts.
- **Detailed Reports**: Interactive charts showing spending trends, category breakdowns, and merchant summaries.

### 🐾 Gamification (Pet System)
- **Digital Companion**: Your financial habits affect your pet's mood and hunger.
- **Level Up**: Gain XP by logging transactions and staying within budget.
- **Rewards**: Unlock outfits and new pets as you progress.

### 🤖 AI Assistant
- **Floating Chat**: An integrated AI assistant that can answer questions about your spending, summarize data, and perform actions via natural language (e.g., "How much did I spend on food last week?").

### 🛠 Technical Highlights
- **Real-time Sync**: Data synchronizes instantly across devices using Supabase Realtime.
- **Offline Support**: Built-in caching for currencies and essential data.
- **Customizable**: Support for dark mode, custom categories, and multiple languages (English/Chinese).

---

## 🏗 Tech Stack

- **Frontend**: React Native, Expo, Expo Router, Reanimated
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **AI Integration**: OpenAI, Gemini API
- **Language**: TypeScript

---

## 🚀 Getting Started

### Prerequisites
- Node.js (LTS version recommended, e.g., >= 20)
- npm or yarn
- Expo Go app on your mobile device or an Android/iOS Simulator

### 1. Clone and Install

```bash
# Clone the repository
git clone [https://github.com/BYLinMou/COMP3330-Gp20-AuraSpend.git](https://github.com/BYLinMou/COMP3330-Gp20-AuraSpend.git)

# Navigate to project folder
cd COMP3330-Gp20-AuraSpend

# Install dependencies
npm install

# Project Introduction

This project is developed for **HKU COMP3330 25-26 sem 1, Group 20**.

## Group Members

- Xie Yee Lam
- Chen Yifan
- Zeng Ruo Xi

## Project Overview
