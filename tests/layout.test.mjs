import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPACING, normalizeSpacing, stepLayout } from '../dist/layout.js';

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
