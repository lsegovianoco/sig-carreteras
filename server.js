"use strict";
const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs");
const https = require("https");
const multer = require("multer");
const store = require("./lib/storage");
const { validateExtension, validateContent, MAX_SIZE } = require("./lib/validate");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const VERSION = "2.1.0";

store.ensureDir();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/catalogo/archivos", express.static(store.DIR, { index: false, dotfiles: "deny" }));

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const t = req.get("x-admin-token") || req.query.token;
  if (t !== ADMIN_TOKEN) return res.status(401).json({ error: "No autorizado. Token de administrador incorrecto." });
  next();
}

const storage = multer.diskStorage({
  destination: (_r, _f, cb) => cb(null, store.DIR),
  filename: (_r, f, cb) => {
    const n = store.cleanName(f.originalname);
    const e = path.extname(n).toLowerCase();
    const stem = path.basename(n, e) || "capa";
    const uniq = `${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${e}`;
    cb(null, uniq);
  },
});
const upload = multer({
  storage,
limits: { fileSize: 1024 * 1024 * 1024, files: 20 },
  fileFilter: (_r, f, cb) => {
    try { validateExtension(f.originalname); cb(null, true); }
    catch (e) { cb(e); }
  },
});

app.get("/api/health", (_r, res) =>
  res.json({ ok: true, name: "SIG-Carreteras PEC", version: VERSION, authRequired: !!ADMIN_TOKEN })
);

app.get("/api/catalogo", (_r, res) => {
  res.set("Cache-Control", "public, max-age=15");
  const list = store.read().map((x) => ({
    ...x,
    url: `/catalogo/archivos/${encodeURIComponent(x.filename)}`,
  }));
  res.json(list);
});

app.post("/api/catalogo", requireAdmin, upload.array("archivos", 20), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "No se recibieron archivos." });

  const invalid = [];
  const accepted = [];
  for (const f of files) {
    const ext = path.extname(f.originalname).toLowerCase();
    let buf;
    try { buf = fs.readFileSync(f.path); }
    catch { invalid.push({ file: f.originalname, error: "No se pudo leer." }); continue; }
    const v = validateContent(ext, buf);
    if (!v.ok) {
      invalid.push({ file: f.originalname, error: v.error });
      try { fs.unlinkSync(f.path); } catch {}
    } else {
      accepted.push(f);
    }
  }

  if (!accepted.length) {
    return res.status(400).json({ error: "Ningún archivo pasó la validación.", invalid });
  }

  const list = store.read();
  const added = accepted.map((f) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    filename: f.filename,
    originalName: f.originalname,
    size: f.size,
    uploadedAt: new Date().toISOString(),
    source: "Carga local",
  }));
  store.write(list.concat(added));
  res.status(201).json({ ok: true, added, invalid });
});

app.delete("/api/catalogo/:id", requireAdmin, (req, res) => {
  const list = store.read();
  const item = list.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: "No se encontró la capa." });
  try {
    const p = store.safePath(item.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    return res.status(400).json({ error: "Ruta inválida o no se pudo borrar." });
  }
  store.write(list.filter((x) => x.id !== item.id));
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  const code = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
  res.status(code).json({ error: err.message || "Error de solicitud." });
});

app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(__dirname, "public", "index.html"), (err) => { if (err) next(err); });
});

// --- Arranque con HTTPS (si existen los certificados) ---
const KEY_FILE = path.join(__dirname, "localhost+2-key.pem");
const CERT_FILE = path.join(__dirname, "localhost+2.pem");

let server;
if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) {
  server = https.createServer({
    key: fs.readFileSync(KEY_FILE),
    cert: fs.readFileSync(CERT_FILE)
  }, app);
  console.log("\n🔒 Modo HTTPS ACTIVADO (Seguro)");
} else {
  server = require("http").createServer(app);
  console.log("\n⚠️ Modo HTTP normal (GPS podría no funcionar)");
}

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n=== SIG-CARRETERAS PEC v" + VERSION + " ===");
  console.log(`Esta computadora: http${fs.existsSync(KEY_FILE) ? 's' : ''}://127.0.0.1:${PORT}`);
  for (const [name, arr] of Object.entries(os.networkInterfaces()))
    for (const a of arr || [])
      if (a.family === "IPv4" && !a.internal) console.log(`Red local (${name}): http${fs.existsSync(KEY_FILE) ? 's' : ''}://${a.address}:${PORT}`);
  console.log(`Catálogo compartido: ${store.DIR}`);
  console.log(`Autenticación admin: ${ADMIN_TOKEN ? "ACTIVADA" : "DESACTIVADA (define ADMIN_TOKEN)"}`);
  console.log("Mantén abierta esta ventana. Ctrl+C para detener.\n");
});