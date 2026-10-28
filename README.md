# Circles

A small, local-first personal connection map. The model has people, relation types,
and connections. Each pair of people can have several relation types.

## How the idea took shape

Circles began by rediscovering **Lost Circles**, a Chrome extension developed by
members of the Algorithmics group at the University of Konstanz. It visualized a
Facebook friendship network, helping reveal the groups hidden inside a dense
tangle of connections. The university's
[2016 research article](https://www.visual-computing.org/2016/04/18/untangling-networks/)
connects the extension to Arlind Nocaj's doctoral research on making networks
readable.

We explored the original website's archives, the related publication, and a
downloaded copy of version 2.3.1. Inspecting the extension showed how it assembled
the graph and displayed it. Its **Backbone** button sent the graph to a Lost
Circles server for processing; that server implementation was absent from the
extension package. The published research gave us a basis for building our own
local filtering method. The distinction between that method and the original
research algorithm is explained in [Backbone](#backbone).

The idea then grew beyond Facebook. The same map could include Instagram,
LinkedIn, or people who know each other in real life. Data could be entered by
hand or imported. We considered extra account details and relationship metadata,
then settled on a deliberately small model:

- **People** are nodes.
- **Connections** link two people.
- **Relation types** describe what connects them: Facebook, Instagram, LinkedIn,
  real life, or a custom type.

Two people can share several relation types. Colors and filters let us explore
those connections together or separately, and a backbone view helps untangle the
result. This became Circles: a personal map whose usefulness does not depend on
where the data came from.

## Sources and credits

- **Lost Circles** provided the original inspiration. Its
  [archived May 2018 homepage](https://web.archive.org/web/20180520082911/https://lostcircles.com/)
  credits **Arlind Nocaj, Jan Hildenbrand, Felix Schönenberger, and Alban Nocaj**,
  members of the University of Konstanz Algorithmics group.
- **The extension archive**, [Lost Circles — Social Network, version 2.3.1](https://chrome-stats.com/d/ehpmfdlcppenimpibdifodjgfafkjhjl/download),
  was used to study its collection workflow, JSON export format, viewer, and
  client/server boundary. Circles supports importing its index-based JSON graphs.
- **The publication:** Arlind Nocaj, Mark Ortmann, and Ulrik Brandes (2015).
  [*Untangling the Hairballs of Multi-Centered, Small-World Online Social Media Networks*](https://doi.org/10.7155/jgaa.00370).
  *Journal of Graph Algorithms and Applications*, **19**(2), 595–618.
  DOI: `10.7155/jgaa.00370`. Its work on quadrilateral edge embeddedness and
  connected backbones informed our local backbone implementation.
- **Research background:**
  [*Untangling Networks — or How to Focus on Less to See More*](https://www.visual-computing.org/2016/04/18/untangling-networks/)
  introduces Nocaj's dissertation, *Untangling Networks: Focus on Less to See More*,
  and explains the connection to Lost Circles.

Circles is an independent implementation inspired by that work.

## What we used to build it

The current implementation uses **plain JavaScript modules, HTML, and CSS**, with
**native SVG** for the interactive graph. The layout and backbone calculations run
in the browser. Browser `localStorage` saves the map, and JSON files provide
import, export, and backups. Node.js's built-in test runner checks the graph
logic; Python's standard-library HTTP server serves the app on localhost.

The old extension's viewer used D3 and WebCola. Studying its source helped us
understand the original workflow; Circles uses its own SVG renderer and layout.
There are no third-party runtime dependencies, and Circles does not call the old
Lost Circles service.

## Get the project and run locally

The project is maintained in the public GitHub repository
<https://github.com/TomorProcessor/connection-map>.

Requires Node.js 20+ for the tests and Python 3 for the development server. There
are no package dependencies to install.

```sh
git clone https://github.com/TomorProcessor/connection-map.git
cd connection-map
npm start
```

If you already have the project in `~/Projects/connection-map`, run `npm start`
there. No install step is needed. Stop the local server with Ctrl+C.

Open <http://127.0.0.1:4173>. Static files are in `dist/`; any static HTTP host can
serve them. Opening `index.html` directly as a `file:` URL is not supported because
the app uses JavaScript modules.

## Features

- Add, rename, and remove people.
- Add, replace, or remove an optional profile picture; initials appear otherwise.
- Add and edit undirected connections with one or more relation types.
- Built-in Real life, Facebook, Instagram, and LinkedIn types; add custom types.
- Filter by type; search for a person; select, drag, pan, zoom, and fit the map.
- Local backbone extraction with a retention slider.
- Automatic browser storage, JSON export/import, and undo for the last data change.
- Import legacy Lost Circles JSON (`nodes` and index-based `links`).
- A clearly marked fictional example, plus a blank-map action.

No Facebook account, crawler, backend, analytics, or third-party runtime requests
are used. Storage is per browser and origin: different browsers, ports, and
hostnames have separate maps. Keep using `http://127.0.0.1:4173` for this project.
Export/import to transfer a map. Clearing browser data removes saved
maps. If browser storage fails, the app warns and leaves the current map in memory.

The first version supports 500 people, 5,000 connections, and 24 relation types.
JSON imports are validated before replacing the current map. Parallel entries for
the same pair merge their relation types; self-connections are discarded. People
have a name and an optional picture. Platform account IDs are not retained.

### Profile pictures

Choose a JPEG, PNG, or WebP file (up to 10 MB) when adding or editing a person. The
browser crops the center to a square, resizes it to 192 × 192, and compresses it as
a JPEG. It appears in the graph and person details. Remove the picture to return
to initials. Canceling the editor discards picture changes.

Pictures stay on the device and are embedded in Circles JSON backups, so they
survive export/import and work offline. Older maps without pictures still load.
Imports accept embedded JPEG, PNG, and WebP data URLs up to 64 KB of encoded text
per person; external image URLs and SVG are rejected. JSON files can be up to
40 MB. The legacy Lost Circles importer still imports names and connections only.

Browser storage has a quota. If a map with many pictures exceeds it, Circles shows
a save warning and keeps the current map in memory. Export a backup before closing
the page; reducing or removing pictures can free space.

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

A person can also have an optional `photo` string containing an embedded raster
image, for example `data:image/jpeg;base64,...` (with actual image bytes in place of
the ellipsis). It is included automatically when a picture is chosen in the editor.

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
- `dist/photos.js`: picture validation, center cropping, and browser compression.

## GitHub workflow

Commit and push source changes to GitHub. The application runs locally; this
repository has no automatic hosting or deployment configured. Pulling code updates
does not change your saved map. Refresh the browser after updating the source.

```sh
git pull --ff-only
npm test
npm run check
npm start
```

Personal graph data stays in browser storage and is not committed to the repository.
Keep exported personal maps outside the project directory.
