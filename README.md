# 💰 Finanzas del Hogar

App web para administrar las finanzas de un hogar con dos ingresos: ingresos, gastos
fijos, gastos extra, desglose automático de cartola de tarjeta de crédito (Santander),
dashboard consolidado, historial mes a mes, y soporte multi-hogar (tipo SaaS: cualquier
persona puede crear su cuenta y su propio hogar, o unirse a uno existente con un código).

Stack: HTML/CSS/JS plano (sin build) + **Supabase** (Postgres, Auth, Storage) + Chart.js
+ PDF.js. Se despliega gratis en **GitHub Pages**.

---

## 1. Crear el proyecto en Supabase

1. Ve a https://supabase.com → **New project** (plan gratis está bien).
2. Cuando esté listo, ve a **SQL Editor → New query**, pega TODO el contenido de
   `sql/schema.sql` de este repo, y ejecútalo (▶ Run). Esto crea las tablas, las
   políticas de seguridad (RLS) y el bucket de almacenamiento `cartolas`.
3. Ve a **Authentication → Providers** y confirma que "Email" esté habilitado.
   - Opcional: en **Authentication → Settings**, puedes desactivar "Confirm email"
     mientras pruebas, para no tener que confirmar cada cuenta por correo.
4. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key

## 2. Conectar la app a tu proyecto

Abre `js/supabaseClient.js` y reemplaza:

```js
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU-ANON-KEY-PUBLICA";
```

con los valores reales que copiaste. Guarda el archivo.

## 3. Probar localmente (opcional)

Puedes simplemente abrir `index.html` en el navegador, o servirlo con cualquier
servidor estático, por ejemplo:

```bash
npx serve .
```

## 4. Subir a GitHub y publicar con GitHub Pages

```bash
cd hogar-finanzas
git init
git add .
git commit -m "Primera versión de Finanzas del Hogar"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/hogar-finanzas.git
git push -u origin main
```

Luego en GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
En un par de minutos quedará publicada en algo como
`https://TU-USUARIO.github.io/hogar-finanzas/`.

## 5. Uso

1. Entra a la app, crea tu cuenta (o inicia sesión).
2. Si es tu primera vez, te pedirá crear un hogar o unirte a uno con un código.
   - Al crear un hogar se genera un **código de invitación** (botón ⚙️ Hogares
     para verlo). Compártelo con quien más registre ingresos/gastos en el mismo hogar.
3. La app crea automáticamente el mes actual la primera vez. Usa "+ Nuevo mes" para
   avanzar de mes — los meses anteriores quedan guardados y se acumulan en el
   Historial y el gráfico del Dashboard.
4. En la pestaña **Tarjeta de Crédito**, sube el PDF de tu cartola Santander: la app
   intenta desglosar los movimientos automáticamente. **Siempre revisa la tabla antes
   de confirmar** — puedes editar fechas, montos, descripciones o categorías, y
   borrar líneas mal detectadas.

## Notas sobre el parser de PDF (importante)

El desglose automático (`js/pdfParser.js`) es un primer intento basado en el formato
típico de cartolas Santander (fecha + descripción + N° de cuotas + monto, por línea).
No pude probarlo contra un PDF real tuyo, así que es posible que:
- Algunas líneas no se detecten bien la primera vez.
- El total facturado no se detecte automáticamente (en ese caso, tendrás que
  escribirlo tú mismo en el campo "Total facturado" antes de confirmar).

Si después de probarlo con una cartola real ves que falla mucho, compárteme 2-3
líneas de ejemplo del texto (sin datos sensibles como el número de tarjeta) y
ajusto las expresiones regulares del parser.

## Estructura del proyecto

```
hogar-finanzas/
├── index.html              # Toda la interfaz (login + app)
├── css/style.css           # Estilos
├── js/
│   ├── supabaseClient.js   # Configuración de conexión a Supabase
│   ├── pdfParser.js        # Parser de cartola Santander
│   └── app.js              # Lógica de la app (auth, hogares, meses, CRUD, dashboard)
└── sql/schema.sql          # Esquema completo de base de datos + seguridad (RLS)
```

## Modelo de datos (resumen)

- `households` / `household_members` → multi-hogar tipo SaaS, con código de invitación.
- `months` → un registro por hogar/año/mes.
- `incomes`, `fixed_expenses`, `extra_expenses` → líneas de detalle por mes.
- `credit_card_statements` / `credit_card_transactions` → cartola + desglose.
- Vista `v_month_summary` → totales consolidados y ahorro por mes (usada en
  Dashboard e Historial).

La seguridad (Row Level Security) está configurada para que cada usuario solo vea
los datos de los hogares a los que pertenece.
