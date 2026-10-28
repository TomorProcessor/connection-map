import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoto, squareCrop, preparePhoto, PHOTO_MAX_CHARS, PHOTO_UPLOAD_BYTES } from '../dist/photos.js';
import { normalizeGraph, emptyGraph } from '../dist/graph.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMv0AAAAASUVORK5CYII=';

test('photos survive validation and a JSON backup round-trip without altering the input', () => {
  const graph=emptyGraph();
  graph.people=[{id:'alice',name:'Alice',photo:png},{id:'bob',name:'Bob'}];
  const before=JSON.stringify(graph),normalized=normalizeGraph(graph);
  assert.equal(normalized.people[0].photo,png);
  assert.ok(!Object.hasOwn(normalized.people[1],'photo'));
  assert.deepEqual(normalizeGraph(JSON.parse(JSON.stringify(normalized))),normalized);
  assert.equal(JSON.stringify(graph),before);
});
test('old maps load without a photo field, and clearing a photo omits it', () => {
  const graph=emptyGraph();graph.people=[{id:'alice',name:'Alice'}];
  assert.deepEqual(normalizeGraph(graph).people,graph.people);
  for(const value of [undefined,null,'']){
    graph.people[0].photo=value;
    assert.deepEqual(normalizeGraph(graph).people,[{id:'alice',name:'Alice'}]);
  }
});
test('imports reject external URLs, SVG, malformed base64, disguised text and excessive image data', () => {
  for(const photo of [
    'https://example.com/photo.jpg','javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/png;base64,not-base64!','data:image/png;base64,',
    'data:image/jpeg;base64,PHN2Zz48L3N2Zz4=',
    'data:image/png;base64,'+'A'.repeat(PHOTO_MAX_CHARS)
  ]) {
    assert.throws(()=>normalizePhoto(photo),/Profile pictures/);
    const graph=emptyGraph();graph.people=[{id:'alice',name:'Alice',photo}];
    assert.throws(()=>normalizeGraph(graph),/Profile pictures/);
  }
});
test('portrait and landscape pictures are center-cropped without stretching', () => {
  assert.deepEqual(squareCrop(400,200),{x:100,y:0,size:200});
  assert.deepEqual(squareCrop(200,400),{x:0,y:100,size:200});
  assert.deepEqual(squareCrop(300,300),{x:0,y:0,size:300});
  for(const [width,height] of [[0,10],[10,0],[-5,10],[NaN,10],[10,Infinity]])assert.throws(()=>squareCrop(width,height),/dimensions/);
});
test('uploads reject unsupported formats and large files before opening an image', async () => {
  await assert.rejects(preparePhoto({type:'image/svg+xml',size:100}),/Choose a JPEG/);
  await assert.rejects(preparePhoto({type:'image/png',size:PHOTO_UPLOAD_BYTES+1}),/10 MB/);
});
