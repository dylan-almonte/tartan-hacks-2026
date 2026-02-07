const els = {
  vendorBadge: document.getElementById("vendorBadge"),
  detectedTotal: document.getElementById("detectedTotal"),
  monthlyBudget: document.getElementById("monthlyBudget"),
  predictedBalance: document.getElementById("predictedBalance"),
  statusMessage: document.getElementById("statusMessage"),
  checkoutButton: document.getElementById("checkoutButton"),
};

init();

async function init() {
  const budget = await getBudget();
  els.monthlyBudget.textContent = formatMoney(budget);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active tab found.");
    return;
  }

  const response = await sendMessageToTab(tab.id, { type: "NUDGEPAY_GET_TOTAL" });

  if (!response?.total) {
    setStatus("No checkout total detected on this page.");
    return;
  }

  const total = Number(response.total);
  const predicted = Number((budget - total).toFixed(2));
  els.vendorBadge.textContent = response.vendor || "Checkout";
  els.detectedTotal.textContent = formatMoney(total);
  els.predictedBalance.textContent = formatMoney(predicted);
  els.checkoutButton.disabled = false;
  els.checkoutButton.addEventListener("click", () => simulateCheckout(total, response.vendor));
  setStatus("Prediction ready. Proceed with caution.");
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}

async function getBudget() {
  const stored = await new Promise((resolve) => {
    chrome.storage.local.get(["user_profile"], (result) => {
      const budget = Number(result?.user_profile?.total_monthly_budget || 0);
      resolve(Number(budget.toFixed(2)));
    });
  });

  if (stored > 0) {
    return stored;
  }

  const summary = await getNessieSummary();
  if (summary?.balance) {
    return Number(summary.balance.toFixed(2));
  }

  return 0;
}

function getNessieSummary() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "NUDGEPAY_NESSIE_GET_SUMMARY" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus(response?.error || "Nessie summary unavailable.");
        resolve(null);
        return;
      }
      resolve(response.summary || null);
    });
  });
}

function simulateCheckout(amount, vendor) {
  els.checkoutButton.disabled = true;
  chrome.runtime.sendMessage(
    {
      type: "NUDGEPAY_NESSIE_CHECKOUT",
      payload: { amount, vendor },
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus(response?.error || "Nessie checkout failed.");
        els.checkoutButton.disabled = false;
        return;
      }
      setStatus("Checkout simulated in Nessie.");
      els.checkoutButton.disabled = false;
    }
  );
}

function setStatus(message) {
  els.statusMessage.textContent = message;
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}
