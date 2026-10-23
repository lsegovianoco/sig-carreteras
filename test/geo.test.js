"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { segDist, distanceTo, jurisdiction } = require("../lib/geo");

test("segDist: punto sobre la línea da ~0", () => {
  const d = segDist({ lat: 0, lng: 0 }, [0, -0.001], [0, 0.001]);
  assert.ok(d < 1, `esperaba ~0, obtuve ${d}`);
});

test("segDist: punto perpendicular a ~111 m", () => {
  const d = segDist({ lat: 0.001, lng: 0 }, [0, -0.001], [0, 0.001]);
  assert.ok(Math.abs(d - 111) < 5, `esperaba ~111, obtuve ${d}`);
});

test("distanceTo: LineString", () => {
  const g = { type: "LineString", coordinates: [[0, -0.001], [0, 0.001]] };
  const d = distanceTo({ lat: 0.001, lng: 0 }, g);
  assert.ok(Math.abs(d - 111) < 5);
});

test("distanceTo: Polygon calcula borde", () => {
  const g = {
    type: "Polygon",
    coordinates: [[[0, 0], [0, 0.01], [0.01, 0.01], [0.01, 0], [0, 0]]],
  };
  const d = distanceTo({ lat: -0.001, lng: 0.005 }, g);
  assert.ok(Math.abs(d - 111) < 10, `esperaba ~111, obtuve ${d}`);
});

test("jurisdiction: detecta federal", () => {
  const r = jurisdiction({ red: "Federal", nombre: "MEX-45" });
  assert.match(r, /Federal/);
});

test("jurisdiction: niega con valor no", () => {
  const r = jurisdiction({ red: "no federal" });
  assert.doesNotMatch(r, /^Federal/);
});

test("jurisdiction: sin atributos relevantes", () => {
  const r = jurisdiction({ color: "rojo" });
  assert.match(r, /No determinada/);
});