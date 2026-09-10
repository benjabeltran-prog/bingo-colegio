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
// MENÚ DESPLEGABLE DE ACCIONES
// ============================================================
const actionsMenuBtn = document.getElementById("btn-actions-menu");
const actionsDropdown = document.getElementById("actions-dropdown");

actionsMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  actionsDropdown.classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (!actionsDropdown.contains(e.target) && e.target !== actionsMenuBtn) {
    actionsDropdown.classList.remove("open");
  }
});
actionsDropdown.querySelectorAll(".dropdown-item").forEach((item) => {
  item.addEventListener("click", () => actionsDropdown.classList.remove("open"));
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
  await Promise.all([
    loadIncomes(), loadFixedExpenses(), loadExtraExpenses(), loadCreditCardTransactions(), loadAccounts(), loadCategoryBreakdown(),
  ]);
  await loadDashboard();
  await loadHistory();
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
      <td><button class="btn-danger" data-del-income="${r.id}">✕</button></td>
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
      <td><button class="btn-danger" data-del-fixed="${r.id}">✕</button></td>
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
      <td><button class="btn-danger" data-del-extra="${r.id}">✕</button></td>
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

document.getElementById("pdf-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("pdf-status").textContent = "Leyendo PDF...";

  try {
    const { transactions, suggestedTotal } = await parseSantanderStatement(file);
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
      <td><button class="btn-danger" data-remove-preview="${i}">✕</button></td>
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
  tbody.innerHTML = (txs || []).map((t) => `
    <tr><td>${t.transaction_date || "-"}</td><td>${t.description}</td><td>${t.installment_info || "-"}</td><td>${fmt(t.amount)}</td><td>${t.category}</td></tr>
  `).join("");
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
          <td><button class="btn-danger" data-del-account="${a.id}">✕</button></td>
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
        <td><button class="btn-danger" data-del-account="${a.id}">✕</button></td>
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

// ---------------- INIT ----------------
initAuthTabs();
