const els = {
  vendorBadge: document.getElementById("vendorBadge"),
  detectedTotal: document.getElementById("detectedTotal"),
  monthlyBudget: document.getElementById("monthlyBudget"),
  predictedBalance: document.getElementById("predictedBalance"),
  statusMessage: document.getElementById("statusMessage"),
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

function getBudget() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["user_profile"], (result) => {
      const budget = Number(result?.user_profile?.total_monthly_budget || 0);
      resolve(Number(budget.toFixed(2)));
    });
  });
}

function setStatus(message) {
  els.statusMessage.textContent = message;
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}
