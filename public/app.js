"use strict";

// ===== Login =====
const PASSWORD = "admin123"; // <--- AQUÍ PUEDES CAMBIAR LA CONTRASEÑA DE ACCESO

if (sessionStorage.getItem("loggedIn") === "true") {
  document.getElementById("loginScreen").style.display = "none";
}

document.getElementById("btnLogin").addEventListener("click", () => {
  if (document.getElementById("loginPass").value === PASSWORD) {
    sessionStorage.setItem("loggedIn", "true");
    document.getElementById("loginScreen").style.display = "none";
  } else {
    document.getElementById("loginError").style.display = "block";
  }
});

// ===== Mapa =====
const map = L.map("map").setView([21.019, -101.257], 8);
const bases = {
  "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }),
  "OpenTopoMap": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "&copy; OpenTopoMap" }),
};
bases.OpenStreetMap.addTo(map);
L.control.layers(bases, null, { collapsed: true }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);

// ===== Estado =====
const $ = (id) => document.getElementById(id);
const layers = [];
const catalog = new Map();
const palette = ["#1677c8", "#e17c24", "#16835d", "#8b5bc7", "#be4b62"];
const renderer = L.canvas({ padding: 0.5 });
const attrColors = ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#ffff33", "#a65628", "#f781bf", "#999999", "#66c2a5"];

let point = null, marker = null, highlight = null;
let isSelectMode = false;
const selectedFeatures = [];

// ===== Utilidades =====
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let msgTimer = null;
function msg(t) {
  const el = $("uploadStatus");
  if (!el) return;
  el.textContent = t;
  el.style.borderLeft = "3px solid var(--blue)";
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { el.style.borderLeft = ""; }, 5000);
}

// ===== Health check =====
async function pingServer() {
  try {
    const r = await fetch("/api/health");
    const x = await r.json();
    $("serverStatus").textContent = `Servidor activo · v${x.version}`;
    if (x.authRequired) $("adminHint").textContent = "🔒 Token requerido.";
    else $("adminHint").textContent = "";
  } catch {
    $("serverStatus").textContent = "Sin conexión";
  }
}
pingServer();
setInterval(pingServer, 30000);

// ===== Auth admin =====
function adminHeaders() {
  const t = localStorage.getItem("adminToken") || "";
  return t ? { "x-admin-token": t } : {};
}
$("btnSetToken").addEventListener("click", () => {
  const t = prompt("Token de administrador:", localStorage.getItem("adminToken") || "");
  if (t === null) return;
  if (t) localStorage.setItem("adminToken", t);
  else localStorage.removeItem("adminToken");
  msg(t ? "Token guardado." : "Token eliminado.");
});

// ===== Capas y Estilos =====
function addLayer(gj, name, meta = {}) {
  if (gj.type === "Feature") gj = { type: "FeatureCollection", features: [gj] };
  if (gj.type === "GeometryCollection") {
    gj = { type: "FeatureCollection", features: gj.geometries.map((g) => ({ type: "Feature", properties: {}, geometry: g })) };
  }
  if (gj.type !== "FeatureCollection") throw Error("GeoJSON no válido.");

  const color = palette[layers.length % palette.length];
  
  const defaultStyle = (f) => ({
    color,
    weight: (f.geometry?.type || "").includes("Line") ? 4 : 2,
    fillColor: color,
    fillOpacity: 0.14,
  });

  const l = L.geoJSON(gj, {
    renderer,
    style: defaultStyle,
    pointToLayer: (_f, ll) => L.circleMarker(ll, { radius: 5, color, fillColor: color, fillOpacity: 0.8 }),
    onEachFeature: (f, ly) => {
      const p = Object.entries(f.properties || {})
        .slice(0, 12)
        .map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(typeof v === "object" ? JSON.stringify(v) : v)}</div>`)
        .join("");
      if (p) ly.bindPopup(p);
    },
  });
  l.addTo(map);

  const featureBounds = [];
  l.eachLayer((ly) => {
    if (ly.feature) {
      try { featureBounds.push({ feature: ly.feature, bounds: ly.getBounds() }); } catch {}
    }
  });

  layers.push({ name, gj, leaflet: l, meta, visible: true, featureBounds, defaultStyle, color });

  updateAttributeDropdown(gj);
  updateFilterLayerDropdown(name);
  updateLegend();
}

function updateAttributeDropdown(gj) {
  const select = $("colorAttr");
  const panel = $("stylePanel");
  
  if (!gj.features || !gj.features.length) return;
  const props = gj.features[0].properties || {};
  const keys = Object.keys(props);
  
  if (keys.length > 0) {
    panel.style.display = "block";
    select.innerHTML = '<option value="">-- Color por defecto --</option>';
    keys.forEach(k => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      select.appendChild(opt);
    });
  }
}

$("colorAttr").addEventListener("change", (e) => {
  const attr = e.target.value;
  if (layers.length === 0) return;
  const targetLayer = layers[layers.length - 1]; 
  
  if (!attr) {
    targetLayer.leaflet.setStyle(targetLayer.defaultStyle);
    updateLegend();
    return;
  }

  const uniqueValues = new Set();
  targetLayer.gj.features.forEach(f => {
    const val = f.properties ? f.properties[attr] : null;
    if (val !== undefined && val !== null) uniqueValues.add(String(val));
  });

  const colorMap = {};
  let i = 0;
  uniqueValues.forEach(val => {
    colorMap[val] = attrColors[i % attrColors.length];
    i++;
  });

  targetLayer.leaflet.setStyle((f) => {
    const val = f.properties ? String(f.properties[attr]) : "";
    const c = colorMap[val] || "#999999";
    return { color: c, fillColor: c, weight: (f.geometry?.type || "").includes("Line") ? 4 : 2, fillOpacity: 0.6 };
  });

  updateLegend(colorMap);
  msg(`Coloreando por: ${attr}`);
});

// ===== Filtros =====
function updateFilterLayerDropdown(name) {
  const select = $("filterLayerSelect");
  $("filterPanel").style.display = "block";
  
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  select.appendChild(opt);
}

$("filterLayerSelect").addEventListener("change", (e) => {
  const layerName = e.target.value;
  const attrSelect = $("filterAttrSelect");
  const valSelect = $("filterValueSelect");
  
  attrSelect.innerHTML = '<option value="">-- Seleccionar campo --</option>';
  valSelect.innerHTML = '<option value="">-- Todos los valores --</option>';
  
  if (!layerName) return;
  
  const layer = layers.find(l => l.name === layerName);
  if (!layer || !layer.gj.features) return;
  
  const props = layer.gj.features[0].properties || {};
  Object.keys(props).forEach(k => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    attrSelect.appendChild(opt);
  });
});

$("filterAttrSelect").addEventListener("change", (e) => {
  const layerName = $("filterLayerSelect").value;
  const attr = e.target.value;
  const valSelect = $("filterValueSelect");
  
  valSelect.innerHTML = '<option value="">-- Todos los valores --</option>';
  if (!layerName || !attr) return;
  
  const layer = layers.find(l => l.name === layerName);
  const uniqueValues = new Set();
  layer.gj.features.forEach(f => {
    const val = f.properties ? f.properties[attr] : null;
    if (val !== undefined && val !== null) uniqueValues.add(String(val));
  });
  
  uniqueValues.forEach(val => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    valSelect.appendChild(opt);
  });
});

$("filterValueSelect").addEventListener("change", (e) => {
  const layerName = $("filterLayerSelect").value;
  const attr = $("filterAttrSelect").value;
  const val = e.target.value;
  
  if (!layerName) return;
  
  const layer = layers.find(l => l.name === layerName);
  if (!layer) return;

  if (!attr || !val) {
    layer.leaflet.setStyle(layer.defaultStyle);
    layer.leaflet.eachLayer(ly => {
      if (ly.setStyle) ly.setStyle({ opacity: 1, fillOpacity: 0.6 });
    });
    msg("Mostrando todos los elementos.");
    return;
  }

  layer.leaflet.eachLayer(ly => {
    if (ly.feature && ly.feature.properties) {
      const featureVal = String(ly.feature.properties[attr]);
      if (featureVal === val) {
        ly.setStyle({ opacity: 1, fillOpacity: 0.6 });
      } else {
        ly.setStyle({ opacity: 0, fillOpacity: 0 });
      }
    }
  });
  
  msg(`Filtrando ${layerName} por ${attr} = ${val}`);
});


async function convertirAGeoJSON(file) {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "json" || ext === "geojson") return JSON.parse(await file.text());
  if (ext === "kml" || ext === "kmz") {
    if (typeof window.toGeoJSON === "undefined") throw Error("Librería KML no cargada.");
    let text;
    if (ext === "kml") text = await file.text();
    else {
      const z = await JSZip.loadAsync(file);
      const names = Object.keys(z.files).filter((n) => n.endsWith(".kml"));
      text = await z.files[names[0]].async("text");
    }
    const d = new DOMParser().parseFromString(text, "text/xml");
    return window.toGeoJSON.kml(d);
  }
  throw Error("Formato no compatible.");
}

async function loadEntry(e) {
  if (layers.some((x) => x.meta.id === e.id)) { msg(`${e.originalName} ya está cargada.`); return; }
  msg(`Cargando ${e.originalName}...`);
  const r = await fetch(e.url);
  if (!r.ok) throw Error("No se pudo descargar.");
  const blob = await r.blob();
  const f = new File([blob], e.originalName);
  const gj = await convertirAGeoJSON(f);
  addLayer(gj, e.originalName, { id: e.id, source: e.source });
  msg(`Cargada: ${e.originalName}`);
}

// ===== Catálogo =====
async function loadCatalog() {
  const el = $("layerList");
  el.innerHTML = '<div class="empty-state">Consultando...</div>';
  try {
    const r = await fetch("/api/catalogo");
    const items = await r.json();
    catalog.clear();
    items.forEach((x) => catalog.set(x.id, x));
    if (!items.length) { el.innerHTML = '<div class="empty-state">Catálogo vacío.</div>'; return; }
    
    el.innerHTML = items.map((e) => `
      <div class="layer-item" data-id="${esc(e.id)}">
        <input type="checkbox" class="load-one">
        <div class="layer-name" title="${esc(e.originalName)}">${esc(e.originalName)}
          <span class="layer-meta">${(e.size / 1048576).toFixed(2)} MB</span>
        </div>
        <button class="layer-action del">×</button>
      </div>`).join("");

    el.querySelectorAll(".layer-item").forEach((row) => {
      const e = catalog.get(row.dataset.id);
      row.querySelector(".load-one").addEventListener("change", async (ev) => {
        if (ev.target.checked) {
          try { await loadEntry(e); } catch (err) { ev.target.checked = false; alert(err.message); }
        }
      });
      row.querySelector(".del").addEventListener("click", async () => {
        if (!confirm(`¿Eliminar ${e.originalName}?`)) return;
        await fetch("/api/catalogo/" + encodeURIComponent(e.id), { method: "DELETE", headers: adminHeaders() });
        await loadCatalog();
      });
    });
    msg(`${items.length} archivo(s) en el catálogo.`);
  } catch (e) { el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
}

$("fileInput").addEventListener("change", async (ev) => {
  const files = [...ev.target.files];
  if (!files.length) return;
  const fd = new FormData();
  files.forEach((f) => fd.append("archivos", f));
  msg("Subiendo...");
  try {
    const r = await fetch("/api/catalogo", { method: "POST", body: fd, headers: adminHeaders() });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Error de carga");
    await loadCatalog();
    msg(`${d.added.length} archivo(s) subido(s).`);
  } catch (e) { msg("Error: " + e.message); }
  ev.target.value = "";
});

$("btnReloadCatalog").addEventListener("click", loadCatalog);

$("btnLoadAll").addEventListener("click", async () => {
  const entries = [...catalog.values()];
  if (!entries.length) return;
  msg(`Cargando ${entries.length} capa(s)...`);
  for (const e of entries) {
    try { await loadEntry(e); } catch (err) { console.error(err); }
  }
  if (layers.length) {
    const group = L.featureGroup(layers.map((l) => l.leaflet));
    const bounds = group.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.05), { maxZoom: 16 });
  }
});

$("btnClearLayers").addEventListener("click", () => {
  layers.forEach((l) => map.removeLayer(l.leaflet));
  layers.length = 0;
  if (highlight) { map.removeLayer(highlight); highlight = null; }
  if (marker) { map.removeLayer(marker); marker = null; }
  point = null;
  $("result").innerHTML = '<div class="result-empty">Capas eliminadas.</div>';
  $("stylePanel").style.display = "none";
  $("filterPanel").style.display = "none";
  $("filterLayerSelect").innerHTML = '<option value="">-- Seleccionar capa --</option>';
  map.setView([21.019, -101.257], 8);
  updateLegend();
});

// ===== Lógica de consulta (Distancia) =====
function segDist(p, a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const φ = toRad(p.lat);
  const sx = R * Math.cos(φ) * toRad(1);
  const sy = R * toRad(1);
  const ax = (a[1] - p.lng) * sx, ay = (a[0] - p.lat) * sy;
  const bx = (b[1] - p.lng) * sx, by = (b[0] - p.lat) * sy;
  const dx = bx - ax, dy = by - ay;
  const d2 = dx * dx + dy * dy;
  const t = d2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / d2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function distanceTo(p, g) {
  let best = Infinity;
  const lineString = (coords) => {
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1], b = coords[i];
      if (a?.length >= 2 && b?.length >= 2) {
        const d = segDist(p, [a[0], a[1]], [b[0], b[1]]);
        if (d < best) best = d;
      }
    }
  };
  const visit = (x) => {
    if (!x) return;
    switch (x.type) {
      case "LineString": lineString(x.coordinates); break;
      case "MultiLineString": x.coordinates.forEach(lineString); break;
      case "Polygon": x.coordinates.forEach(lineString); break;
      case "MultiPolygon": x.coordinates.forEach((poly) => poly.forEach(lineString)); break;
      case "GeometryCollection": x.geometries.forEach(visit); break;
    }
  };
  visit(g);
  return best;
}

function jurisdiction(props) {
  const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const entries = Object.entries(props || {}).filter(([k]) =>
    /jurisdic|administr|competenc|ambito|clasific|red|carretera|road|highway|federal|estatal|municipal/i.test(k)
  );
  if (!entries.length) return "No determinada";
  const text = entries.map(([k, v]) => `${k}:${v}`).join(" ").toLowerCase();
  if (/\bfederal\b/.test(norm(text))) return "Federal (por atributos)";
  if (/\bestatal\b/.test(norm(text))) return "Estatal (por atributos)";
  if (/\bmunicipal\b/.test(norm(text))) return "Municipal (por atributos)";
  return "No determinada";
}

function identify(p, label, accuracy = null) {
  point = L.latLng(p.lat, p.lng);
  if (marker) map.removeLayer(marker);
  marker = L.circleMarker(point, { radius: 8, color: "#a32626", weight: 3, fillColor: "#ef5350", fillOpacity: 1 })
    .addTo(map).bindPopup(`${esc(label)}<br>${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`).openPopup();
  
  $("mapHint").textContent = `${label}: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;

  if (highlight) { map.removeLayer(highlight); highlight = null; }

  const tol = Math.max(10, Math.min(5000, Number($("tolerance").value) || 100));
  const tolDeg = tol / 111320;
  let best = null;
  
  for (const l of layers) {
    if (!l.visible) continue;
    for (const { feature, bounds } of l.featureBounds) {
      if (!feature.geometry) continue;
      try { if (!bounds.pad(tolDeg).contains(p)) continue; } catch { continue; }
      const d = distanceTo(p, feature.geometry);
      if (Number.isFinite(d) && (!best || d < best.d)) best = { d, f: feature, l };
    }
  }

  if (!best || best.d > tol) {
    $("result").innerHTML = `<div class="result-empty">No hay tramos en un rango de ${tol} m.</div>`;
    return;
  }

  const props = best.f.properties || {};
  const entries = Object.entries(props).filter(([, v]) => v !== null && v !== "");
  const nameEntry = entries.find(([k]) => /nombre|name|carretera|road|ref|ruta|route|codigo|clave/i.test(k));
  const j = jurisdiction(props);

  const rows = [
    ["Capa", best.l.name],
    ["Distancia", best.d.toFixed(1) + " m"],
    ...(accuracy !== null ? [["Precisión GPS", Math.round(accuracy) + " m"]] : []),
    ["Jurisdicción", j],
    ...entries.slice(0, 10).map(([k, v]) => [k, String(v)]),
  ];

  $("result").innerHTML = `
    <div class="result-head">
      <small>TRAMO MÁS CERCANO</small>
      <strong>${esc(nameEntry ? nameEntry[1] : "Sin nombre")}</strong>
      <div class="jurisdiction">${esc(j)}</div>
    </div>
    <div class="result-body">
      ${rows.map(([k, v]) => `<div class="result-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}
    </div>`;

  try {
    highlight = L.geoJSON(best.f, { style: { color: "#ff2d55", weight: 7, opacity: 0.95 } }).addTo(map).bringToFront();
  } catch {}
}

$("btnGuanajuato").addEventListener("click", () => map.fitBounds([[19.88, -102.12], [21.85, -99.65]]));

$("btnGPS").addEventListener("click", () => {
  if (!navigator.geolocation) { $("gpsStatus").textContent = "Navegador sin GPS."; return; }
  $("gpsStatus").textContent = "Solicitando ubicación...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      $("gpsStatus").textContent = `Precisión: ${Math.round(pos.coords.accuracy)} m.`;
      map.setView([p.lat, p.lng], 16);
      identify(p, "GPS", pos.coords.accuracy);
    },
    (err) => { $("gpsStatus").textContent = "Error de GPS (permiso denegado)."; },
    { enableHighAccuracy: true, timeout: 15000 }
  );
});

$("btnIdentify").addEventListener("click", () => {
  if (!point) return;
  map.setView(point, Math.max(map.getZoom(), 15));
  identify({ lat: point.lat, lng: point.lng }, "Consulta");
});

$("btnClearPoint").addEventListener("click", () => {
  if (marker) map.removeLayer(marker);
  if (highlight) map.removeLayer(highlight);
  marker = highlight = point = null;
  $("result").innerHTML = '<div class="result-empty">Punto quitado.</div>';
  $("mapHint").textContent = "Haz clic en el mapa.";
});

// ===== Modo Selección Múltiple =====
$("btnSelectMode").addEventListener("click", () => {
  isSelectMode = !isSelectMode;
  const btn = $("btnSelectMode");
  
  if (isSelectMode) {
    btn.classList.add("active-mode");
    btn.textContent = "🖱️ Selección ACTIVA";
    map.getContainer().style.cursor = "crosshair";
    $("mapHint").textContent = "Modo Selección: Haz clic en los elementos para resaltarlos.";
  } else {
    btn.classList.remove("active-mode");
    btn.textContent = "🖱️ Modo Selección";
    map.getContainer().style.cursor = "";
    // Limpiar selecciones al apagar
    selectedFeatures.forEach(ly => ly.setStyle(ly.options._originalStyle || {}));
    selectedFeatures.length = 0;
    $("mapHint").textContent = "Haz clic en el mapa para consultar.";
  }
});

// Evento click unificado
map.on("click", (e) => {
  if (isSelectMode) {
    const layerClick = layers.find(l => l.leaflet);
    if (layerClick) {
      layerClick.leaflet.eachLayer((ly) => {
        if (ly.getBounds && ly.getBounds().contains(e.latlng) && ly.feature) {
          if (selectedFeatures.includes(ly)) {
            ly.setStyle(ly.options._originalStyle || {});
            selectedFeatures.splice(selectedFeatures.indexOf(ly), 1);
          } else {
            if (!ly.options._originalStyle) ly.options._originalStyle = { ...ly.options };
            ly.setStyle({ color: "#ff2d55", weight: 6, fillColor: "#ff2d55", fillOpacity: 0.8 });
            selectedFeatures.push(ly);
          }
        }
      });
    }
  } else {
    identify({ lat: e.latlng.lat, lng: e.latlng.lng }, "Punto manual");
  }
});

// ===== Leyenda dinámica =====
function updateLegend(colorMap = null) {
  const el = document.querySelector(".map-legend");
  if (!el) return;
  
  let html = `<span><i class="legend-dot"></i> Punto de consulta</span>`;
  
  if (colorMap) {
    Object.entries(colorMap).forEach(([val, color]) => {
      html += `<span><i class="legend-line" style="background:${color}; width:12px; height:12px; border-radius:3px;"></i> ${esc(val)}</span>`;
    });
  } else {
    html += layers.map((l, i) => `<span><i class="legend-line" style="background:${l.color}"></i> ${esc(l.name)}</span>`).join("");
  }
  el.innerHTML = html;
}

loadCatalog();
updateLegend();