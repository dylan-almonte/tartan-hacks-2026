const AMAZON_VENDOR = "Amazon";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "NUDGEPAY_GET_TOTAL") {
    return;
  }

  const total = findAmazonTotal();
  sendResponse({ vendor: AMAZON_VENDOR, total });
});

function findAmazonTotal() {
  const labelTotal = findTotalByLabel("order total");
  if (labelTotal !== null) {
    return labelTotal;
  }

  const summaryContainers = [
    "#subtotals-marketplace-table",
    "#orderSummary",
    "#checkout-summary",
    "#subtotals-table",
    ".order-summary",
  ];

  for (const selector of summaryContainers) {
    const container = document.querySelector(selector);
    if (!container) continue;
    const match = container.textContent.match(/\$\s?[\d,.]+/);
    if (match) return parseMoney(match[0]);
  }

  const bodyMatch = document.body.innerText.match(/Order total[^$]*\$\s?[\d,.]+/i);
  if (bodyMatch) {
    const priceMatch = bodyMatch[0].match(/\$\s?[\d,.]+/);
    if (priceMatch) return parseMoney(priceMatch[0]);
  }

  return null;
}

function findTotalByLabel(labelText) {
  const candidates = Array.from(document.querySelectorAll("span, div, td, th"))
    .filter((el) => el.childElementCount === 0)
    .filter((el) => el.textContent && el.textContent.trim().toLowerCase().startsWith(labelText));

  for (const label of candidates) {
    const container = label.closest("tr, .a-row, .a-section, div");
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
