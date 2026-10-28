import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGraph, emptyGraph, demoGraph, pairKey, embeddedness, extractBackbone, filteredConnections } from '../dist/graph.js';

function fixture(n, pairs) {
  const graph = emptyGraph();
  graph.people = Array.from({length:n}, (_,i) => ({id:String(i),name:`Person ${i}`}));
  graph.connections = pairs.map(([a,b]) => ({source:String(a),target:String(b),types:['real-life']}));
  return graph;
}
function components(graph, edges) {
  const adj = new Map(graph.people.map(p=>[p.id,[]]));
  for(const e of edges){adj.get(e.source).push(e.target);adj.get(e.target).push(e.source);}
  const result=[],seen=new Set();
  for(const p of graph.people){if(seen.has(p.id))continue;const stack=[p.id],group=[];seen.add(p.id);while(stack.length){const id=stack.pop();group.push(id);for(const v of adj.get(id))if(!seen.has(v)){seen.add(v);stack.push(v);}}result.push(group.sort());}
  return result.sort((a,b)=>a[0].localeCompare(b[0]));
}
test('undirected duplicates merge types; self loops do not enter the graph',()=>{
  const g=fixture(2,[[0,1],[1,0],[0,0]]);g.connections[1].types=['facebook'];
  const normalized=normalizeGraph(g);
  assert.equal(normalized.connections.length,1);
  assert.deepEqual(normalized.connections[0].types,['real-life','facebook']);
});
test('reject dangling references, duplicate IDs and unknown relation types',()=>{
  const g=fixture(2,[[0,1]]);
  assert.throws(()=>normalizeGraph({...g,connections:[{source:'0',target:'missing',types:['real-life']}]}),/unknown person/);
  assert.throws(()=>normalizeGraph({...g,people:[g.people[0],g.people[0]]}),/unique/);
  assert.throws(()=>normalizeGraph({...g,connections:[{source:'0',target:'1',types:['unknown']}]}),/relation type/);
  assert.throws(()=>normalizeGraph({...g,version:2}),/unsupported/);
});
test('legacy Lost Circles indices are mapped independently from account IDs',()=>{
  const g=normalizeGraph({nodes:[{id:'900',name:'Anna'},{id:'100',name:'Bob'}],links:[{source:0,target:1},{source:1,target:0}]});
  assert.equal(g.connections.length,1);assert.equal(g.people[0].name,'Anna');assert.equal(g.connections[0].source,g.people[0].id);
  assert.throws(()=>normalizeGraph({nodes:[{name:'Anna'}],links:[{source:0,target:4}]}),/unknown person/);
});
test('a square has one quadrangle per edge and normalized score one half',()=>{
  const g=fixture(4,[[0,1],[1,2],[2,3],[3,0]]);
  for(const e of embeddedness(g.people,g.connections)){assert.equal(e.quadrangles,1);assert.equal(e.score,.5);}
});
test('K4 has two quadrangles per edge; trees have none',()=>{
  const g=fixture(4,[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]);
  for(const e of embeddedness(g.people,g.connections)){assert.equal(e.quadrangles,2);assert.equal(e.score,1/3);}
  const tree=fixture(4,[[0,1],[1,2],[1,3]]);
  assert.ok(embeddedness(tree.people,tree.connections).every(e=>e.score===0));
});
test('the sparsest backbone preserves every component and essential bridge',()=>{
  const g=fixture(9,[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3],[3,4],[4,5],[5,6],[6,7],[7,4]]);
  const result=extractBackbone(g.people,g.connections,0);
  assert.deepEqual(components(g,result),components(g,g.connections));
  assert.ok(result.some(e=>pairKey(e.source,e.target)===pairKey('3','4')));
  assert.equal(result.length,7); // 8 connected people plus one isolated person
});
test('100% keeps every connection and partial views never add edges',()=>{
  const g=demoGraph();
  assert.deepEqual(extractBackbone(g.people,g.connections,1),g.connections);
  const original=new Set(g.connections.map(e=>pairKey(e.source,e.target)));
  const result=extractBackbone(g.people,g.connections,.2);
  assert.ok(result.length<g.connections.length);
  assert.ok(result.every(e=>original.has(pairKey(e.source,e.target))));
  assert.deepEqual(components(g,result),components(g,g.connections));
});
test('filters retain only enabled types and leave the stored graph untouched',()=>{
  const g=fixture(3,[[0,1],[1,2]]);g.connections[0].types.push('facebook');
  const original=JSON.stringify(g);
  assert.deepEqual(filteredConnections(g,new Set(['facebook'])),[{source:'0',target:'1',types:['facebook']}]);
  assert.deepEqual(filteredConnections(g,new Set()),[]);
  assert.equal(JSON.stringify(g),original);
});
test('backbone preserves connectivity across varied sparse graphs',()=>{
  let seed=79;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
  for(let run=0;run<30;run++){
    const pairs=[];for(let i=0;i<25;i++)for(let j=i+1;j<25;j++)if(random()<.17)pairs.push([i,j]);
    const g=fixture(25,pairs),before=JSON.stringify(g);
    const sparse=extractBackbone(g.people,g.connections,.1);
    assert.deepEqual(components(g,sparse),components(g,g.connections));
    assert.equal(JSON.stringify(g),before);
  }
});
