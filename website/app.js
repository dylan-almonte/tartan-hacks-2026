const EXTENSION_ID = "TODO_EXTENSION_ID"; // TODO: replace with the real extension id

const STATE_KEY = "nudgepay_dashboard_state";

const defaultState = {
  user_profile: {
    total_monthly_budget: 0,
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
};

const state = loadState();
renderState();

els.budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(els.budgetAmount.value || 0);
  const currency = els.budgetCurrency.value || "USD";
  state.user_profile.total_monthly_budget = Number(amount.toFixed(2));
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

function removePayment(id) {
  state.recurring_payments = state.recurring_payments.filter((item) => item.id !== id);
  persistState();
  renderState();
}

function renderState() {
  els.budgetAmount.value = state.user_profile.total_monthly_budget || "";
  els.budgetCurrency.value = state.user_profile.currency || "USD";

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

function setStatus(message, success) {
  els.syncStatus.textContent = message;
  els.syncStatus.classList.toggle("synced", Boolean(success));
}
