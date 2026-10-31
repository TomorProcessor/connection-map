import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGraph, emptyGraph, mergeGraphs, pairKey, LIMITS } from '../dist/graph.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMv0AAAAASUVORK5CYII=';

function map(people, connections = []) {
  const graph = emptyGraph();
  graph.people = people.map(([id, name]) => ({ id, name }));
  graph.connections = connections.map(([source, target, ...types]) => ({ source, target, types }));
  return normalizeGraph(graph);
}
function typesOf(graph, a, b) {
  return graph.connections.find(e => pairKey(e.source, e.target) === pairKey(a, b))?.types;
}

test('adding a file keeps everything on the map, adds new people, and widens existing connections', () => {
  const current = map([['u1', 'Anna Kovács'], ['u2', 'Bence Tóth']], [['u1', 'u2', 'real-life']]);
  const before = JSON.stringify(current);
  const incoming = map([['u1', 'Kovács Anna'], ['u2', 'Tóth Bence'], ['clara', 'Clara Szabó']],
    [['u1', 'u2', 'facebook'], ['u1', 'clara', 'facebook']]);

  const { graph, summary } = mergeGraphs(current, incoming);

  assert.deepEqual(graph.people.map(p => [p.id, p.name]), [['u1', 'Anna Kovács'], ['u2', 'Bence Tóth'], ['clara', 'Clara Szabó']]);
  assert.deepEqual(typesOf(graph, 'u1', 'u2'), ['real-life', 'facebook']);
  assert.deepEqual(typesOf(graph, 'u1', 'clara'), ['facebook']);
  assert.deepEqual(summary, { addedPeople: 1, matchedPeople: 2, addedConnections: 1, extendedConnections: 1, addedTypes: 0 });
  assert.equal(JSON.stringify(current), before);
});

test('matching IDs merge reordered names and keep the existing display name', () => {
  const current = map([['u1', 'Kovács Ödön']]);
  const incoming = map([['u1', 'odon  kovacs']]);

  const { graph, summary } = mergeGraphs(current, incoming);

  assert.deepEqual(graph.people, [{ id: 'u1', name: 'Kovács Ödön' }]);
  assert.equal(summary.matchedPeople, 1);
});

test('matching IDs remain the same people even when the incoming names are entirely different', () => {
  const current = map([['imported-person-0', 'Anna'], ['imported-person-1', 'Bence']], [['imported-person-0', 'imported-person-1', 'facebook']]);
  const incoming = map([['imported-person-0', 'Clara'], ['imported-person-1', 'Bence']], [['imported-person-0', 'imported-person-1', 'facebook']]);

  const { graph, summary } = mergeGraphs(current, incoming);

  assert.deepEqual(graph.people.map(p => [p.id, p.name]), [['imported-person-0', 'Anna'], ['imported-person-1', 'Bence']]);
  assert.deepEqual(typesOf(graph, 'imported-person-0', 'imported-person-1'), ['facebook']);
  assert.equal(summary.addedPeople, 0);
  assert.equal(summary.matchedPeople, 2);
});

test('IDs distinguish people with identical names', () => {
  const current = map([['a1', 'Anna'], ['a2', 'Anna']]);
  const incoming = map([['a2', 'Anna'], ['b', 'Bence']], [['a2', 'b', 'real-life']]);

  const { graph } = mergeGraphs(current, incoming);

  assert.deepEqual(typesOf(graph, 'a2', 'b'), ['real-life']);
  assert.equal(typesOf(graph, 'a1', 'b'), undefined);
});

test('different IDs stay separate even when names match exactly or after accent normalization', () => {
  const twoOnMap = map([['a1', 'Anna'], ['a2', 'Anna']]);
  const twoInFile = map([['x', 'Anna'], ['y', 'anna']]);
  const { graph, summary } = mergeGraphs(twoOnMap, twoInFile);
  assert.deepEqual(graph.people.map(p=>p.id), ['a1', 'a2', 'x', 'y']);
  assert.equal(summary.addedPeople, 2);
  assert.equal(summary.matchedPeople, 0);
  const accents = mergeGraphs(map([['a', 'Ödön']]), map([['b', 'odon']]));
  assert.equal(accents.graph.people.length, 2);
});

test('relation types match by ID or name, and new ones are added with their color', () => {
  const current = map([['u1', 'Anna'], ['u2', 'Bence']]);
  const incoming = map([['u1', 'Anna'], ['u2', 'Bence']]);
  incoming.types = [{ id: 'fb', name: 'facebook', color: '#000000' }, { id: 'discord', name: 'Discord', color: '#5865f2' }];
  incoming.connections = [{ source: 'u1', target: 'u2', types: ['fb', 'discord'] }];

  const { graph, summary } = mergeGraphs(current, normalizeGraph(incoming));

  assert.deepEqual(typesOf(graph, 'u1', 'u2'), ['facebook', 'discord']);
  assert.equal(graph.types.find(t => t.id === 'facebook').color, '#517cd1');
  assert.deepEqual(graph.types.at(-1), { id: 'discord', name: 'Discord', color: '#5865f2' });
  assert.equal(summary.addedTypes, 1);
});

test('existing names and pictures are kept; a missing picture is filled in', () => {
  const current = map([['u1', 'Anna Kovács'], ['u2', 'Bence']]);
  current.people[1].photo = png;
  const incoming = map([['u1', 'anna kovacs'], ['u2', 'Bence']]);
  incoming.people[0].photo = png;
  incoming.people[1].photo = png.replace('mP8', 'mP9');

  const { graph } = mergeGraphs(current, incoming);

  assert.deepEqual(graph.people, [{ id: 'u1', name: 'Anna Kovács', photo: png }, { id: 'u2', name: 'Bence', photo: png }]);
});

test('adding the same file twice changes nothing the second time', () => {
  const current = map([['u1', 'Anna']]);
  const incoming = map([['u1', 'Changed label'], ['b', 'Bence']], [['u1', 'b', 'linkedin']]);
  const once = mergeGraphs(current, incoming).graph;

  const { graph, summary } = mergeGraphs(once, incoming);

  assert.deepEqual(graph, once);
  assert.deepEqual(summary, { addedPeople: 0, matchedPeople: 2, addedConnections: 0, extendedConnections: 0, addedTypes: 0 });
});

test('a merge that would pass the people limit is refused with the resulting count', () => {
  const current = map(Array.from({ length: LIMITS.people }, (_, i) => [`u${i}`, `Person ${i}`]));
  const incoming = map([['x', 'Someone new']]);

  assert.throws(() => mergeGraphs(current, incoming), /would give your map 501 people\. Circles supports up to 500\./);
});

test('adding a first file to a blank map keeps the built-in relation types', () => {
  const incoming = map([['a', 'Anna'], ['b', 'Bence']], [['a', 'b', 'facebook']]);
  incoming.types = [{ id: 'facebook', name: 'Facebook', color: '#517cd1' }];

  const { graph, summary } = mergeGraphs(emptyGraph(), normalizeGraph(incoming));

  assert.deepEqual(graph.types.map(t => t.name), ['Real life', 'Facebook', 'Instagram', 'LinkedIn']);
  assert.deepEqual(summary, { addedPeople: 2, matchedPeople: 0, addedConnections: 1, extendedConnections: 0, addedTypes: 0 });
});
