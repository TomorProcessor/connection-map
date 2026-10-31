export const DEFAULT_SPACING = 100;
export const MIN_SPACING = 100;
export const MAX_SPACING = 400;

export function normalizeSpacing(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(MAX_SPACING, Math.max(MIN_SPACING, number)) : DEFAULT_SPACING;
}

// Only positions and velocities change. Links are position references, never graph data.
export function stepLayout(nodes, links, { centerX, centerY, heat = 1, spacing = DEFAULT_SPACING }) {
  const factor = normalizeSpacing(spacing) / 100;
  const separation = 64 * factor, repulsion = 2200 * factor * factor;
  const linkDistance = 105 * factor, spring = .012 / (factor * factor);
  const degree = new Map(nodes.map(p => [p, 0]));
  for (const { source, target } of links) { degree.set(source, degree.get(source) + 1); degree.set(target, degree.get(target) + 1); }
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    let dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) + Math.abs(dy) < .01) { dx = .1; dy = .1; }
    const d2 = Math.max(600, dx * dx + dy * dy), force = repulsion * heat / d2, distance = Math.sqrt(d2);
    a.vx -= dx / distance * force; b.vx += dx / distance * force;
    a.vy -= dy / distance * force; b.vy += dy / distance * force;
  }
  for (const { source: a, target: b } of links) {
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1;
    const force = (distance - linkDistance) * spring * heat / Math.sqrt(Math.max(degree.get(a), degree.get(b)));
    a.vx += dx / distance * force; b.vx -= dx / distance * force;
    a.vy += dy / distance * force; b.vy -= dy / distance * force;
  }
  for (const p of nodes) {
    if (p.fixed) { p.vx = 0; p.vy = 0; continue; }
    p.vx = (p.vx + (centerX - p.x) * .0009 * heat / factor) * .8;
    p.vy = (p.vy + (centerY - p.y) * .0009 * heat / factor) * .8;
    p.x += p.vx; p.y += p.vy;
  }
  // Resolve collisions after springs, so dense hubs cannot pull faces into each other.
  // Repeat to settle overlaps introduced when another pair is separated.
  for (let pass = 0; pass < 12; pass++) {
    let largestOverlap = 0;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.fixed && b.fixed) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= separation * separation) continue;
      let distance = Math.sqrt(distanceSquared);
      largestOverlap = Math.max(largestOverlap, separation - distance);
      if (distance < .001) { dx = 1; dy = 0; distance = 1; }
      const shift = (separation - distance) / ((a.fixed || b.fixed) ? 1 : 2);
      if (!a.fixed) { a.x -= dx / distance * shift; a.y -= dy / distance * shift; }
      if (!b.fixed) { b.x += dx / distance * shift; b.y += dy / distance * shift; }
    }
    if (largestOverlap < .5) break;
  }
}
