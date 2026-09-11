import { supabase } from "./supabaseClient.js";
import { parseSantanderStatement } from "./pdfParser.js";

// ---------------- ESTADO GLOBAL ----------------
let currentUser = null;
let households = [];       // [{id, name, role, join_code}]
let currentHousehold = null;
let months = [];           // [{id, year, month, status}]
let currentMonth = null;
let savingsChart = null;
let ccCategoryChart = null;

const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ============================================================
// ÍCONOS (trazo, un solo color — sin emojis)
// ============================================================
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  ingresos: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>',
  fijos: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  extra: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
  tarjeta: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  ahorros: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1h4v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-4c1-.5 1.7-1 2-2h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-2c0-1-.5-1.5-1-2h0V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/>',
  historial: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  sparkles: '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  "Compras online": '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  Supermercado: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  Combustible: '<line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2v0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.41L18 5"/>',
  Suscripciones: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  Restaurantes: '<path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  Salud: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
  Transporte: '<path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5 17V9l2-5h10l2 5v8"/>',
  Vestuario: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23Z"/>',
  Entretenimiento: '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
  Servicios: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  "Sin categoría": '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  compras: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  planificacion: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
};

function icon(name, size = 18) {
  const path = ICONS[name] || ICONS["Sin categoría"];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="icon-inline">${path}</svg>`;
}

document.querySelectorAll(".side-tab[data-icon]").forEach((btn) => {
  const name = btn.dataset.icon;
  btn.innerHTML = `${icon(name, 17)}<span>${btn.textContent.trim()}</span>`;
});
const fmt = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");

// ============================================================
// AUTH
// ============================================================
function initAuthTabs() {
  document.querySelectorAll("[data-authtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-authtab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const which = btn.dataset.authtab;
      document.getElementById("login-form").style.display = which === "login" ? "flex" : "none";
      document.getElementById("signup-form").style.display = which === "signup" ? "flex" : "none";
      document.getElementById("auth-message").textContent = "";
    });
  });
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) document.getElementById("auth-message").textContent = error.message;
});

document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    document.getElementById("auth-message").textContent = error.message;
  } else {
    document.getElementById("auth-message").style.color = "var(--green)";
    document.getElementById("auth-message").textContent = "Cuenta creada. Si tu proyecto pide confirmación por correo, revisa tu bandeja.";
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await supabase.auth.signOut();
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    currentUser = session.user;
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app-screen").style.display = "block";
    document.getElementById("user-email").textContent = currentUser.email;
    bootstrapApp();
  } else {
    currentUser = null;
    document.getElementById("auth-screen").style.display = "flex";
    document.getElementById("app-screen").style.display = "none";
  }
});

// ============================================================
// TABS DE NAVEGACIÓN
// ============================================================
document.querySelectorAll(".sidebar .side-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sidebar .side-tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ============================================================
// MENÚ HAMBURGUESA (drawer lateral)
// ============================================================
const hamburgerBtn = document.getElementById("btn-hamburger");
const drawer = document.getElementById("drawer");
const drawerOverlay = document.getElementById("drawer-overlay");

function openDrawer() {
  drawer.classList.add("open");
  drawerOverlay.style.display = "block";
}
function closeDrawer() {
  drawer.classList.remove("open");
  drawerOverlay.style.display = "none";
}

hamburgerBtn.addEventListener("click", openDrawer);
drawerOverlay.addEventListener("click", closeDrawer);
document.getElementById("drawer-close").addEventListener("click", closeDrawer);
drawer.querySelectorAll(".dropdown-item").forEach((item) => {
  item.addEventListener("click", closeDrawer);
});

// ============================================================
// BOOTSTRAP: cargar hogares del usuario al iniciar sesión
// ============================================================
async function bootstrapApp() {
  await loadHouseholds();
  if (households.length === 0) {
    openHouseholdModal();
  } else {
    await selectHousehold(households[0].id);
  }
}

async function loadHouseholds() {
  const { data, error } = await supabase
    .from("household_members")
    .select("role, households(id, name, join_code)")
    .eq("user_id", currentUser.id);

  if (error) { console.error(error); return; }

  households = (data || []).map((row) => ({
    id: row.households.id,
    name: row.households.name,
    join_code: row.households.join_code,
    role: row.role,
  }));

  const select = document.getElementById("household-select");
  select.innerHTML = households.map((h) => `<option value="${h.id}">${h.name}</option>`).join("");
}

document.getElementById("household-select").addEventListener("change", (e) => {
  selectHousehold(e.target.value);
});

async function selectHousehold(id) {
  currentHousehold = households.find((h) => h.id === id);
  if (!currentHousehold) return;
  document.getElementById("household-select").value = id;
  document.getElementById("current-join-code").textContent = currentHousehold.join_code;
  await loadMonths();
  await loadShoppingList();
  await loadEvents();
}

// ---------------- MODAL DE HOGARES ----------------
function openHouseholdModal() { document.getElementById("household-modal").style.display = "flex"; }
function closeHouseholdModal() { document.getElementById("household-modal").style.display = "none"; }

document.getElementById("btn-household-manage").addEventListener("click", openHouseholdModal);
document.getElementById("btn-close-household-modal").addEventListener("click", closeHouseholdModal);

document.getElementById("btn-create-household").addEventListener("click", async () => {
  const name = document.getElementById("new-household-name").value.trim();
  if (!name) return;
  const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  const { data: hh, error } = await supabase
    .from("households")
    .insert({ name, join_code: joinCode, created_by: currentUser.id })
    .select()
    .single();
  if (error) { alert("Error creando hogar: " + error.message); return; }

  await supabase.from("household_members").insert({
    household_id: hh.id, user_id: currentUser.id, role: "owner",
  });

  document.getElementById("new-household-name").value = "";
  await loadHouseholds();
  await selectHousehold(hh.id);
  closeHouseholdModal();
});

document.getElementById("btn-join-household").addEventListener("click", async () => {
  const code = document.getElementById("join-code").value.trim().toUpperCase();
  if (!code) return;

  const { data: hh, error } = await supabase
    .from("households").select("id, name").eq("join_code", code).single();
  if (error || !hh) { alert("Código no encontrado."); return; }

  const { error: joinError } = await supabase
    .from("household_members")
    .insert({ household_id: hh.id, user_id: currentUser.id, role: "member" });
  if (joinError) { alert("Error al unirse: " + joinError.message); return; }

  document.getElementById("join-code").value = "";
  await loadHouseholds();
  await selectHousehold(hh.id);
  closeHouseholdModal();
});

// ============================================================
// MESES
// ============================================================
async function loadMonths() {
  const { data, error } = await supabase
    .from("months")
    .select("*")
    .eq("household_id", currentHousehold.id)
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (error) { console.error(error); return; }
  months = data || [];

  const select = document.getElementById("month-select");
  select.innerHTML = months.map((m) =>
    `<option value="${m.id}">${MONTH_NAMES[m.month - 1]} ${m.year}</option>`
  ).join("");

  if (months.length === 0) {
    await createMonth(new Date().getFullYear(), new Date().getMonth() + 1);
  } else {
    await selectMonth(months[0].id);
  }
}

document.getElementById("month-select").addEventListener("change", (e) => selectMonth(e.target.value));

document.getElementById("btn-new-month").addEventListener("click", async () => {
  const now = new Date();
  let year = now.getFullYear(), month = now.getMonth() + 1;
  if (months.length > 0) {
    // sugiere el mes siguiente al más reciente que existe
    const latest = months[0];
    month = latest.month + 1;
    year = latest.year;
    if (month > 12) { month = 1; year += 1; }
  }
  const input = prompt("Nuevo mes (formato AAAA-MM):", `${year}-${String(month).padStart(2, "0")}`);
  if (!input) return;
  const [y, m] = input.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) { alert("Formato inválido."); return; }
  await createMonth(y, m);
});

document.getElementById("btn-delete-month").addEventListener("click", async () => {
  if (!currentMonth) return;
  const label = `${MONTH_NAMES[currentMonth.month - 1]} ${currentMonth.year}`;
  const confirmed = confirm(
    `¿Eliminar ${label}? Esto borra también todos sus ingresos, gastos fijos, gastos extra y la cartola de tarjeta asociada. Esta acción no se puede deshacer.`
  );
  if (!confirmed) return;

  const { error } = await supabase.from("months").delete().eq("id", currentMonth.id);
  if (error) { alert("Error eliminando el mes: " + error.message); return; }

  currentMonth = null;
  await loadMonths();
});

async function createMonth(year, month) {
  const { data, error } = await supabase
    .from("months")
    .insert({ household_id: currentHousehold.id, year, month })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") { alert("Ese mes ya existe."); }
    else { alert("Error creando mes: " + error.message); }
    await loadMonths();
    return;
  }
  await loadMonths();
  await selectMonth(data.id);
}

async function selectMonth(id) {
  currentMonth = months.find((m) => m.id === id) || (await fetchMonthById(id));
  document.getElementById("month-select").value = id;
  const label = document.getElementById("month-switcher-label");
  if (label) label.textContent = `${MONTH_NAMES[currentMonth.month - 1].slice(0, 3)} ${currentMonth.year}`;
  await refreshAll();
}

// ---------------- NAVEGACIÓN TIPO LÍNEA DE TIEMPO ----------------
function ascendingMonths() {
  return [...months].sort((a, b) => a.year - b.year || a.month - b.month);
}

function navigateMonth(delta) {
  if (!currentMonth) return;
  const ascending = ascendingMonths();
  const idx = ascending.findIndex((m) => m.id === currentMonth.id);
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= ascending.length) return;
  selectMonth(ascending[newIdx].id);
}

document.getElementById("btn-prev-month").addEventListener("click", () => navigateMonth(-1));
document.getElementById("btn-next-month").addEventListener("click", () => navigateMonth(1));
document.getElementById("btn-prev-month-top").addEventListener("click", () => navigateMonth(-1));
document.getElementById("btn-next-month-top").addEventListener("click", () => navigateMonth(1));

function renderTimeline(summariesByMonthId) {
  const strip = document.getElementById("timeline-strip");
  const ascending = ascendingMonths();
  strip.innerHTML = ascending.map((m) => {
    const active = currentMonth && m.id === currentMonth.id;
    const s = summariesByMonthId && summariesByMonthId[m.id];
    const dot = s ? `<span class="timeline-dot ${Number(s.ahorro) >= 0 ? "positive" : "negative"}"></span>` : "";
    return `<button class="timeline-pill ${active ? "active" : ""}" data-month-id="${m.id}">${dot}${MONTH_NAMES[m.month - 1].slice(0, 3)} ${m.year}</button>`;
  }).join("");

  strip.querySelectorAll("[data-month-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectMonth(btn.dataset.monthId));
  });

  const activeEl = strip.querySelector(".active");
  if (activeEl) activeEl.scrollIntoView({ inline: "center", block: "nearest" });
}

async function fetchMonthById(id) {
  const { data } = await supabase.from("months").select("*").eq("id", id).single();
  return data;
}

// ============================================================
// REFRESCAR TODO (al cambiar de mes/hogar)
// ============================================================
async function refreshAll() {
  if (!currentMonth) return;
  await loadMerchantRules();
  await Promise.all([
    loadIncomes(), loadFixedExpenses(), loadExtraExpenses(), loadCreditCardTransactions(), loadAccounts(), loadCategoryBreakdown(),
  ]);
  await loadDashboard();
  await loadHistory();
  await loadMonthlySummaryNarrative();
  await updateTickerMessages();
}

// ============================================================
// TICKER DE LA BARRA SUPERIOR
// ============================================================
let tickerMessages = [];
let tickerIndex = 0;
let tickerInterval = null;

function formatDateLong(d) {
  const s = d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function updateTickerMessages() {
  const messages = [];
  if (currentHousehold) messages.push(`Este es el hogar ${currentHousehold.name}`);
  if (currentMonth) messages.push(`El mes seleccionado es ${MONTH_NAMES[currentMonth.month - 1]} ${currentMonth.year}`);
  messages.push(`Hoy es ${formatDateLong(new Date())}`);

  if (currentMonth) {
    const { data: summary } = await supabase
      .from("v_month_summary").select("*").eq("month_id", currentMonth.id).single();
    if (summary) {
      messages.push(`Ingresos de este mes: ${fmt(summary.total_ingresos)}`);
      messages.push(`Ahorro de este mes: ${fmt(summary.ahorro)}`);
      messages.push(`Gasto en tarjeta este mes: ${fmt(summary.total_tarjeta)}`);
    }
  }

  tickerMessages = messages;
  tickerIndex = 0;
  renderTickerMessage();
  startTicker();
}

function renderTickerMessage() {
  const el = document.getElementById("ticker-text");
  if (!el || tickerMessages.length === 0) return;
  el.classList.add("fade-out");
  setTimeout(() => {
    el.textContent = tickerMessages[tickerIndex];
    el.classList.remove("fade-out");
  }, 250);
}

function startTicker() {
  if (tickerInterval) clearInterval(tickerInterval);
  tickerInterval = setInterval(() => {
    if (tickerMessages.length === 0) return;
    tickerIndex = (tickerIndex + 1) % tickerMessages.length;
    renderTickerMessage();
  }, 4000);
}

// ============================================================
// INGRESOS
// ============================================================
document.getElementById("form-income").addEventListener("submit", async (e) => {
  e.preventDefault();
  const person = document.getElementById("income-person").value.trim();
  const desc = document.getElementById("income-desc").value.trim();
  const amount = parseFloat(document.getElementById("income-amount").value);
  if (!person || !amount) return;

  const { error } = await supabase.from("incomes").insert({
    household_id: currentHousehold.id, month_id: currentMonth.id,
    person_name: person, description: desc, amount,
  });
  if (error) { alert(error.message); return; }
  e.target.reset();
  await loadIncomes();
  await loadDashboard();
  await loadHistory();
});

async function loadIncomes() {
  const { data } = await supabase.from("incomes").select("*").eq("month_id", currentMonth.id).order("created_at");
  const tbody = document.querySelector("#table-incomes tbody");
  tbody.innerHTML = (data || []).map((r) => `
    <tr>
      <td>${r.person_name}</td><td>${r.description || ""}</td><td>${fmt(r.amount)}</td>
      <td><button class="btn-danger" data-del-income="${r.id}">${icon("trash", 14)}</button></td>
    </tr>`).join("");
  document.getElementById("total-incomes").textContent = fmt((data || []).reduce((s, r) => s + Number(r.amount), 0));

  tbody.querySelectorAll("[data-del-income]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await supabase.from("incomes").delete().eq("id", btn.dataset.delIncome);
      await loadIncomes(); await loadDashboard(); await loadHistory();
    });
  });
}

// ============================================================
// GASTOS FIJOS
// ============================================================
document.getElementById("form-fixed").addEventListener("submit", async (e) => {
  e.preventDefault();
  const category = document.getElementById("fixed-category").value;
  const name = document.getElementById("fixed-name").value.trim();
  const amount = parseFloat(document.getElementById("fixed-amount").value);
  if (!name || !amount) return;

  const { error } = await supabase.from("fixed_expenses").insert({
    household_id: currentHousehold.id, month_id: currentMonth.id, category, name, amount,
  });
  if (error) { alert(error.message); return; }
  e.target.reset();
  await loadFixedExpenses(); await loadDashboard(); await loadHistory();
});

async function loadFixedExpenses() {
  const { data } = await supabase.from("fixed_expenses").select("*").eq("month_id", currentMonth.id).order("created_at");
  const tbody = document.querySelector("#table-fixed tbody");
  tbody.innerHTML = (data || []).map((r) => `
    <tr>
      <td>${capitalize(r.category)}</td><td>${r.name}</td><td>${fmt(r.amount)}</td>
      <td><button class="btn-danger" data-del-fixed="${r.id}">${icon("trash", 14)}</button></td>
    </tr>`).join("");
  document.getElementById("total-fixed").textContent = fmt((data || []).reduce((s, r) => s + Number(r.amount), 0));

  tbody.querySelectorAll("[data-del-fixed]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await supabase.from("fixed_expenses").delete().eq("id", btn.dataset.delFixed);
      await loadFixedExpenses(); await loadDashboard(); await loadHistory();
    });
  });
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

document.getElementById("btn-copy-fixed").addEventListener("click", async () => {
  const ascending = ascendingMonths();
  const idx = ascending.findIndex((m) => m.id === currentMonth.id);
  if (idx <= 0) { alert("No hay un mes anterior a este para copiar."); return; }
  const prevMonth = ascending[idx - 1];

  const { data: prevFixed } = await supabase
    .from("fixed_expenses").select("category, name, amount").eq("month_id", prevMonth.id);
  if (!prevFixed || prevFixed.length === 0) {
    alert(`${MONTH_NAMES[prevMonth.month - 1]} ${prevMonth.year} no tiene gastos fijos guardados.`);
    return;
  }

  const { data: currentFixed } = await supabase
    .from("fixed_expenses").select("name").eq("month_id", currentMonth.id);
  const existingNames = new Set((currentFixed || []).map((r) => r.name.toLowerCase()));

  const toInsert = prevFixed
    .filter((r) => !existingNames.has(r.name.toLowerCase()))
    .map((r) => ({ household_id: currentHousehold.id, month_id: currentMonth.id, category: r.category, name: r.name, amount: r.amount }));

  if (toInsert.length === 0) {
    alert("Ya tienes todos esos gastos fijos cargados este mes.");
    return;
  }

  const { error } = await supabase.from("fixed_expenses").insert(toInsert);
  if (error) { alert("Error copiando gastos fijos: " + error.message); return; }

  await loadFixedExpenses(); await loadDashboard(); await loadHistory();
  alert(`Se copiaron ${toInsert.length} gasto(s) fijo(s) de ${MONTH_NAMES[prevMonth.month - 1]} ${prevMonth.year}.`);
});

// ============================================================
// GASTOS EXTRA
// ============================================================
document.getElementById("form-extra").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("extra-name").value.trim();
  const date = document.getElementById("extra-date").value || null;
  const amount = parseFloat(document.getElementById("extra-amount").value);
  if (!name || !amount) return;

  const { error } = await supabase.from("extra_expenses").insert({
    household_id: currentHousehold.id, month_id: currentMonth.id, name, expense_date: date, amount,
  });
  if (error) { alert(error.message); return; }
  e.target.reset();
  await loadExtraExpenses(); await loadDashboard(); await loadHistory();
});

async function loadExtraExpenses() {
  const { data } = await supabase.from("extra_expenses").select("*").eq("month_id", currentMonth.id).order("expense_date");
  const tbody = document.querySelector("#table-extra tbody");
  tbody.innerHTML = (data || []).map((r) => `
    <tr>
      <td>${r.name}</td><td>${r.expense_date || "-"}</td><td>${fmt(r.amount)}</td>
      <td><button class="btn-danger" data-del-extra="${r.id}">${icon("trash", 14)}</button></td>
    </tr>`).join("");
  document.getElementById("total-extra").textContent = fmt((data || []).reduce((s, r) => s + Number(r.amount), 0));

  tbody.querySelectorAll("[data-del-extra]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await supabase.from("extra_expenses").delete().eq("id", btn.dataset.delExtra);
      await loadExtraExpenses(); await loadDashboard(); await loadHistory();
    });
  });
}

// ============================================================
// TARJETA DE CRÉDITO
// ============================================================
let pendingParsedTransactions = [];
let merchantRules = [];

async function loadMerchantRules() {
  const { data } = await supabase
    .from("merchant_category_rules").select("*").eq("household_id", currentHousehold.id);
  merchantRules = data || [];
}

function applyLearnedCategory(description) {
  const lower = description.toLowerCase();
  const rule = merchantRules.find((r) => lower.includes(r.merchant_pattern));
  return rule ? rule.category : null;
}

document.getElementById("pdf-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("pdf-status").textContent = "Leyendo PDF...";

  try {
    const { transactions, suggestedTotal } = await parseSantanderStatement(file);
    transactions.forEach((t) => {
      const learned = applyLearnedCategory(t.description);
      if (learned) t.category = learned;
    });
    pendingParsedTransactions = transactions;
    renderPdfPreview(transactions, suggestedTotal);
    document.getElementById("pdf-status").textContent =
      `Se encontraron ${transactions.length} movimientos. Revisa antes de confirmar.`;
  } catch (err) {
    console.error(err);
    document.getElementById("pdf-status").textContent = "No se pudo leer el PDF: " + err.message;
  }
});

function renderPdfPreview(transactions, suggestedTotal) {
  const wrap = document.getElementById("pdf-preview");
  wrap.style.display = transactions.length ? "block" : "none";
  const tbody = document.querySelector("#table-pdf-preview tbody");
  tbody.innerHTML = transactions.map((t, i) => `
    <tr>
      <td><input type="date" data-field="transaction_date" data-i="${i}" value="${t.transaction_date || ""}" /></td>
      <td><input type="text" data-field="description" data-i="${i}" value="${escapeHtml(t.description)}" /></td>
      <td><input type="text" data-field="installment_info" data-i="${i}" value="${t.installment_info || ""}" style="width:60px" /></td>
      <td><input type="number" data-field="amount" data-i="${i}" value="${t.amount}" style="width:100px" /></td>
      <td><input type="text" data-field="category" data-i="${i}" value="${t.category}" style="width:110px" /></td>
      <td><button class="btn-danger" data-remove-preview="${i}">${icon("trash", 14)}</button></td>
    </tr>`).join("");

  tbody.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.i);
      const field = e.target.dataset.field;
      pendingParsedTransactions[i][field] = field === "amount" ? parseFloat(e.target.value) : e.target.value;
    });
  });
  tbody.querySelectorAll("[data-remove-preview]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.removePreview);
      pendingParsedTransactions.splice(i, 1);
      renderPdfPreview(pendingParsedTransactions, Number(document.getElementById("pdf-total").value) || suggestedTotal);
    });
  });

  document.getElementById("pdf-total").value = suggestedTotal || transactions.reduce((s, t) => s + t.amount, 0);
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.getElementById("btn-confirm-pdf").addEventListener("click", async () => {
  const total = parseFloat(document.getElementById("pdf-total").value) || 0;

  const { data: statement, error: stError } = await supabase
    .from("credit_card_statements")
    .insert({ household_id: currentHousehold.id, month_id: currentMonth.id, total_billed: total, bank: "Santander" })
    .select().single();
  if (stError) { alert("Error guardando cartola: " + stError.message); return; }

  if (pendingParsedTransactions.length > 0) {
    const rows = pendingParsedTransactions.map((t) => ({
      household_id: currentHousehold.id,
      statement_id: statement.id,
      transaction_date: t.transaction_date || null,
      description: t.description,
      installment_info: t.installment_info,
      amount: t.amount,
      category: t.category,
    }));
    const { error: txError } = await supabase.from("credit_card_transactions").insert(rows);
    if (txError) { alert("Cartola guardada, pero hubo error con los movimientos: " + txError.message); }
  }

  pendingParsedTransactions = [];
  document.getElementById("pdf-preview").style.display = "none";
  document.getElementById("pdf-input").value = "";
  document.getElementById("pdf-status").textContent = "Cartola importada correctamente.";
  await loadCreditCardTransactions(); await loadDashboard(); await loadHistory(); await loadCategoryBreakdown();
});

async function loadCreditCardTransactions() {
  const { data: statements } = await supabase
    .from("credit_card_statements").select("id, total_billed").eq("month_id", currentMonth.id);

  const totalCC = (statements || []).reduce((s, st) => s + Number(st.total_billed || 0), 0);
  document.getElementById("total-cc").textContent = fmt(totalCC);

  const statementIds = (statements || []).map((s) => s.id);
  const tbody = document.querySelector("#table-cc-transactions tbody");
  if (statementIds.length === 0) { tbody.innerHTML = ""; return; }

  const { data: txs } = await supabase
    .from("credit_card_transactions").select("*").in("statement_id", statementIds).order("transaction_date");

  const categoryOptions = Object.keys(CATEGORY_COLORS);
  tbody.innerHTML = (txs || []).map((t) => `
    <tr>
      <td>${t.transaction_date || "-"}</td>
      <td>${t.description}</td>
      <td>${t.installment_info || "-"}</td>
      <td>${fmt(t.amount)}</td>
      <td>
        <select class="category-select" data-cc-id="${t.id}" data-cc-desc="${escapeHtml(t.description)}">
          ${categoryOptions.map((c) => `<option value="${c}" ${c === t.category ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll("[data-cc-id]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const id = sel.dataset.ccId;
      const desc = sel.dataset.ccDesc;
      const newCategory = sel.value;

      await supabase.from("credit_card_transactions").update({ category: newCategory }).eq("id", id);

      // Aprender: la próxima vez que este comercio aparezca en una cartola, ya vendrá clasificado así.
      await supabase.from("merchant_category_rules").upsert(
        { household_id: currentHousehold.id, merchant_pattern: desc.toLowerCase(), category: newCategory },
        { onConflict: "household_id,merchant_pattern" }
      );
      await loadMerchantRules();
      await loadCategoryBreakdown();
    });
  });
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  // Todos los meses del hogar (abiertos y cerrados), en orden cronológico —
  // esto es lo que permite consolidar el histórico completo, no solo el mes activo.
  const { data: allSummaries } = await supabase
    .from("v_month_summary").select("*").eq("household_id", currentHousehold.id)
    .order("year").order("month");

  const summaries = allSummaries || [];
  const summariesByMonthId = {};
  summaries.forEach((s) => { summariesByMonthId[s.month_id] = s; });

  // --- Tarjetas del mes seleccionado ---
  const summary = summariesByMonthId[currentMonth.id];
  if (summary) {
    const ahorro = Number(summary.ahorro);
    document.getElementById("dashboard-cards").innerHTML = `
      <div class="card"><div class="label">Ingresos</div><div class="value">${fmt(summary.total_ingresos)}</div></div>
      <div class="card"><div class="label">Gastos Fijos</div><div class="value">${fmt(summary.total_gastos_fijos)}</div></div>
      <div class="card"><div class="label">Gastos Extra</div><div class="value">${fmt(summary.total_gastos_extra)}</div></div>
      <div class="card"><div class="label">Tarjeta de Crédito</div><div class="value">${fmt(summary.total_tarjeta)}</div></div>
      <div class="card ${ahorro >= 0 ? "savings-positive" : "savings-negative"}"><div class="label">Ahorro del mes</div><div class="value">${fmt(ahorro)}</div></div>
    `;
  }

  // --- Acumulado histórico: suma de TODOS los meses hasta (e incluyendo) el seleccionado ---
  const idxCurrent = summaries.findIndex((s) => s.month_id === currentMonth.id);
  let cumIngresos = 0, cumFijos = 0, cumExtra = 0, cumTarjeta = 0, cumAhorro = 0;
  for (let i = 0; i <= idxCurrent; i++) {
    cumIngresos += Number(summaries[i].total_ingresos);
    cumFijos += Number(summaries[i].total_gastos_fijos);
    cumExtra += Number(summaries[i].total_gastos_extra);
    cumTarjeta += Number(summaries[i].total_tarjeta);
    cumAhorro += Number(summaries[i].ahorro);
  }
  document.getElementById("dashboard-cumulative-cards").innerHTML = `
    <div class="card"><div class="label">Ingresos acumulados</div><div class="value">${fmt(cumIngresos)}</div></div>
    <div class="card"><div class="label">Gastos acumulados</div><div class="value">${fmt(cumFijos + cumExtra + cumTarjeta)}</div></div>
    <div class="card ${cumAhorro >= 0 ? "savings-positive" : "savings-negative"}"><div class="label">Ahorro acumulado</div><div class="value">${fmt(cumAhorro)}</div></div>
  `;

  // --- Patrimonio consolidado: saldo real de tus cuentas este mes ---
  // (no se suma el ahorro acumulado por flujo: el saldo de las cuentas ya
  // refleja el efecto de esos ingresos/gastos, sumarlo de nuevo lo duplicaría)
  const { data: patrimonioRow } = await supabase
    .from("v_month_patrimonio").select("total_patrimonio").eq("month_id", currentMonth.id).single();
  const externalSavings = patrimonioRow ? Number(patrimonioRow.total_patrimonio) : 0;

  document.getElementById("dashboard-consolidated-card").innerHTML = `
    <div class="card ${externalSavings >= 0 ? "savings-positive" : "savings-negative"}">
      <div class="label">Patrimonio consolidado (saldo de tus cuentas este mes)</div>
      <div class="value">${fmt(externalSavings)}</div>
    </div>
  `;

  // --- Gráfico: barras = ahorro de cada mes, línea = ahorro acumulado, línea = patrimonio ---
  const labels = summaries.map((s) => `${MONTH_NAMES[s.month - 1].slice(0, 3)} ${s.year}`);
  const monthlyValues = summaries.map((s) => Number(s.ahorro));
  let running = 0;
  const cumulativeValues = summaries.map((s) => { running += Number(s.ahorro); return running; });

  const { data: allPatrimonio } = await supabase
    .from("v_month_patrimonio").select("*").eq("household_id", currentHousehold.id);
  const patrimonioByMonthId = {};
  (allPatrimonio || []).forEach((p) => { patrimonioByMonthId[p.month_id] = Number(p.total_patrimonio); });
  const patrimonioValues = summaries.map((s) => patrimonioByMonthId[s.month_id] || 0);

  const canvas = document.getElementById("chart-savings");
  const ctx = canvas.getContext("2d");
  const chartHeight = canvas.parentElement.clientHeight || 300;

  // Gradientes suaves para las barras (verde/rojo) y el área bajo las líneas (azul/violeta)
  const gradGreen = ctx.createLinearGradient(0, 0, 0, chartHeight);
  gradGreen.addColorStop(0, "rgba(52, 211, 153, 0.95)");
  gradGreen.addColorStop(1, "rgba(52, 211, 153, 0.35)");

  const gradRed = ctx.createLinearGradient(0, 0, 0, chartHeight);
  gradRed.addColorStop(0, "rgba(248, 113, 113, 0.95)");
  gradRed.addColorStop(1, "rgba(248, 113, 113, 0.35)");

  const gradLineFill = ctx.createLinearGradient(0, 0, 0, chartHeight);
  gradLineFill.addColorStop(0, "rgba(79, 140, 255, 0.35)");
  gradLineFill.addColorStop(1, "rgba(79, 140, 255, 0)");

  const gradPatrimonioFill = ctx.createLinearGradient(0, 0, 0, chartHeight);
  gradPatrimonioFill.addColorStop(0, "rgba(124, 92, 255, 0.25)");
  gradPatrimonioFill.addColorStop(1, "rgba(124, 92, 255, 0)");

  if (savingsChart) savingsChart.destroy();
  savingsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Ahorro del mes",
          data: monthlyValues,
          backgroundColor: monthlyValues.map((v) => (v >= 0 ? gradGreen : gradRed)),
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 42,
          order: 3,
        },
        {
          type: "line",
          label: "Ahorro acumulado",
          data: cumulativeValues,
          borderColor: "#4f8cff",
          backgroundColor: gradLineFill,
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: "#4f8cff",
          pointBorderColor: "#0f1420",
          pointBorderWidth: 2,
          order: 2,
        },
        {
          type: "line",
          label: "Patrimonio (cuentas externas)",
          data: patrimonioValues,
          borderColor: "#7c5cff",
          backgroundColor: gradPatrimonioFill,
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          borderDash: [5, 3],
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: "#7c5cff",
          pointBorderColor: "#0f1420",
          pointBorderWidth: 2,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: { duration: 700, easing: "easeOutQuart" },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: { color: "#8792a8", usePointStyle: true, pointStyle: "circle", boxWidth: 8, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: "#1e2536",
          titleColor: "#e8ecf5",
          bodyColor: "#e8ecf5",
          borderColor: "#262e40",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          displayColors: true,
          callbacks: { label: (item) => `${item.dataset.label}: ${fmt(item.parsed.y)}` },
        },
      },
      scales: {
        y: {
          grid: { color: "rgba(255,255,255,0.06)", drawTicks: false },
          border: { display: false },
          ticks: { color: "#8792a8", padding: 8, callback: (v) => fmt(v) },
        },
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#8792a8" },
        },
      },
    },
  });

  syncSavingsChartFilters();
  renderTimeline(summariesByMonthId);
}

// ---------------- FILTROS DEL GRÁFICO DE AHORRO ----------------
function syncSavingsChartFilters() {
  if (!savingsChart) return;
  document.querySelectorAll("#savings-chart-filters .filter-chip").forEach((chip) => {
    const idx = Number(chip.dataset.series);
    savingsChart.setDatasetVisibility(idx, chip.classList.contains("active"));
  });
  savingsChart.update();
}

document.querySelectorAll("#savings-chart-filters .filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chip.classList.toggle("active");
    syncSavingsChartFilters();
  });
});

// ============================================================
// HISTORIAL
// ============================================================
async function loadHistory() {
  const { data: allSummaries } = await supabase
    .from("v_month_summary").select("*").eq("household_id", currentHousehold.id)
    .order("year", { ascending: false }).order("month", { ascending: false });

  const tbody = document.querySelector("#table-history tbody");
  tbody.innerHTML = (allSummaries || []).map((s) => `
    <tr>
      <td>${MONTH_NAMES[s.month - 1]} ${s.year}</td>
      <td>${fmt(s.total_ingresos)}</td>
      <td>${fmt(s.total_gastos_fijos)}</td>
      <td>${fmt(s.total_gastos_extra)}</td>
      <td>${fmt(s.total_tarjeta)}</td>
      <td style="color:${s.ahorro >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(s.ahorro)}</td>
    </tr>`).join("");

  document.getElementById("report-cards").style.display = "none";
}

document.getElementById("btn-generate-report").addEventListener("click", async () => {
  const { data: summaries } = await supabase
    .from("v_month_summary").select("*").eq("household_id", currentHousehold.id);

  if (!summaries || summaries.length === 0) {
    alert("Todavía no hay meses con datos para calcular un promedio.");
    return;
  }

  const n = summaries.length;
  const avg = (key) => summaries.reduce((s, r) => s + Number(r[key]), 0) / n;
  const avgIngresos = avg("total_ingresos");
  const avgFijos = avg("total_gastos_fijos");
  const avgExtra = avg("total_gastos_extra");
  const avgTarjeta = avg("total_tarjeta");
  const avgAhorro = avg("ahorro");

  const el = document.getElementById("report-cards");
  el.style.display = "grid";
  el.innerHTML = `
    <div class="card"><div class="label">Meses considerados</div><div class="value">${n}</div></div>
    <div class="card"><div class="label">Ingreso promedio mensual</div><div class="value">${fmt(avgIngresos)}</div></div>
    <div class="card"><div class="label">Gasto tarjeta promedio</div><div class="value">${fmt(avgTarjeta)}</div></div>
    <div class="card"><div class="label">Gastos fijos promedio</div><div class="value">${fmt(avgFijos)}</div></div>
    <div class="card"><div class="label">Gastos extra promedio</div><div class="value">${fmt(avgExtra)}</div></div>
    <div class="card ${avgAhorro >= 0 ? "savings-positive" : "savings-negative"}"><div class="label">Ahorro promedio mensual</div><div class="value">${fmt(avgAhorro)}</div></div>
  `;
});

// ============================================================
// AHORROS / PATRIMONIO (cuentas y saldos mes a mes)
// ============================================================
let savingsAccounts = [];
let patrimonioChart = null;

const ACCOUNT_TYPE_LABELS = {
  cuenta_corriente: "Cuenta corriente",
  cuenta_digital: "Cuenta digital",
  deposito_plazo: "Depósito a plazo",
  otro: "Otro",
};

document.getElementById("account-auto-track").addEventListener("change", (e) => {
  document.getElementById("auto-track-fields").style.display = e.target.checked ? "inline-flex" : "none";
  document.getElementById("auto-track-hint").style.display = e.target.checked ? "block" : "none";
});

document.getElementById("form-account").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("account-name").value.trim();
  const account_type = document.getElementById("account-type").value;
  const rateRaw = document.getElementById("account-rate").value;
  const interest_rate = rateRaw ? parseFloat(rateRaw) : null;
  const autoTrack = document.getElementById("account-auto-track").checked;
  if (!name) return;

  let initial_balance = null;
  let initial_month_id = null;
  if (autoTrack) {
    initial_balance = parseFloat(document.getElementById("account-initial-balance").value);
    initial_month_id = document.getElementById("account-initial-month").value;
    if (isNaN(initial_balance) || !initial_month_id) {
      alert("Completa el saldo inicial y el mes inicial para una cuenta vinculada.");
      return;
    }
  }

  const { error } = await supabase.from("savings_accounts").insert({
    household_id: currentHousehold.id, name, account_type, interest_rate,
    auto_track: autoTrack, initial_balance, initial_month_id,
  });
  if (error) { alert("Error agregando cuenta: " + error.message); return; }
  e.target.reset();
  document.getElementById("auto-track-fields").style.display = "none";
  document.getElementById("auto-track-hint").style.display = "none";
  await loadAccounts();
  await loadPatrimonioChart();
});

async function loadAccounts() {
  const { data: accounts } = await supabase
    .from("savings_accounts").select("*").eq("household_id", currentHousehold.id).order("created_at");
  savingsAccounts = accounts || [];

  // Popular el selector de "mes inicial" del formulario de nueva cuenta
  const initialMonthSelect = document.getElementById("account-initial-month");
  if (initialMonthSelect) {
    initialMonthSelect.innerHTML = ascendingMonths()
      .map((m) => `<option value="${m.id}">${MONTH_NAMES[m.month - 1]} ${m.year}</option>`).join("");
  }

  const { data: balances } = await supabase
    .from("account_balances").select("*").eq("month_id", currentMonth.id);
  const balanceByAccount = {};
  (balances || []).forEach((b) => { balanceByAccount[b.account_id] = b; });

  // Cuentas vinculadas al flujo de caja: calcular su saldo de este mes y guardarlo
  const autoAccounts = savingsAccounts.filter((a) => a.auto_track && a.initial_month_id);
  if (autoAccounts.length) {
    const { data: allSummaries } = await supabase
      .from("v_month_summary").select("month_id, year, month, ahorro")
      .eq("household_id", currentHousehold.id).order("year").order("month");

    for (const acc of autoAccounts) {
      const initIdx = (allSummaries || []).findIndex((s) => s.month_id === acc.initial_month_id);
      const curIdx = (allSummaries || []).findIndex((s) => s.month_id === currentMonth.id);
      if (initIdx === -1 || curIdx === -1 || curIdx < initIdx) continue; // este mes es anterior al mes inicial

      let flowSum = 0;
      for (let i = initIdx; i <= curIdx; i++) flowSum += Number(allSummaries[i].ahorro);
      const computedBalance = Number(acc.initial_balance) + flowSum;

      await supabase.from("account_balances").upsert(
        { household_id: currentHousehold.id, account_id: acc.id, month_id: currentMonth.id, balance: computedBalance, updated_at: new Date().toISOString() },
        { onConflict: "account_id,month_id" }
      );
      balanceByAccount[acc.id] = { balance: computedBalance };
    }
  }

  const tbody = document.querySelector("#table-accounts tbody");
  tbody.innerHTML = savingsAccounts.map((a) => {
    const existing = balanceByAccount[a.id];
    const rate = a.interest_rate != null ? `${a.interest_rate}%` : "-";

    if (a.auto_track) {
      const val = existing ? fmt(existing.balance) : "— (antes del mes inicial)";
      return `
        <tr>
          <td>${a.name}</td>
          <td>${ACCOUNT_TYPE_LABELS[a.account_type] || a.account_type}</td>
          <td>${rate}</td>
          <td><strong>${val}</strong> <span class="muted" style="font-size:0.75em">(automático)</span></td>
          <td><button class="btn-danger" data-del-account="${a.id}">${icon("trash", 14)}</button></td>
        </tr>`;
    }

    return `
      <tr>
        <td>${a.name}</td>
        <td>${ACCOUNT_TYPE_LABELS[a.account_type] || a.account_type}</td>
        <td>${rate}</td>
        <td>
          <input type="number" step="1" style="width:140px" data-account-id="${a.id}"
                 class="balance-input" value="${existing ? existing.balance : ""}" placeholder="Saldo" />
          <button class="btn-ghost" data-save-balance="${a.id}" style="padding:4px 10px;font-size:0.85em">Guardar</button>
        </td>
        <td><button class="btn-danger" data-del-account="${a.id}">${icon("trash", 14)}</button></td>
      </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-save-balance]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const accountId = btn.dataset.saveBalance;
      const input = tbody.querySelector(`.balance-input[data-account-id="${accountId}"]`);
      const balance = parseFloat(input.value);
      if (isNaN(balance)) { alert("Ingresa un saldo válido."); return; }
      const { error } = await supabase.from("account_balances").upsert(
        { household_id: currentHousehold.id, account_id: accountId, month_id: currentMonth.id, balance, updated_at: new Date().toISOString() },
        { onConflict: "account_id,month_id" }
      );
      if (error) { alert("Error guardando saldo: " + error.message); return; }
      await loadAccounts();
      await loadPatrimonioChart();
    });
  });

  tbody.querySelectorAll("[data-del-account]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta cuenta y todo su historial de saldos?")) return;
      await supabase.from("savings_accounts").delete().eq("id", btn.dataset.delAccount);
      await loadAccounts();
      await loadPatrimonioChart();
    });
  });

  const total = savingsAccounts.reduce((s, a) => {
    const b = balanceByAccount[a.id];
    return s + (b ? Number(b.balance) : 0);
  }, 0);
  document.getElementById("total-patrimonio").textContent = fmt(total);

  await loadPatrimonioChart();
}

async function loadPatrimonioChart() {
  const { data: allPatrimonio } = await supabase
    .from("v_month_patrimonio").select("*").eq("household_id", currentHousehold.id)
    .order("year").order("month");

  const labels = (allPatrimonio || []).map((s) => `${MONTH_NAMES[s.month - 1].slice(0, 3)} ${s.year}`);
  const values = (allPatrimonio || []).map((s) => Number(s.total_patrimonio));

  const canvas = document.getElementById("chart-patrimonio");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const gradFill = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 300);
  gradFill.addColorStop(0, "rgba(124, 92, 255, 0.35)");
  gradFill.addColorStop(1, "rgba(124, 92, 255, 0)");

  if (patrimonioChart) patrimonioChart.destroy();
  patrimonioChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Patrimonio total",
        data: values,
        borderColor: "#7c5cff",
        backgroundColor: gradFill,
        fill: true,
        tension: 0.4,
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#7c5cff",
        pointBorderColor: "#0d1117",
        pointBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1c2333", titleColor: "#eef1f7", bodyColor: "#eef1f7",
          borderColor: "#262e40", borderWidth: 1, padding: 10, cornerRadius: 8,
          callbacks: { label: (item) => `Patrimonio: ${fmt(item.parsed.y)}` },
        },
      },
      scales: {
        y: { grid: { color: "rgba(255,255,255,0.06)" }, border: { display: false }, ticks: { color: "#8792a8", callback: (v) => fmt(v) } },
        x: { grid: { display: false }, border: { display: false }, ticks: { color: "#8792a8" } },
      },
    },
  });
}

// ============================================================
// GASTO POR CATEGORÍA (tarjeta de crédito)
// ============================================================
const CATEGORY_COLORS = {
  "Compras online": "#4f8cff",
  "Supermercado": "#34d399",
  "Combustible": "#fbbf24",
  "Suscripciones": "#7c5cff",
  "Restaurantes": "#f87171",
  "Salud": "#22d3ee",
  "Transporte": "#f472b6",
  "Vestuario": "#a78bfa",
  "Entretenimiento": "#fb923c",
  "Servicios": "#94a3b8",
  "Sin categoría": "#64748b",
};

async function loadCategoryBreakdown() {
  const { data: statements } = await supabase
    .from("credit_card_statements").select("id").eq("month_id", currentMonth.id);
  const statementIds = (statements || []).map((s) => s.id);

  let txs = [];
  if (statementIds.length) {
    const { data } = await supabase
      .from("credit_card_transactions").select("category, amount").in("statement_id", statementIds);
    txs = data || [];
  }

  const totals = {};
  txs.forEach((t) => {
    const cat = t.category || "Sin categoría";
    totals[cat] = (totals[cat] || 0) + Number(t.amount);
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const maxVal = sorted.length ? sorted[0][1] : 0;

  const rankEl = document.getElementById("dashboard-categories");
  if (rankEl) {
    rankEl.innerHTML = sorted.length
      ? sorted.map(([cat, amt]) => `
        <div class="category-row">
          <div class="cat-name" style="color:${CATEGORY_COLORS[cat] || "#4f8cff"}">${icon(cat, 16)}</div>
          <div class="cat-name">${cat}</div>
          <div class="bar-wrap"><div class="bar" style="width:${maxVal ? (amt / maxVal) * 100 : 0}%; background:${CATEGORY_COLORS[cat] || "#4f8cff"}"></div></div>
          <div class="cat-amount">${fmt(amt)}</div>
        </div>`).join("")
      : `<p class="muted">Sin movimientos de tarjeta este mes.</p>`;
  }

  const canvas = document.getElementById("chart-cc-categories");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (ccCategoryChart) { ccCategoryChart.destroy(); ccCategoryChart = null; }
    if (sorted.length) {
      ccCategoryChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: sorted.map(([cat]) => cat),
          datasets: [{
            data: sorted.map(([, amt]) => amt),
            backgroundColor: sorted.map(([cat]) => CATEGORY_COLORS[cat] || "#4f8cff"),
            borderColor: "#151b26",
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "right", labels: { color: "#8792a8", usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
            tooltip: {
              backgroundColor: "#1c2333", titleColor: "#eef1f7", bodyColor: "#eef1f7",
              borderColor: "#262e40", borderWidth: 1, padding: 10, cornerRadius: 8,
              callbacks: { label: (item) => `${item.label}: ${fmt(item.parsed)}` },
            },
          },
        },
      });
    }
  }
}

// ============================================================
// RESUMEN NARRADO DEL MES
// ============================================================
async function loadMonthlySummaryNarrative() {
  const el = document.getElementById("monthly-narrative");
  if (!el) return;

  const { data: summaries } = await supabase
    .from("v_month_summary").select("*").eq("household_id", currentHousehold.id)
    .order("year").order("month");
  if (!summaries || summaries.length === 0) { el.innerHTML = ""; return; }

  const idx = summaries.findIndex((s) => s.month_id === currentMonth.id);
  if (idx === -1) { el.innerHTML = ""; return; }
  const current = summaries[idx];
  const prev = idx > 0 ? summaries[idx - 1] : null;
  const others = summaries.filter((s) => s.month_id !== currentMonth.id);
  const avgTarjeta = others.length ? others.reduce((s, r) => s + Number(r.total_tarjeta), 0) / others.length : null;

  const { data: statements } = await supabase
    .from("credit_card_statements").select("id").eq("month_id", currentMonth.id);
  const statementIds = (statements || []).map((s) => s.id);
  let topCategory = null, topAmount = 0;
  if (statementIds.length) {
    const { data: txs } = await supabase
      .from("credit_card_transactions").select("category, amount").in("statement_id", statementIds);
    const totals = {};
    (txs || []).forEach((t) => {
      const cat = t.category || "Sin categoría";
      totals[cat] = (totals[cat] || 0) + Number(t.amount);
    });
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (sorted.length) { topCategory = sorted[0][0]; topAmount = sorted[0][1]; }
  }

  const ahorro = Number(current.ahorro);
  const parts = [];

  parts.push(ahorro >= 0
    ? `Este mes ahorraste ${fmt(ahorro)}.`
    : `Este mes gastaste ${fmt(Math.abs(ahorro))} más de lo que ingresó.`);

  if (prev) {
    const diff = ahorro - Number(prev.ahorro);
    const prevLabel = `${MONTH_NAMES[prev.month - 1]}`;
    if (diff > 0) parts.push(`Eso es ${fmt(diff)} más que en ${prevLabel}.`);
    else if (diff < 0) parts.push(`Eso es ${fmt(Math.abs(diff))} menos que en ${prevLabel}.`);
  }

  if (avgTarjeta !== null && avgTarjeta > 0) {
    const diffPct = Math.round(((Number(current.total_tarjeta) - avgTarjeta) / avgTarjeta) * 100);
    if (Math.abs(diffPct) >= 5) {
      parts.push(`Gastaste ${Math.abs(diffPct)}% ${diffPct > 0 ? "más" : "menos"} en tarjeta que tu promedio histórico.`);
    }
  }

  if (topCategory) {
    parts.push(`Tu mayor gasto de tarjeta fue en ${topCategory} (${fmt(topAmount)}).`);
  }

  el.innerHTML = `<p>${icon("sparkles", 16)} ${parts.join(" ")}</p>`;
}

// ============================================================
// CHAT CON IA
// ============================================================
let chatMessages = [];

document.getElementById("chat-bubble-toggle").innerHTML = icon("sparkles", 24);

document.getElementById("chat-bubble-toggle").addEventListener("click", () => {
  const popup = document.getElementById("chat-popup");
  const isOpen = popup.style.display === "flex";
  popup.style.display = isOpen ? "none" : "flex";
  if (!isOpen && chatMessages.length === 0) {
    chatMessages.push({ role: "assistant", text: "Hola, pregúntame sobre las finanzas de este hogar (ej: '¿cuánto gasté en restaurantes este mes?')." });
    renderChat();
  }
});
document.getElementById("chat-popup-close").addEventListener("click", () => {
  document.getElementById("chat-popup").style.display = "none";
});

function renderChat() {
  const log = document.getElementById("chat-log");
  if (!log) return;
  log.innerHTML = chatMessages.map((m) => `
    <div class="chat-msg chat-msg-${m.role} ${m.pending ? "pending" : ""}">${escapeHtml(m.text)}</div>
  `).join("");
  log.scrollTop = log.scrollHeight;
}

async function buildChatContext() {
  const { data: summaries } = await supabase
    .from("v_month_summary").select("*").eq("household_id", currentHousehold.id)
    .order("year").order("month");

  const { data: statements } = await supabase
    .from("credit_card_statements").select("id").eq("month_id", currentMonth.id);
  const statementIds = (statements || []).map((s) => s.id);
  const categoryTotals = {};
  if (statementIds.length) {
    const { data: txs } = await supabase
      .from("credit_card_transactions").select("category, amount").in("statement_id", statementIds);
    (txs || []).forEach((t) => {
      const cat = t.category || "Sin categoría";
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(t.amount);
    });
  }

  const { data: patrimonioRow } = await supabase
    .from("v_month_patrimonio").select("total_patrimonio").eq("month_id", currentMonth.id).single();

  return {
    mes_seleccionado: `${MONTH_NAMES[currentMonth.month - 1]} ${currentMonth.year}`,
    resumen_por_mes: (summaries || []).map((s) => ({
      mes: `${MONTH_NAMES[s.month - 1]} ${s.year}`,
      ingresos: Number(s.total_ingresos),
      gastos_fijos: Number(s.total_gastos_fijos),
      gastos_extra: Number(s.total_gastos_extra),
      tarjeta: Number(s.total_tarjeta),
      ahorro: Number(s.ahorro),
    })),
    gasto_por_categoria_mes_seleccionado: categoryTotals,
    patrimonio_cuentas_mes_seleccionado: patrimonioRow ? Number(patrimonioRow.total_patrimonio) : null,
  };
}

document.getElementById("form-chat").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const question = input.value.trim();
  if (!question) return;
  input.value = "";

  chatMessages.push({ role: "user", text: question });
  renderChat();
  chatMessages.push({ role: "assistant", text: "Pensando…", pending: true });
  renderChat();

  try {
    const context = await buildChatContext();
    const { data, error } = await supabase.functions.invoke("ai-chat", {
      body: { question, context },
    });

    chatMessages.pop();
    if (error) {
      chatMessages.push({ role: "assistant", text: "Hubo un error consultando la IA: " + error.message });
    } else if (data && data.error) {
      chatMessages.push({ role: "assistant", text: "Error: " + data.error });
    } else {
      chatMessages.push({ role: "assistant", text: (data && data.answer) || "No hubo respuesta." });
    }
  } catch (err) {
    chatMessages.pop();
    chatMessages.push({ role: "assistant", text: "Error de conexión: " + err.message });
  }
  renderChat();
});

// ============================================================
// LISTA DE COMPRAS
// ============================================================
document.getElementById("form-shopping-item").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("shopping-item-name").value.trim();
  const is_recurring = document.getElementById("shopping-item-recurring").checked;
  if (!name) return;

  const { error } = await supabase.from("shopping_list_items").insert({
    household_id: currentHousehold.id, name, is_recurring,
  });
  if (error) { alert("Error agregando ítem: " + error.message); return; }
  e.target.reset();
  await loadShoppingList();
});

document.getElementById("btn-clear-purchased").addEventListener("click", async () => {
  if (!confirm("¿Borrar todos los ítems comprados de la lista?")) return;
  await supabase.from("shopping_list_items")
    .delete().eq("household_id", currentHousehold.id).eq("is_purchased", true);
  await loadShoppingList();
});

async function loadShoppingList() {
  const { data } = await supabase
    .from("shopping_list_items").select("*").eq("household_id", currentHousehold.id)
    .order("created_at");
  const items = data || [];

  const pending = items.filter((i) => !i.is_purchased);
  const purchased = items.filter((i) => i.is_purchased);

  const renderItem = (item) => `
    <div class="shopping-item ${item.is_purchased ? "purchased" : ""}">
      <input type="checkbox" data-shopping-id="${item.id}" data-recurring="${item.is_recurring}" ${item.is_purchased ? "checked" : ""} />
      <span class="shopping-name">${escapeHtml(item.name)}</span>
      ${item.is_recurring ? '<span class="recurring-badge">Recurrente</span>' : ""}
      <button class="btn-danger" data-del-shopping="${item.id}">${icon("trash", 14)}</button>
    </div>`;

  document.getElementById("shopping-list-pending").innerHTML = pending.length
    ? pending.map(renderItem).join("")
    : `<p class="muted">No hay nada pendiente por comprar.</p>`;

  document.getElementById("shopping-list-purchased").innerHTML = purchased.length
    ? purchased.map(renderItem).join("")
    : `<p class="muted">Nada comprado todavía.</p>`;

  document.querySelectorAll("[data-shopping-id]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const id = cb.dataset.shoppingId;
      const isRecurring = cb.dataset.recurring === "true";
      const nowPurchased = cb.checked;

      await supabase.from("shopping_list_items").update({
        is_purchased: nowPurchased, purchased_at: nowPurchased ? new Date().toISOString() : null,
      }).eq("id", id);

      // Si es recurrente y se acaba de marcar como comprado, vuelve solo a la lista
      if (nowPurchased && isRecurring) {
        const { data: item } = await supabase.from("shopping_list_items").select("name").eq("id", id).single();
        if (item) {
          await supabase.from("shopping_list_items").insert({
            household_id: currentHousehold.id, name: item.name, is_recurring: true,
          });
        }
      }
      await loadShoppingList();
    });
  });

  document.querySelectorAll("[data-del-shopping]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await supabase.from("shopping_list_items").delete().eq("id", btn.dataset.delShopping);
      await loadShoppingList();
    });
  });
}

// ============================================================
// PLANIFICACIÓN DEL HOGAR (actividades / eventos)
// ============================================================
document.getElementById("form-event").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("event-title").value.trim();
  const description = document.getElementById("event-description").value.trim();
  const startRaw = document.getElementById("event-start").value;
  const endRaw = document.getElementById("event-end").value;
  if (!title || !startRaw) return;

  const { error } = await supabase.from("household_events").insert({
    household_id: currentHousehold.id,
    title,
    description: description || null,
    start_at: new Date(startRaw).toISOString(),
    end_at: endRaw ? new Date(endRaw).toISOString() : null,
    created_by: currentUser.id,
    created_by_email: currentUser.email,
  });
  if (error) { alert("Error agregando actividad: " + error.message); return; }
  e.target.reset();
  await loadEvents();
});

function formatEventDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("es-CL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function googleCalendarLink(ev) {
  const fmtGCal = (iso) => iso.replace(/[-:]/g, "").split(".")[0] + "Z";
  const start = fmtGCal(ev.start_at);
  const end = ev.end_at ? fmtGCal(ev.end_at) : fmtGCal(new Date(new Date(ev.start_at).getTime() + 60 * 60 * 1000).toISOString());
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${start}/${end}`,
    details: ev.description || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function loadEvents() {
  const { data } = await supabase
    .from("household_events").select("*").eq("household_id", currentHousehold.id)
    .order("start_at", { ascending: true });
  allHouseholdEvents = data || [];

  const el = document.getElementById("events-list");
  el.innerHTML = allHouseholdEvents.length
    ? allHouseholdEvents.map((ev) => renderEventCard(ev)).join("")
    : `<p class="muted">No hay actividades agendadas.</p>`;
  attachEventDeleteHandlers(el);

  renderCalendarGrid();
}

function renderEventCard(ev) {
  return `
    <div class="event-card">
      <div class="event-info">
        <div class="event-title">${escapeHtml(ev.title)}</div>
        <div class="event-time">${formatEventDateTime(ev.start_at)}${ev.end_at ? " – " + formatEventDateTime(ev.end_at) : ""}</div>
        ${ev.description ? `<div class="event-desc">${escapeHtml(ev.description)}</div>` : ""}
        ${ev.created_by_email ? `<div class="event-desc">Agregado por ${escapeHtml(ev.created_by_email)}</div>` : ""}
      </div>
      <div class="event-actions">
        <a class="event-gcal-link" href="${googleCalendarLink(ev)}" target="_blank" rel="noopener">+ Google Calendar</a>
        <button class="btn-danger" data-del-event="${ev.id}">${icon("trash", 14)}</button>
      </div>
    </div>`;
}

function attachEventDeleteHandlers(container) {
  container.querySelectorAll("[data-del-event]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await supabase.from("household_events").delete().eq("id", btn.dataset.delEvent);
      await loadEvents();
    });
  });
}

// ---------------- CALENDARIO VISUAL (cuadrícula mensual) ----------------
let allHouseholdEvents = [];
let calendarViewDate = new Date();

function renderCalendarGrid() {
  const grid = document.getElementById("calendar-grid");
  if (!grid) return;

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth(); // 0-indexado
  document.getElementById("calendar-month-label").textContent = `${MONTH_NAMES[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekdayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  let html = weekdayLabels.map((w) => `<div class="calendar-weekday">${w}</div>`).join("");
  for (let i = 0; i < startWeekday; i++) html += `<div class="calendar-day empty"></div>`;

  const todayStr = new Date().toDateString();
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const isToday = cellDate.toDateString() === todayStr;
    const dayEvents = allHouseholdEvents.filter((ev) => {
      const d = new Date(ev.start_at);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
    html += `
      <div class="calendar-day ${isToday ? "today" : ""}" data-cal-day="${day}">
        <div class="calendar-day-num">${day}</div>
        <div class="calendar-day-dots">${dayEvents.slice(0, 4).map(() => `<span class="calendar-dot"></span>`).join("")}</div>
      </div>`;
  }
  grid.innerHTML = html;

  grid.querySelectorAll("[data-cal-day]").forEach((cell) => {
    cell.addEventListener("click", () => {
      grid.querySelectorAll(".calendar-day").forEach((c) => c.classList.remove("selected"));
      cell.classList.add("selected");
      renderDayEvents(year, month, Number(cell.dataset.calDay));
    });
  });
}

function renderDayEvents(year, month, day) {
  const dayEvents = allHouseholdEvents.filter((ev) => {
    const d = new Date(ev.start_at);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });
  const el = document.getElementById("calendar-day-events");
  el.innerHTML = dayEvents.length
    ? dayEvents.map((ev) => renderEventCard(ev)).join("")
    : `<p class="muted">Sin actividades ese día.</p>`;
  attachEventDeleteHandlers(el);
}

document.getElementById("btn-cal-prev").addEventListener("click", () => {
  calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
  renderCalendarGrid();
});
document.getElementById("btn-cal-next").addEventListener("click", () => {
  calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
  renderCalendarGrid();
});

// ---------------- INIT ----------------
initAuthTabs();
