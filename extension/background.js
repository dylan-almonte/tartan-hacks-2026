const MESSAGE_TYPE = "NUDGEPAY_SET_DATA";
const NESSIE_CONFIG_KEY = "nessie_config";
const NESSIE_BASE_URL = "https://api.nessieisreal.com";

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handleMessage(message, sendResponse);
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sendResponse);
  return true;
});

async function handleMessage(message, sendResponse) {
  if (!message?.type) {
    sendResponse({ ok: false, error: "Missing message type" });
    return;
  }

  if (message.type === MESSAGE_TYPE) {
    if (!message.payload) {
      sendResponse({ ok: false, error: "Missing payload" });
      return;
    }

    chrome.storage.local.set(message.payload, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true });
    });
    return;
  }

  if (message.type === "NUDGEPAY_NESSIE_SET_CONFIG") {
    const incoming = sanitizeConfig(message.payload || {});
    const existing = await getNessieConfig();
    const config = mergeConfig(existing, incoming);
    chrome.storage.local.set({ [NESSIE_CONFIG_KEY]: config }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true });
    });
    return;
  }

  if (message.type === "NUDGEPAY_NESSIE_GET_SUMMARY") {
    const config = await getNessieConfig();
    const missing = requireConfig(config, ["apiKey", "accountId"]);
    if (missing) {
      sendResponse({ ok: false, error: missing });
      return;
    }

    try {
      const summary = await buildNessieSummary(config);
      chrome.storage.local.set({ nessie_summary: summary });
      sendResponse({ ok: true, summary });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
    return;
  }

  if (message.type === "NUDGEPAY_NESSIE_CHECKOUT") {
    const config = await getNessieConfig();
    const missing = requireConfig(config, ["apiKey", "accountId", "merchantId"]);
    if (missing) {
      sendResponse({ ok: false, error: missing });
      return;
    }

    const amount = Number(message.payload?.amount || 0);
    if (!amount || amount <= 0) {
      sendResponse({ ok: false, error: "Missing checkout amount" });
      return;
    }

    try {
      const body = {
        merchant_id: config.merchantId,
        medium: "balance",
        amount: Number(amount.toFixed(2)),
        description: message.payload?.vendor || "Demo checkout",
      };
      const response = await fetchNessieJson(`/accounts/${config.accountId}/purchases`, config.apiKey, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const summary = await buildNessieSummary(config);
      chrome.storage.local.set({ nessie_summary: summary });
      await broadcastToWebsite({
        type: "NUDGEPAY_NESSIE_PURCHASE",
        purchase: response,
        summary,
      });
      sendResponse({ ok: true, purchase: response, summary });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
    return;
  }

  if (message.type === "NUDGEPAY_NESSIE_CREATE_DEMO") {
    const config = await getNessieConfig();
    const missing = requireConfig(config, ["apiKey"]);
    if (missing) {
      sendResponse({ ok: false, error: missing });
      return;
    }

    try {
      const customer = await fetchNessieJson(`/customers`, config.apiKey, {
        method: "POST",
        body: JSON.stringify(buildDemoCustomer()),
      });

      const account = await fetchNessieJson(`/customers/${customer._id}/accounts`, config.apiKey, {
        method: "POST",
        body: JSON.stringify(buildDemoAccount()),
      });

      const merchant = await fetchNessieJson(`/merchants`, config.apiKey, {
        method: "POST",
        body: JSON.stringify(buildDemoMerchant()),
      });

      const nextConfig = {
        ...config,
        customerId: customer._id,
        accountId: account._id,
        merchantId: merchant._id,
      };

      chrome.storage.local.set({ [NESSIE_CONFIG_KEY]: nextConfig });

      sendResponse({
        ok: true,
        customerId: customer._id,
        accountId: account._id,
        merchantId: merchant._id,
      });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
    return;
  }

  sendResponse({ ok: false, error: "Unknown message type" });
}

function sanitizeConfig(config) {
  return {
    apiKey: String(config.apiKey || "").trim(),
    accountId: String(config.accountId || "").trim(),
    customerId: String(config.customerId || "").trim(),
    merchantId: String(config.merchantId || "").trim(),
  };
}

function mergeConfig(existing, incoming) {
  return {
    apiKey: incoming.apiKey || existing.apiKey || "",
    accountId: incoming.accountId || existing.accountId || "",
    customerId: incoming.customerId || existing.customerId || "",
    merchantId: incoming.merchantId || existing.merchantId || "",
  };
}

function requireConfig(config, fields) {
  const missing = fields.find((field) => !config?.[field]);
  return missing ? `Missing Nessie config: ${missing}` : "";
}

function getNessieConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([NESSIE_CONFIG_KEY], (result) => {
      resolve(result?.[NESSIE_CONFIG_KEY] || {});
    });
  });
}

async function fetchNessieJson(path, apiKey, options = {}) {
  const url = `${NESSIE_BASE_URL}${path}${path.includes("?") ? "&" : "?"}key=${apiKey}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nessie error: ${response.status} ${text}`);
  }
  return response.json();
}

async function buildNessieSummary(config) {
  const account = await fetchNessieJson(`/accounts/${config.accountId}`, config.apiKey);
  const purchases = await fetchNessieJson(`/accounts/${config.accountId}/purchases`, config.apiKey);
  const deposits = await fetchNessieJson(`/accounts/${config.accountId}/deposits`, config.apiKey);

  const spendLast30 = sumLast30Days(purchases, ["purchase_date", "transaction_date", "created_at"], "amount");
  const incomeLast30 = sumLast30Days(deposits, ["transaction_date", "deposit_date", "created_at"], "amount");

  return {
    balance: Number(account?.balance || 0),
    accountName: account?.nickname || account?.name || "Account",
    accountType: account?.type || "",
    incomeLast30: Number(incomeLast30.toFixed(2)),
    spendLast30: Number(spendLast30.toFixed(2)),
  };
}

function broadcastToWebsite(message) {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: ["http://localhost:5173/*", "http://127.0.0.1:5173/*"] }, (tabs) => {
      tabs.forEach((tab) => {
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, message);
        }
      });
      resolve();
    });
  });
}

function sumLast30Days(items, dateKeys, amountKey) {
  if (!Array.isArray(items)) return 0;
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - 30);
  return items.reduce((total, item) => {
    const dateValue = dateKeys.map((key) => item?.[key]).find(Boolean);
    if (!dateValue) return total;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime()) || date < cutoff) return total;
    const amount = Number(item?.[amountKey] || 0);
    return total + amount;
  }, 0);
}

function buildDemoCustomer() {
  const seed = Math.floor(Math.random() * 10000);
  return {
    first_name: "Nudge",
    last_name: `Demo${seed}`,
    address: {
      street_number: "123",
      street_name: "Mosaic Ave",
      city: "Pittsburgh",
      state: "PA",
      zip: "15213",
    },
  };
}

function buildDemoAccount() {
  return {
    type: "Checking",
    nickname: "NudgePay Checking",
    rewards: 10,
    balance: 2400,
  };
}

function buildDemoMerchant() {
  return {
    name: "NudgePay Demo Shop",
    category: "Online",
    address: {
      street_number: "200",
      street_name: "River St",
      city: "Pittsburgh",
      state: "PA",
      zip: "15222",
    },
    geocode: {
      lat: 40.4406,
      lng: -79.9959,
    },
  };
}
