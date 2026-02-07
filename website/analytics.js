const SESSION_KEY = "nudgepay_session";
const STATE_KEY = "nudgepay_dashboard_state";

// Auth guard
const _session = localStorage.getItem(SESSION_KEY);
if (!_session) {
  window.location.href = "login.html";
} else {
  try {
    const s = JSON.parse(_session);
    if (!s.apiKey || !s.accountId) window.location.href = "login.html";
  } catch { window.location.href = "login.html"; }
}

/* ── Fixed category color map ── */
const CATEGORY_COLORS = {
  Food:          { bg: "#e67e22", border: "#d35400" },
  Shopping:      { bg: "#3498db", border: "#2980b9" },
  Bills:         { bg: "#e74c3c", border: "#c0392b" },
  Entertainment: { bg: "#9b59b6", border: "#8e44ad" },
  Transport:     { bg: "#2e8f7f", border: "#1e6b60" },
  Uncategorized: { bg: "#95a5a6", border: "#7f8c8d" },
};
const FALLBACK_COLORS = [
  { bg: "#1abc9c", border: "#16a085" },
  { bg: "#f39c12", border: "#e67e22" },
  { bg: "#2c3e50", border: "#1a252f" },
  { bg: "#d35400", border: "#a04000" },
  { bg: "#c0392b", border: "#962d22" },
  { bg: "#27ae60", border: "#1e8449" },
  { bg: "#8e44ad", border: "#6c3483" },
];
let fallbackIdx = 0;

function colorFor(category) {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  const c = FALLBACK_COLORS[fallbackIdx % FALLBACK_COLORS.length];
  CATEGORY_COLORS[category] = c;
  fallbackIdx++;
  return c;
}

const els = {
  filterCategory: document.getElementById("filterCategory"),
  filterMonth: document.getElementById("filterMonth"),
  filterFrom: document.getElementById("filterFrom"),
  filterTo: document.getElementById("filterTo"),
  filterVendor: document.getElementById("filterVendor"),
  applyFilters: document.getElementById("applyFilters"),
  clearFilters: document.getElementById("clearFilters"),
  metricsGrid: document.getElementById("metricsGrid"),
  dailyChartSubtitle: document.getElementById("dailyChartSubtitle"),
  categoryList: document.getElementById("categoryList"),
  totalSpend: document.getElementById("totalSpend"),
  txnBody: document.getElementById("txnBody"),
  txnCount: document.getElementById("txnCount"),
  generateDemo: document.getElementById("generateDemo"),
  clearLedger: document.getElementById("clearLedger"),
  demoStatus: document.getElementById("demoStatus"),
};

let dailyChart = null;
let categoryChart = null;
let vendorChart = null;
let typeChart = null;

const state = loadState();

// default the month picker to the current month
const now = new Date();
els.filterMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

populateCategoryFilter();
renderAll();
initLiquidBackground();

els.applyFilters.addEventListener("click", renderAll);
els.clearFilters.addEventListener("click", () => {
  els.filterCategory.value = "";
  els.filterMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  els.filterFrom.value = "";
  els.filterTo.value = "";
  els.filterVendor.value = "";
  renderAll();
});

els.generateDemo.addEventListener("click", () => {
  generateDemoTransactions();
  persistState();
  populateCategoryFilter();
  renderAll();
  els.demoStatus.textContent = `Generated demo transactions. Ledger now has ${state.ledger.length} entries.`;
});

els.clearLedger.addEventListener("click", () => {
  state.ledger = [];
  persistState();
  renderAll();
  els.demoStatus.textContent = "Ledger cleared.";
});

document.getElementById("logoutLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem(SESSION_KEY);
  window.location.href = "login.html";
});

/* ── State helpers ── */

function loadState() {
  const saved = localStorage.getItem(STATE_KEY);
  const defaults = {
    user_profile: { total_monthly_budget: 0, currency: "USD", last_synced: null },
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

function persistState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function getAllCategories() {
  const cats = new Set([...state.categories.system, ...state.categories.user]);
  state.ledger.forEach((t) => { if (t.category) cats.add(t.category); });
  state.recurring_payments.forEach((r) => { if (r.category) cats.add(r.category); });
  return [...cats].sort();
}

function populateCategoryFilter() {
  const current = els.filterCategory.value;
  els.filterCategory.innerHTML = '<option value="">All Categories</option>';
  getAllCategories().forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    els.filterCategory.appendChild(opt);
  });
  els.filterCategory.value = current;
}

/* ── Filtering ── */

function getFilteredLedger() {
  const catFilter = els.filterCategory.value;
  const monthFilter = els.filterMonth.value;
  const fromFilter = els.filterFrom.value;
  const toFilter = els.filterTo.value;
  const vendorFilter = els.filterVendor.value.trim().toLowerCase();

  return state.ledger.filter((txn) => {
    if (catFilter && txn.category !== catFilter) return false;
    if (monthFilter && txn.date.slice(0, 7) !== monthFilter) return false;
    if (fromFilter && txn.date < fromFilter) return false;
    if (toFilter && txn.date.slice(0, 10) > toFilter) return false;
    if (vendorFilter && !txn.vendor.toLowerCase().includes(vendorFilter)) return false;
    return true;
  });
}

/* ── Render orchestration ── */

function renderAll() {
  const filtered = getFilteredLedger();
  renderMetrics(filtered);
  renderDailyChart(filtered);
  renderCategoryChart(filtered);
  renderCategoryList(filtered);
  renderVendorChart(filtered);
  renderTypeChart(filtered);
  renderTransactionTable(filtered);
}

/* ── Metrics cards ── */

function renderMetrics(transactions) {
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  const count = transactions.length;
  const avg = count > 0 ? total / count : 0;

  // unique days with spending
  const days = new Set(transactions.map((t) => t.date.slice(0, 10)));
  const avgPerDay = days.size > 0 ? total / days.size : 0;

  // largest single purchase
  const largest = transactions.reduce((max, t) => t.amount > max.amount ? t : max, { amount: 0, vendor: "-" });

  // top vendor by total
  const vendorTotals = {};
  transactions.forEach((t) => { vendorTotals[t.vendor] = (vendorTotals[t.vendor] || 0) + t.amount; });
  const topVendor = Object.entries(vendorTotals).sort((a, b) => b[1] - a[1])[0];

  // fixed vs variable
  const fixed = transactions.filter((t) => t.type === "Fixed").reduce((s, t) => s + t.amount, 0);
  const variable = total - fixed;

  // budget remaining
  const budget = state.user_profile.total_monthly_budget;
  const remaining = budget > 0 ? budget - total : null;

  const metrics = [
    { label: "Total Spent", value: `$${total.toFixed(2)}` },
    { label: "Transactions", value: count },
    { label: "Avg per Transaction", value: `$${avg.toFixed(2)}` },
    { label: "Avg per Day", value: `$${avgPerDay.toFixed(2)}` },
    { label: "Largest Purchase", value: largest.amount > 0 ? `$${largest.amount.toFixed(2)} (${largest.vendor})` : "-" },
    { label: "Top Vendor", value: topVendor ? `${topVendor[0]} ($${topVendor[1].toFixed(2)})` : "-" },
    { label: "Fixed Costs", value: `$${fixed.toFixed(2)}` },
    { label: "Variable Costs", value: `$${variable.toFixed(2)}` },
  ];

  if (remaining !== null) {
    metrics.push({ label: "Budget Remaining", value: `$${remaining.toFixed(2)}`, warn: remaining < 0 });
  }

  els.metricsGrid.innerHTML = "";
  metrics.forEach((m) => {
    const card = document.createElement("div");
    card.className = "metric-card" + (m.warn ? " metric-warn" : "");
    card.innerHTML = `<span class="metric-value">${m.value}</span><span class="metric-label">${m.label}</span>`;
    els.metricsGrid.appendChild(card);
  });
}

/* ── Daily stacked bar chart (color-coded by category) ── */

function renderDailyChart(transactions) {
  const ctx = document.getElementById("dailyChart").getContext("2d");
  if (dailyChart) dailyChart.destroy();

  if (transactions.length === 0) {
    dailyChart = new Chart(ctx, { type: "bar", data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false } });
    return;
  }

  // determine day range
  const dates = transactions.map((t) => t.date.slice(0, 10)).sort();
  const minDate = new Date(dates[0]);
  const maxDate = new Date(dates[dates.length - 1]);

  // build all day labels in range
  const dayLabels = [];
  for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
    dayLabels.push(d.toISOString().slice(0, 10));
  }

  // aggregate: { category -> { day -> total } }
  const catDays = {};
  transactions.forEach((txn) => {
    const cat = txn.category || "Uncategorized";
    const day = txn.date.slice(0, 10);
    if (!catDays[cat]) catDays[cat] = {};
    catDays[cat][day] = (catDays[cat][day] || 0) + txn.amount;
  });

  const categories = Object.keys(catDays).sort();
  const datasets = categories.map((cat) => {
    const c = colorFor(cat);
    return {
      label: cat,
      data: dayLabels.map((d) => catDays[cat][d] || 0),
      backgroundColor: c.bg,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 3,
    };
  });

  // budget daily line
  const budget = state.user_profile.total_monthly_budget;
  if (budget > 0) {
    const daysInRange = dayLabels.length || 30;
    const dailyBudget = budget / daysInRange;
    datasets.push({
      label: "Daily Budget",
      data: dayLabels.map(() => dailyBudget),
      type: "line",
      borderColor: "#e74c3c",
      borderDash: [6, 4],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
    });
  }

  const monthLabel = els.filterMonth.value;
  els.dailyChartSubtitle.textContent = monthLabel
    ? `Daily spending for ${formatMonthLabel(monthLabel)}, stacked by category`
    : "Daily spending stacked by category";

  dailyChart = new Chart(ctx, {
    type: "bar",
    data: { labels: dayLabels.map((d) => formatDayLabel(d)), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            label: (tip) => `${tip.dataset.label}: $${tip.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { callback: (v) => `$${v}` },
        },
      },
    },
  });
}

/* ── Category doughnut (color-coded) ── */

function aggregateByCategory(transactions) {
  const cats = {};
  transactions.forEach((txn) => {
    const key = txn.category || "Uncategorized";
    cats[key] = (cats[key] || 0) + txn.amount;
  });
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  return { labels: sorted.map((e) => e[0]), data: sorted.map((e) => e[1]) };
}

function renderCategoryChart(transactions) {
  const { labels, data } = aggregateByCategory(transactions);
  const ctx = document.getElementById("categoryChart").getContext("2d");
  if (categoryChart) categoryChart.destroy();

  categoryChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map((cat) => colorFor(cat).bg),
        borderColor: labels.map((cat) => colorFor(cat).border),
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (tip) => {
              const total = tip.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((tip.parsed / total) * 100).toFixed(1) : 0;
              return `${tip.label}: $${tip.parsed.toFixed(2)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function renderCategoryList(transactions) {
  const { labels, data } = aggregateByCategory(transactions);
  const total = data.reduce((a, b) => a + b, 0);

  els.categoryList.innerHTML = "";
  labels.forEach((cat, i) => {
    const pct = total > 0 ? ((data[i] / total) * 100).toFixed(1) : 0;
    const c = colorFor(cat);
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <div>
        <span class="cat-dot" style="background:${c.bg}"></span>
        <span>${cat}</span>
      </div>
      <small>$${data[i].toFixed(2)} (${pct}%)</small>
    `;
    els.categoryList.appendChild(row);
  });

  els.totalSpend.innerHTML = `<strong>Total: $${total.toFixed(2)}</strong>`;
}

/* ── Top vendors horizontal bar ── */

function renderVendorChart(transactions) {
  const ctx = document.getElementById("vendorChart").getContext("2d");
  if (vendorChart) vendorChart.destroy();

  const vendorTotals = {};
  const vendorCat = {};
  transactions.forEach((t) => {
    vendorTotals[t.vendor] = (vendorTotals[t.vendor] || 0) + t.amount;
    if (!vendorCat[t.vendor]) vendorCat[t.vendor] = t.category || "Uncategorized";
  });

  const sorted = Object.entries(vendorTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const labels = sorted.map((e) => e[0]);
  const data = sorted.map((e) => e[1]);
  const bgColors = labels.map((v) => colorFor(vendorCat[v]).bg);
  const borderColors = labels.map((v) => colorFor(vendorCat[v]).border);

  vendorChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Spent",
        data,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (tip) => `$${tip.parsed.x.toFixed(2)}` },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { callback: (v) => `$${v}` } },
      },
    },
  });
}

/* ── Fixed vs Variable pie ── */

function renderTypeChart(transactions) {
  const ctx = document.getElementById("typeChart").getContext("2d");
  if (typeChart) typeChart.destroy();

  const fixed = transactions.filter((t) => t.type === "Fixed").reduce((s, t) => s + t.amount, 0);
  const variable = transactions.filter((t) => t.type !== "Fixed").reduce((s, t) => s + t.amount, 0);

  typeChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["Fixed / Recurring", "Variable"],
      datasets: [{
        data: [fixed, variable],
        backgroundColor: ["#e74c3c", "#2e8f7f"],
        borderColor: ["#c0392b", "#1e6b60"],
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (tip) => {
              const total = tip.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((tip.parsed / total) * 100).toFixed(1) : 0;
              return `${tip.label}: $${tip.parsed.toFixed(2)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ── Transaction table ── */

function renderTransactionTable(transactions) {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  els.txnBody.innerHTML = "";
  sorted.forEach((txn) => {
    const c = colorFor(txn.category || "Uncategorized");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(txn.date).toLocaleDateString()}</td>
      <td>${txn.vendor}</td>
      <td><span class="cat-dot" style="background:${c.bg}"></span>${txn.category}</td>
      <td>$${txn.amount.toFixed(2)}</td>
      <td>${txn.type || "Variable"}</td>
    `;
    els.txnBody.appendChild(tr);
  });

  els.txnCount.textContent = `${sorted.length} transaction${sorted.length !== 1 ? "s" : ""}`;
}

/* ── Formatting helpers ── */

function formatMonthLabel(ym) {
  const [y, m] = ym.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ── Demo data ── */

function generateDemoTransactions() {
  const vendors = [
    { vendor: "Amazon", category: "Shopping" },
    { vendor: "Uber Eats", category: "Food" },
    { vendor: "Spotify", category: "Entertainment" },
    { vendor: "Netflix", category: "Entertainment" },
    { vendor: "Chipotle", category: "Food" },
    { vendor: "Target", category: "Shopping" },
    { vendor: "Electric Co", category: "Bills" },
    { vendor: "Uber", category: "Transport" },
    { vendor: "Starbucks", category: "Food" },
    { vendor: "Internet ISP", category: "Bills" },
    { vendor: "Gas Station", category: "Transport" },
    { vendor: "Grocery Store", category: "Food" },
  ];

  const n = new Date();
  const entries = [];

  for (let m = 0; m < 6; m++) {
    const count = 8 + Math.floor(Math.random() * 12);
    for (let i = 0; i < count; i++) {
      const v = vendors[Math.floor(Math.random() * vendors.length)];
      const day = 1 + Math.floor(Math.random() * 28);
      const date = new Date(n.getFullYear(), n.getMonth() - m, day);
      const isRecurring = ["Spotify", "Netflix", "Electric Co", "Internet ISP"].includes(v.vendor);
      entries.push({
        id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        date: date.toISOString(),
        amount: Number((isRecurring ? 10 + Math.random() * 40 : 5 + Math.random() * 80).toFixed(2)),
        vendor: v.vendor,
        category: v.category,
        type: isRecurring ? "Fixed" : "Variable",
        source: "manual",
        status: "confirmed",
      });
    }
  }

  state.ledger = entries;
}

/* ── liquid background (same as app.js) ── */

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
    { a: "rgba(196,234,227,0.55)", b: "rgba(168,210,252,0.55)", c: "rgba(236,250,246,0.45)", border: "rgba(47,122,191,0.18)" },
    { a: "rgba(180,236,255,0.6)", b: "rgba(152,214,255,0.5)", c: "rgba(226,243,255,0.45)", border: "rgba(47,122,191,0.22)" },
    { a: "rgba(191,240,224,0.6)", b: "rgba(120,208,192,0.55)", c: "rgba(229,250,243,0.45)", border: "rgba(46,143,127,0.22)" },
    { a: "rgba(236,248,255,0.6)", b: "rgba(190,222,252,0.55)", c: "rgba(240,249,255,0.45)", border: "rgba(103,153,216,0.2)" },
  ];
  const shards = Array.from({ length: count }, () => {
    const el = document.createElement("div");
    const variant = variants[Math.floor(Math.random() * variants.length)];
    el.className = variant ? `shard ${variant}` : "shard";
    const tint = tints[Math.floor(Math.random() * tints.length)];
    const sizeBase = 80 + Math.random() * 140;
    const size = variant === "sliver" || variant === "blade" ? sizeBase * 0.7 : sizeBase;
    const hue = Math.floor(Math.random() * 360);
    const tiltX = -8 + Math.random() * 16;
    const tiltY = -10 + Math.random() * 20;
    const prism = document.createElement("span"); prism.className = "prism";
    const edge = document.createElement("span"); edge.className = "edge";
    const thickness = document.createElement("span"); thickness.className = "thickness";
    el.appendChild(prism); el.appendChild(edge); el.appendChild(thickness);
    const rotate = -20 + Math.random() * 40;
    const position = { baseX: Math.random() * window.innerWidth, baseY: Math.random() * window.innerHeight, offsetX: 0, offsetY: 0, targetX: 0, targetY: 0, size, rotate, el };
    el.style.setProperty("--size", `${size}px`);
    el.style.setProperty("--rotate", `${rotate}deg`);
    el.style.setProperty("--hue", `${hue}deg`);
    el.style.setProperty("--tilt-x", `${tiltX}deg`);
    el.style.setProperty("--tilt-y", `${tiltY}deg`);
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

function resetShards(shards) { shards.forEach((s) => { s.baseX = Math.random() * window.innerWidth; s.baseY = Math.random() * window.innerHeight; }); }

function repelShards(shards, pointer) {
  const radius = 180;
  shards.forEach((s) => {
    const dx = s.baseX + s.offsetX - pointer.x;
    const dy = s.baseY + s.offsetY - pointer.y;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < radius) { const str = (radius - d) / radius; s.targetX = dx / d * str * 60; s.targetY = dy / d * str * 60; }
  });
}

function animateShards(shards, getPointer) {
  const tick = () => {
    shards.forEach((s) => {
      s.offsetX += (s.targetX - s.offsetX) * 0.08;
      s.offsetY += (s.targetY - s.offsetY) * 0.08;
      s.targetX *= 0.92; s.targetY *= 0.92;
      s.el.style.setProperty("--x", `${s.baseX + s.offsetX}px`);
      s.el.style.setProperty("--y", `${s.baseY + s.offsetY}px`);
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function maybeSpawnBubble(layer, x, y, setLast, lastBubble) {
  if (!layer) return;
  if (Date.now() - lastBubble < 40) return;
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
