"use strict";
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "catalogo");
const META = path.join(DIR, "catalogo.json");

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(META)) fs.writeFileSync(META, "[]", "utf8");
}

function read() {
  ensureDir();
  try {
    const raw = fs.readFileSync(META, "utf8");
    const x = JSON.parse(raw);
    return Array.isArray(x) ? x : [];
  } catch (e) {
    try {
      const bak = META + ".bak-" + Date.now();
      fs.copyFileSync(META, bak);
      console.error(`[storage] catalogo.json corrupto. Backup en ${bak}`);
    } catch {}
    return [];
  }
}

function write(list) {
  ensureDir();
  const tmp = META + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
  fs.renameSync(tmp, META);
}

function safePath(filename) {
  const base = path.basename(String(filename || ""));
  const full = path.resolve(DIR, base);
  const root = path.resolve(DIR) + path.sep;
  if (!full.startsWith(root)) throw new Error("Ruta inválida");
  return full;
}

function cleanName(s) {
  return String(s || "capa")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);
}

module.exports = { DIR, META, ensureDir, read, write, safePath, cleanName };