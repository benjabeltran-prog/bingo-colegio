// ============================================================
// PARSER DE CARTOLA DE TARJETA DE CRÉDITO - SANTANDER (Chile)
// ------------------------------------------------------------
// Validado contra una cartola real de 7 páginas (formato "ESTADO DE
// CUENTA EN MONEDA NACIONAL DE TARJETA DE CRÉDITO"). Con esa cartola,
// el desglose suma EXACTO el "MONTO TOTAL FACTURADO A PAGAR".
//
// Reglas clave del formato:
// - Cada línea de movimiento real trae: [LUGAR opcional] FECHA
//   DESCRIPCIÓN [tasa interés %] [$ monto origen] [$ monto total a
//   pagar] [Nº cuota "01/03"] $ monto (cargo del mes real).
// - El ÚLTIMO monto "$" de la línea es siempre el cargo de ESTE mes
//   (para compras al contado es el único monto; en cuotas, es el
//   valor de la cuota mensual). Es el que usamos como `amount`.
// - Se descartan: líneas sin fecha o con MÁS DE UNA fecha completa
//   (esto último detecta filas corruptas donde el extractor de texto
//   fusiona por error las dos cajas "COMPROBANTE DE PAGO" de la
//   página 1, que quedan una al lado de la otra).
// - Se descarta explícitamente "MONTO CANCELADO" (es un abono/pago
//   del período anterior, no un gasto) y las líneas "PAGAR HASTA" /
//   "...FACTURADO A PAGAR" (son resúmenes, no movimientos).
// - Todo lo que aparece después de la sección "4. INFORMACIÓN COMPRAS
//   EN CUOTAS EN EL PERIODO" se ignora: es solo informativo (un
//   desglose de cuotas ya contado en la sección de movimientos) y
//   sumarlo de nuevo duplica el total.
//
// Sigue siendo heurístico para OTRAS cartolas Santander (formato de
// tarjeta distinto, otro tipo de cuenta, etc.) — por eso SIEMPRE se
// muestra la tabla de revisión antes de guardar. Si falla mucho con
// otra cartola tuya, compárteme 2-3 líneas de ejemplo y la ajusto.
// ============================================================

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const ROW_TOLERANCE = 3; // puntos PDF de tolerancia vertical para agrupar palabras en una misma fila

/**
 * Extrae texto del PDF agrupando por línea visual. En vez de redondear
 * cada palabra a un "bucket" Y fijo (lo que puede partir una misma fila
 * en dos cuando su Y cae justo en el borde de un bucket), se agrupan
 * palabras consecutivas (ordenadas por Y) cuya distancia a la primera
 * palabra de la fila actual es menor a ROW_TOLERANCE. Dentro de cada
 * fila, las palabras se ordenan por X (izquierda a derecha).
 */
async function extractLines(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lines = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    const words = content.items
      .map((item) => ({ x: item.transform[4], y: item.transform[5], str: item.str }))
      .filter((w) => w.str.trim().length > 0);

    // pdf.js: Y crece hacia ARRIBA de la página -> ordenar descendente = de arriba hacia abajo
    words.sort((a, b) => b.y - a.y);

    const rows = [];
    let current = [];
    let refY = null;
    for (const w of words) {
      if (refY === null || Math.abs(w.y - refY) <= ROW_TOLERANCE) {
        current.push(w);
        if (refY === null) refY = w.y;
      } else {
        rows.push(current);
        current = [w];
        refY = w.y;
      }
    }
    if (current.length) rows.push(current);

    rows.forEach((row) => {
      const text = row
        .sort((a, b) => a.x - b.x)
        .map((w) => w.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) lines.push(text);
    });
  }
  return lines;
}

function parseCLPNumber(str) {
  // "$ 45.990" -> 45990 ; "$ -1.766.943" -> -1766943
  const clean = str.replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

const DATE_RE_SINGLE = /\d{2}\/\d{2}\/(\d{4}|\d{2})/;
const DATE_RE_GLOBAL = /\d{2}\/\d{2}\/(\d{4}|\d{2})/g;
const CUOTA_RE = /\b(\d{1,2})\s?\/\s?(\d{1,2})\b/;
const AMOUNT_GLOBAL_RE = /\$ ?-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g;
const PERCENT_TOKEN_RE = /\d{1,3},\d{2}\s?%/g;

const EXCLUDE_LINE_RE = /pagar hasta|facturado a pagar|monto cancelado/i;
const STOP_SECTION_RE = /informacion compras en cuotas/i;

const FILLER_PATTERNS = [
  /N\/CUOTAS PRECIO/gi,
  /TRES CUOTAS PREC/gi,
  /CUOTA COMERCIO/gi,
  /COMPRAS P\.A\.T\./gi,
  /\d{1,2}\s*CUOTAS COMERC/gi,
];

function normalizeDate(d) {
  const [dd, mm, yyRaw] = d.split("/");
  const yy = yyRaw.length === 2 ? "20" + yyRaw : yyRaw;
  return `${yy}-${mm}-${dd}`;
}

function parseLineToTransaction(line) {
  if (EXCLUDE_LINE_RE.test(line)) return null;

  // Exactamente UNA fecha completa en la línea. Ninguna (encabezados,
  // saldos) o más de una (filas corruptas / cajas fusionadas) se descartan.
  const dateMatches = [...line.matchAll(DATE_RE_GLOBAL)];
  if (dateMatches.length !== 1) return null;
  const dateStr = dateMatches[0][0];
  const dateIndex = dateMatches[0].index;

  const amounts = [...line.matchAll(AMOUNT_GLOBAL_RE)].map((m) => m[0]);
  if (amounts.length === 0) return null;

  const amount = parseCLPNumber(amounts[amounts.length - 1]);
  if (amount === null) return null;

  const withoutDate = line.slice(0, dateIndex) + " " + line.slice(dateIndex + dateStr.length);
  const cuotaMatch = withoutDate.match(CUOTA_RE);
  const cuota = cuotaMatch ? `${cuotaMatch[1]}/${cuotaMatch[2]}` : null;

  let desc = line.replace(dateStr, " ");
  amounts.forEach((a) => { desc = desc.replace(a, " "); });
  if (cuotaMatch) desc = desc.replace(cuotaMatch[0], " ");
  desc = desc.replace(PERCENT_TOKEN_RE, " ");
  FILLER_PATTERNS.forEach((re) => { desc = desc.replace(re, " "); });
  desc = desc.replace(/\s+/g, " ").trim();

  if (!desc || desc.length < 2) return null;
  if (amount === 0 && !cuota) return null;

  return {
    transaction_date: normalizeDate(dateStr),
    description: desc,
    installment_info: cuota,
    amount: Math.abs(amount),
    category: guessCategory(desc),
  };
}

const CATEGORY_KEYWORDS = {
  "Compras online": ["mercado libre", "mercadolibre", "mercadopago", "mercado pago"],
  Supermercado: ["lider", "jumbo", "santa isabel", "unimarc", "tottus", "supermercado", "supermercados", "minimarket"],
  Combustible: ["copec", "shell", "petrobras", "combustible"],
  Suscripciones: ["netflix", "spotify", "disney", "hbo", "amazon prime", "youtube", "starlink"],
  Restaurantes: ["restaurant", "rappi", "pedidosya", "uber eats", "delivery", "mc donalds", "mcdonalds", "papajohns", "cafe", "café", "churros"],
  Salud: ["farmacia", "cruz verde", "cruzverde", "salcobrand", "clinica", "clínica"],
  Transporte: ["uber", "cabify", "didi", "metro", "peaje", "parking", "starken"],
  Vestuario: ["falabella", "paris", "ripley", "h&m", "zara"],
  Entretenimiento: ["cine", "cines", "casino", "juegos", "games"],
  Servicios: ["aguas", "luz", "gas natural", "movistar", "entel", "wom", "claro", "internet"],
};

function guessCategory(desc) {
  const lower = desc.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return cat;
  }
  return "Sin categoría";
}

function findStatementTotal(lines) {
  for (const line of lines) {
    if (/monto total facturado a pagar/i.test(line) && !/anterior/i.test(line)) {
      const amounts = [...line.matchAll(AMOUNT_GLOBAL_RE)].map((m) => m[0]);
      if (amounts.length) return parseCLPNumber(amounts[amounts.length - 1]);
    }
  }
  for (const line of lines) {
    if (/total a pagar/i.test(line) && !/anterior/i.test(line)) {
      const amounts = [...line.matchAll(AMOUNT_GLOBAL_RE)].map((m) => m[0]);
      if (amounts.length) return parseCLPNumber(amounts[amounts.length - 1]);
    }
  }
  return null;
}

/**
 * Función principal: recibe un File (PDF) y devuelve
 * { transactions: [...], suggestedTotal: number|null }
 */
export async function parseSantanderStatement(file) {
  const lines = await extractLines(file);
  const transactions = [];
  let stop = false;

  for (const line of lines) {
    if (STOP_SECTION_RE.test(line)) stop = true;
    if (stop) continue;
    const tx = parseLineToTransaction(line);
    if (tx) transactions.push(tx);
  }

  const total = findStatementTotal(lines);
  const suggestedTotal = total !== null ? total : (transactions.length ? transactions.reduce((s, t) => s + t.amount, 0) : null);

  return { transactions, suggestedTotal };
}
