# NudgePay

A personal finance budgeting and spending monitor built at Tartan Hacks 2026. NudgePay consists of a **web dashboard** for managing budgets and a **Chrome extension** that nudges you at checkout on Amazon and Uber Eats by comparing your cart total against your budget.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16+) or [Bun](https://bun.sh/)
- [Google Chrome](https://www.google.com/chrome/) (for the browser extension)
- A [Nessie API key](http://api.nessieisreal.com/) (free Capital One sandbox banking API)
- A [Google Gemini API key](https://ai.google.dev/) (used for AI-powered analytics)

## Project Structure

```
├── website/          # Web dashboard (budget management & analytics)
│   ├── index.html    # Main dashboard
│   ├── login.html    # Login / account creation
│   ├── analytics.html# Spending analytics
│   ├── app.js        # Dashboard logic
│   ├── login.js      # Auth logic
│   ├── analytics.js  # Charts & AI insights
│   └── config.js     # API keys (you create this)
│
└── extension/        # Chrome extension (checkout nudges)
    ├── manifest.json # Extension manifest v3
    ├── popup.html/js # Extension popup UI
    ├── background.js # Service worker
    ├── amazon.js     # Amazon checkout content script
    ├── ubereats.js   # Uber Eats checkout content script
    └── bridge.js     # Dashboard ↔ extension bridge
```

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd tartan-hacks-2026
```

### 2. Configure API keys

Copy the example config and fill in your keys:

```bash
cp website/config.example.js website/config.js
```

Edit `website/config.js` with your API keys:

```js
const CONFIG = {
  GEMINI_API_KEY: "your-gemini-api-key-here",
  EXTENSION_ID: "your-chrome-extension-id-here",  // filled in after step 4
  NESSIE_API_KEY: "your-nessie-api-key-here",
  NESSIE_BASE_URLS: [
    "http://api.nessieisreal.com",
    "http://api.reimaginebanking.com",
    "https://api.nessieisreal.com",
    "https://api.reimaginebanking.com",
  ],
};
```

### 3. Run the web dashboard

```bash
cd website
npm install
npm run dev
```

The dashboard will be available at **http://localhost:5173**.

### 4. Load the Chrome extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked** and select the `extension/` folder
4. Note the **Extension ID** that Chrome assigns — copy it back into `website/config.js` as the `EXTENSION_ID` value

### 5. Connect the dashboard to the extension

1. Open the dashboard at http://localhost:5173
2. Log in or create a new account (backed by the Nessie API)
3. Set your monthly budget and add any recurring payments
4. Click **"Send to Extension"** to sync your budget data to the Chrome extension

## Usage

- **Dashboard** — Set your monthly budget, manage recurring payments, and view spending analytics with AI-powered insights.
- **Extension popup** — While on an Amazon or Uber Eats checkout page, click the NudgePay extension icon to see how your cart total compares to your remaining budget.
- **Analytics** — Visit the analytics page from the dashboard to view spending charts broken down by day, category, and vendor.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript (ES Modules) |
| Dev Server | http-server (Node.js) |
| Extension | Chrome Extension Manifest V3 |
| Banking API | Nessie (Capital One sandbox) |
| AI | Google Gemini 2.0 Flash |
| Storage | localStorage, chrome.storage.local |
