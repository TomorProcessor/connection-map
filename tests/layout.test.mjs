import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPACING, layoutIterations, normalizeSpacing, scaleLayout, stepLayout } from '../dist/layout.js';

const point = (x, y, fixed = false) => ({ x, y, vx: 0, vy: 0, fixed });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('spacing handles missing or invalid preferences and stays in the slider bounds', () => {
  for (const value of [undefined, null, NaN, Infinity, 'invalid', 0]) assert.equal(normalizeSpacing(value), DEFAULT_SPACING);
  assert.equal(normalizeSpacing(25), 100);
  assert.equal(normalizeSpacing('250'), 250);
  assert.equal(normalizeSpacing(900), 400);
});

test('connected, coincident faces separate without losing their connection', () => {
  const a = point(0, 0), b = point(0, 0), links = [{ source: a, target: b }];
  stepLayout([a, b], links, { centerX: 0, centerY: 0 });
  assert.ok(distance(a, b) >= 63.99);
  assert.equal(links.length, 1);
  assert.equal(links[0].source, a);
  assert.ok([a.x, a.y, b.x, b.y].every(Number.isFinite));
});

test('increasing spacing opens a dense connected group while every link stays in place', () => {
  function settle(spacing) {
    const nodes = Array.from({ length: 12 }, (_, i) => point(Math.cos(i) * 20, Math.sin(i) * 20));
    const links = nodes.flatMap((source, i) => nodes.slice(i + 1).map(target => ({ source, target })));
    const initialLinks = links.map(e => [e.source, e.target]);
    for (let ticks = 180; ticks > 0; ticks--) {
      stepLayout(nodes, links, { centerX: 0, centerY: 0, spacing, heat: Math.max(.12, Math.min(1, ticks / 100)) });
    }
    assert.deepEqual(links.map(e => [e.source, e.target]), initialLinks);
    const nearest = nodes.map((a, i) => Math.min(...nodes.filter((_, j) => i !== j).map(b => distance(a, b))));
    return nearest.reduce((sum, n) => sum + n, 0) / nodes.length;
  }
  const compact = settle(100), spread = settle(300);
  assert.ok(compact > 54, `Faces overlap at default spacing: ${compact}`);
  assert.ok(spread > compact * 2, `Spacing did not spread the group enough: ${compact} → ${spread}`);
});

test('collision handling respects a dragged, fixed person', () => {
  const anchor = point(50, 50, true), moving = point(50, 50);
  const links = [{ source: anchor, target: moving }];
  stepLayout([anchor, moving], links, { centerX: 0, centerY: 0, spacing: 200 });
  assert.deepEqual(anchor, point(50, 50, true));
  assert.ok(distance(anchor, moving) >= 127.99);
});

test('dense groups around a highly connected hub settle without overlapping faces', () => {
  const nodes = Array.from({ length: 96 }, (_, i) => point(Math.cos(i * 2.4) * Math.sqrt(i) * 30, Math.sin(i * 2.4) * Math.sqrt(i) * 30));
  const links = nodes.slice(1).map(target => ({ source: nodes[0], target }));
  for (let i = 1; i < nodes.length; i++) for (let j = i + 1; j < Math.min(nodes.length, i + 5); j++) links.push({ source: nodes[i], target: nodes[j] });
  for (let ticks = 180; ticks > 0; ticks--) stepLayout(nodes, links, { centerX: 0, centerY: 0, heat: Math.max(.12, Math.min(1, ticks / 100)) });
  for (let i = 0; i < nodes.length; i++) for (const b of nodes.slice(i + 1)) assert.ok(distance(nodes[i], b) >= 54);
});

test('backbone at 100% retains the layout forces from before the spacing slider', () => {
  const nodes = [point(10, -20), { ...point(130, 50), vx: 1, vy: -2 }, point(-70, 100)];
  const links = [{ source: nodes[0], target: nodes[1] }, { source: nodes[0], target: nodes[2] }];
  stepLayout(nodes, links, { centerX: 200, centerY: 150, heat: .8, backbone: true });
  // Reference output from the pre-slider implementation, commit ec1cc55.
  const expected = [
    [10.141932288990924, -19.61324944516339, .14193228899092375, .3867505548366088],
    [130.71042713596273, 48.35504562068012, .7104271359627186, -1.6449543793198775],
    [-69.74707942495364, 99.84252382448327, .2529205750463576, -.1574761755167314]
  ];
  nodes.forEach((p, i) => [p.x, p.y, p.vx, p.vy].forEach((n, j) => assert.ok(Math.abs(n - expected[i][j]) < 1e-10)));
});

test('backbone spacing enlarges the same pattern without changing the force balance', () => {
  const original = [point(-100, 20), point(80, 70), point(30, -90)];
  const enlarged = structuredClone(original);
  const center = { centerX: 20, centerY: 30 };
  scaleLayout(enlarged, center, 3);
  const links = nodes => [{ source: nodes[0], target: nodes[1] }, { source: nodes[1], target: nodes[2] }];
  for (let t = 180; t > 0; t--) {
    const heat = Math.max(.12, Math.min(1, t / 100));
    stepLayout(original, links(original), { ...center, spacing: 100, heat, backbone: true });
    stepLayout(enlarged, links(enlarged), { ...center, spacing: 300, heat, backbone: true });
  }
  for (let i = 0; i < original.length; i++) {
    assert.ok(Math.abs(enlarged[i].x - (center.centerX + (original[i].x - center.centerX) * 3)) < 1e-8);
    assert.ok(Math.abs(enlarged[i].y - (center.centerY + (original[i].y - center.centerY) * 3)) < 1e-8);
  }
});

test('the backbone settling budget separates connected groups rather than stopping in a mixed cloud', () => {
  const nodes = Array.from({ length: 30 }, (_, i) => point(Math.cos(i * 2.4) * 100, Math.sin(i * 2.4) * 100));
  const links = [];
  for (let group = 0; group < 3; group++) for (let j = 1; j < 8; j++) links.push({ source: nodes[group * 8], target: nodes[group * 8 + j] });
  for (const [a, b] of [[0, 24], [24, 25], [25, 8], [8, 26], [26, 27], [27, 16], [16, 28], [28, 29]]) links.push({ source: nodes[a], target: nodes[b] });
  for (let t = layoutIterations(true); t > 0; t--) stepLayout(nodes, links, { centerX: 0, centerY: 0, heat: Math.max(.12, Math.min(1, t / 100)), backbone: true });
  const groups = [0, 1, 2].map(i => nodes.slice(i * 8, i * 8 + 8));
  const centers = groups.map(group => ({ x: group.reduce((sum, p) => sum + p.x, 0) / 8, y: group.reduce((sum, p) => sum + p.y, 0) / 8 }));
  const radii = groups.map((group, i) => Math.max(...group.map(p => distance(p, centers[i]))));
  for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) assert.ok(distance(centers[a], centers[b]) > radii[a] + radii[b]);
  assert.equal(links.length, 29);
});
