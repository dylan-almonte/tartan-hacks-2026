const STATE_KEY = "nudgepay_dashboard_state";
const SESSION_KEY = "nudgepay_session";
const LOCAL_CONFIG = typeof CONFIG === "undefined"
  ? {
      NESSIE_API_KEY: "",
      NESSIE_BASE_URLS: [
        "http://api.nessieisreal.com",
        "http://api.reimaginebanking.com",
        "https://api.nessieisreal.com",
        "https://api.reimaginebanking.com",
      ],
    }
  : CONFIG;
const NESSIE_BASE_URLS = LOCAL_CONFIG.NESSIE_BASE_URLS;

// If already logged in, go straight to dashboard
const existingSession = localStorage.getItem(SESSION_KEY);
if (existingSession) {
  try {
    const session = JSON.parse(existingSession);
    if (session.apiKey && session.accountId) {
      window.location.href = "index.html";
    }
  } catch {}
}

const els = {
  loginForm: document.getElementById("loginForm"),
  apiKey: document.getElementById("apiKey"),
  accountId: document.getElementById("accountId"),
  loginButton: document.getElementById("loginButton"),
  loginStatus: document.getElementById("loginStatus"),
  accountInfo: document.getElementById("accountInfo"),
  accountDetails: document.getElementById("accountDetails"),
  continueButton: document.getElementById("continueButton"),
};

// Pre-fill API key from config if set
if (LOCAL_CONFIG.NESSIE_API_KEY) {
  els.apiKey.value = LOCAL_CONFIG.NESSIE_API_KEY;
}

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const apiKey = els.apiKey.value.trim();
  const existingAccountId = els.accountId.value.trim();

  if (!apiKey) {
    setLoginStatus("Please enter a Nessie API key.", true);
    return;
  }

  els.loginButton.disabled = true;
  els.loginButton.textContent = "Working...";

  try {
    let accountId, customerId, merchantId, accountName, balance;

    if (existingAccountId) {
      // Verify the existing account works
      setLoginStatus("Verifying account...");
      const account = await fetchNessie(`/accounts/${existingAccountId}`, apiKey);
      accountId = existingAccountId;
      accountName = account.nickname || account.name || "Account";
      balance = Number(account.balance || 0);
      setLoginStatus("Account verified.");
    } else {
      // Create demo customer
      setLoginStatus("Creating demo customer...");
      const customer = await fetchNessie("/customers", apiKey, {
        method: "POST",
        body: JSON.stringify({
          first_name: "Nudge",
          last_name: `Demo${Math.floor(Math.random() * 10000)}`,
          address: {
            street_number: "123",
            street_name: "Mosaic Ave",
            city: "Pittsburgh",
            state: "PA",
            zip: "15213",
          },
        }),
      });
      customerId = extractId(customer);

      // Create demo account
      setLoginStatus("Creating demo checking account...");
      const account = await fetchNessie(`/customers/${customerId}/accounts`, apiKey, {
        method: "POST",
        body: JSON.stringify({
          type: "Checking",
          nickname: "NudgePay Checking",
          rewards: 10,
          balance: 2400,
        }),
      });
      accountId = extractId(account);
      accountName = "NudgePay Checking";
      balance = 2400;

      // Create demo merchant
      setLoginStatus("Creating demo merchant...");
      const merchant = await fetchNessie("/merchants", apiKey, {
        method: "POST",
        body: JSON.stringify({
          name: "NudgePay Demo Shop",
          category: "Online",
          address: {
            street_number: "200",
            street_name: "River St",
            city: "Pittsburgh",
            state: "PA",
            zip: "15222",
          },
          geocode: { lat: 40.4406, lng: -79.9959 },
        }),
      });
      merchantId = extractId(merchant);
    }

    // Build the Nessie summary
    setLoginStatus("Fetching account summary...");
    let summary;
    try {
      const purchases = await fetchNessie(`/accounts/${accountId}/purchases`, apiKey);
      const deposits = await fetchNessie(`/accounts/${accountId}/deposits`, apiKey);
      const accountData = await fetchNessie(`/accounts/${accountId}`, apiKey);
      summary = {
        balance: Number(accountData.balance || balance || 0),
        accountName: accountData.nickname || accountName || "Account",
        accountType: accountData.type || "Checking",
        incomeLast30: sumLast30(deposits),
        spendLast30: sumLast30(purchases),
      };
    } catch {
      summary = {
        balance: balance || 0,
        accountName: accountName || "Account",
        accountType: "Checking",
        incomeLast30: 0,
        spendLast30: 0,
      };
    }

    // Save session
    const session = { apiKey, accountId, customerId: customerId || "", merchantId: merchantId || "" };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    // Save to dashboard state
    const state = loadDashboardState();
    state.user_profile.last_nessie_summary = summary;
    state.user_profile.nessie_account_id = accountId;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));

    // Show account info
    els.loginForm.style.display = "none";
    els.loginStatus.style.display = "none";
    els.accountInfo.style.display = "block";
    renderAccountDetails(summary, accountId);

  } catch (err) {
    setLoginStatus(err.message || "Login failed. Check your API key.", true);
  } finally {
    els.loginButton.disabled = false;
    els.loginButton.textContent = "Log In / Create Demo";
  }
});

els.continueButton.addEventListener("click", () => {
  window.location.href = "index.html";
});

/* ── Nessie API helpers ── */

async function fetchNessie(path, apiKey, options = {}) {
  let lastError;
  for (const baseUrl of NESSIE_BASE_URLS) {
    try {
      const sep = path.includes("?") ? "&" : "?";
      const url = `${baseUrl}${path}${sep}key=${apiKey}`;
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Nessie error: ${res.status} ${text}`);
      }
      return res.json();
    } catch (err) {
      lastError = err;
      if (err.message?.startsWith("Nessie error:")) throw err;
    }
  }
  throw lastError || new Error("Nessie request failed");
}

function extractId(entity) {
  const id = entity?._id || entity?.id || entity?.objectCreated?._id || entity?.objectCreated?.id;
  if (!id) throw new Error("Failed to create resource — no ID returned");
  return id;
}

function sumLast30(items) {
  if (!Array.isArray(items)) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return Number(items.reduce((total, item) => {
    const dateVal = item.purchase_date || item.transaction_date || item.deposit_date || item.created_at;
    if (!dateVal) return total;
    const d = new Date(dateVal);
    if (isNaN(d.getTime()) || d < cutoff) return total;
    return total + Number(item.amount || 0);
  }, 0).toFixed(2));
}

/* ── State helpers ── */

function loadDashboardState() {
  const saved = localStorage.getItem(STATE_KEY);
  const defaults = {
    user_profile: { total_monthly_budget: 0, remaining_monthly_budget: 0, currency: "USD", last_synced: null },
    ledger: [],
    recurring_payments: [],
    categories: { system: ["Food", "Shopping", "Bills", "Entertainment", "Transport"], user: [] },
  };
  if (!saved) return defaults;
  try {
    return { ...defaults, ...JSON.parse(saved) };
  } catch {
    return defaults;
  }
}

/* ── UI helpers ── */

function setLoginStatus(msg, isError) {
  els.loginStatus.textContent = msg;
  els.loginStatus.style.display = msg ? "block" : "none";
  els.loginStatus.className = "login-status" + (isError ? " login-error" : "");
}

function renderAccountDetails(summary, accountId) {
  const items = [
    { label: "Account ID", value: accountId },
    { label: "Account Name", value: summary.accountName },
    { label: "Type", value: summary.accountType },
    { label: "Balance", value: `$${Number(summary.balance).toFixed(2)}` },
    { label: "Income (30d)", value: `$${Number(summary.incomeLast30).toFixed(2)}` },
    { label: "Spend (30d)", value: `$${Number(summary.spendLast30).toFixed(2)}` },
  ];
  els.accountDetails.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<span>${item.label}</span><small>${item.value}</small>`;
    els.accountDetails.appendChild(row);
  });
}

/* ── Liquid background ── */

(function initLiquidBackground() {
  const root = document.documentElement;
  const shardLayer = document.getElementById("shardLayer");
  const bubbleLayer = document.getElementById("bubbleLayer");
  if (!shardLayer) return;
  const variants = ["", "rhombus", "kite", "sliver", "blade"];
  const tints = [
    { a: "rgba(196,234,227,0.55)", b: "rgba(168,210,252,0.55)", c: "rgba(236,250,246,0.45)", border: "rgba(47,122,191,0.18)" },
    { a: "rgba(180,236,255,0.6)", b: "rgba(152,214,255,0.5)", c: "rgba(226,243,255,0.45)", border: "rgba(47,122,191,0.22)" },
    { a: "rgba(191,240,224,0.6)", b: "rgba(120,208,192,0.55)", c: "rgba(229,250,243,0.45)", border: "rgba(46,143,127,0.22)" },
    { a: "rgba(236,248,255,0.6)", b: "rgba(190,222,252,0.55)", c: "rgba(240,249,255,0.45)", border: "rgba(103,153,216,0.2)" },
  ];
  const shards = Array.from({ length: 12 }, () => {
    const el = document.createElement("div");
    const v = variants[Math.floor(Math.random() * variants.length)];
    el.className = v ? `shard ${v}` : "shard";
    const t = tints[Math.floor(Math.random() * tints.length)];
    const size = 80 + Math.random() * 140;
    el.style.setProperty("--size", `${size}px`);
    el.style.setProperty("--rotate", `${-20 + Math.random() * 40}deg`);
    el.style.setProperty("--hue", `${Math.floor(Math.random() * 360)}deg`);
    el.style.setProperty("--tilt-x", `${-8 + Math.random() * 16}deg`);
    el.style.setProperty("--tilt-y", `${-10 + Math.random() * 20}deg`);
    el.style.setProperty("--shard-tint", t.a);
    el.style.setProperty("--shard-tint-2", t.b);
    el.style.setProperty("--shard-tint-3", t.c);
    el.style.setProperty("--shard-border", t.border);
    const prism = document.createElement("span"); prism.className = "prism";
    const edge = document.createElement("span"); edge.className = "edge";
    const thick = document.createElement("span"); thick.className = "thickness";
    el.appendChild(prism); el.appendChild(edge); el.appendChild(thick);
    shardLayer.appendChild(el);
    const pos = { baseX: Math.random() * window.innerWidth, baseY: Math.random() * window.innerHeight, offsetX: 0, offsetY: 0, targetX: 0, targetY: 0, el };
    return pos;
  });
  let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let lastBubble = 0;
  window.addEventListener("pointermove", (e) => {
    root.style.setProperty("--liquid-x", `${(e.clientX / window.innerWidth * 100).toFixed(2)}%`);
    root.style.setProperty("--liquid-y", `${(e.clientY / window.innerHeight * 100).toFixed(2)}%`);
    pointer = { x: e.clientX, y: e.clientY };
    if (bubbleLayer && Date.now() - lastBubble > 40) {
      lastBubble = Date.now();
      const b = document.createElement("div");
      b.className = "bubble";
      b.style.setProperty("--bubble-size", `${6 + Math.random() * 16}px`);
      b.style.left = `${e.clientX}px`;
      b.style.top = `${e.clientY}px`;
      bubbleLayer.appendChild(b);
      b.addEventListener("animationend", () => b.remove());
    }
    shards.forEach((s) => {
      const dx = s.baseX + s.offsetX - e.clientX;
      const dy = s.baseY + s.offsetY - e.clientY;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < 180) { const str = (180 - d) / 180; s.targetX = dx / d * str * 60; s.targetY = dy / d * str * 60; }
    });
  });
  (function tick() {
    shards.forEach((s) => {
      s.offsetX += (s.targetX - s.offsetX) * 0.08;
      s.offsetY += (s.targetY - s.offsetY) * 0.08;
      s.targetX *= 0.92; s.targetY *= 0.92;
      s.el.style.setProperty("--x", `${s.baseX + s.offsetX}px`);
      s.el.style.setProperty("--y", `${s.baseY + s.offsetY}px`);
    });
    requestAnimationFrame(tick);
  })();
})();
