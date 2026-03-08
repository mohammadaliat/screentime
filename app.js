const APPS = ["VS Code", "Chrome", "YouTube", "Figma", "Slack", "Spotify", "Terminal"];
const state = {
  user: null,
  permissionsGranted: false,
  limits: JSON.parse(localStorage.getItem("limits") || "[]"),
  range: "day",
  records: generateRecords(120),
  chart: null,
};

function generateRecords(days) {
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    APPS.forEach((app) => {
      const mins = Math.max(5, Math.round(Math.random() * (app === "YouTube" ? 95 : 70)));
      data.push({ date: date.toISOString().slice(0, 10), app, mins });
    });
  }
  return data;
}

const $ = (id) => document.getElementById(id);

function applyTheme(mode) {
  const isDark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.body.classList.toggle("dark", isDark);
  localStorage.setItem("themeMode", mode);
}

function filterRecords(range, startDate, endDate) {
  const today = new Date();
  let start = new Date(today);
  if (range === "day") start = today;
  if (range === "week") start.setDate(today.getDate() - 6);
  if (range === "month") start.setMonth(today.getMonth() - 1);
  if (range === "custom") {
    start = new Date(startDate);
    today.setTime(new Date(endDate).getTime());
  }
  const startISO = start.toISOString().slice(0, 10);
  const endISO = today.toISOString().slice(0, 10);
  return state.records.filter((r) => r.date >= startISO && r.date <= endISO);
}

function summarize(records) {
  const totalsByApp = {};
  let totalMins = 0;
  records.forEach((r) => {
    totalMins += r.mins;
    totalsByApp[r.app] = (totalsByApp[r.app] || 0) + r.mins;
  });
  const top = Object.entries(totalsByApp).sort((a, b) => b[1] - a[1])[0] || ["-", 0];
  const focusMinutes = (totalsByApp["VS Code"] || 0) + (totalsByApp["Terminal"] || 0);
  const focusScore = totalMins ? Math.round((focusMinutes / totalMins) * 100) : 0;
  return { totalMins, topApp: top[0], focusScore, totalsByApp };
}

function renderChart(records) {
  const grouped = {};
  records.forEach((r) => {
    grouped[r.date] = (grouped[r.date] || 0) + r.mins;
  });
  const labels = Object.keys(grouped);
  const values = labels.map((d) => grouped[d]);

  if (state.chart) state.chart.destroy();
  state.chart = new Chart($("usageChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total screen minutes",
        data: values,
        borderRadius: 8,
        backgroundColor: "rgba(217,45,32,0.78)",
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

function renderFlowchart(summary) {
  const svg = $("flowchart");
  const apps = Object.entries(summary.totalsByApp)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([app]) => app);
  const nodes = ["Start Day", ...apps, "End Day"];
  const spacing = 120;

  svg.innerHTML = `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="currentColor"></polygon></marker></defs>`;
  nodes.forEach((label, i) => {
    const x = 15 + i * spacing;
    const y = 80;
    svg.insertAdjacentHTML(
      "beforeend",
      `<rect class="node" x="${x}" y="${y}" width="100" height="42" rx="9"></rect><text x="${x + 10}" y="${y + 24}">${label}</text>`
    );
    if (i < nodes.length - 1) {
      svg.insertAdjacentHTML("beforeend", `<line class="arrow" x1="${x + 100}" y1="${y + 21}" x2="${x + spacing}" y2="${y + 21}"></line>`);
    }
  });
}

function renderLimits(records) {
  const used = summarize(records).totalsByApp;
  $("limitList").innerHTML = "";
  state.limits.forEach((limit, idx) => {
    const consumed = used[limit.app] || 0;
    const exceeded = consumed > limit.minutes;
    const li = document.createElement("li");
    li.className = "limit-item";
    li.innerHTML = `
      <span><strong>${limit.app}</strong> • Limit ${limit.minutes}m • Used ${consumed}m ${exceeded ? "⚠️ Exceeded" : "✅"}</span>
      <button class="btn btn-secondary" data-delete="${idx}">Remove</button>
    `;
    $("limitList").appendChild(li);
  });
}

function refresh(range = state.range) {
  const custom = range === "custom";
  const records = filterRecords(range, $("startDate").value, $("endDate").value);
  const summary = summarize(records);

  $("totalTime").textContent = `${(summary.totalMins / 60).toFixed(1)}h`;
  $("topApp").textContent = summary.topApp;
  $("focusScore").textContent = `${summary.focusScore}%`;
  $("breakAlerts").textContent = Math.max(0, Math.floor(summary.totalMins / 180));

  if (!custom || ($("startDate").value && $("endDate").value)) {
    renderChart(records);
    renderFlowchart(summary);
    renderLimits(records);
  }
}

document.addEventListener("click", (e) => {
  if (e.target.matches(".chip")) {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    e.target.classList.add("active");
    state.range = e.target.dataset.range;
    refresh(state.range);
  }
  if (e.target.dataset.delete) {
    state.limits.splice(Number(e.target.dataset.delete), 1);
    localStorage.setItem("limits", JSON.stringify(state.limits));
    refresh();
  }
});

$("applyCustom").addEventListener("click", () => {
  state.range = "custom";
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  refresh("custom");
});

$("limitForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.limits.push({ app: $("appName").value.trim(), minutes: Number($("limitMins").value) });
  localStorage.setItem("limits", JSON.stringify(state.limits));
  e.target.reset();
  refresh();
});

$("authForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const mode = e.submitter.dataset.mode;
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || password.length < 6) return;

  const users = JSON.parse(localStorage.getItem("users") || "{}");
  if (mode === "signup") users[email] = { password, devices: ["Desktop-Primary", "Laptop-Work"] };
  if (!users[email] || users[email].password !== password) {
    $("authStatus").textContent = "Invalid credentials.";
    return;
  }
  state.user = email;
  localStorage.setItem("users", JSON.stringify(users));
  $("authStatus").textContent = `Signed in as ${email}. Multi-device sync is active.`;
  $("deviceControls").classList.remove("hidden");
  $("deviceList").innerHTML = users[email].devices.map((d) => `<li>${d} • Controls Enabled</li>`).join("");
});

$("allowBtn").addEventListener("click", () => {
  state.permissionsGranted = true;
  $("permissionModal").classList.remove("visible");
  refresh();
});

$("denyBtn").addEventListener("click", () => {
  $("permissionModal").querySelector("p").textContent =
    "Permission denied. Analytics remain demo-only until access is granted.";
});

$("themeMode").addEventListener("change", (e) => applyTheme(e.target.value));

(function init() {
  const savedTheme = localStorage.getItem("themeMode") || "system";
  $("themeMode").value = savedTheme;
  applyTheme(savedTheme);

  const today = new Date().toISOString().slice(0, 10);
  $("startDate").value = today;
  $("endDate").value = today;
  refresh();
})();
