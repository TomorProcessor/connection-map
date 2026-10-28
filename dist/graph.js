// The model is deliberately small: people, relation types, and typed connections.
export const DEFAULT_TYPES = [
  { id: 'real-life', name: 'Real life', color: '#3f806b' },
  { id: 'facebook', name: 'Facebook', color: '#517cd1' },
  { id: 'instagram', name: 'Instagram', color: '#c46389' },
  { id: 'linkedin', name: 'LinkedIn', color: '#8a6bc0' }
];
export const LIMITS = { people: 500, connections: 5000, types: 24 };
export const pairKey = (a, b) => JSON.stringify([String(a), String(b)].sort());
export function emptyGraph() {
  return { version: 1, demo: false, people: [], types: structuredClone(DEFAULT_TYPES), connections: [] };
}
function nonempty(value, label, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} must be 1–${max} characters.`);
  return value.trim();
}
export function normalizeGraph(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose a Circles JSON file or a Lost Circles JSON export.');
  if (Array.isArray(input.nodes) && Array.isArray(input.links) && !input.people) {
    // Legacy Lost Circles links use node-array indices, not Facebook IDs.
    const ids = input.nodes.map((_, i) => `imported-person-${i}`);
    const resolve = v => {
      const i = typeof v === 'object' && v !== null ? v.index : v;
      if (!Number.isInteger(i) || !ids[i]) throw new Error('An imported connection points to an unknown person.');
      return ids[i];
    };
    input = {
      version: 1,
      people: input.nodes.map((n, i) => ({ id: ids[i], name: String(n.name || n.userName || `Person ${i + 1}`) })),
      types: [{ id: 'facebook', name: 'Facebook', color: '#517cd1' }],
      connections: input.links.map(e => ({ source: resolve(e.source), target: resolve(e.target), types: ['facebook'] }))
    };
  }
  if (input.version !== undefined && input.version !== 1) throw new Error('This file uses an unsupported Circles format version.');
  if (!Array.isArray(input.people) || !Array.isArray(input.connections) || !Array.isArray(input.types)) throw new Error('The file needs people, types, and connections arrays.');
  if (input.people.length > LIMITS.people || input.connections.length > LIMITS.connections || input.types.length > LIMITS.types) throw new Error('This version supports up to 500 people, 5,000 connections, and 24 relation types.');
  const personIds = new Set(), typeIds = new Set();
  const people = input.people.map(p => {
    const id = nonempty(p?.id, 'Person ID');
    if (personIds.has(id)) throw new Error('Person IDs must be unique.');
    personIds.add(id);
    return { id, name: nonempty(p.name, 'Name', 80) };
  });
  const types = input.types.map(t => {
    const id = nonempty(t?.id, 'Relation type ID');
    if (typeIds.has(id)) throw new Error('Relation type IDs must be unique.');
    typeIds.add(id);
    if (!/^#[0-9a-f]{6}$/i.test(t.color)) throw new Error('Each relation type needs a six-digit hex color.');
    return { id, name: nonempty(t.name, 'Relation type', 32), color: t.color };
  });
  const pairs = new Map();
  for (const e of input.connections) {
    if (!e || !personIds.has(e.source) || !personIds.has(e.target)) throw new Error('A connection points to an unknown person.');
    if (!Array.isArray(e.types) || !e.types.length || e.types.some(t => !typeIds.has(t))) throw new Error('A connection contains an unknown or missing relation type.');
    if (e.source === e.target) continue;
    const key = pairKey(e.source, e.target);
    const prior = pairs.get(key);
    if (prior) prior.types = [...new Set([...prior.types, ...e.types])];
    else pairs.set(key, { source: e.source, target: e.target, types: [...new Set(e.types)] });
  }
  return { version: 1, demo: input.demo === true, people, types, connections: [...pairs.values()] };
}
export function filteredConnections(graph, enabled) {
  return graph.connections.flatMap(e => {
    const types = e.types.filter(t => enabled.has(t));
    return types.length ? [{ ...e, types }] : [];
  });
}
class UnionFind {
  constructor(ids) { this.parent = new Map(ids.map(id => [id, id])); }
  find(x) { const p = this.parent.get(x); if (p !== x) this.parent.set(x, this.find(p)); return this.parent.get(x); }
  join(a, b) { a = this.find(a); b = this.find(b); if (a === b) return false; this.parent.set(b, a); return true; }
}
// Count 4-cycles per edge via pairs of opposite vertices. Each 4-cycle contributes
// twice to each edge; dividing by two removes that double counting.
export function embeddedness(people, connections) {
  const adj = new Map(people.map(p => [p.id, new Set()]));
  const q = new Map(connections.map(e => [pairKey(e.source, e.target), 0]));
  for (const e of connections) { adj.get(e.source).add(e.target); adj.get(e.target).add(e.source); }
  const ids = people.map(p => p.id);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], aa = adj.get(a), bb = adj.get(b);
    const small = aa.size <= bb.size ? aa : bb, big = small === aa ? bb : aa;
    const common = [...small].filter(v => big.has(v));
    if (common.length < 2) continue;
    for (const v of common) {
      for (const u of [a, b]) { const key = pairKey(u, v); q.set(key, q.get(key) + common.length - 1); }
    }
  }
  const totals = new Map(ids.map(id => [id, 0]));
  for (const e of connections) {
    const count = q.get(pairKey(e.source, e.target)) / 2;
    totals.set(e.source, totals.get(e.source) + count);
    totals.set(e.target, totals.get(e.target) + count);
  }
  return connections.map(e => {
    const quadrangles = q.get(pairKey(e.source, e.target)) / 2;
    const denominator = Math.sqrt(totals.get(e.source) * totals.get(e.target));
    return { ...e, quadrangles, score: denominator ? quadrangles / denominator : 0 };
  });
}
// A practical, local variant: normalized quadrilateral embeddedness + a maximum
// spanning forest. It is inspired by Nocaj et al. (2015), not an exact replica of
// their ranked-neighborhood QSB/union-of-all-MST algorithm or the missing server.
export function extractBackbone(people, connections, keep = 0.4, scores) {
  const ranked = [...(scores || embeddedness(people, connections))].sort((a, b) => b.score - a.score || pairKey(a.source, a.target).localeCompare(pairKey(b.source, b.target)));
  const forest = new UnionFind(people.map(p => p.id));
  const retained = new Set();
  for (const e of ranked) if (forest.join(e.source, e.target)) retained.add(pairKey(e.source, e.target));
  const fraction = Number.isFinite(keep) ? Math.max(0, Math.min(1, keep)) : 0.4;
  for (const e of ranked.slice(0, Math.ceil(ranked.length * fraction))) retained.add(pairKey(e.source, e.target));
  return connections.filter(e => retained.has(pairKey(e.source, e.target)));
}
export function demoGraph() {
  const names = ['Anna', 'Bence', 'Clara', 'David', 'Eszter', 'Felix', 'Hanna', 'Iris', 'Jonas', 'Kata', 'Leo', 'Mira', 'Nora', 'Oliver', 'Petra', 'Sam', 'Tessa', 'Vera', 'Zoe', 'Adam', 'Luca', 'Noel'];
  const people = names.map((name, i) => ({ id: `demo-${i}`, name }));
  const edges = [], add = (a, b, types) => edges.push({ source: people[a].id, target: people[b].id, types });
  const groups = [[0,1,2,3,4,5], [6,7,8,9,10], [11,12,13,14,15], [16,17,18,19,20,21]];
  groups.forEach((g, k) => {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      if ((i * 3 + j * 7 + k) % 5 === 0) continue;
      add(g[i], g[j], [DEFAULT_TYPES[k].id, ...((i + j) % 4 === 0 ? [DEFAULT_TYPES[(k + 1) % 4].id] : [])]);
    }
  });
  [[2,7],[4,11],[5,17],[8,13],[10,19],[14,18],[0,20],[3,15]].forEach(([a,b],i) => add(a,b,[DEFAULT_TYPES[i%4].id]));
  return normalizeGraph({ version: 1, demo: true, people, types: structuredClone(DEFAULT_TYPES), connections: edges });
}
