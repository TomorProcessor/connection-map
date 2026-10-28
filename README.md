# Circles

A small, local-first personal connection map. The model has people, relation types,
and connections. Each pair of people can have several relation types.

## Run locally

Requires Node.js 20+ for the tests and Python 3 for the development server. There
are no package dependencies to install.

```sh
npm start
```

Open <http://127.0.0.1:4173>. Static files are in `dist/`; any static HTTP host can
serve them. Opening `index.html` directly as a `file:` URL is not supported because
the app uses JavaScript modules.

## Features

- Add, rename, and remove people.
- Add and edit undirected connections with one or more relation types.
- Built-in Real life, Facebook, Instagram, and LinkedIn types; add custom types.
- Filter by type; search for a person; select, drag, pan, zoom, and fit the map.
- Local backbone extraction with a retention slider.
- Automatic browser storage, JSON export/import, and undo for the last data change.
- Import legacy Lost Circles JSON (`nodes` and index-based `links`).
- A clearly marked fictional example, plus a blank-map action.

No Facebook account, crawler, backend, analytics, or third-party runtime requests
are used. Storage is per browser and origin: the localhost app and hosted app have
separate maps. Export/import to transfer a map. Clearing browser data removes saved
maps. If browser storage fails, the app warns and leaves the current map in memory.

The first version supports 500 people, 5,000 connections, and 24 relation types.
JSON imports are validated before replacing the current map. Parallel entries for
the same pair merge their relation types; self-connections are discarded. Data has
names and types only; imported photos and platform account IDs are not retained.

## Backbone

The local implementation counts the four-cycles containing each edge and uses
normalized quadrilateral embeddedness:

`Q(u,v) = q(u,v) / sqrt(q(u) * q(v))`

Here `q(u)` is the sum of quadrangle counts on edges incident to `u`. Connections
with no quadrangles receive score zero. Edges are ranked by that score. The chosen
top fraction is combined with a maximum spanning forest, preserving each original
connected component, including bridges. A single spanning forest is retained;
ties are resolved deterministically. As a result, the actual retained fraction may
exceed the slider target. Filtering changes the graph on which scores are computed.
Neither filtering nor backbone mode changes the stored data.

This is a practical variant inspired by Nocaj, Ortmann & Brandes (2015),
[Untangling the Hairballs of Multi-Centered, Small-World Online Social Media Networks](https://doi.org/10.7155/jgaa.00370).
It does **not** implement their ranked-neighborhood reweighting or union of all
maximum spanning trees. It does not claim to reproduce the missing Lost Circles
server exactly. Layout is an independent force simulation; no old extension source
or vendor libraries have been copied.

## File format

```json
{
  "version": 1,
  "people": [{"id": "alice", "name": "Alice"}, {"id": "bob", "name": "Bob"}],
  "types": [{"id": "real-life", "name": "Real life", "color": "#3f806b"}],
  "connections": [{"source": "alice", "target": "bob", "types": ["real-life"]}]
}
```

## Validation

```sh
npm test
npm run check
```

The tests verify quadrangle counts, normalized scores, connectivity preservation,
essential bridges, filters, legacy import, duplicate merging, and invalid data.

## Project files

- `dist/index.html`, `dist/style.css`: interface and responsive layout.
- `dist/app.js`: graph editor, local persistence, import/export, and SVG rendering.
- `dist/graph.js`: model validation, demo data, filters, and backbone computation.
- `.openai/hosting.json`: private Site identity and static deployment configuration.
