const UBER_EATS_VENDOR = "Uber Eats";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "NUDGEPAY_GET_TOTAL") {
    return;
  }

  const total = findUberEatsTotal();
  sendResponse({ vendor: UBER_EATS_VENDOR, total });
});

function findUberEatsTotal() {
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
