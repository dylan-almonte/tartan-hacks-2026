const EXTENSION_ID = CONFIG.EXTENSION_ID;

const STATE_KEY = "nudgepay_dashboard_state";
const SESSION_KEY = "nudgepay_session";
const DEFAULT_BUDGET = 500;

const defaultState = {
  user_profile: {
    total_monthly_budget: 0,
    remaining_monthly_budget: 0,
    currency: "USD",
    last_synced: null,
  },
  ledger: [],
  recurring_payments: [],
  categories: {
    system: ["Food", "Shopping", "Bills", "Entertainment", "Transport"],
    user: [],
  },
};

const els = {
  budgetForm: document.getElementById("budgetForm"),
  budgetAmount: document.getElementById("budgetAmount"),
  budgetCurrency: document.getElementById("budgetCurrency"),
  budgetRemaining: document.getElementById("budgetRemaining"),
  recurringForm: document.getElementById("recurringForm"),
  vendor: document.getElementById("vendor"),
  amount: document.getElementById("amount"),
  category: document.getElementById("category"),
  frequency: document.getElementById("frequency"),
  billingDay: document.getElementById("billingDay"),
  type: document.getElementById("type"),
  paymentsList: document.getElementById("paymentsList"),
  syncButton: document.getElementById("syncButton"),
  resetButton: document.getElementById("resetButton"),
  payloadPreview: document.getElementById("payloadPreview"),
  syncStatus: document.getElementById("syncStatus"),
  nessieForm: document.getElementById("nessieForm"),
  nessieSavings: document.getElementById("nessieSavings"),
  nessieAllocation: document.getElementById("nessieAllocation"),
  nessieApplyBudget: document.getElementById("nessieApplyBudget"),
  logoutLink: document.getElementById("logoutLink"),
  accountName: document.getElementById("accountName"),
  accountId: document.getElementById("accountId"),
  accountBalance: document.getElementById("accountBalance"),
  accountBudget: document.getElementById("accountBudget"),
  accountBudgetRemaining: document.getElementById("accountBudgetRemaining"),
};

enforceSession();
const state = loadState();
ensureDefaultBudget();
renderState();
initLiquidBackground();
initExtensionUpdates();
initAccountSummary();

els.budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(els.budgetAmount.value || 0);
  const currency = els.budgetCurrency.value || "USD";
  state.user_profile.total_monthly_budget = Number(amount.toFixed(2));
  state.user_profile.remaining_monthly_budget = Number(amount.toFixed(2));
  state.user_profile.currency = currency;
  persistState();
  renderState();
});

els.recurringForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const payment = {
    id: `rec_${Date.now()}`,
    vendor: els.vendor.value.trim(),
    amount: Number(Number(els.amount.value || 0).toFixed(2)),
    category: els.category.value.trim(),
    frequency: els.frequency.value,
    billing_day: Number(els.billingDay.value),
    type: els.type.value,
    active: true,
    last_generated: new Date().toISOString(),
  };

  state.recurring_payments.push(payment);
  persistState();
  els.recurringForm.reset();
  renderState();
});

els.syncButton.addEventListener("click", async () => {
  await syncToExtension();
});

els.resetButton.addEventListener("click", () => {
  localStorage.removeItem(STATE_KEY);
  Object.assign(state, structuredClone(defaultState));
  renderState();
});

if (els.logoutLink) {
  els.logoutLink.addEventListener("click", (event) => {
    event.preventDefault();
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(STATE_KEY);
    window.location.href = "login.html";
  });
}

els.nessieApplyBudget.addEventListener("click", () => {
  const summary = state.user_profile.last_nessie_summary;
  const savings = Number(els.nessieSavings.value || 0);
  const allocationPercent = Number(els.nessieAllocation.value || 30);
  const income = Number(summary?.incomeLast30 || 0);
  const balance = Number(summary?.balance || 0);
  const base = income > 0 ? income - savings : balance - savings || DEFAULT_BUDGET;
  const allocation = Math.min(100, Math.max(0, allocationPercent)) / 100;
  const suggested = Math.max(0, Math.min(balance || base, base * allocation));
  state.user_profile.total_monthly_budget = Number(suggested.toFixed(2));
  state.user_profile.remaining_monthly_budget = Number(suggested.toFixed(2));
  persistState();
  renderState();
  setStatus("Suggested budget applied.", true);
});

function removePayment(id) {
  state.recurring_payments = state.recurring_payments.filter((item) => item.id !== id);
  persistState();
  renderState();
}

function renderState() {
  els.budgetAmount.value = state.user_profile.total_monthly_budget || "";
  els.budgetCurrency.value = state.user_profile.currency || "USD";

  recomputeRemainingBudget();
  if (els.budgetRemaining) {
    const remaining = Number(state.user_profile.remaining_monthly_budget || 0);
    els.budgetRemaining.textContent = formatMoney(remaining);
    els.budgetRemaining.classList.toggle("budget-positive", remaining >= 0);
    els.budgetRemaining.classList.toggle("budget-negative", remaining < 0);
  }

  els.paymentsList.innerHTML = "";
  state.recurring_payments.forEach((payment) => {
    const item = document.createElement("div");
    item.className = "list-item";

    const info = document.createElement("div");
    info.innerHTML = `
      <span>${payment.vendor} • $${payment.amount.toFixed(2)}</span>
      <div><small>${payment.category} · ${payment.frequency} · Day ${payment.billing_day}</small></div>
    `;

    const button = document.createElement("button");
    button.textContent = "Remove";
    button.addEventListener("click", () => removePayment(payment.id));

    item.appendChild(info);
    item.appendChild(button);
    els.paymentsList.appendChild(item);
  });

  els.payloadPreview.textContent = JSON.stringify(state, null, 2);
  updateAccountSummary();
}

function persistState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem(STATE_KEY);
  if (!saved) {
    return structuredClone(defaultState);
  }
  try {
    const parsed = JSON.parse(saved);
    return { ...structuredClone(defaultState), ...parsed };
  } catch (error) {
    return structuredClone(defaultState);
  }
}

function enforceSession() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) {
    window.location.href = "login.html";
    return;
  }
  try {
    const parsed = JSON.parse(session);
    if (!parsed?.apiKey || !parsed?.accountId) {
      localStorage.removeItem(SESSION_KEY);
      window.location.href = "login.html";
    }
  } catch {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "login.html";
  }
}

function ensureDefaultBudget() {
  if (!state.user_profile.total_monthly_budget) {
    state.user_profile.total_monthly_budget = DEFAULT_BUDGET;
    state.user_profile.remaining_monthly_budget = DEFAULT_BUDGET;
    persistState();
  }
}

async function syncToExtension() {
  if (!window.chrome?.runtime?.sendMessage) {
    setStatus("Chrome extension APIs unavailable", false);
    return;
  }

  state.user_profile.last_synced = new Date().toISOString();

  const payload = {
    type: "NUDGEPAY_SET_DATA",
    payload: state,
  };

  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(EXTENSION_ID, payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response);
      });
    });

    persistState();
    renderState();
    setStatus("Synced to extension", true);
  } catch (error) {
    setStatus(`Sync failed: ${error.message || error}`, false);
  }
}

function sendExtensionMessage(type, payload) {
  if (!window.chrome?.runtime?.sendMessage) {
    return Promise.resolve({ ok: false, error: "Chrome extension APIs unavailable" });
  }
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(EXTENSION_ID, { type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "No response" });
    });
  });
}

function initExtensionUpdates() {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "nudgepay-extension") return;
    const message = data.payload;
    if (!message?.type) return;

    if (message.type === "NUDGEPAY_NESSIE_PURCHASE") {
      if (message.summary) {
        state.user_profile.last_nessie_summary = message.summary;
        renderNessieSummary(message.summary);
        persistState();
      }
      const amount = Number(message.amount ?? message.purchase?.amount ?? 0);
      const vendor = message.vendor || message.purchase?.description || "Purchase";
      const category = message.category || "Shopping";
      const ledgerEntry = {
        id: `txn_${Date.now()}`,
        date: new Date().toISOString(),
        amount: Number(amount.toFixed(2)),
        vendor,
        category,
        type: "Variable",
        source: "extension",
        status: "confirmed",
      };
      state.ledger = [ledgerEntry, ...(state.ledger || [])];
      recomputeRemainingBudget();
      persistState();
      renderState();
      setStatus(`Nessie updated: ${vendor} $${amount.toFixed(2)}`, true);
      return;
    }

    if (message.type === "NUDGEPAY_NESSIE_SUMMARY") {
      state.user_profile.last_nessie_summary = message.summary;
      renderNessieSummary(message.summary);
      persistState();
      setStatus("Nessie summary updated.", true);
    }
  });
}

function setStatus(message, success) {
  els.syncStatus.textContent = message;
  els.syncStatus.classList.toggle("synced", Boolean(success));
}

function renderNessieSummary(summary) {
  if (!summary) return;
  updateAccountSummary();
}

function initAccountSummary() {
  const session = getSession();
  if (!session?.apiKey || !session?.accountId) {
    updateAccountSummary();
    return;
  }

  sendExtensionMessage("NUDGEPAY_NESSIE_SET_CONFIG", {
    apiKey: session.apiKey,
    accountId: session.accountId,
  }).then(() => sendExtensionMessage("NUDGEPAY_NESSIE_GET_SUMMARY"))
    .then((response) => {
      if (response?.ok && response.summary) {
        state.user_profile.last_nessie_summary = response.summary;
        persistState();
        updateAccountSummary();
      }
    });
}

function updateAccountSummary() {
  if (els.accountName) {
    els.accountName.textContent = state.user_profile.last_nessie_summary?.accountName || "--";
  }
  if (els.accountId) {
    const accountId = state.user_profile.last_nessie_summary?.accountId || getSession()?.accountId || "--";
    els.accountId.textContent = `Account ID: ${accountId}`;
  }
  if (els.accountBalance) {
    els.accountBalance.textContent = formatMoney(state.user_profile.last_nessie_summary?.balance || 0);
  }
  if (els.accountBudget) {
    els.accountBudget.textContent = formatMoney(state.user_profile.total_monthly_budget || DEFAULT_BUDGET);
  }
  if (els.accountBudgetRemaining) {
    const remaining = Number(state.user_profile.remaining_monthly_budget || DEFAULT_BUDGET);
    els.accountBudgetRemaining.textContent = formatMoney(remaining);
    els.accountBudgetRemaining.classList.toggle("budget-positive", remaining >= 0);
    els.accountBudgetRemaining.classList.toggle("budget-negative", remaining < 0);
  }
}

function recomputeRemainingBudget() {
  const totalBudget = Number(state.user_profile.total_monthly_budget || DEFAULT_BUDGET);
  const recurringTotal = getRecurringMonthlyTotal(state.recurring_payments || []);
  const ledgerTotal = getCurrentMonthLedgerTotal(state.ledger || []);
  const remaining = Number((totalBudget - recurringTotal - ledgerTotal).toFixed(2));
  state.user_profile.remaining_monthly_budget = remaining;
}

function getRecurringMonthlyTotal(recurring) {
  return recurring.reduce((sum, item) => {
    if (item.active === false) return sum;
    const amount = Number(item.amount || 0);
    switch (item.frequency) {
      case "weekly":
        return sum + amount * 4;
      case "yearly":
        return sum + amount / 12;
      case "monthly":
      default:
        return sum + amount;
    }
  }, 0);
}

function getCurrentMonthLedgerTotal(ledger) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return ledger.reduce((sum, item) => {
    if (!item?.date || item.date.slice(0, 7) !== ym) return sum;
    return sum + Number(item.amount || 0);
  }, 0);
}

function getSession() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
}

function initLiquidBackground() {
  const root = document.documentElement;
  const shardLayer = document.getElementById("shardLayer");
  const bubbleLayer = document.getElementById("bubbleLayer");
  const shards = createShards(shardLayer, 18);
  let lastBubble = 0;
  let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  const update = (event) => {
    const x = (event.clientX / window.innerWidth) * 100;
    const y = (event.clientY / window.innerHeight) * 100;
    root.style.setProperty("--liquid-x", `${x.toFixed(2)}%`);
    root.style.setProperty("--liquid-y", `${y.toFixed(2)}%`);
    pointer = { x: event.clientX, y: event.clientY };
    maybeSpawnBubble(bubbleLayer, event.clientX, event.clientY, () => (lastBubble = Date.now()), lastBubble);
    repelShards(shards, pointer);
  };

  window.addEventListener("pointermove", update);
  window.addEventListener("resize", () => resetShards(shards));
  animateShards(shards, () => pointer);
}

function createShards(layer, count) {
  if (!layer) return [];
  const variants = ["", "rhombus", "kite", "sliver", "blade"];
  const tints = [
    { a: "rgba(196, 234, 227, 0.55)", b: "rgba(168, 210, 252, 0.55)", c: "rgba(236, 250, 246, 0.45)", border: "rgba(47, 122, 191, 0.18)" },
    { a: "rgba(180, 236, 255, 0.6)", b: "rgba(152, 214, 255, 0.5)", c: "rgba(226, 243, 255, 0.45)", border: "rgba(47, 122, 191, 0.22)" },
    { a: "rgba(191, 240, 224, 0.6)", b: "rgba(120, 208, 192, 0.55)", c: "rgba(229, 250, 243, 0.45)", border: "rgba(46, 143, 127, 0.22)" },
    { a: "rgba(236, 248, 255, 0.6)", b: "rgba(190, 222, 252, 0.55)", c: "rgba(240, 249, 255, 0.45)", border: "rgba(103, 153, 216, 0.2)" },
    { a: "rgba(210, 236, 255, 0.6)", b: "rgba(120, 185, 255, 0.5)", c: "rgba(233, 245, 255, 0.45)", border: "rgba(90, 140, 210, 0.22)" },
    { a: "rgba(200, 245, 233, 0.6)", b: "rgba(112, 209, 184, 0.55)", c: "rgba(232, 252, 245, 0.45)", border: "rgba(62, 155, 130, 0.22)" },
    { a: "rgba(234, 238, 255, 0.6)", b: "rgba(173, 190, 255, 0.5)", c: "rgba(241, 244, 255, 0.45)", border: "rgba(120, 130, 210, 0.22)" },
    { a: "rgba(230, 248, 236, 0.6)", b: "rgba(160, 230, 196, 0.5)", c: "rgba(240, 252, 246, 0.45)", border: "rgba(110, 180, 150, 0.22)" },
    { a: "rgba(226, 240, 255, 0.6)", b: "rgba(140, 200, 235, 0.5)", c: "rgba(239, 248, 255, 0.45)", border: "rgba(85, 150, 205, 0.22)" },
    { a: "rgba(255, 231, 239, 0.6)", b: "rgba(244, 189, 214, 0.5)", c: "rgba(255, 244, 248, 0.45)", border: "rgba(214, 140, 176, 0.22)" },
    { a: "rgba(255, 244, 221, 0.6)", b: "rgba(241, 211, 160, 0.5)", c: "rgba(255, 250, 238, 0.45)", border: "rgba(214, 174, 110, 0.22)" },
    { a: "rgba(234, 255, 235, 0.6)", b: "rgba(182, 238, 189, 0.5)", c: "rgba(244, 255, 245, 0.45)", border: "rgba(140, 200, 150, 0.22)" },
    { a: "rgba(238, 233, 255, 0.6)", b: "rgba(198, 185, 255, 0.5)", c: "rgba(246, 242, 255, 0.45)", border: "rgba(150, 135, 220, 0.22)" },
    { a: "rgba(225, 249, 255, 0.6)", b: "rgba(170, 230, 244, 0.5)", c: "rgba(241, 252, 255, 0.45)", border: "rgba(120, 180, 195, 0.22)" },
    { a: "rgba(255, 239, 230, 0.6)", b: "rgba(242, 199, 173, 0.5)", c: "rgba(255, 247, 241, 0.45)", border: "rgba(214, 160, 132, 0.22)" },
  ];
  const shards = Array.from({ length: count }, () => {
    const el = document.createElement("div");
    const variant = variants[Math.floor(Math.random() * variants.length)];
    el.className = variant ? `shard ${variant}` : "shard";
    const tint = tints[Math.floor(Math.random() * tints.length)];
    const sizeBase = 80 + Math.random() * 140;
    const size = variant === "sliver" || variant === "blade" ? sizeBase * 0.7 : sizeBase;
    const hue = Math.floor(Math.random() * 360);
    const strongTilt = Math.random() > 0.6;
    const tiltX = strongTilt ? -18 + Math.random() * 36 : -8 + Math.random() * 16;
    const tiltY = strongTilt ? -22 + Math.random() * 44 : -10 + Math.random() * 20;
    const edgeDepth = strongTilt ? 10 + Math.random() * 10 : 6 + Math.random() * 6;
    const thicknessX = strongTilt ? 12 + Math.random() * 10 : 6 + Math.random() * 6;
    const thicknessY = strongTilt ? 10 + Math.random() * 8 : 5 + Math.random() * 5;
    const prism = document.createElement("span");
    prism.className = "prism";
    const edge = document.createElement("span");
    edge.className = "edge";
    const thickness = document.createElement("span");
    thickness.className = "thickness";
    el.appendChild(prism);
    el.appendChild(edge);
    el.appendChild(thickness);
    const rotate = -20 + Math.random() * 40;
    const position = {
      baseX: Math.random() * window.innerWidth,
      baseY: Math.random() * window.innerHeight,
      offsetX: 0,
      offsetY: 0,
      targetX: 0,
      targetY: 0,
      size,
      rotate,
      el,
    };
    el.style.setProperty("--size", `${size}px`);
    el.style.setProperty("--rotate", `${rotate}deg`);
    el.style.setProperty("--hue", `${hue}deg`);
    el.style.setProperty("--tilt-x", `${tiltX}deg`);
    el.style.setProperty("--tilt-y", `${tiltY}deg`);
    el.style.setProperty("--edge-depth", `${edgeDepth}px`);
    el.style.setProperty("--thickness-x", `${thicknessX}px`);
    el.style.setProperty("--thickness-y", `${thicknessY}px`);
    el.style.setProperty("--shard-tint", tint.a);
    el.style.setProperty("--shard-tint-2", tint.b);
    el.style.setProperty("--shard-tint-3", tint.c);
    el.style.setProperty("--shard-border", tint.border);
    layer.appendChild(el);
    return position;
  });

  resetShards(shards);
  return shards;
}

function resetShards(shards) {
  shards.forEach((shard) => {
    shard.baseX = Math.random() * window.innerWidth;
    shard.baseY = Math.random() * window.innerHeight;
  });
}

function repelShards(shards, pointer) {
  const radius = 180;
  shards.forEach((shard) => {
    const dx = shard.baseX + shard.offsetX - pointer.x;
    const dy = shard.baseY + shard.offsetY - pointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0 && distance < radius) {
      const strength = (radius - distance) / radius;
      shard.targetX = dx / distance * strength * 60;
      shard.targetY = dy / distance * strength * 60;
    }
  });
}

function animateShards(shards, getPointer) {
  const tick = () => {
    const pointer = getPointer();
    shards.forEach((shard) => {
      shard.offsetX += (shard.targetX - shard.offsetX) * 0.08;
      shard.offsetY += (shard.targetY - shard.offsetY) * 0.08;
      shard.targetX *= 0.92;
      shard.targetY *= 0.92;

      shard.el.style.setProperty("--x", `${shard.baseX + shard.offsetX}px`);
      shard.el.style.setProperty("--y", `${shard.baseY + shard.offsetY}px`);
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function maybeSpawnBubble(layer, x, y, setLast, lastBubble) {
  if (!layer) return;
  const now = Date.now();
  if (now - lastBubble < 40) return;
  setLast();

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const size = 6 + Math.random() * 16;
  bubble.style.setProperty("--bubble-size", `${size}px`);
  bubble.style.left = `${x}px`;
  bubble.style.top = `${y}px`;
  layer.appendChild(bubble);
  bubble.addEventListener("animationend", () => bubble.remove());
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}
