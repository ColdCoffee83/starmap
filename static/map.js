// --- Constants -----------------------------------------------------------

const STAR_COLORS = {
  O: '#6a92ff', B: '#9bb5ff', A: '#ffffff', F: '#fff5cf',
  G: '#ffd35a', K: '#ff9c3a', M: '#ff5a4a',
};
const STAR_SIZES = { O: 14, B: 11, A: 9, F: 7, G: 6, K: 5, M: 4 };
const JUMP_RANGE = 10; // ly

function classKey(c) { return (c || 'G').slice(0, 1).toUpperCase(); }
function starColor(c) { return STAR_COLORS[classKey(c)] || STAR_COLORS.G; }
function starSize(c)  { return STAR_SIZES[classKey(c)]  || STAR_SIZES.G; }

// --- State ---------------------------------------------------------------

const state = {
  systems: [],
  ship: { x: 0, y: 0, z: 0 },
  scale: 150,
  view: { x: 0, y: 0 }, // world coords at center of canvas (starts at ship)
  selectedId: null,
  detail: null,         // full system detail
  detailStarId: null,
  detailPlanetId: null,
  detailMoonId: null,
  hoveredId: null,
  hoverScreen: { x: 0, y: 0 },
  gmPassword: localStorage.getItem('gmPassword') || '',
  gmRequired: false,
  drag: null,
};

// --- API helpers ---------------------------------------------------------

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (state.gmPassword) opts.headers['X-GM-Password'] = state.gmPassword;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${r.status}: ${text}`);
  }
  return r.json();
}

// --- Canvas --------------------------------------------------------------

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const c = document.getElementById('map-container');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = c.clientWidth * dpr;
  canvas.height = c.clientHeight * dpr;
  canvas.style.width = c.clientWidth + 'px';
  canvas.style.height = c.clientHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
window.addEventListener('resize', resizeCanvas);

function cw() { return canvas.width / (window.devicePixelRatio || 1); }
function ch() { return canvas.height / (window.devicePixelRatio || 1); }

function worldToScreen(wx, wy) {
  return [
    (wx - state.view.x) * state.scale + cw() / 2,
    -(wy - state.view.y) * state.scale + ch() / 2,
  ];
}

function draw() {
  const W = cw(), H = ch();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Grid (every 5 ly)
  ctx.strokeStyle = 'rgba(60, 80, 130, 0.18)';
  ctx.lineWidth = 1;
  const step = 5;
  const minX = state.view.x - W / (2 * state.scale);
  const maxX = state.view.x + W / (2 * state.scale);
  const minY = state.view.y - H / (2 * state.scale);
  const maxY = state.view.y + H / (2 * state.scale);
  for (let gx = Math.ceil(minX / step) * step; gx <= maxX; gx += step) {
    const [sx] = worldToScreen(gx, 0);
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
  }
  for (let gy = Math.ceil(minY / step) * step; gy <= maxY; gy += step) {
    const [, sy] = worldToScreen(0, gy);
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
  }

  // Jump-range circle around ship
  const [shipSX, shipSY] = worldToScreen(state.ship.x, state.ship.y);
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.25)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(shipSX, shipSY, JUMP_RANGE * state.scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Systems
  for (const sys of state.systems) {
    const [x, y] = worldToScreen(sys.x, sys.y);
    const r = starSize(sys.primary_class);
    if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
    const color = starColor(sys.primary_class);

    // glow
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // core
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    // multi-star indicator
    if (sys.star_count > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke();
    }

    // selection ring
    if (sys.id === state.selectedId) {
      ctx.strokeStyle = '#ffe070';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.stroke();
    }

    // labels
    ctx.fillStyle = '#5dbcff';
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`(${sys.x}, ${sys.y}, ${sys.z})`, x, y + r + 12);
    if (sys.name) {
      ctx.font = '11px sans-serif';
      ctx.fillText(sys.name, x, y + r + 24);
    }
  }

  // Ship marker
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(shipSX - 14, shipSY); ctx.lineTo(shipSX - 6, shipSY);
  ctx.moveTo(shipSX + 6, shipSY);  ctx.lineTo(shipSX + 14, shipSY);
  ctx.moveTo(shipSX, shipSY - 14); ctx.lineTo(shipSX, shipSY - 6);
  ctx.moveTo(shipSX, shipSY + 6);  ctx.lineTo(shipSX, shipSY + 14);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(shipSX, shipSY, 16, 0, Math.PI * 2); ctx.stroke();

  // Hover tooltip
  if (state.hoveredId) {
    const sys = state.systems.find(s => s.id === state.hoveredId);
    if (sys && sys.mouse_over) {
      drawTooltip(sys.mouse_over, state.hoverScreen.x + 18, state.hoverScreen.y - 8);
    }
  }
}

function drawTooltip(text, x, y) {
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  const lines = text.split('\n');
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 14;
  const h = lines.length * 16 + 10;
  if (x + w > cw()) x = cw() - w - 4;
  ctx.fillStyle = 'rgba(20, 24, 38, 0.95)';
  ctx.strokeStyle = '#5dbcff';
  ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#fff';
  lines.forEach((l, i) => ctx.fillText(l, x + 7, y + 16 + i * 16));
}

function findSystemAt(sx, sy) {
  for (const sys of state.systems) {
    const [x, y] = worldToScreen(sys.x, sys.y);
    const r = starSize(sys.primary_class) + 4;
    if ((sx - x) * (sx - x) + (sy - y) * (sy - y) < r * r) return sys;
  }
  return null;
}

// --- Mouse / keyboard ---------------------------------------------------

function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

canvas.addEventListener('mousemove', e => {
  const [sx, sy] = canvasCoords(e);
  if (state.drag) {
    const dx = (sx - state.drag.startSX) / state.scale;
    const dy = (sy - state.drag.startSY) / state.scale;
    state.view.x = state.drag.startVX - dx;
    state.view.y = state.drag.startVY + dy;
    draw();
    return;
  }
  const sys = findSystemAt(sx, sy);
  const newId = sys ? sys.id : null;
  if (newId !== state.hoveredId || sys) {
    state.hoveredId = newId;
    state.hoverScreen = { x: sx, y: sy };
    canvas.style.cursor = sys ? 'pointer' : 'crosshair';
    draw();
  }
});

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const [sx, sy] = canvasCoords(e);
  const sys = findSystemAt(sx, sy);
  if (sys) return; // clicks handled in 'click'
  state.drag = {
    startSX: sx, startSY: sy,
    startVX: state.view.x, startVY: state.view.y,
  };
  canvas.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', () => {
  if (state.drag) {
    state.drag = null;
    canvas.style.cursor = 'crosshair';
  }
});

canvas.addEventListener('click', e => {
  const [sx, sy] = canvasCoords(e);
  const sys = findSystemAt(sx, sy);
  if (sys) {
    state.selectedId = sys.id;
    loadDetail(sys.id);
    draw();
  } else if (!state.drag) {
    state.selectedId = null;
    state.detail = null;
    renderDetail();
    draw();
  }
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const [sx, sy] = canvasCoords(e);
  const sys = findSystemAt(sx, sy);
  if (sys) {
    state.selectedId = sys.id;
    loadDetail(sys.id);
    draw();
  }
});

window.addEventListener('keydown', e => {
  if (document.activeElement && document.activeElement.tagName.match(/INPUT|TEXTAREA/)) return;
  const step = 5;
  if (e.key === 'ArrowLeft')  { state.view.x -= step; draw(); }
  if (e.key === 'ArrowRight') { state.view.x += step; draw(); }
  if (e.key === 'ArrowUp')    { state.view.y += step; draw(); }
  if (e.key === 'ArrowDown')  { state.view.y -= step; draw(); }
});

document.getElementById('scale-slider').addEventListener('input', e => {
  state.scale = parseInt(e.target.value, 10);
  document.getElementById('scale-value').textContent = state.scale;
  draw();
});

document.getElementById('center-ship-btn').addEventListener('click', () => {
  state.view.x = state.ship.x;
  state.view.y = state.ship.y;
  draw();
});

// --- Ship panel ---------------------------------------------------------

function updateShipUI() {
  document.getElementById('ship-x').textContent = state.ship.x;
  document.getElementById('ship-y').textContent = state.ship.y;
  document.getElementById('ship-z').textContent = state.ship.z;
  document.getElementById('ship-x-input').value = state.ship.x;
  document.getElementById('ship-y-input').value = state.ship.y;
  document.getElementById('ship-z-input').value = state.ship.z;
}

document.getElementById('save-ship-btn').addEventListener('click', async () => {
  const x = parseFloat(document.getElementById('ship-x-input').value);
  const y = parseFloat(document.getElementById('ship-y-input').value);
  const z = parseFloat(document.getElementById('ship-z-input').value);
  if (isNaN(x) || isNaN(y) || isNaN(z)) return alert('Enter valid numbers');
  await api('PUT', '/api/ship', { x, y, z });
  state.ship = { x, y, z };
  state.view.x = x; state.view.y = y;
  updateShipUI();
  draw();
});

// --- Distance ----------------------------------------------------------

function refreshDistance() {
  const fx = parseFloat(document.getElementById('dist-from-x').value);
  const fy = parseFloat(document.getElementById('dist-from-y').value);
  const fz = parseFloat(document.getElementById('dist-from-z').value);
  const tx = parseFloat(document.getElementById('dist-to-x').value);
  const ty = parseFloat(document.getElementById('dist-to-y').value);
  const tz = parseFloat(document.getElementById('dist-to-z').value);
  if ([fx, fy, fz, tx, ty, tz].some(isNaN)) {
    document.getElementById('dist-result').textContent = '—';
    document.getElementById('jump-status').textContent = '';
    return;
  }
  const d = Math.sqrt((tx - fx) ** 2 + (ty - fy) ** 2 + (tz - fz) ** 2);
  document.getElementById('dist-result').textContent = d.toFixed(2);
  const status = document.getElementById('jump-status');
  if (d <= JUMP_RANGE) { status.textContent = `(in jump range, ${JUMP_RANGE} ly)`; status.className = 'jump-yes'; }
  else { status.textContent = `(beyond ${JUMP_RANGE} ly jump)`; status.className = 'jump-no'; }
}

['dist-from-x','dist-from-y','dist-from-z','dist-to-x','dist-to-y','dist-to-z']
  .forEach(id => document.getElementById(id).addEventListener('input', refreshDistance));

document.getElementById('dist-use-ship').addEventListener('click', () => {
  document.getElementById('dist-from-x').value = state.ship.x;
  document.getElementById('dist-from-y').value = state.ship.y;
  document.getElementById('dist-from-z').value = state.ship.z;
  refreshDistance();
});

document.getElementById('dist-use-selected').addEventListener('click', () => {
  if (!state.detail) return;
  document.getElementById('dist-to-x').value = state.detail.x;
  document.getElementById('dist-to-y').value = state.detail.y;
  document.getElementById('dist-to-z').value = state.detail.z;
  refreshDistance();
});

// --- GM auth ----------------------------------------------------------

document.getElementById('set-password-btn').addEventListener('click', () => {
  state.gmPassword = document.getElementById('gm-password-input').value;
  localStorage.setItem('gmPassword', state.gmPassword);
  updateAuthStatus();
  if (state.detail) renderDetail();
});

function updateAuthStatus() {
  const el = document.getElementById('auth-status');
  if (!state.gmRequired) {
    el.textContent = 'Editing: open (no GM password set on server)';
  } else if (state.gmPassword) {
    el.textContent = 'Editing: GM password loaded';
  } else {
    el.textContent = 'Editing: read-only (enter GM password)';
  }
}

document.getElementById('new-system-btn').addEventListener('click', async () => {
  try {
    const r = await api('POST', '/api/system', {
      x: state.ship.x, y: state.ship.y, z: state.ship.z, name: 'New system'
    });
    await loadSystems();
    state.selectedId = r.id;
    await loadDetail(r.id);
    draw();
  } catch (e) { alert(e.message); }
});

// --- Detail panel ------------------------------------------------------

async function loadDetail(id) {
  state.detail = await api('GET', `/api/system/${id}`);
  state.detailStarId = null;
  state.detailPlanetId = null;
  state.detailMoonId = null;
  renderDetail();
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function canEdit() { return !state.gmRequired || !!state.gmPassword; }

function renderDetail() {
  const el = document.getElementById('detail-content');
  const title = document.getElementById('detail-title');
  if (!state.detail) {
    title.textContent = 'Selection';
    el.innerHTML = '<p class="muted">Click a system on the map to view details.</p>';
    return;
  }
  const sys = state.detail;

  // breadcrumb
  let bc = `<span class="link" data-go="system">${escapeHtml(sys.name || `System #${sys.id}`)}</span>`;
  if (state.detailStarId) {
    const star = sys.stars.find(s => s.id === state.detailStarId);
    if (star) bc += ` &raquo; <span class="link" data-go="star">${escapeHtml(star.star_class)}</span>`;
  }
  if (state.detailPlanetId) {
    const star = sys.stars.find(s => s.id === state.detailStarId);
    const planet = star && star.planets.find(p => p.id === state.detailPlanetId);
    if (planet) {
      const planetLabel = escapeHtml(planet.name || 'Planet');
      bc += state.detailMoonId
        ? ` &raquo; <span class="link" data-go="planet">${planetLabel}</span>`
        : ` &raquo; ${planetLabel}`;
      if (state.detailMoonId) {
        const moon = planet.moons.find(m => m.id === state.detailMoonId);
        if (moon) bc += ` &raquo; ${escapeHtml(moon.name || 'Moon')}`;
      }
    }
  }

  let body;
  if (state.detailMoonId) body = renderMoonView();
  else if (state.detailPlanetId) body = renderPlanetView();
  else if (state.detailStarId) body = renderStarView();
  else body = renderSystemView();

  title.innerHTML = `<div class="breadcrumb">${bc}</div>`;
  el.innerHTML = body;
  attachDetailHandlers();
}

function fieldRow(label, value, editKey, multi=false, alwaysOpen=false) {
  const editable = (canEdit() || alwaysOpen) && editKey;
  const cls = editable ? 'editable' : '';
  if (multi) {
    return `<div class="field-row" style="flex-direction:column; align-items:stretch;">
              <div class="field-label">${escapeHtml(label)}</div>
              <div class="notes-block ${cls}" data-edit="${editKey || ''}" data-multi="1">${escapeHtml(value || '')}</div>
            </div>`;
  }
  return `<div class="field-row">
            <div class="field-label">${escapeHtml(label)}</div>
            <div class="field-value ${cls}" data-edit="${editKey || ''}">${escapeHtml(value || '(empty)')}</div>
          </div>`;
}

function renderSystemView() {
  const sys = state.detail;
  let html = '<section>';
  html += fieldRow('Name', sys.name, 'name');
  html += fieldRow('X (ly)', sys.x, canEdit() ? 'x' : null);
  html += fieldRow('Y (ly)', sys.y, canEdit() ? 'y' : null);
  html += fieldRow('Z (ly)', sys.z, canEdit() ? 'z' : null);
  html += fieldRow('System code', sys.system_code, 'system_code');
  // Player notes (mouse-over) are editable by anyone, even without GM rights.
  html += fieldRow('Player notes (mouse-over)', sys.mouse_over, 'mouse_over', true, true);
  html += fieldRow('Notes', sys.notes, 'notes', true);
  html += '</section>';

  html += '<section><h3>Stars</h3><ul class="entity-list">';
  for (const star of sys.stars) {
    html += `<li data-star="${star.id}">
               <span class="star-dot" style="background:${starColor(star.star_class)};color:${starColor(star.star_class)};"></span>
               <span class="item-title">${escapeHtml(star.star_class)}</span>
               <span class="item-sub">${star.planets.length} planet${star.planets.length===1?'':'s'}</span>
             </li>`;
  }
  html += '</ul>';
  if (canEdit()) {
    html += `<div class="btn-row">
               <button id="add-star-btn">+ Add star</button>
               <button id="delete-system-btn" class="danger">Delete system</button>
             </div>`;
  }
  html += '</section>';
  return html;
}

function renderStarView() {
  const sys = state.detail;
  const star = sys.stars.find(s => s.id === state.detailStarId);
  if (!star) { state.detailStarId = null; return renderSystemView(); }

  let html = '<section>';
  html += fieldRow('Class', star.star_class, 'star_class');
  html += fieldRow('Mass', star.mass, 'mass');
  html += fieldRow('Luminosity', star.luminosity, 'luminosity');
  html += fieldRow('Magnetic field', star.magnetic_field, 'magnetic_field');
  html += fieldRow('Flare frequency', star.flare_frequency, 'flare_frequency');
  html += fieldRow('Other', star.extra, 'extra');
  html += fieldRow('Notes', star.notes, 'notes', true);
  html += '</section>';

  html += '<section><h3>Planets / Bodies</h3><ul class="entity-list">';
  if (!star.planets.length) html += '<li class="muted">No bodies</li>';
  for (const p of star.planets) {
    const moonCount = (p.moons || []).length;
    const sub = [p.orbital_distance || '',
                 moonCount ? `${moonCount} moon${moonCount === 1 ? '' : 's'}` : '']
                .filter(Boolean).join(' · ');
    html += `<li data-planet="${p.id}">
               <span class="item-title">${escapeHtml(p.name || `Body ${p.display_order + 1}`)}</span>
               <span class="item-sub">${escapeHtml(sub)}</span>
             </li>`;
  }
  html += '</ul>';
  if (canEdit()) {
    html += `<div class="btn-row">
               <button id="add-planet-btn">+ Add body</button>
               <button id="delete-star-btn" class="danger">Delete star</button>
             </div>`;
  }
  html += '</section>';
  return html;
}

function renderPlanetView() {
  const sys = state.detail;
  const star = sys.stars.find(s => s.id === state.detailStarId);
  if (!star) { state.detailPlanetId = null; return renderStarView(); }
  const p = star.planets.find(p => p.id === state.detailPlanetId);
  if (!p) { state.detailPlanetId = null; return renderStarView(); }

  let html = '<section>';
  html += fieldRow('Name', p.name, 'name');
  html += fieldRow('Orbital distance', p.orbital_distance, 'orbital_distance');
  html += fieldRow('Mass', p.mass, 'mass');
  html += fieldRow('Radius', p.radius, 'radius');
  html += fieldRow('Atmosphere', p.atmosphere, 'atmosphere');
  html += fieldRow('Hydrosphere', p.hydrosphere, 'hydrosphere');
  html += fieldRow('Sophont artifacts', p.sophont_artifacts, 'sophont_artifacts', true);
  html += fieldRow('Notes', p.notes, 'notes', true);
  html += '</section>';

  html += '<section><h3>Moons</h3><ul class="entity-list">';
  const moons = p.moons || [];
  if (!moons.length) html += '<li class="muted">No moons</li>';
  for (const m of moons) {
    html += `<li data-moon="${m.id}">
               <span class="item-title">${escapeHtml(m.name || `Moon ${m.display_order + 1}`)}</span>
               <span class="item-sub">${escapeHtml(m.orbital_distance || '')}</span>
             </li>`;
  }
  html += '</ul>';
  if (canEdit()) {
    html += `<div class="btn-row">
               <button id="add-moon-btn">+ Add moon</button>
               <button id="delete-planet-btn" class="danger">Delete body</button>
             </div>`;
  }
  html += '</section>';
  return html;
}

function renderMoonView() {
  const sys = state.detail;
  const star = sys.stars.find(s => s.id === state.detailStarId);
  if (!star) { state.detailMoonId = null; return renderStarView(); }
  const planet = star.planets.find(p => p.id === state.detailPlanetId);
  if (!planet) { state.detailMoonId = null; return renderStarView(); }
  const m = (planet.moons || []).find(m => m.id === state.detailMoonId);
  if (!m) { state.detailMoonId = null; return renderPlanetView(); }

  let html = '<section>';
  html += fieldRow('Name', m.name, 'name');
  html += fieldRow('Orbital distance', m.orbital_distance, 'orbital_distance');
  html += fieldRow('Mass', m.mass, 'mass');
  html += fieldRow('Radius', m.radius, 'radius');
  html += fieldRow('Atmosphere', m.atmosphere, 'atmosphere');
  html += fieldRow('Hydrosphere', m.hydrosphere, 'hydrosphere');
  html += fieldRow('Sophont artifacts', m.sophont_artifacts, 'sophont_artifacts', true);
  html += fieldRow('Notes', m.notes, 'notes', true);
  html += '</section>';

  if (canEdit()) {
    html += `<div class="btn-row"><button id="delete-moon-btn" class="danger">Delete moon</button></div>`;
  }
  return html;
}

function attachDetailHandlers() {
  const title = document.getElementById('detail-title');
  title.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', () => {
      const target = el.dataset.go;
      if (target === 'system') { state.detailStarId = null; state.detailPlanetId = null; state.detailMoonId = null; }
      if (target === 'star')   { state.detailPlanetId = null; state.detailMoonId = null; }
      if (target === 'planet') { state.detailMoonId = null; }
      renderDetail();
    });
  });

  const root = document.getElementById('detail-content');

  root.querySelectorAll('[data-star]').forEach(el => {
    el.addEventListener('click', () => {
      state.detailStarId = parseInt(el.dataset.star, 10);
      state.detailPlanetId = null;
      renderDetail();
    });
  });
  root.querySelectorAll('[data-planet]').forEach(el => {
    el.addEventListener('click', () => {
      state.detailPlanetId = parseInt(el.dataset.planet, 10);
      state.detailMoonId = null;
      renderDetail();
    });
  });
  root.querySelectorAll('[data-moon]').forEach(el => {
    el.addEventListener('click', () => {
      state.detailMoonId = parseInt(el.dataset.moon, 10);
      renderDetail();
    });
  });

  root.querySelectorAll('.editable[data-edit]').forEach(el => {
    el.addEventListener('click', () => beginEdit(el));
  });

  const addStarBtn = document.getElementById('add-star-btn');
  if (addStarBtn) addStarBtn.addEventListener('click', addStar);

  const addPlanetBtn = document.getElementById('add-planet-btn');
  if (addPlanetBtn) addPlanetBtn.addEventListener('click', addPlanet);

  const addMoonBtn = document.getElementById('add-moon-btn');
  if (addMoonBtn) addMoonBtn.addEventListener('click', addMoon);

  const delSysBtn = document.getElementById('delete-system-btn');
  if (delSysBtn) delSysBtn.addEventListener('click', deleteSystem);

  const delStarBtn = document.getElementById('delete-star-btn');
  if (delStarBtn) delStarBtn.addEventListener('click', deleteStar);

  const delPlanetBtn = document.getElementById('delete-planet-btn');
  if (delPlanetBtn) delPlanetBtn.addEventListener('click', deletePlanet);

  const delMoonBtn = document.getElementById('delete-moon-btn');
  if (delMoonBtn) delMoonBtn.addEventListener('click', deleteMoon);
}

// --- Inline edit -------------------------------------------------------

function beginEdit(el) {
  const key = el.dataset.edit;
  if (!key) return;
  // Guard against re-entry: clicks inside an already-open editor (e.g. to
  // reposition the cursor, or on the Save/Cancel buttons) bubble back up to
  // this same element's click handler. Without this, the re-run would read
  // el.textContent — now "SaveCancel" — and dump it into the input.
  if (el.querySelector('.edit-input')) return;
  const multi = el.dataset.multi === '1';
  const current = el.textContent === '(empty)' ? '' : el.textContent;
  el.innerHTML = '';
  const input = document.createElement(multi ? 'textarea' : 'input');
  input.className = 'edit-input';
  input.value = current;
  if (!multi) input.type = 'text';
  el.appendChild(input);
  const btnRow = document.createElement('div');
  btnRow.className = 'btn-row';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'primary'; saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  btnRow.appendChild(saveBtn); btnRow.appendChild(cancelBtn);
  el.appendChild(btnRow);
  input.focus();

  saveBtn.addEventListener('click', async () => {
    const value = input.value;
    const payload = {};
    if (['x', 'y', 'z'].includes(key)) {
      const n = parseFloat(value);
      if (isNaN(n)) return alert('Must be a number');
      payload[key] = n;
    } else {
      payload[key] = value;
    }
    try { await commitEdit(payload); } catch (e) { alert(e.message); }
  });
  cancelBtn.addEventListener('click', () => renderDetail());
}

async function commitEdit(payload) {
  if (state.detailMoonId) {
    await api('PATCH', `/api/moon/${state.detailMoonId}`, payload);
  } else if (state.detailPlanetId) {
    await api('PATCH', `/api/planet/${state.detailPlanetId}`, payload);
  } else if (state.detailStarId) {
    await api('PATCH', `/api/star/${state.detailStarId}`, payload);
  } else {
    await api('PATCH', `/api/system/${state.detail.id}`, payload);
  }
  await loadDetail(state.detail.id);
  await loadSystems();
  draw();
}

async function addStar() {
  try {
    await api('POST', '/api/star', {
      system_id: state.detail.id,
      star_class: 'G2',
      display_order: state.detail.stars.length,
    });
    await loadDetail(state.detail.id);
    await loadSystems();
    draw();
  } catch (e) { alert(e.message); }
}

async function addPlanet() {
  try {
    const star = state.detail.stars.find(s => s.id === state.detailStarId);
    const starId = state.detailStarId;
    await api('POST', '/api/planet', {
      star_id: starId,
      name: '',
      display_order: star ? star.planets.length : 0,
    });
    await loadDetail(state.detail.id);
    // loadDetail resets drill-down; restore the star view we were on
    state.detailStarId = starId;
    renderDetail();
  } catch (e) { alert(e.message); }
}

async function addMoon() {
  try {
    const star = state.detail.stars.find(s => s.id === state.detailStarId);
    const planet = star && star.planets.find(p => p.id === state.detailPlanetId);
    await api('POST', '/api/moon', {
      planet_id: state.detailPlanetId,
      name: '',
      display_order: planet ? (planet.moons || []).length : 0,
    });
    await loadDetail(state.detail.id);
    // loadDetail resets drill-down; restore the planet view we were on
    state.detailStarId = star ? star.id : null;
    state.detailPlanetId = planet ? planet.id : null;
    renderDetail();
  } catch (e) { alert(e.message); }
}

async function deleteSystem() {
  if (!confirm('Delete this entire system?')) return;
  await api('DELETE', `/api/system/${state.detail.id}`);
  state.detail = null;
  state.selectedId = null;
  renderDetail();
  await loadSystems();
  draw();
}

async function deleteStar() {
  if (!confirm('Delete this star (and its planets)?')) return;
  await api('DELETE', `/api/star/${state.detailStarId}`);
  state.detailStarId = null;
  await loadDetail(state.detail.id);
  await loadSystems();
  draw();
}

async function deletePlanet() {
  if (!confirm('Delete this body?')) return;
  await api('DELETE', `/api/planet/${state.detailPlanetId}`);
  state.detailPlanetId = null;
  await loadDetail(state.detail.id);
}

async function deleteMoon() {
  if (!confirm('Delete this moon?')) return;
  const starId = state.detailStarId;
  const planetId = state.detailPlanetId;
  await api('DELETE', `/api/moon/${state.detailMoonId}`);
  await loadDetail(state.detail.id);
  // Return to the planet view the moon belonged to
  state.detailStarId = starId;
  state.detailPlanetId = planetId;
  renderDetail();
}

// --- Boot --------------------------------------------------------------

async function loadSystems() {
  state.systems = await api('GET', '/api/systems');
}

async function loadShip() {
  state.ship = await api('GET', '/api/ship');
  state.view.x = state.ship.x;
  state.view.y = state.ship.y;
  updateShipUI();
}

async function loadConfig() {
  const cfg = await api('GET', '/api/config');
  state.gmRequired = cfg.gm_password_required;
  document.getElementById('gm-password-input').value = state.gmPassword;
  updateAuthStatus();
}

(async function init() {
  resizeCanvas();
  try {
    await loadConfig();
    await loadShip();
    await loadSystems();
    document.getElementById('dist-from-x').value = state.ship.x;
    document.getElementById('dist-from-y').value = state.ship.y;
    document.getElementById('dist-from-z').value = state.ship.z;
    draw();
  } catch (e) {
    console.error(e);
    alert('Failed to load: ' + e.message);
  }
})();
