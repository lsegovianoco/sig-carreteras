"use strict";
const path = require("path");

const ALLOWED_EXT = new Set([".kml", ".kmz", ".geojson", ".json"]);
const MAX_SIZE = 100 * 1024 * 1024;

const GEOJSON_TYPES = new Set([
  "FeatureCollection", "Feature", "GeometryCollection",
  "Point", "MultiPoint", "LineString", "MultiLineString",
  "Polygon", "MultiPolygon"
]);

function validateExtension(originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error("Formato no admitido. Usa KML, KMZ, GeoJSON o JSON.");
  }
  return ext;
}

function validateContent(ext, buffer) {
  try {
    if (ext === ".json" || ext === ".geojson") {
      const j = JSON.parse(buffer.toString("utf8"));
      if (!j || typeof j !== "object" || !GEOJSON_TYPES.has(j.type)) {
        return { ok: false, error: "El JSON no es un GeoJSON válido (falta 'type' reconocido)." };
      }
      return { ok: true };
    }
    if (ext === ".kml") {
      const head = buffer.toString("utf8", 0, Math.min(buffer.length, 8192));
      if (!/<kml[\s>]/i.test(head) && !/<Document[\s>]/i.test(head)) {
        return { ok: false, error: "El KML no contiene etiquetas <kml> o <Document>." };
      }
      return { ok: true };
    }
    if (ext === ".kmz") {
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        return { ok: false, error: "El KMZ no es un ZIP válido." };
      }
      return { ok: true };
    }
    return { ok: false, error: "Extensión no reconocida." };
  } catch (e) {
    return { ok: false, error: "No se pudo parsear el archivo: " + e.message };
  }
}

module.exports = { ALLOWED_EXT, MAX_SIZE, validateExtension, validateContent };