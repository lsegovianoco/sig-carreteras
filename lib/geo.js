"use strict";

function segDist(p, a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const φ = toRad(p.lat);
  const sx = R * Math.cos(φ) * toRad(1);
  const sy = R * toRad(1);
  const ax = (a[1] - p.lng) * sx;
  const ay = (a[0] - p.lat) * sy;
  const bx = (b[1] - p.lng) * sx;
  const by = (b[0] - p.lat) * sy;
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
  const norm = (s) =>
    String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const entries = Object.entries(props || {}).filter(([k]) =>
    /jurisdic|administr|competenc|ambito|clasific|red|carretera|road|highway|federal|estatal|municipal/i.test(k)
  );

  if (!entries.length) return "No determinada por los atributos";

  const text = entries.map(([k, v]) => `${k}:${v}`).join(" ").toLowerCase();
  const neg = /\b(no|false|0|ninguna|ninguno)\b/.test(norm(text));

  const rules = [
    { re: /\bfederal\b/, label: "Federal" },
    { re: /\bestatal\b/, label: "Estatal" },
    { re: /\bmunicipal\b/, label: "Municipal" },
  ];
  for (const r of rules) {
    if (r.re.test(norm(text)) && !neg) {
      return `${r.label} (por atributos; verificar fuente)`;
    }
  }
  return "No determinada por los atributos";
}

module.exports = { segDist, distanceTo, jurisdiction };