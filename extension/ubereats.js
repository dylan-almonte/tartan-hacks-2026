const UBER_EATS_VENDOR = "Uber Eats";
const BANNER_ID = "nudgepay-banner";
let lastTotal = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "NUDGEPAY_GET_TOTAL") {
    return;
  }

  const total = findUberEatsTotal();
  sendResponse({ vendor: UBER_EATS_VENDOR, total });
});

bootstrapBanner();

function findUberEatsTotal() {
  const breakdownTotal = findBreakdownTotal();
  if (breakdownTotal !== null) {
    return breakdownTotal;
  }

  const fareTotal = findFareBreakdownTotal();
  if (fareTotal !== null) {
    return fareTotal;
  }

  const labelTotal = findTotalByLabel("total");
  if (labelTotal !== null) {
    return labelTotal;
  }

  const summary = document.querySelector("[data-testid*='checkout']") || document.querySelector("main");
  if (summary) {
    const text = summary.innerText;
    const match = text.match(/Total[^$]*\$\s?[\d,.]+/i);
    if (match) {
      const priceMatch = match[0].match(/\$\s?[\d,.]+/);
      if (priceMatch) return parseMoney(priceMatch[0]);
    }
  }

  return null;
}

function findBreakdownTotal() {
  const breakdown = document.querySelector('[data-test="fare-breakdown"]');
  if (!breakdown) return null;

  const totalLabel = breakdown.querySelector('[data-testid="fare-breakdown-total-label"]');
  if (!totalLabel) return null;

  const row = totalLabel.closest("div");
  if (row) {
    const rowMatch = row.textContent.match(/\$\s?[\d,.]+/);
    if (rowMatch) return parseMoney(rowMatch[0]);
  }

  const textMatch = breakdown.textContent.match(/Total[^$]*\$\s?[\d,.]+/i);
  if (textMatch) {
    const priceMatch = textMatch[0].match(/\$\s?[\d,.]+/);
    if (priceMatch) return parseMoney(priceMatch[0]);
  }

  return null;
}

function findFareBreakdownTotal() {
  const label = document.querySelector('[data-testid="fare-breakdown-total-label"]');
  if (!label) return null;

  const row = label.closest("div");
  if (!row) return null;

  const priceMatch = row.textContent.match(/\$\s?[\d,.]+/);
  if (priceMatch) return parseMoney(priceMatch[0]);

  const next = row.nextElementSibling;
  if (next) {
    const nextMatch = next.textContent.match(/\$\s?[\d,.]+/);
    if (nextMatch) return parseMoney(nextMatch[0]);
  }

  return null;
}

function findTotalByLabel(labelText) {
  const candidates = Array.from(document.querySelectorAll("span, div, p"))
    .filter((el) => el.childElementCount === 0)
    .filter((el) => el.textContent && el.textContent.trim().toLowerCase() === labelText);

  for (const label of candidates) {
    const container = label.closest("div, li, section");
    if (!container) continue;
    const match = container.textContent.match(/\$\s?[\d,.]+/);
    if (match) return parseMoney(match[0]);
  }

  return null;
}

function parseMoney(text) {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  return Number(value.toFixed(2));
}

function bootstrapBanner() {
  const observer = new MutationObserver(() => {
    const total = findUberEatsTotal();
    if (total === null) return;
    updateBanner(total);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  const initial = findUberEatsTotal();
  if (initial !== null) {
    updateBanner(initial);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes.user_profile) return;
    if (lastTotal === null) return;
    updateBanner(lastTotal);
  });
}

function updateBanner(total) {
  lastTotal = total;
  chrome.storage.local.get(["user_profile"], (result) => {
    const profile = result?.user_profile || {};
    const budget = getActiveBudget(profile);
    const predicted = Number((budget - total).toFixed(2));
    const banner = ensureBanner();
    banner.querySelector(".nudgepay-total").textContent = formatMoney(total);
    banner.querySelector(".nudgepay-budget").textContent = formatMoney(budget);
    banner.querySelector(".nudgepay-predicted").textContent = formatMoney(predicted);
  });
}

function getActiveBudget(profile) {
  const remaining = Number(profile.remaining_monthly_budget || 0);
  if (remaining > 0) return Number(remaining.toFixed(2));
  const total = Number(profile.total_monthly_budget || 0);
  return Number(total.toFixed(2));
}

function ensureBanner() {
  let banner = document.getElementById(BANNER_ID);
  if (banner) return banner;

  banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.innerHTML = `
    <div class="nudgepay-card">
      <strong>NudgePay warning</strong>
      <div>Total: <span class="nudgepay-total">--</span></div>
      <div>Budget: <span class="nudgepay-budget">--</span></div>
      <div>Predicted: <span class="nudgepay-predicted">--</span></div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #${BANNER_ID} {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 99999;
      font-family: "Inter", "Segoe UI", sans-serif;
    }
    #${BANNER_ID} .nudgepay-card {
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid rgba(46, 143, 127, 0.3);
      padding: 12px 14px;
      border-radius: 12px;
      box-shadow: 0 10px 24px rgba(14, 36, 32, 0.18);
      color: #0d2320;
      font-size: 12px;
      line-height: 1.4;
      min-width: 180px;
    }
    #${BANNER_ID} strong {
      display: block;
      margin-bottom: 6px;
    }
  `;

  document.documentElement.appendChild(style);
  document.documentElement.appendChild(banner);
  return banner;
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}
