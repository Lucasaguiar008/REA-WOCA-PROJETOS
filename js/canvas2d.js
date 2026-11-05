// ============================================================================
// EDITOR CAD 2D INTERATIVO — PLANTA BAIXA, PORTAS/JANELAS/VÃOS (NBR 6492) E ELÉTRICA (NBR 5410)
// ============================================================================

window.CAD2D = (function () {
  let canvas = null;
  let ctx = null;
  let project = null;
  let onSelectionChange = null;
  let onProjectMutate = null;
  let onToolChange = null;
  let onStateChange = null;

  // Transformação de câmera (metros -> pixels)
  let scale = 68;
  let offsetX = 90;
  let offsetY = 75;

  // Estado de ferramentas
  // select, pan, add_room, door, window, opening, qdc, light, switch, tug_baixa, tug_media, tue_alta, conduit
  let activeTool = 'select';
  let selectedItem = null;   // { kind: 'room'|'point'|'conduit'|'opening', id: string }
  let hoveredPointId = null;
  let hoveredOpeningId = null;
  let hoveredRoomId = null;
  let hoveredHandle = null;  // 'n','s','e','w','nw','ne','sw','se' | 'op_start','op_end'
  let conduitStartPointId = null;
  let mouseWorldPos = { x: 0, y: 0 };

  // Pilhas de Histórico (Reverter / Refazer) e Área de Transferência (Copiar / Colar)
  const MAX_HISTORY = 60;
  let undoStack = [];
  let redoStack = [];
  let clipboardData = null;
  let pendingDragSnapshot = null;

  // Arraste e Edição
  let isDragging = false;
  let dragType = null; // 'pan' | 'point' | 'room' | 'resize_room' | 'new_room' | 'opening' | 'resize_opening'
  let activeResizeHandle = null;
  let dragStartScreen = { x: 0, y: 0 };
  let dragStartWorld = { x: 0, y: 0 };
  let dragInitialRoom = null;
  let dragInitialPointsSnapshot = [];
  let dragInitialPos = { x: 0, y: 0 };
  let newRoomPreview = null;

  // Imagem/Planta importada de fundo
  let backgroundOverlayImg = null;

  // Camadas visíveis
  const layers = {
    architecture: true,
    conduits: true,
    lighting: true,
    outlets: true,
    labels: true,
    dimensions: true
  };

  function init(canvasEl, callbacks) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    onSelectionChange = callbacks.onSelectionChange || function () {};
    onProjectMutate = callbacks.onProjectMutate || function () {};
    onToolChange = callbacks.onToolChange || function () {};
    onStateChange = callbacks.onStateChange || function () {};

    bindEvents();
    resize();
    window.addEventListener('resize', resize);
  }

  function setProject(proj) {
    project = proj;
    if (project) {
      window.NBR5410.ensureProjectOpenings(project);
    }
    selectedItem = null;
    conduitStartPointId = null;
    undoStack = [];
    redoStack = [];
    pendingDragSnapshot = null;
    resize();
    fitToView();
    notifyStateChange();
    render();
  }

  // ==================== HISTÓRICO (REVERTER / REFAZER) ====================
  function captureStateSnapshot() {
    if (!project) return null;
    return JSON.stringify({
      rooms: project.rooms || [],
      openings: project.openings || [],
      points: project.points || [],
      conduits: project.conduits || [],
      circuits: project.circuits || [],
      selectedItem
    });
  }

  function applyStateSnapshot(serialized) {
    if (!project || !serialized) return;
    const data = JSON.parse(serialized);
    project.rooms = data.rooms || [];
    project.openings = data.openings || [];
    project.points = data.points || [];
    project.conduits = data.conduits || [];
    project.circuits = data.circuits || [];
    selectedItem = data.selectedItem || null;
  }

  function pushHistorySnapshot() {
    if (!project) return;
    const snapStr = captureStateSnapshot();
    if (!snapStr) return;
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapStr) {
      return;
    }
    undoStack.push(snapStr);
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    redoStack = [];
    notifyStateChange();
  }

  function undo() {
    if (!project || undoStack.length === 0) return false;
    const currentSnap = captureStateSnapshot();
    if (currentSnap) {
      redoStack.push(currentSnap);
    }
    const prevSnap = undoStack.pop();
    applyStateSnapshot(prevSnap);
    onSelectionChange(selectedItem);
    onProjectMutate('Ação revertida (Ctrl+Z)');
    notifyStateChange();
    render();
    return true;
  }

  function redo() {
    if (!project || redoStack.length === 0) return false;
    const currentSnap = captureStateSnapshot();
    if (currentSnap) {
      undoStack.push(currentSnap);
    }
    const nextSnap = redoStack.pop();
    applyStateSnapshot(nextSnap);
    onSelectionChange(selectedItem);
    onProjectMutate('Ação refeita (Ctrl+Y)');
    notifyStateChange();
    render();
    return true;
  }

  // ==================== COPIAR E COLAR (AMBIENTES, PONTOS E PORTAS/JANELAS/VÃOS) ====================
  function copySelected() {
    if (!project || !selectedItem) return false;

    if (selectedItem.kind === 'room') {
      const room = project.rooms.find(r => r.id === selectedItem.id);
      if (!room) return false;

      const roomPoints = project.points.filter(p => isPointInsideRoom(p, room) && p.category !== 'qdc');
      const roomPtIds = new Set(roomPoints.map(p => p.id));
      const roomConduits = project.conduits.filter(
        c => roomPtIds.has(c.fromId) && roomPtIds.has(c.toId)
      );
      const roomOpenings = (project.openings || []).filter(op => op.roomId === room.id);

      clipboardData = {
        kind: 'room',
        pasteCount: 0,
        room: JSON.parse(JSON.stringify(room)),
        openings: JSON.parse(JSON.stringify(roomOpenings)),
        points: JSON.parse(JSON.stringify(roomPoints)),
        conduits: JSON.parse(JSON.stringify(roomConduits))
      };
      notifyStateChange();
      onProjectMutate(`Ambiente "${room.name}" copiado (Ctrl+C)`);
      return true;
    }

    if (selectedItem.kind === 'point') {
      const pt = project.points.find(p => p.id === selectedItem.id);
      if (!pt) return false;

      clipboardData = {
        kind: 'point',
        pasteCount: 0,
        point: JSON.parse(JSON.stringify(pt))
      };
      notifyStateChange();
      onProjectMutate(`Ponto "${pt.label || pt.category.toUpperCase()}" copiado (Ctrl+C)`);
      return true;
    }

    if (selectedItem.kind === 'opening') {
      const op = (project.openings || []).find(o => o.id === selectedItem.id);
      if (!op) return false;

      clipboardData = {
        kind: 'opening',
        pasteCount: 0,
        opening: JSON.parse(JSON.stringify(op))
      };
      notifyStateChange();
      onProjectMutate(`Abertura "${op.label || op.type}" copiada (Ctrl+C)`);
      return true;
    }

    return false;
  }

  function pasteClipboard() {
    if (!project || !clipboardData) return false;
    pushHistorySnapshot();
    clipboardData.pasteCount = (clipboardData.pasteCount || 0) + 1;
    const stepCount = clipboardData.pasteCount;
    const stamp = Date.now();

    if (clipboardData.kind === 'room') {
      const srcRoom = clipboardData.room;
      const dx = +(srcRoom.w * stepCount).toFixed(2);
      const dy = 0;

      const newRoom = {
        ...JSON.parse(JSON.stringify(srcRoom)),
        id: `room-${stamp}`,
        name: `${srcRoom.name} (${stepCount + 1})`,
        x: +(srcRoom.x + dx).toFixed(2),
        y: +(srcRoom.y + dy).toFixed(2)
      };
      project.rooms.push(newRoom);

      // Cola aberturas (portas, janelas, vãos) do cômodo
      if (!Array.isArray(project.openings)) project.openings = [];
      (clipboardData.openings || []).forEach((op, idx) => {
        project.openings.push({
          ...JSON.parse(JSON.stringify(op)),
          id: `op-paste-${stamp}-${idx}`,
          roomId: newRoom.id
        });
      });

      const idMap = {};
      const qdc = project.points.find(p => p.category === 'qdc');
      let pastedLightId = null;

      (clipboardData.points || []).forEach((pt, idx) => {
        const newPtId = `pt-paste-${stamp}-${idx}`;
        idMap[pt.id] = newPtId;
        if (pt.category === 'light') pastedLightId = newPtId;

        project.points.push({
          ...JSON.parse(JSON.stringify(pt)),
          id: newPtId,
          x: +(pt.x + dx).toFixed(2),
          y: +(pt.y + dy).toFixed(2),
          roomId: newRoom.id
        });
      });

      (clipboardData.conduits || []).forEach((cd, idx) => {
        if (idMap[cd.fromId] && idMap[cd.toId]) {
          project.conduits.push({
            ...JSON.parse(JSON.stringify(cd)),
            id: `cd-paste-${stamp}-${idx}`,
            fromId: idMap[cd.fromId],
            toId: idMap[cd.toId]
          });
        }
      });

      if (qdc && pastedLightId) {
        project.conduits.push({
          id: `cd-qdc-${stamp}`,
          fromId: qdc.id,
          toId: pastedLightId,
          mounting: 'laje',
          diameterMm: 20
        });
      }

      selectedItem = { kind: 'room', id: newRoom.id };
      onSelectionChange(selectedItem);
      notifyStateChange();
      onProjectMutate(`Ambiente "${newRoom.name}" colado na planta (Ctrl+V)`);
      render();
      return true;
    }

    if (clipboardData.kind === 'point') {
      const srcPt = clipboardData.point;
      const offsetDelta = +(0.4 * stepCount).toFixed(2);
      const nx = snap(srcPt.x + offsetDelta, 0.1);
      const ny = snap(srcPt.y + offsetDelta, 0.1);
      const hostRoom = findRoomAtWorld(nx, ny);

      const newPt = {
        ...JSON.parse(JSON.stringify(srcPt)),
        id: `pt-paste-${stamp}`,
        x: nx,
        y: ny,
        roomId: hostRoom ? hostRoom.id : srcPt.roomId
      };
      project.points.push(newPt);

      selectedItem = { kind: 'point', id: newPt.id };
      onSelectionChange(selectedItem);
      notifyStateChange();
      onProjectMutate(`Ponto "${newPt.label || newPt.category.toUpperCase()}" colado na planta (Ctrl+V)`);
      render();
      return true;
    }

    if (clipboardData.kind === 'opening') {
      const srcOp = clipboardData.opening;
      if (!Array.isArray(project.openings)) project.openings = [];
      const newOp = {
        ...JSON.parse(JSON.stringify(srcOp)),
        id: `op-paste-${stamp}`,
        offset: +(Number(srcOp.offset || 1.0) + 0.6 * stepCount).toFixed(2)
      };
      project.openings.push(newOp);
      selectedItem = { kind: 'opening', id: newOp.id };
      onSelectionChange(selectedItem);
      notifyStateChange();
      onProjectMutate(`Abertura "${newOp.label || newOp.type}" colada (Ctrl+V)`);
      render();
      return true;
    }

    return false;
  }

  function duplicateSelected() {
    if (copySelected()) {
      return pasteClipboard();
    }
    return false;
  }

  function notifyStateChange() {
    if (onStateChange) {
      onStateChange({
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        canCopy: Boolean(selectedItem && ['room', 'point', 'opening'].includes(selectedItem.kind)),
        canPaste: Boolean(clipboardData),
        hasSelection: Boolean(selectedItem)
      });
    }
  }

  function selectById(kind, id, shouldFocus = false) {
    if (!project) return;
    selectedItem = { kind, id };
    onSelectionChange(selectedItem);
    notifyStateChange();
    if (shouldFocus && kind === 'room') {
      const r = project.rooms.find(rm => rm.id === id);
      if (r && canvas) {
        offsetX = canvas.width / 2 - (r.x + r.w / 2) * scale;
        offsetY = canvas.height / 2 - (r.y + r.h / 2) * scale;
      }
    }
    render();
  }

  function setTool(toolName) {
    activeTool = toolName;
    conduitStartPointId = null;
    updateCursor();
    if (onToolChange) onToolChange(toolName);
    render();
  }

  function updateCursor() {
    if (!canvas) return;
    if (activeTool === 'pan') {
      canvas.style.cursor = 'grab';
    } else if (['add_room', 'door', 'window', 'opening', 'qdc', 'light', 'switch', 'tug_baixa', 'tug_media', 'tue_alta', 'conduit'].includes(activeTool)) {
      canvas.style.cursor = 'crosshair';
    } else if (hoveredHandle) {
      const cursorMap = {
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
        nw: 'nwse-resize',
        se: 'nwse-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        op_start: 'ew-resize',
        op_end: 'ew-resize'
      };
      canvas.style.cursor = cursorMap[hoveredHandle] || 'pointer';
    } else if (hoveredPointId || hoveredOpeningId) {
      canvas.style.cursor = 'move';
    } else if (hoveredRoomId) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'default';
    }
  }

  function setLayerVisible(layerName, visible) {
    layers[layerName] = visible;
    render();
  }

  function setBackgroundFloorplan(dataUrl) {
    if (!dataUrl) {
      backgroundOverlayImg = null;
      render();
      return;
    }
    const img = new Image();
    img.onload = function () {
      backgroundOverlayImg = img;
      render();
    };
    img.src = dataUrl;
  }

  function resize() {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width;
      canvas.height = rect.height;
      render();
    }
  }

  function fitToView() {
    if (!canvas) return;
    resize();
    if (!project || !project.rooms || project.rooms.length === 0) {
      scale = 68;
      offsetX = 120;
      offsetY = 90;
      render();
      return;
    }
    const cw = canvas.width || 900;
    const ch = canvas.height || 600;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    project.rooms.forEach(r => {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    });

    const worldW = Math.max(maxX - minX, 4);
    const worldH = Math.max(maxY - minY, 4);
    const pad = 100;

    scale = Math.min((cw - pad * 2) / worldW, (ch - pad * 2) / worldH);
    scale = Math.max(32, Math.min(115, scale));

    offsetX = (cw - worldW * scale) / 2 - minX * scale;
    offsetY = (ch - worldH * scale) / 2 - minY * scale;
    render();
  }

  function zoomBy(factor) {
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const worldBefore = screenToWorld(cx, cy);
    scale = Math.max(24, Math.min(180, scale * factor));
    offsetX = cx - worldBefore.x * scale;
    offsetY = cy - worldBefore.y * scale;
    render();
  }

  function screenToWorld(sx, sy) {
    return {
      x: +((sx - offsetX) / scale).toFixed(2),
      y: +((sy - offsetY) / scale).toFixed(2)
    };
  }

  function worldToScreen(wx, wy) {
    return {
      x: offsetX + wx * scale,
      y: offsetY + wy * scale
    };
  }

  function snap(val, step = 0.1) {
    return +(Math.round(val / step) * step).toFixed(2);
  }

  // ==================== GEOMETRIA E SNAP DE PORTAS, JANELAS E VÃOS NAS PAREDES ====================
  // Encontra a parede mais próxima de (wx, wy) em qualquer cômodo do projeto
  function findNearestWallSnap(wx, wy) {
    if (!project || !project.rooms || project.rooms.length === 0) return null;
    let best = null;

    project.rooms.forEach(room => {
      const candidates = [
        // Norte (y = room.y)
        {
          wall: 'n',
          dist: Math.abs(wy - room.y) + (wx < room.x ? room.x - wx : wx > room.x + room.w ? wx - (room.x + room.w) : 0),
          offset: Math.max(0.4, Math.min(room.w - 0.4, +(wx - room.x).toFixed(2))),
          wallLen: room.w
        },
        // Sul (y = room.y + room.h)
        {
          wall: 's',
          dist: Math.abs(wy - (room.y + room.h)) + (wx < room.x ? room.x - wx : wx > room.x + room.w ? wx - (room.x + room.w) : 0),
          offset: Math.max(0.4, Math.min(room.w - 0.4, +(wx - room.x).toFixed(2))),
          wallLen: room.w
        },
        // Oeste (x = room.x)
        {
          wall: 'w',
          dist: Math.abs(wx - room.x) + (wy < room.y ? room.y - wy : wy > room.y + room.h ? wy - (room.y + room.h) : 0),
          offset: Math.max(0.4, Math.min(room.h - 0.4, +(wy - room.y).toFixed(2))),
          wallLen: room.h
        },
        // Leste (x = room.x + room.w)
        {
          wall: 'e',
          dist: Math.abs(wx - (room.x + room.w)) + (wy < room.y ? room.y - wy : wy > room.y + room.h ? wy - (room.y + room.h) : 0),
          offset: Math.max(0.4, Math.min(room.h - 0.4, +(wy - room.y).toFixed(2))),
          wallLen: room.h
        }
      ];

      candidates.forEach(c => {
        if (!best || c.dist < best.dist) {
          best = {
            roomId: room.id,
            room,
            wall: c.wall,
            offset: snap(c.offset, 0.1),
            dist: c.dist,
            wallLen: c.wallLen
          };
        }
      });
    });

    return best;
  }

  function findOpeningAtScreen(sx, sy) {
    if (!project || !Array.isArray(project.openings)) return null;
    for (let i = project.openings.length - 1; i >= 0; i--) {
      const op = project.openings[i];
      const room = project.rooms.find(r => r.id === op.roomId);
      if (!room) continue;
      const geom = window.NBR5410.getOpeningWorldGeometry(op, room);
      if (!geom) continue;

      const s1 = worldToScreen(geom.x1, geom.y1);
      const s2 = worldToScreen(geom.x2, geom.y2);
      const sc = worldToScreen(geom.cx, geom.cy);

      // Distância do ponto de clique ao segmento da abertura ou ao centro do arco da porta
      const distSeg = distToSegment({ x: sx, y: sy }, s1, s2);
      if (distSeg <= 14 || Math.hypot(sx - sc.x, sy - sc.y) <= 18) {
        return op;
      }
    }
    return null;
  }

  function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  function getOpeningResizeHandles(op) {
    if (!project) return [];
    const room = project.rooms.find(r => r.id === op.roomId);
    if (!room) return [];
    const geom = window.NBR5410.getOpeningWorldGeometry(op, room);
    if (!geom) return [];
    const s1 = worldToScreen(geom.x1, geom.y1);
    const s2 = worldToScreen(geom.x2, geom.y2);
    return [
      { id: 'op_start', x: s1.x, y: s1.y },
      { id: 'op_end', x: s2.x, y: s2.y }
    ];
  }

  function getRoomResizeHandles(room) {
    const tl = worldToScreen(room.x, room.y);
    const br = worldToScreen(room.x + room.w, room.y + room.h);
    const mx = (tl.x + br.x) / 2;
    const my = (tl.y + br.y) / 2;

    return [
      { id: 'nw', x: tl.x, y: tl.y },
      { id: 'n',  x: mx,   y: tl.y },
      { id: 'ne', x: br.x, y: tl.y },
      { id: 'e',  x: br.x, y: my },
      { id: 'se', x: br.x, y: br.y },
      { id: 's',  x: mx,   y: br.y },
      { id: 'sw', x: tl.x, y: br.y },
      { id: 'w',  x: tl.x, y: my }
    ];
  }

  function findResizeHandleAtScreen(sx, sy) {
    if (!project || !selectedItem) return null;
    if (selectedItem.kind === 'room') {
      const room = project.rooms.find(r => r.id === selectedItem.id);
      if (!room) return null;
      const handles = getRoomResizeHandles(room);
      for (const h of handles) {
        if (Math.hypot(sx - h.x, sy - h.y) <= 11) {
          return h.id;
        }
      }
    } else if (selectedItem.kind === 'opening') {
      const op = (project.openings || []).find(o => o.id === selectedItem.id);
      if (!op) return null;
      const handles = getOpeningResizeHandles(op);
      for (const h of handles) {
        if (Math.hypot(sx - h.x, sy - h.y) <= 11) {
          return h.id;
        }
      }
    }
    return null;
  }

  function getWallNormalAngle(pt) {
    if (typeof pt.rotation === 'number') return pt.rotation;
    if (!project || !project.rooms) return 0;

    const room = project.rooms.find(r => r.id === pt.roomId) || findRoomAtWorld(pt.x, pt.y) || project.rooms[0];
    if (!room) return 0;

    const dTop = Math.abs(pt.y - room.y);
    const dBottom = Math.abs(room.y + room.h - pt.y);
    const dLeft = Math.abs(pt.x - room.x);
    const dRight = Math.abs(room.x + room.w - pt.x);
    const min = Math.min(dTop, dBottom, dLeft, dRight);

    if (min === dTop) return Math.PI / 2;
    if (min === dBottom) return -Math.PI / 2;
    if (min === dLeft) return 0;
    return Math.PI;
  }

  function bindEvents() {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const keyLower = e.key.toLowerCase();

      if (isCtrlOrCmd && keyLower === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (isCtrlOrCmd && (keyLower === 'y' || (keyLower === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if (isCtrlOrCmd && keyLower === 'c') {
        e.preventDefault();
        copySelected();
        return;
      }
      if (isCtrlOrCmd && keyLower === 'v') {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (isCtrlOrCmd && keyLower === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItem) {
        e.preventDefault();
        deleteSelectedItem();
      } else if (e.key === 'Escape') {
        conduitStartPointId = null;
        newRoomPreview = null;
        isDragging = false;
        setTool('select');
      } else if ((e.key === 'r' || e.key === 'R') && !isCtrlOrCmd && selectedItem) {
        if (selectedItem.kind === 'point') {
          rotateSelectedPoint();
        } else if (selectedItem.kind === 'opening') {
          flipSelectedOpeningSwing();
        }
      }
    });
  }

  function rotateSelectedPoint() {
    if (!project || !selectedItem || selectedItem.kind !== 'point') return;
    const pt = project.points.find(p => p.id === selectedItem.id);
    if (!pt) return;
    pushHistorySnapshot();
    const currentAngle = getWallNormalAngle(pt);
    pt.rotation = +((currentAngle + Math.PI / 2) % (Math.PI * 2)).toFixed(4);
    onProjectMutate('Simbologia rotacionada em 90°');
    render();
  }

  // Alterna o sentido de abertura da porta selecionada (Interna Esquerda -> Interna Direita -> Externa Esquerda -> Externa Direita)
  function flipSelectedOpeningSwing() {
    if (!project || !selectedItem || selectedItem.kind !== 'opening') return;
    const op = (project.openings || []).find(o => o.id === selectedItem.id);
    if (!op) return;
    pushHistorySnapshot();
    const order = ['in-left', 'in-right', 'out-left', 'out-right'];
    const idx = order.indexOf(op.swing || 'in-left');
    op.swing = order[(idx + 1) % order.length];
    onSelectionChange(selectedItem);
    onProjectMutate('Sentido de abertura da porta invertido (Tecla R)');
    render();
  }

  function onDoubleClick(e) {
    if (!project) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    const hitPt = findPointAtScreen(sx, sy);
    if (hitPt) {
      selectedItem = { kind: 'point', id: hitPt.id };
      onSelectionChange(selectedItem);
      notifyStateChange();
      const labelInput = document.getElementById('inspectorPointLabel');
      if (labelInput) labelInput.focus();
      render();
      return;
    }

    const hitOp = findOpeningAtScreen(sx, sy);
    if (hitOp) {
      selectedItem = { kind: 'opening', id: hitOp.id };
      onSelectionChange(selectedItem);
      notifyStateChange();
      if (hitOp.type === 'door') {
        flipSelectedOpeningSwing();
      }
      render();
      return;
    }

    const hitRoom = findRoomAtWorld(world.x, world.y);
    if (hitRoom) {
      selectedItem = { kind: 'room', id: hitRoom.id };
      onSelectionChange(selectedItem);
      notifyStateChange();
      const nameInput = document.getElementById('inspectorRoomName');
      if (nameInput) {
        nameInput.focus();
        nameInput.select();
      }
      render();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = screenToWorld(mx, my);
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    scale = Math.max(24, Math.min(180, scale * factor));
    offsetX = mx - before.x * scale;
    offsetY = my - before.y * scale;
    updateStatusBar(before);
    render();
  }

  function onMouseDown(e) {
    if (!project) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    dragStartScreen = { x: sx, y: sy };
    dragStartWorld = world;

    // 1. Pan
    if (e.button === 1 || activeTool === 'pan') {
      isDragging = true;
      dragType = 'pan';
      dragInitialPos = { x: offsetX, y: offsetY };
      canvas.style.cursor = 'grabbing';
      return;
    }

    // 2. Desenhar Novo Ambiente
    if (activeTool === 'add_room') {
      isDragging = true;
      dragType = 'new_room';
      const startX = snap(world.x, 0.2);
      const startY = snap(world.y, 0.2);
      newRoomPreview = {
        startX,
        startY,
        x: startX,
        y: startY,
        w: 3.2,
        h: 3.0
      };
      render();
      return;
    }

    // 3. Inserir Porta, Janela ou Vão Livre na parede mais próxima
    if (['door', 'window', 'opening'].includes(activeTool)) {
      placeNewOpeningAt(world.x, world.y, activeTool);
      return;
    }

    // 4. Traçar Eletroduto
    if (activeTool === 'conduit') {
      const hitPt = findPointAtScreen(sx, sy);
      if (hitPt) {
        if (!conduitStartPointId) {
          conduitStartPointId = hitPt.id;
        } else if (conduitStartPointId !== hitPt.id) {
          pushHistorySnapshot();
          project.conduits.push({
            id: `cd-${Date.now()}`,
            fromId: conduitStartPointId,
            toId: hitPt.id,
            mounting: 'laje',
            diameterMm: 20
          });
          conduitStartPointId = null;
          onProjectMutate('Eletroduto lançado entre os pontos');
        }
        render();
      }
      return;
    }

    // 5. Lançar Ponto Elétrico
    if (['qdc', 'light', 'switch', 'tug_baixa', 'tug_media', 'tue_alta'].includes(activeTool)) {
      placeNewPointAt(world.x, world.y, activeTool);
      return;
    }

    // 6. Alça de Redimensionamento (Cômodo ou Abertura)
    const handle = findResizeHandleAtScreen(sx, sy);
    if (handle && selectedItem) {
      if (selectedItem.kind === 'room') {
        const room = project.rooms.find(r => r.id === selectedItem.id);
        if (room) {
          pendingDragSnapshot = captureStateSnapshot();
          isDragging = true;
          dragType = 'resize_room';
          activeResizeHandle = handle;
          dragInitialRoom = { x: room.x, y: room.y, w: room.w, h: room.h };
          snapshotRoomPoints(room);
          return;
        }
      } else if (selectedItem.kind === 'opening') {
        const op = (project.openings || []).find(o => o.id === selectedItem.id);
        if (op) {
          pendingDragSnapshot = captureStateSnapshot();
          isDragging = true;
          dragType = 'resize_opening';
          activeResizeHandle = handle;
          dragInitialPos = { offset: op.offset, width: op.width };
          return;
        }
      }
    }

    // 7. Ponto Elétrico
    const hitPt = findPointAtScreen(sx, sy);
    if (hitPt) {
      pendingDragSnapshot = captureStateSnapshot();
      selectedItem = { kind: 'point', id: hitPt.id };
      isDragging = true;
      dragType = 'point';
      dragInitialPos = { x: hitPt.x, y: hitPt.y };
      onSelectionChange(selectedItem);
      notifyStateChange();
      render();
      return;
    }

    // 8. Porta, Janela ou Vão Livre
    const hitOp = findOpeningAtScreen(sx, sy);
    if (hitOp) {
      pendingDragSnapshot = captureStateSnapshot();
      selectedItem = { kind: 'opening', id: hitOp.id };
      isDragging = true;
      dragType = 'opening';
      onSelectionChange(selectedItem);
      notifyStateChange();
      render();
      return;
    }

    // 9. Eletroduto
    const hitConduit = findConduitAtScreen(sx, sy);
    if (hitConduit) {
      selectedItem = { kind: 'conduit', id: hitConduit.id };
      onSelectionChange(selectedItem);
      notifyStateChange();
      render();
      return;
    }

    // 10. Cômodo / Ambiente
    const hitRoom = findRoomAtWorld(world.x, world.y);
    if (hitRoom) {
      pendingDragSnapshot = captureStateSnapshot();
      selectedItem = { kind: 'room', id: hitRoom.id };
      isDragging = true;
      dragType = 'room';
      dragInitialRoom = { x: hitRoom.x, y: hitRoom.y, w: hitRoom.w, h: hitRoom.h };
      snapshotRoomPoints(hitRoom);
      onSelectionChange(selectedItem);
      notifyStateChange();
      render();
      return;
    }

    // 11. Vazio -> Desmarcar e Pan
    selectedItem = null;
    onSelectionChange(null);
    notifyStateChange();
    isDragging = true;
    dragType = 'pan';
    dragInitialPos = { x: offsetX, y: offsetY };
    render();
  }

  function placeNewOpeningAt(wx, wy, toolType, targetRoomId = null, targetWall = null) {
    if (!project) return;
    pushHistorySnapshot();
    if (!Array.isArray(project.openings)) project.openings = [];

    let snapInfo = null;
    if (targetRoomId) {
      const rm = project.rooms.find(r => r.id === targetRoomId);
      if (rm) {
        const wSide = targetWall || 's';
        const wLen = (wSide === 'n' || wSide === 's') ? rm.w : rm.h;
        snapInfo = { roomId: rm.id, room: rm, wall: wSide, offset: +(wLen / 2).toFixed(2), wallLen: wLen };
      }
    }
    if (!snapInfo) {
      snapInfo = findNearestWallSnap(wx, wy);
    }
    if (!snapInfo) return;

    const countByType = project.openings.filter(o => o.type === toolType).length + 1;
    const defaults = {
      door: { width: 0.80, height: 2.10, sillHeight: 0.00, label: `P${countByType}` },
      window: { width: 1.40, height: 1.10, sillHeight: 1.00, label: `J${countByType}` },
      opening: { width: 1.20, height: 2.10, sillHeight: 0.00, label: `Vão ${countByType}` }
    };
    const cfg = defaults[toolType] || defaults.door;

    const newOp = {
      id: `op-${Date.now()}`,
      type: toolType,
      roomId: snapInfo.roomId,
      wall: snapInfo.wall,
      offset: snapInfo.offset,
      width: Math.min(cfg.width, Math.max(0.5, snapInfo.wallLen - 0.2)),
      height: cfg.height,
      sillHeight: cfg.sillHeight,
      swing: 'in-left',
      label: cfg.label
    };

    project.openings.push(newOp);
    selectedItem = { kind: 'opening', id: newOp.id };
    setTool('select');
    onSelectionChange(selectedItem);
    notifyStateChange();
    const typeLabel = toolType === 'door' ? 'Porta' : toolType === 'window' ? 'Janela' : 'Vão livre';
    onProjectMutate(`${typeLabel} "${newOp.label}" inserida na parede!`);
    render();
  }

  function snapshotRoomPoints(room) {
    dragInitialPointsSnapshot = project.points
      .filter(p => isPointInsideRoom(p, room))
      .map(p => ({
        id: p.id,
        relX: room.w > 0 ? (p.x - room.x) / room.w : 0.5,
        relY: room.h > 0 ? (p.y - room.y) / room.h : 0.5
      }));
  }

  function isPointInsideRoom(pt, room) {
    if (pt.roomId && pt.roomId === room.id) return true;
    return (
      pt.x >= room.x - 0.18 &&
      pt.x <= room.x + room.w + 0.18 &&
      pt.y >= room.y - 0.18 &&
      pt.y <= room.y + room.h + 0.18
    );
  }

  function onMouseMove(e) {
    if (!project || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    mouseWorldPos = world;

    updateStatusBar(world);

    if (!isDragging) {
      hoveredHandle = findResizeHandleAtScreen(sx, sy);
      const hoverPt = !hoveredHandle ? findPointAtScreen(sx, sy) : null;
      hoveredPointId = hoverPt ? hoverPt.id : null;
      const hoverOp = (!hoveredHandle && !hoverPt) ? findOpeningAtScreen(sx, sy) : null;
      hoveredOpeningId = hoverOp ? hoverOp.id : null;
      const hoverRm = (!hoveredHandle && !hoverPt && !hoverOp) ? findRoomAtWorld(world.x, world.y) : null;
      hoveredRoomId = hoverRm ? hoverRm.id : null;
      updateCursor();
      render();
      return;
    }

    if (dragType === 'pan') {
      offsetX = dragInitialPos.x + (sx - dragStartScreen.x);
      offsetY = dragInitialPos.y + (sy - dragStartScreen.y);
      render();
    } else if (dragType === 'opening' && selectedItem && selectedItem.kind === 'opening') {
      // Arrastar Porta, Janela ou Vão ao longo da parede ou para qualquer outra parede!
      const op = (project.openings || []).find(o => o.id === selectedItem.id);
      if (op) {
        const snapWall = findNearestWallSnap(world.x, world.y);
        if (snapWall) {
          op.roomId = snapWall.roomId;
          op.wall = snapWall.wall;
          const halfW = Number(op.width || 0.8) / 2;
          op.offset = Math.max(halfW + 0.05, Math.min(snapWall.wallLen - halfW - 0.05, snapWall.offset));
          render();
        }
      }
    } else if (dragType === 'resize_opening' && selectedItem && selectedItem.kind === 'opening') {
      // Redimensionar largura da Porta, Janela ou Vão pelas alças das extremidades
      const op = (project.openings || []).find(o => o.id === selectedItem.id);
      const room = op ? project.rooms.find(r => r.id === op.roomId) : null;
      if (op && room) {
        const isHoriz = op.wall === 'n' || op.wall === 's';
        const along = isHoriz ? (world.x - room.x) : (world.y - room.y);
        const wallLen = isHoriz ? room.w : room.h;
        const distFromCenter = Math.abs(along - op.offset);
        const newWidth = snap(Math.max(0.40, Math.min(wallLen - 0.2, distFromCenter * 2)), 0.05);
        op.width = newWidth;
        render();
      }
    } else if (dragType === 'point' && selectedItem && selectedItem.kind === 'point') {
      const pt = project.points.find(p => p.id === selectedItem.id);
      if (pt) {
        let nx = snap(dragInitialPos.x + (world.x - dragStartWorld.x), 0.1);
        let ny = snap(dragInitialPos.y + (world.y - dragStartWorld.y), 0.1);

        const hostRoom = findRoomAtWorld(nx, ny);
        if (hostRoom) {
          pt.roomId = hostRoom.id;
          if (pt.category !== 'light') {
            const margin = 0.14;
            if (Math.abs(nx - hostRoom.x) < 0.35) nx = +(hostRoom.x + margin).toFixed(2);
            else if (Math.abs(nx - (hostRoom.x + hostRoom.w)) < 0.35) nx = +(hostRoom.x + hostRoom.w - margin).toFixed(2);
            if (Math.abs(ny - hostRoom.y) < 0.35) ny = +(hostRoom.y + margin).toFixed(2);
            else if (Math.abs(ny - (hostRoom.y + hostRoom.h)) < 0.35) ny = +(hostRoom.y + hostRoom.h - margin).toFixed(2);
          }
        }
        pt.x = nx;
        pt.y = ny;
        render();
      }
    } else if (dragType === 'room' && selectedItem && selectedItem.kind === 'room') {
      const room = project.rooms.find(r => r.id === selectedItem.id);
      if (room && dragInitialRoom) {
        const nx = snap(dragInitialRoom.x + (world.x - dragStartWorld.x), 0.2);
        const ny = snap(dragInitialRoom.y + (world.y - dragStartWorld.y), 0.2);
        room.x = nx;
        room.y = ny;
        dragInitialPointsSnapshot.forEach(snapPt => {
          const pt = project.points.find(p => p.id === snapPt.id);
          if (pt) {
            pt.x = +(room.x + snapPt.relX * room.w).toFixed(2);
            pt.y = +(room.y + snapPt.relY * room.h).toFixed(2);
            pt.roomId = room.id;
          }
        });
        render();
      }
    } else if (dragType === 'resize_room' && selectedItem && selectedItem.kind === 'room') {
      const room = project.rooms.find(r => r.id === selectedItem.id);
      if (room && dragInitialRoom && activeResizeHandle) {
        const dx = snap(world.x - dragStartWorld.x, 0.1);
        const dy = snap(world.y - dragStartWorld.y, 0.1);
        const minSize = 1.2;

        let nx = dragInitialRoom.x;
        let ny = dragInitialRoom.y;
        let nw = dragInitialRoom.w;
        let nh = dragInitialRoom.h;

        if (activeResizeHandle.includes('e')) {
          nw = Math.max(minSize, +(dragInitialRoom.w + dx).toFixed(2));
        }
        if (activeResizeHandle.includes('s')) {
          nh = Math.max(minSize, +(dragInitialRoom.h + dy).toFixed(2));
        }
        if (activeResizeHandle.includes('w')) {
          const maxDeltaX = dragInitialRoom.w - minSize;
          const clampedDx = Math.min(dx, maxDeltaX);
          nx = +(dragInitialRoom.x + clampedDx).toFixed(2);
          nw = +(dragInitialRoom.w - clampedDx).toFixed(2);
        }
        if (activeResizeHandle.includes('n')) {
          const maxDeltaY = dragInitialRoom.h - minSize;
          const clampedDy = Math.min(dy, maxDeltaY);
          ny = +(dragInitialRoom.y + clampedDy).toFixed(2);
          nh = +(dragInitialRoom.h - clampedDy).toFixed(2);
        }

        room.x = nx;
        room.y = ny;
        room.w = nw;
        room.h = nh;

        dragInitialPointsSnapshot.forEach(snapPt => {
          const pt = project.points.find(p => p.id === snapPt.id);
          if (pt) {
            pt.x = +(room.x + snapPt.relX * room.w).toFixed(2);
            pt.y = +(room.y + snapPt.relY * room.h).toFixed(2);
            pt.roomId = room.id;
          }
        });
        render();
      }
    } else if (dragType === 'new_room' && newRoomPreview) {
      const curX = snap(world.x, 0.2);
      const curY = snap(world.y, 0.2);
      const distDrag = Math.hypot(curX - newRoomPreview.startX, curY - newRoomPreview.startY);
      if (distDrag >= 0.4) {
        const x1 = Math.min(newRoomPreview.startX, curX);
        const y1 = Math.min(newRoomPreview.startY, curY);
        const x2 = Math.max(newRoomPreview.startX, curX);
        const y2 = Math.max(newRoomPreview.startY, curY);
        newRoomPreview.x = x1;
        newRoomPreview.y = y1;
        newRoomPreview.w = Math.max(1.2, +(x2 - x1).toFixed(2));
        newRoomPreview.h = Math.max(1.2, +(y2 - y1).toFixed(2));
      }
      render();
    }
  }

  function onMouseUp() {
    if (!isDragging) return;
    if (dragType === 'new_room' && newRoomPreview && project) {
      pushHistorySnapshot();
      const newRoom = {
        id: `room-${Date.now()}`,
        name: `Ambiente ${project.rooms.length + 1}`,
        type: 'sala',
        x: newRoomPreview.x,
        y: newRoomPreview.y,
        w: newRoomPreview.w,
        h: newRoomPreview.h
      };
      project.rooms.push(newRoom);
      // Cria porta e janela padrão no novo ambiente
      if (!Array.isArray(project.openings)) project.openings = [];
      project.openings.push({
        id: `op-d-${newRoom.id}`,
        type: 'door',
        roomId: newRoom.id,
        wall: 's',
        offset: +(Math.min(0.65, newRoom.w * 0.3)).toFixed(2),
        width: 0.80,
        height: 2.10,
        sillHeight: 0.00,
        swing: 'in-left',
        label: `P${project.openings.filter(o => o.type === 'door').length + 1}`
      });
      project.openings.push({
        id: `op-w-${newRoom.id}`,
        type: 'window',
        roomId: newRoom.id,
        wall: 'n',
        offset: +(newRoom.w / 2).toFixed(2),
        width: 1.20,
        height: 1.10,
        sillHeight: 1.00,
        swing: 'in-left',
        label: `J${project.openings.filter(o => o.type === 'window').length + 1}`
      });

      populateSingleRoomNormativePoints(newRoom);
      selectedItem = { kind: 'room', id: newRoom.id };
      newRoomPreview = null;
      setTool('select');
      onSelectionChange(selectedItem);
      notifyStateChange();
      onProjectMutate(`Ambiente "${newRoom.name}" criado com porta, janela e pontos NBR 5410!`);
    } else if (['point', 'room', 'resize_room', 'opening', 'resize_opening'].includes(dragType)) {
      const afterSnap = captureStateSnapshot();
      if (pendingDragSnapshot && afterSnap !== pendingDragSnapshot) {
        undoStack.push(pendingDragSnapshot);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack = [];
      }
      pendingDragSnapshot = null;
      onSelectionChange(selectedItem);
      notifyStateChange();
      onProjectMutate();
    }
    isDragging = false;
    dragType = null;
    activeResizeHandle = null;
    updateCursor();
    render();
  }

  function populateSingleRoomNormativePoints(room) {
    if (!project) return;
    const oldPtIds = new Set(project.points.filter(p => p.roomId === room.id && p.category !== 'qdc').map(p => p.id));
    project.points = project.points.filter(p => !oldPtIds.has(p.id));
    project.conduits = project.conduits.filter(c => !oldPtIds.has(c.fromId) && !oldPtIds.has(c.toId));

    const norms = window.NBR5410.calculateRoomNormativeMinimums(room);
    const qdc = project.points.find(p => p.category === 'qdc') || project.points[0];
    const lightCircuit = project.circuits.find(c => c.type === 'iluminacao')?.id || project.circuits[0]?.id || 'C1';
    const tugCircuit = project.circuits.find(c => c.type === 'tug')?.id || project.circuits[0]?.id || 'C2';
    const cmd = `a${project.rooms.indexOf(room) + 1}`;
    const stamp = Date.now();

    const lightPt = {
      id: `pt-l-${stamp}`,
      category: 'light',
      subtype: 'luz_teto',
      label: `Luz ${room.name}`,
      command: cmd,
      x: +(room.x + room.w / 2).toFixed(2),
      y: +(room.y + room.h / 2).toFixed(2),
      z: 2.8,
      powerVA: norms.minLightingVA,
      circuitId: lightCircuit,
      roomId: room.id
    };
    project.points.push(lightPt);

    const swPt = {
      id: `pt-s-${stamp}`,
      category: 'switch',
      subtype: 'int_simples',
      label: `Int. ${room.name}`,
      command: cmd,
      x: +(room.x + 0.35).toFixed(2),
      y: +(room.y + room.h - 0.14).toFixed(2),
      z: 1.2,
      powerVA: 0,
      circuitId: lightCircuit,
      roomId: room.id
    };
    project.points.push(swPt);

    if (qdc) {
      project.conduits.push({
        id: `cd-q-${stamp}`,
        fromId: qdc.id,
        toId: lightPt.id,
        mounting: 'laje',
        diameterMm: 20
      });
    }
    project.conduits.push({
      id: `cd-s-${stamp}`,
      fromId: lightPt.id,
      toId: swPt.id,
      mounting: 'parede',
      diameterMm: 20
    });

    const margin = 0.14;
    const walls = [
      (t) => ({ x: +(room.x + room.w * t).toFixed(2), y: +(room.y + margin).toFixed(2) }),
      (t) => ({ x: +(room.x + room.w - margin).toFixed(2), y: +(room.y + room.h * t).toFixed(2) }),
      (t) => ({ x: +(room.x + margin).toFixed(2), y: +(room.y + room.h * t).toFixed(2) }),
      (t) => ({ x: +(room.x + room.w * t).toFixed(2), y: +(room.y + room.h - margin).toFixed(2) })
    ];

    for (let i = 0; i < norms.minTugCount; i++) {
      const wallFn = walls[i % walls.length];
      const slot = Math.floor(i / walls.length);
      const t = slot === 0 ? 0.5 : slot % 2 === 1 ? 0.28 : 0.72;
      const pos = wallFn(t);
      const isHigh = i < norms.highCount;
      const tugPt = {
        id: `pt-t-${stamp}-${i}`,
        category: 'tug',
        subtype: isHigh ? 'tug_media' : 'tug_baixa',
        label: isHigh ? 'TUG 600VA' : 'TUG 100VA',
        x: pos.x,
        y: pos.y,
        z: isHigh ? 1.3 : 0.3,
        powerVA: isHigh ? 600 : 100,
        circuitId: tugCircuit,
        roomId: room.id
      };
      project.points.push(tugPt);
      project.conduits.push({
        id: `cd-t-${stamp}-${i}`,
        fromId: lightPt.id,
        toId: tugPt.id,
        mounting: 'parede',
        diameterMm: 20
      });
    }
  }

  function placeNewPointAt(wx, wy, tool) {
    pushHistorySnapshot();
    const hostRoom = findRoomAtWorld(wx, wy);
    const defaultCircuit =
      tool === 'light' || tool === 'switch'
        ? (project.circuits.find(c => c.type === 'iluminacao')?.id || project.circuits[0]?.id || 'C1')
        : (project.circuits.find(c => c.type !== 'iluminacao')?.id || project.circuits[0]?.id || 'C2');

    const mapConfig = {
      qdc: { category: 'qdc', subtype: 'qdc_embutir', label: 'QDC', z: 1.5, powerVA: 0, circuitId: null },
      light: { category: 'light', subtype: 'luz_teto', label: 'Ponto de Luz', z: 2.8, powerVA: 100, command: 'a1', circuitId: defaultCircuit },
      switch: { category: 'switch', subtype: 'int_simples', label: 'Interruptor 1S', z: 1.2, powerVA: 0, command: 'a1', circuitId: defaultCircuit },
      tug_baixa: { category: 'tug', subtype: 'tug_baixa', label: 'TUG Baixa 100VA', z: 0.3, powerVA: 100, circuitId: defaultCircuit },
      tug_media: { category: 'tug', subtype: 'tug_media', label: 'TUG Média 600VA', z: 1.3, powerVA: 600, circuitId: defaultCircuit },
      tue_alta: { category: 'tue', subtype: 'tue_alta', label: 'TUE Específica', z: 2.2, powerVA: 5500, circuitId: defaultCircuit }
    };

    const cfg = mapConfig[tool];
    if (!cfg) return;

    const newPt = {
      id: `pt-${Date.now()}`,
      ...cfg,
      x: snap(wx, 0.1),
      y: snap(wy, 0.1),
      roomId: hostRoom ? hostRoom.id : null
    };

    project.points.push(newPt);
    selectedItem = { kind: 'point', id: newPt.id };
    onSelectionChange(selectedItem);
    notifyStateChange();
    onProjectMutate(`${cfg.label} adicionado à planta`);
    render();
  }

  function deleteSelectedItem() {
    if (!project || !selectedItem) return;
    pushHistorySnapshot();
    if (selectedItem.kind === 'point') {
      project.points = project.points.filter(p => p.id !== selectedItem.id);
      project.conduits = project.conduits.filter(
        c => c.fromId !== selectedItem.id && c.toId !== selectedItem.id
      );
    } else if (selectedItem.kind === 'conduit') {
      project.conduits = project.conduits.filter(c => c.id !== selectedItem.id);
    } else if (selectedItem.kind === 'opening') {
      project.openings = (project.openings || []).filter(o => o.id !== selectedItem.id);
    } else if (selectedItem.kind === 'room') {
      const rmId = selectedItem.id;
      const roomPtIds = new Set(project.points.filter(p => p.roomId === rmId && p.category !== 'qdc').map(p => p.id));
      project.points = project.points.filter(p => !roomPtIds.has(p.id));
      project.conduits = project.conduits.filter(c => !roomPtIds.has(c.fromId) && !roomPtIds.has(c.toId));
      project.openings = (project.openings || []).filter(o => o.roomId !== rmId);
      project.rooms = project.rooms.filter(r => r.id !== rmId);
    }
    selectedItem = null;
    onSelectionChange(null);
    notifyStateChange();
    onProjectMutate('Item removido da planta (Delete)');
    render();
  }

  function findPointAtScreen(sx, sy) {
    if (!project) return null;
    for (let i = project.points.length - 1; i >= 0; i--) {
      const p = project.points[i];
      const sp = worldToScreen(p.x, p.y);
      if (Math.hypot(sx - sp.x, sy - sp.y) <= 15) {
        return p;
      }
    }
    return null;
  }

  function findConduitAtScreen(sx, sy) {
    if (!project) return null;
    for (const cd of project.conduits) {
      const p1 = project.points.find(p => p.id === cd.fromId);
      const p2 = project.points.find(p => p.id === cd.toId);
      if (!p1 || !p2) continue;
      const s1 = worldToScreen(p1.x, p1.y);
      const s2 = worldToScreen(p2.x, p2.y);
      const dx = s2.x - s1.x;
      const dy = s2.y - s1.y;
      const cx = (s1.x + s2.x) / 2 - dy * 0.13;
      const cy = (s1.y + s2.y) / 2 + dx * 0.13;
      const mx = 0.25 * s1.x + 0.5 * cx + 0.25 * s2.x;
      const my = 0.25 * s1.y + 0.5 * cy + 0.25 * s2.y;
      if (Math.hypot(sx - mx, sy - my) <= 13) return cd;
    }
    return null;
  }

  function findRoomAtWorld(wx, wy) {
    if (!project) return null;
    for (let i = project.rooms.length - 1; i >= 0; i--) {
      const r = project.rooms[i];
      if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) {
        return r;
      }
    }
    return null;
  }

  function updateStatusBar(world) {
    const coordEl = document.getElementById('statusCoords');
    const zoomEl = document.getElementById('statusZoom');
    if (coordEl) coordEl.textContent = `X: ${world.x.toFixed(2)}m | Y: ${world.y.toFixed(2)}m`;
    if (zoomEl) zoomEl.textContent = `Escala: ${Math.round((scale / 68) * 100)}%`;
  }

  // ==================== RENDERIZAÇÃO PRINCIPAL DO CANVAS 2D ====================
  function render() {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    drawGrid(w, h);

    if (!project) return;

    if (backgroundOverlayImg) {
      const topLeft = worldToScreen(0, 0);
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.drawImage(backgroundOverlayImg, topLeft.x, topLeft.y, 12 * scale, 9 * scale);
      ctx.restore();
    }

    // 1. Cômodos e Paredes
    if (layers.architecture) {
      project.rooms.forEach(room => drawRoom(room));
      if (newRoomPreview) {
        drawRoom({
          ...newRoomPreview,
          name: `Novo Ambiente (${newRoomPreview.w.toFixed(1)}m × ${newRoomPreview.h.toFixed(1)}m)`,
          type: 'sala',
          isPreview: true
        });
      }

      // 2. Portas, Janelas e Vãos Livres (NBR 6492)
      (project.openings || []).forEach(op => drawArchitecturalOpening2D(op, false));

      // Pré-visualização (ghost) ao posicionar nova Porta, Janela ou Vão
      if (['door', 'window', 'opening'].includes(activeTool)) {
        const snapWall = findNearestWallSnap(mouseWorldPos.x, mouseWorldPos.y);
        if (snapWall) {
          drawArchitecturalOpening2D({
            id: 'preview-op',
            type: activeTool,
            roomId: snapWall.roomId,
            wall: snapWall.wall,
            offset: snapWall.offset,
            width: activeTool === 'door' ? 0.80 : activeTool === 'window' ? 1.40 : 1.20,
            height: activeTool === 'window' ? 1.10 : 2.10,
            sillHeight: activeTool === 'window' ? 1.00 : 0.00,
            swing: 'in-left',
            label: activeTool === 'door' ? 'Nova Porta' : activeTool === 'window' ? 'Nova Janela' : 'Novo Vão'
          }, true);
        }
      }
    }

    // 3. Eletrodutos e Condutores
    if (layers.conduits) {
      project.conduits.forEach(cd => drawConduitNBR(cd));
      if (activeTool === 'conduit' && conduitStartPointId) {
        const startPt = project.points.find(p => p.id === conduitStartPointId);
        if (startPt) {
          const s1 = worldToScreen(startPt.x, startPt.y);
          const s2 = worldToScreen(mouseWorldPos.x, mouseWorldPos.y);
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 4. Pontos Elétricos (NBR 5410 / 5444)
    project.points.forEach(pt => {
      if (pt.category === 'light' || pt.category === 'switch') {
        if (!layers.lighting) return;
      }
      if (pt.category === 'tug' || pt.category === 'tue') {
        if (!layers.outlets) return;
      }
      drawNBR5410Symbol(pt);
    });

    // 5. Alças de Redimensionamento do Cômodo ou Abertura Selecionada
    if (selectedItem && selectedItem.kind === 'room') {
      const selRoom = project.rooms.find(r => r.id === selectedItem.id);
      if (selRoom) {
        drawRoomSelectionHandles(selRoom);
      }
    } else if (selectedItem && selectedItem.kind === 'opening') {
      const selOp = (project.openings || []).find(o => o.id === selectedItem.id);
      if (selOp) {
        drawOpeningSelectionHandles(selOp);
      }
    }
  }

  function drawGrid(w, h) {
    ctx.save();
    const stepMinor = scale * 0.5;
    const stepMajor = scale * 1.0;

    if (stepMinor >= 14) {
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = offsetX % stepMinor; x < w; x += stepMinor) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = offsetY % stepMinor; y < h; y += stepMinor) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(71, 85, 105, 0.36)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offsetX % stepMajor; x < w; x += stepMajor) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = offsetY % stepMajor; y < h; y += stepMajor) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawRoom(room) {
    const pos = worldToScreen(room.x, room.y);
    const rw = room.w * scale;
    const rh = room.h * scale;
    const isSelected = selectedItem && selectedItem.kind === 'room' && selectedItem.id === room.id;
    const isHovered = hoveredRoomId === room.id && !isSelected;
    const typeInfo = window.NBR5410.ROOM_TYPES[room.type] || window.NBR5410.ROOM_TYPES.sala;

    ctx.save();
    ctx.fillStyle = room.isPreview
      ? 'rgba(245, 158, 11, 0.22)'
      : isSelected
        ? 'rgba(245, 158, 11, 0.14)'
        : isHovered
          ? 'rgba(56, 189, 248, 0.12)'
          : (typeInfo.color + '44');
    ctx.fillRect(pos.x, pos.y, rw, rh);

    const wallThick = Math.max(5, Math.min(9, 0.13 * scale));
    ctx.strokeStyle = room.isPreview || isSelected ? '#f59e0b' : isHovered ? '#38bdf8' : '#cbd5e1';
    ctx.lineWidth = wallThick;
    ctx.strokeRect(pos.x, pos.y, rw, rh);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(1.5, wallThick - 3.2);
    ctx.strokeRect(pos.x, pos.y, rw, rh);

    const area = (room.w * room.h).toFixed(2);
    const perim = (2 * (room.w + room.h)).toFixed(2);

    ctx.fillStyle = isSelected ? '#fde68a' : 'rgba(241, 245, 249, 0.90)';
    ctx.font = '700 11.5px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(room.name.toUpperCase(), pos.x + 12, pos.y + 22);

    ctx.fillStyle = isSelected ? '#fbbf24' : 'rgba(148, 163, 184, 0.85)';
    ctx.font = '600 10px JetBrains Mono, monospace';
    ctx.fillText(`A=${area}m²  P=${perim}m`, pos.x + 12, pos.y + 36);

    if (layers.dimensions) {
      ctx.fillStyle = isSelected ? '#f59e0b' : '#64748b';
      ctx.font = '700 10.5px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${room.w.toFixed(2)} m`, pos.x + rw / 2, pos.y + 13);
      ctx.save();
      ctx.translate(pos.x + 13, pos.y + rh / 2 + 12);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${room.h.toFixed(2)} m`, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  // ==================== DESENHO 2D DE PORTAS, JANELAS E VÃOS (ABNT NBR 6492) ====================
  function drawArchitecturalOpening2D(op, isGhost) {
    const room = project.rooms.find(r => r.id === op.roomId);
    if (!room) return;
    const geom = window.NBR5410.getOpeningWorldGeometry(op, room);
    if (!geom) return;

    const sc = worldToScreen(geom.cx, geom.cy);
    const lenPx = geom.width * scale;
    const halfPx = lenPx / 2;
    const wallThick = Math.max(6, Math.min(11, 0.15 * scale));

    const isSelected = selectedItem && selectedItem.kind === 'opening' && selectedItem.id === op.id;
    const isHovered = hoveredOpeningId === op.id && !isSelected;

    // Ângulo do eixo tangente da parede
    const wallAngle = Math.atan2(geom.ty, geom.tx);
    // Verifica para qual lado aponta a normal interna no sistema local rotacionado
    // No sistema local rotacionado por wallAngle: +X é ao longo da parede; +Y é (-ty, tx).
    // Produto escalar entre (nx, ny) e (-ty, tx):
    const normalSign = (geom.nx * (-geom.ty) + geom.ny * geom.tx) >= 0 ? 1 : -1;

    ctx.save();
    if (isGhost) ctx.globalAlpha = 0.68;
    ctx.translate(sc.x, sc.y);
    ctx.rotate(wallAngle);

    // 1. Limpa/Recorta o trecho da parede onde está a abertura
    ctx.fillStyle = '#070b14';
    ctx.fillRect(-halfPx - 1, -wallThick / 2 - 1.5, lenPx + 2, wallThick + 3);

    // Traços de boneca/arremate da alvenaria nas duas extremidades
    ctx.strokeStyle = isSelected ? '#f59e0b' : isHovered ? '#38bdf8' : '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-halfPx, -wallThick / 2);
    ctx.lineTo(-halfPx, wallThick / 2);
    ctx.moveTo(halfPx, -wallThick / 2);
    ctx.lineTo(halfPx, wallThick / 2);
    ctx.stroke();

    if (op.type === 'door') {
      // SÍMBOLO NBR 6492: PORTA DE GIRO (Batentes + Folha a 90° + Arco de Giro)
      const swing = op.swing || 'in-left';
      const dirY = swing.startsWith('in') ? normalSign : -normalSign;
      const hingeAtLeft = swing.endsWith('left');
      const hx = hingeAtLeft ? -halfPx : halfPx;

      // Folha dupla retangular da porta (espessura 4cm)
      const leafColor = isSelected ? '#f59e0b' : isHovered ? '#38bdf8' : '#fbbf24';
      ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
      ctx.strokeStyle = leafColor;
      ctx.lineWidth = 2;

      const leafThick = 4;
      const leafX = hingeAtLeft ? hx : hx - leafThick;
      const leafY = dirY > 0 ? 0 : -lenPx;
      ctx.fillRect(leafX, leafY, leafThick, lenPx);
      ctx.strokeRect(leafX, leafY, leafThick, lenPx);

      // Arco de abertura de 90° tracejado
      ctx.beginPath();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = isSelected ? '#fde047' : 'rgba(251, 191, 36, 0.75)';
      ctx.lineWidth = 1.4;
      if (hingeAtLeft && dirY > 0) {
        ctx.arc(hx, 0, lenPx, 0, Math.PI / 2, false);
      } else if (hingeAtLeft && dirY < 0) {
        ctx.arc(hx, 0, lenPx, -Math.PI / 2, 0, false);
      } else if (!hingeAtLeft && dirY > 0) {
        ctx.arc(hx, 0, lenPx, Math.PI / 2, Math.PI, false);
      } else {
        ctx.arc(hx, 0, lenPx, Math.PI, Math.PI * 1.5, false);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (op.type === 'window') {
      // SÍMBOLO NBR 6492: JANELA / ESQUADRIA (4 linhas paralelas: peitoril externo/interno + 2 linhas de caixilho/vidro)
      const winColor = isSelected ? '#f59e0b' : isHovered ? '#7dd3fc' : '#38bdf8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.fillRect(-halfPx, -wallThick / 2, lenPx, wallThick);

      // Linhas externas do peitoril
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-halfPx, -wallThick / 2);
      ctx.lineTo(halfPx, -wallThick / 2);
      ctx.moveTo(-halfPx, wallThick / 2);
      ctx.lineTo(halfPx, wallThick / 2);
      ctx.stroke();

      // Duas linhas internas representando os planos de vidro (esquadria de correr)
      ctx.strokeStyle = winColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-halfPx, -1.8);
      ctx.lineTo(halfPx, -1.8);
      ctx.moveTo(-halfPx, 1.8);
      ctx.lineTo(halfPx, 1.8);
      // Montante central divisório
      ctx.moveTo(0, -wallThick / 2);
      ctx.lineTo(0, wallThick / 2);
      ctx.stroke();
    } else if (op.type === 'opening') {
      // SÍMBOLO NBR 6492: VÃO LIVRE / PASSAGEM SEM PORTA (Projeção tracejada da verga superior)
      const openColor = isSelected ? '#f59e0b' : isHovered ? '#c084fc' : '#a855f7';
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = openColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-halfPx, -wallThick / 2);
      ctx.lineTo(halfPx, -wallThick / 2);
      ctx.moveTo(-halfPx, wallThick / 2);
      ctx.lineTo(halfPx, wallThick / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // Etiqueta técnica da esquadria/abertura (ex: P1 0.80×2.10 | J1 1.40×1.10)
    if (layers.labels) {
      ctx.save();
      const tx = sc.x - geom.nx * 14;
      const ty = sc.y - geom.ny * 14;
      ctx.fillStyle = isSelected ? '#fde047' : op.type === 'window' ? '#7dd3fc' : op.type === 'opening' ? '#d8b4fe' : '#fde68a';
      ctx.font = '700 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const dimTxt = `${op.label || ''} (${geom.width.toFixed(2)}×${Number(op.height || 2.1).toFixed(2)})`.trim();
      ctx.fillText(dimTxt, tx, ty);
      ctx.restore();
    }
  }

  function drawOpeningSelectionHandles(op) {
    const handles = getOpeningResizeHandles(op);
    if (handles.length === 0) return;

    ctx.save();
    handles.forEach(h => {
      const isHover = hoveredHandle === h.id || activeResizeHandle === h.id;
      const sz = isHover ? 11 : 9;
      ctx.fillStyle = isHover ? '#38bdf8' : '#f59e0b';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.fillRect(h.x - sz / 2, h.y - sz / 2, sz, sz);
      ctx.strokeRect(h.x - sz / 2, h.y - sz / 2, sz, sz);
    });
    ctx.restore();
  }

  function drawRoomSelectionHandles(room) {
    const handles = getRoomResizeHandles(room);
    ctx.save();

    const pos = worldToScreen(room.x, room.y);
    const rw = room.w * scale;
    const rh = room.h * scale;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(pos.x - 2, pos.y - 2, rw + 4, rh + 4);
    ctx.setLineDash([]);

    handles.forEach(h => {
      const isHover = hoveredHandle === h.id || activeResizeHandle === h.id;
      const sz = isHover ? 11 : 9;
      ctx.fillStyle = isHover ? '#38bdf8' : '#f59e0b';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.fillRect(h.x - sz / 2, h.y - sz / 2, sz, sz);
      ctx.strokeRect(h.x - sz / 2, h.y - sz / 2, sz, sz);
    });

    const badgeText = `${room.name}: ${room.w.toFixed(2)}m × ${room.h.toFixed(2)}m (${(room.w * room.h).toFixed(2)} m²) — Arraste alças ou use Ctrl+C / Ctrl+V`;
    ctx.font = '700 10.5px Inter, sans-serif';
    const tw = ctx.measureText(badgeText).width + 18;
    const bx = pos.x + rw / 2 - tw / 2;
    const by = pos.y - 28;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, 20, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, pos.x + rw / 2, by + 10);

    ctx.restore();
  }

  function drawConduitNBR(cd) {
    const p1 = project.points.find(p => p.id === cd.fromId);
    const p2 = project.points.find(p => p.id === cd.toId);
    if (!p1 || !p2) return;

    const s1 = worldToScreen(p1.x, p1.y);
    const s2 = worldToScreen(p2.x, p2.y);
    const isSelected = selectedItem && selectedItem.kind === 'conduit' && selectedItem.id === cd.id;

    const dx = s2.x - s1.x;
    const dy = s2.y - s1.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return;

    const cx = (s1.x + s2.x) / 2 - dy * 0.13;
    const cy = (s1.y + s2.y) / 2 + dx * 0.13;

    ctx.save();
    ctx.beginPath();
    if (cd.mounting === 'parede') {
      ctx.setLineDash([7, 4]);
      ctx.strokeStyle = isSelected ? '#fde047' : '#38bdf8';
    } else if (cd.mounting === 'piso') {
      ctx.setLineDash([9, 3, 2, 3]);
      ctx.strokeStyle = isSelected ? '#fde047' : '#a855f7';
    } else {
      ctx.setLineDash([]);
      ctx.strokeStyle = isSelected ? '#fde047' : '#f59e0b';
    }
    ctx.lineWidth = isSelected ? 2.8 : 1.7;
    ctx.moveTo(s1.x, s1.y);
    ctx.quadraticCurveTo(cx, cy, s2.x, s2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (layers.labels && dist > 44) {
      const mx = 0.25 * s1.x + 0.5 * cx + 0.25 * s2.x;
      const my = 0.25 * s1.y + 0.5 * cy + 0.25 * s2.y;
      let angle = Math.atan2(dy, dx);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        angle += Math.PI;
      }

      const targetPt = p2.category === 'qdc' ? p1 : p2;
      const isSwitchBranch = p1.category === 'switch' || p2.category === 'switch';
      const circuitObj = project.circuits.find(c => c.id === targetPt.circuitId);
      const isBiphasic = circuitObj && circuitObj.phase && circuitObj.phase.includes('+');

      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle);

      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.45;

      if (isSwitchBranch) {
        drawConductorTick(ctx, -3.5, 'fase');
        drawConductorTick(ctx, 3.5, 'retorno');
      } else if (isBiphasic) {
        drawConductorTick(ctx, -5, 'fase');
        drawConductorTick(ctx, 0, 'fase');
        drawConductorTick(ctx, 5, 'terra');
      } else {
        drawConductorTick(ctx, -5, 'neutro');
        drawConductorTick(ctx, 0, 'fase');
        drawConductorTick(ctx, 5, 'terra');
      }

      if (targetPt.circuitId) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 8.5px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(targetPt.circuitId, 0, 14);
      }

      ctx.restore();
    }
    ctx.restore();
  }

  function drawConductorTick(ctx, xOffset, kind) {
    const h = 7.5;
    ctx.beginPath();
    if (kind === 'fase') {
      ctx.moveTo(xOffset, -h);
      ctx.lineTo(xOffset, h);
    } else if (kind === 'neutro') {
      ctx.moveTo(xOffset, h);
      ctx.lineTo(xOffset, -h);
      ctx.lineTo(xOffset - 3.8, -h);
    } else if (kind === 'terra') {
      ctx.moveTo(xOffset, h);
      ctx.lineTo(xOffset, -h);
      ctx.moveTo(xOffset - 3.2, -h);
      ctx.lineTo(xOffset + 3.2, -h);
    } else if (kind === 'retorno') {
      ctx.moveTo(xOffset, 0);
      ctx.lineTo(xOffset, -h - 1);
    }
    ctx.stroke();
  }

  function drawNBR5410Symbol(pt) {
    const s = worldToScreen(pt.x, pt.y);
    const isSelected =
      (selectedItem && selectedItem.kind === 'point' && selectedItem.id === pt.id) ||
      conduitStartPointId === pt.id;
    const isHovered = hoveredPointId === pt.id;

    ctx.save();
    ctx.translate(s.x, s.y);

    if (isSelected || isHovered) {
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.25)' : 'rgba(56, 189, 248, 0.16)';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#f59e0b' : '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    if (pt.category === 'qdc') {
      const angle = getWallNormalAngle(pt);
      ctx.save();
      ctx.rotate(angle - Math.PI / 2);
      const qw = 28;
      const qh = 16;
      ctx.fillStyle = '#0b1120';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.fillRect(-qw / 2, -qh / 2, qw, qh);
      ctx.strokeRect(-qw / 2, -qh / 2, qw, qh);

      ctx.beginPath();
      ctx.moveTo(-qw / 2, qh / 2);
      ctx.lineTo(qw / 2, -qh / 2);
      ctx.lineTo(qw / 2, qh / 2);
      ctx.closePath();
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.restore();

      if (layers.labels) {
        ctx.fillStyle = '#fde68a';
        ctx.font = '700 10.5px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(pt.label || 'QDC', 0, -15);
      }
    } else if (pt.category === 'light') {
      const r = 16;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1120';
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, r);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.fillStyle = '#fef3c7';
      ctx.font = '700 8.5px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pt.powerVA || 100}`, 0, -r * 0.45);

      ctx.font = '700 7.5px JetBrains Mono, monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText((pt.circuitId || 'C1').replace('C', ''), -r * 0.42, r * 0.44);

      ctx.fillStyle = '#34d399';
      ctx.fillText(pt.command || 'a', r * 0.42, r * 0.44);
    } else if (pt.category === 'switch') {
      const angle = getWallNormalAngle(pt);
      const r = 7.5;

      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-r, 0);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1120';
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (layers.labels) {
        ctx.fillStyle = '#6ee7b7';
        ctx.font = '700 9.5px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pt.command || 'a', 0, 0.5);
      }
    } else if (pt.category === 'tug' || pt.category === 'tue') {
      const angle = getWallNormalAngle(pt);
      const isHigh = pt.category === 'tue' || Number(pt.z) >= 1.9;
      const isMid = !isHigh && (Number(pt.z) >= 1.1 || Number(pt.powerVA) >= 600);
      const mainColor = isHigh ? '#f43f5e' : '#38bdf8';

      ctx.save();
      ctx.rotate(angle);

      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-11, -6);
      ctx.lineTo(-11, 6);
      ctx.moveTo(-11, 0);
      ctx.lineTo(-6, 0);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -8.5);
      ctx.lineTo(-6, 8.5);
      ctx.closePath();
      ctx.fillStyle = '#0b1120';
      ctx.fill();

      if (isHigh) {
        ctx.fillStyle = mainColor;
        ctx.fill();
      } else if (isMid) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-6, -8.5);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fillStyle = mainColor;
        ctx.fill();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -8.5);
      ctx.lineTo(-6, 8.5);
      ctx.closePath();
      ctx.strokeStyle = isHigh ? '#fda4af' : mainColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      if (layers.labels) {
        const vx = Math.cos(angle) * 21;
        const vy = Math.sin(angle) * 21;
        ctx.fillStyle = isHigh ? '#fda4af' : '#bae6fd';
        ctx.font = '700 9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const pTxt = Number(pt.powerVA) > 100 ? `${pt.powerVA}VA ` : '';
        ctx.fillText(`${pTxt}${pt.circuitId || ''}`.trim(), vx, vy);
      }
    }

    ctx.restore();
  }

  function renderProjectPreviewToCanvas(targetCanvas, proj) {
    if (!targetCanvas || !proj || !proj.rooms) return;
    const c = targetCanvas.getContext('2d');
    const w = targetCanvas.width = 360;
    const h = targetCanvas.height = 165;

    c.fillStyle = '#070b14';
    c.fillRect(0, 0, w, h);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    proj.rooms.forEach(r => {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    });
    const rw = Math.max(maxX - minX, 4);
    const rh = Math.max(maxY - minY, 4);
    const sc = Math.min((w - 48) / rw, (h - 36) / rh);
    const ox = (w - rw * sc) / 2 - minX * sc;
    const oy = (h - rh * sc) / 2 - minY * sc;

    proj.rooms.forEach(r => {
      c.fillStyle = 'rgba(30, 58, 95, 0.35)';
      c.strokeStyle = '#64748b';
      c.lineWidth = 1.8;
      c.fillRect(ox + r.x * sc, oy + r.y * sc, r.w * sc, r.h * sc);
      c.strokeRect(ox + r.x * sc, oy + r.y * sc, r.w * sc, r.h * sc);
    });

    proj.conduits.forEach(cd => {
      const p1 = proj.points.find(p => p.id === cd.fromId);
      const p2 = proj.points.find(p => p.id === cd.toId);
      if (!p1 || !p2) return;
      c.strokeStyle = cd.mounting === 'parede' ? 'rgba(56, 189, 248, 0.65)' : 'rgba(245, 158, 11, 0.75)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(ox + p1.x * sc, oy + p1.y * sc);
      c.lineTo(ox + p2.x * sc, oy + p2.y * sc);
      c.stroke();
    });

    proj.points.forEach(pt => {
      const px = ox + pt.x * sc;
      const py = oy + pt.y * sc;
      c.save();
      c.translate(px, py);
      if (pt.category === 'light') {
        c.beginPath();
        c.arc(0, 0, 4.5, 0, Math.PI * 2);
        c.strokeStyle = '#fbbf24';
        c.lineWidth = 1.3;
        c.stroke();
      } else if (pt.category === 'tug' || pt.category === 'tue') {
        c.beginPath();
        c.moveTo(0, -4);
        c.lineTo(3.8, 3);
        c.lineTo(-3.8, 3);
        c.closePath();
        c.fillStyle = pt.category === 'tue' ? '#f43f5e' : '#38bdf8';
        c.fill();
      } else {
        c.fillStyle = pt.category === 'qdc' ? '#f59e0b' : '#34d399';
        c.fillRect(-3.5, -3.5, 7, 7);
      }
      c.restore();
    });
  }

  return {
    init,
    setProject,
    selectById,
    setTool,
    setLayerVisible,
    setBackgroundFloorplan,
    fitToView,
    zoomBy,
    pushHistorySnapshot,
    undo,
    redo,
    copySelected,
    pasteClipboard,
    duplicateSelected,
    deleteSelectedItem,
    rotateSelectedPoint,
    flipSelectedOpeningSwing,
    placeNewOpeningAt,
    populateSingleRoomNormativePoints,
    render,
    renderProjectPreviewToCanvas,
    getSelectedItem: () => selectedItem
  };
})();
