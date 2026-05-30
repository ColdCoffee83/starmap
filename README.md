# Star Map

A top-down 2D viewer for a fictional volume of space, built for a tabletop
RPG campaign. Stars are colored dots sized by spectral class; click any system
to drill down **System → Sun → Planet → Moon**. Includes a distance / jump-range
calculator and GM-gated editing of all the underlying data.

Flask + SQLite backend, vanilla HTML/Canvas/JS frontend. No build step.

## Quick start (local)

```bash
pip install -r requirements.txt
python seed_data.py        # creates starmap.db with ~45 sample systems
python server.py           # http://localhost:5000
```

Open http://localhost:5000 in a browser.

## Features

- **Map**: black field, 5-ly grid, stars colored/sized by class (O = big blue
  … M = small red), (X,Y,Z) + name under each dot, green ship marker with a
  dashed 10-ly jump-range circle.
- **Navigation**: click a star to select; drill into suns, planets, and moons
  via the side panel breadcrumb. Drag empty space or use arrow keys to pan;
  slider or mouse wheel to zoom; "Center on ship" to snap back.
- **Distance tool**: enter two points (defaults From = ship), get the distance
  in light years and whether it's within one 10-ly jump.
- **Ship**: anyone can move the ship (it's a shared marker, per the design).
- **Player notes**: anyone can edit a system's "Player notes (mouse-over)" text
  — these show as a tooltip on hover — *without* the GM password.
- **GM editing**: with the GM password, create/edit/delete systems, suns,
  planets, and moons and all their fields, inline.

## Data model

`systems` → `stars` → `planets` → `moons`. A system's location (X,Y,Z floats)
plus an integer id; the largest-class star sets the dot's color/size on the map.

## Auth

Editing is **open** unless the `GM_PASSWORD` environment variable is set on the
server. When set:

- Anyone can still move the ship and edit player mouse-over notes.
- Everything else (creating/editing/deleting systems, suns, planets, moons)
  requires the password, sent via the `X-GM-Password` header. The frontend has
  a box in the **GM** panel to enter it (stored in your browser's localStorage).

Set it before starting the server:

```bash
# macOS / Linux
GM_PASSWORD=your-secret python server.py
# Windows PowerShell
$env:GM_PASSWORD = 'your-secret'; python server.py
```

## Importing your own data

`POST /api/import` replaces all data with a JSON array of systems. The shape
matches what `GET /api/system/<id>` returns, so you can export a system, edit,
and re-import. Each system may contain `stars`, each star `planets`, each
planet `moons`. See `seed_data.py` for the field names.

## Deploying for the group

See [DEPLOY.md](DEPLOY.md) for hosting on PythonAnywhere (free tier) so players
can reach it from any browser.
