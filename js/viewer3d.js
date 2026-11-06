// ============================================================================
// VISUALIZADOR 3D BIM / REVIT MEP + VISUALIZADOR 3D DO QUADRO ELÉTRICO (QDC 3D)
// ============================================================================

window.Viewer3D = (function () {
  let canvas = null;
  let ctx = null;
  let project = null;

  // Câmera orbital 3D da Planta (BIM)
  let yaw = 0.68;
  let pitch = 0.56;
  let zoom = 52;
  let panX = 0;
  let panY = 24;
  let wallHeight = 2.80;
  let wallOpacity = 0.26;
  let showLightCones = true;
  let visualStyle = 'realistic'; // 'realistic' | 'shaded' | 'wireframe'

  // Filtros de Camadas 3D (Item 3) e Filtro por Cômodo (Item 4)
  let activeQuickFilter = 'all'; // 'all' | 'only_tug' | 'only_tue' | 'only_light'
  let roomFilterId = 'all';      // 'all' ou id do cômodo
  const layers3d = {
    tug: true,
    tue: true,
    light: true,
    switch: true,
    conduits: true,
    openings: true,
    telecom: true,
    stairs: true
  };

  let isDragging = false;
  let dragMode = 'orbit';
  let lastMouse = { x: 0, y: 0 };
  let hoveredPoint = null;

  // ==================== ESTADO DO VISUALIZADOR 3D DO QUADRO ELÉTRICO (ITEM 5) ====================
  let boardCanvas = null;
  let boardCtx = null;
  let boardYaw = 0.28;
  let boardPitch = 0.22;
  let boardZoom = 1.05;
  let boardPanX = 0;
  let boardPanY = 10;
  let boardDragging = false;
  let boardDragMode = 'orbit';
  let boardLastMouse = { x: 0, y: 0 };
  let showBoardWiring = true;
  let showBoardCover = false;
  let selectedBoardId = 'QDC-01';

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (handleViewCubeClick(mx, my)) return;

      isDragging = true;
      dragMode = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
      lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (!isDragging) {
        if (e.target === canvas) checkHoverPoint(mx, my);
        return;
      }

      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      lastMouse = { x: e.clientX, y: e.clientY };

      if (dragMode === 'orbit') {
        yaw += dx * 0.008;
        pitch = Math.max(0.15, Math.min(1.45, pitch + dy * 0.007));
      } else {
        panX += dx;
        panY += dy;
      }
      render();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      boardDragging = false;
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom = Math.max(22, Math.min(150, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
      render();
    }, { passive: false });

    window.addEventListener('resize', () => {
      resize();
      resizeBoard3D();
    });
  }

  function initBoard3D(boardCanvasEl) {
    boardCanvas = boardCanvasEl;
    if (!boardCanvas) return;
    boardCtx = boardCanvas.getContext('2d');

    boardCanvas.addEventListener('mousedown', (e) => {
      boardDragging = true;
      boardDragMode = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
      boardLastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!boardDragging || !boardCanvas) return;
      const dx = e.clientX - boardLastMouse.x;
      const dy = e.clientY - boardLastMouse.y;
      boardLastMouse = { x: e.clientX, y: e.clientY };

      if (boardDragMode === 'orbit') {
        boardYaw = Math.max(-0.85, Math.min(0.85, boardYaw + dx * 0.007));
        boardPitch = Math.max(-0.55, Math.min(0.75, boardPitch + dy * 0.007));
      } else {
        boardPanX += dx;
        boardPanY += dy;
      }
      renderBoard3D();
    });

    boardCanvas.addEventListener('contextmenu', e => e.preventDefault());

    boardCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      boardZoom = Math.max(0.55, Math.min(2.2, boardZoom * (e.deltaY < 0 ? 1.1 : 0.9)));
      renderBoard3D();
    }, { passive: false });

    resizeBoard3D();
  }

  function resizeBoard3D() {
    if (!boardCanvas || !boardCanvas.parentElement) return;
    const rect = boardCanvas.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      boardCanvas.width = rect.width;
      boardCanvas.height = rect.height;
      renderBoard3D();
    }
  }

  function resetBoardCamera() {
    boardYaw = 0.28;
    boardPitch = 0.22;
    boardZoom = 1.05;
    boardPanX = 0;
    boardPanY = 10;
    renderBoard3D();
  }

  function toggleBoardWiring() {
    showBoardWiring = !showBoardWiring;
    renderBoard3D();
    return showBoardWiring;
  }

  function toggleBoardCover() {
    showBoardCover = !showBoardCover;
    renderBoard3D();
    return showBoardCover;
  }

  function setProject(proj) {
    project = proj;
    roomFilterId = 'all';
    if (project && !project.isBlankProject && project.rooms && project.rooms.length > 0 && window.NBR5410 && window.NBR5410.ensureProjectOpenings) {
      window.NBR5410.ensureProjectOpenings(project);
    }
    resize();
    render();
    resizeBoard3D();
    renderBoard3D();
  }

  function setWallOpacity(val) {
    wallOpacity = Number(val);
    render();
  }

  function setVisualStyle(style) {
    visualStyle = style;
    render();
  }

  // Controle de Layers 3D (Item 3)
  function setLayer3D(layerName, visible) {
    layers3d[layerName] = Boolean(visible);
    activeQuickFilter = 'custom';
    render();
  }

  // Filtro Rápido: Só TUG, Só TUE, Só Luminárias ou Tudo (Item 3)
  function setQuickFilter3D(mode) {
    activeQuickFilter = mode || 'all';
    if (mode === 'only_tug') {
      layers3d.tug = true;
      layers3d.tue = false;
      layers3d.light = false;
      layers3d.switch = false;
      layers3d.conduits = false;
      layers3d.telecom = false;
    } else if (mode === 'only_tue') {
      layers3d.tug = false;
      layers3d.tue = true;
      layers3d.light = false;
      layers3d.switch = false;
      layers3d.conduits = false;
      layers3d.telecom = false;
    } else if (mode === 'only_light') {
      layers3d.tug = false;
      layers3d.tue = false;
      layers3d.light = true;
      layers3d.switch = false;
      layers3d.conduits = false;
      layers3d.telecom = false;
    } else {
      layers3d.tug = true;
      layers3d.tue = true;
      layers3d.light = true;
      layers3d.switch = true;
      layers3d.conduits = true;
      layers3d.openings = true;
      layers3d.telecom = true;
      layers3d.stairs = true;
    }
    render();
    return { ...layers3d, activeQuickFilter };
  }

  // Filtro de Visualização 3D por Cômodo (Item 4)
  function setRoomFilter(roomId) {
    roomFilterId = roomId || 'all';
    panX = 0;
    panY = 20;
    if (roomFilterId !== 'all') {
      zoom = 72;
    } else {
      zoom = 52;
    }
    render();
  }

  function toggleLightCones() {
    showLightCones = !showLightCones;
    render();
    return showLightCones;
  }

  function resetCamera() {
    yaw = 0.68;
    pitch = 0.56;
    zoom = roomFilterId === 'all' ? 52 : 72;
    panX = 0;
    panY = 24;
    render();
  }

  function handleViewCubeClick(mx, my) {
    if (!canvas) return false;
    const cx = canvas.width - 74;
    const cy = 78;
    if (Math.hypot(mx - cx, my - cy) <= 46) {
      if (my < cy - 14) {
        yaw = 0;
        pitch = 1.42;
      } else if (mx < cx - 12) {
        yaw = 0;
        pitch = 0.25;
      } else if (mx > cx + 12) {
        yaw = Math.PI / 2;
        pitch = 0.25;
      } else {
        yaw = 0.68;
        pitch = 0.56;
      }
      render();
      return true;
    }
    return false;
  }

  function isPointVisibleIn3D(pt) {
    if (!pt) return false;
    if (roomFilterId !== 'all' && pt.roomId !== roomFilterId) {
      // Verifica também pelas coordenadas do cômodo filtrado
      const rm = (project.rooms || []).find(r => r.id === roomFilterId);
      if (rm) {
        const inside = pt.x >= rm.x - 0.2 && pt.x <= rm.x + rm.w + 0.2 && pt.y >= rm.y - 0.2 && pt.y <= rm.y + rm.h + 0.2;
        if (!inside) return false;
      } else {
        return false;
      }
    }
    if (pt.category === 'tug') return layers3d.tug;
    if (pt.category === 'tue') return layers3d.tue;
    if (pt.category === 'light' || pt.category === 'sensor') return layers3d.light;
    if (pt.category === 'switch') return layers3d.switch;
    if (['telecom', 'bell', 'camera', 'jbox', 'riser'].includes(pt.category)) return layers3d.telecom;
    if (pt.category === 'qdc' || pt.category === 'padrao') {
      return activeQuickFilter === 'all' || activeQuickFilter === 'custom';
    }
    return true;
  }

  function checkHoverPoint(mx, my) {
    if (!project || !project.points) return;
    const center = getModelCenter();
    let found = null;
    for (const pt of project.points) {
      if (!isPointVisibleIn3D(pt)) continue;
      const z = Number(pt.z ?? (pt.category === 'light' ? 2.8 : 0.3));
      const p3 = project3D(pt.x, pt.y, z, center);
      if (Math.hypot(mx - p3.x, my - p3.y) <= 22) {
        found = pt;
        break;
      }
    }
    if (found !== hoveredPoint) {
      hoveredPoint = found;
      render();
    }
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

  function getFilteredRooms() {
    if (!project || !Array.isArray(project.rooms)) return [];
    if (roomFilterId === 'all') return project.rooms;
    return project.rooms.filter(r => r.id === roomFilterId);
  }

  function getModelCenter() {
    const rooms = getFilteredRooms();
    if (rooms.length === 0) {
      return { cx: 4, cy: 3 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rooms.forEach(r => {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    });
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  function project3D(wx, wy, wz, center) {
    const x = wx - center.cx;
    const y = wy - center.cy;
    const z = wz;

    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const rx = x * cosY - y * sinY;
    const ry = x * sinY + y * cosY;

    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    const screenX = canvas.width / 2 + panX + rx * zoom;
    const screenY = canvas.height / 2 + panY + (ry * sinP - z * cosP) * zoom;
    const depth = ry * cosP + z * sinP;

    return { x: screenX, y: screenY, depth };
  }

  function getHostWallBasis(pt) {
    if (!project || !project.rooms || project.rooms.length === 0) {
      return { tx: 1, ty: 0, nx: 0, ny: 1 };
    }
    const room = project.rooms.find(r => r.id === pt.roomId) || project.rooms[0];
    const dTop = Math.abs(pt.y - room.y);
    const dBottom = Math.abs(room.y + room.h - pt.y);
    const dLeft = Math.abs(pt.x - room.x);
    const dRight = Math.abs(room.x + room.w - pt.x);
    const min = Math.min(dTop, dBottom, dLeft, dRight);

    if (min === dTop) return { tx: 1, ty: 0, nx: 0, ny: 1 };
    if (min === dBottom) return { tx: -1, ty: 0, nx: 0, ny: -1 };
    if (min === dLeft) return { tx: 0, ty: 1, nx: 1, ny: 0 };
    return { tx: 0, ty: -1, nx: -1, ny: 0 };
  }

  function draw3DBox(center, origin, basis, dims, colors) {
    const hw = dims.w / 2;
    const hh = dims.h / 2;
    const d = dims.d;

    function toWorld(u, v, w) {
      return project3D(
        origin.x + basis.tx * u + basis.nx * v,
        origin.y + basis.ty * u + basis.ny * v,
        origin.z + w,
        center
      );
    }

    const b0 = toWorld(-hw, 0, -hh);
    const b1 = toWorld(hw, 0, -hh);
    const b2 = toWorld(hw, 0, hh);
    const b3 = toWorld(-hw, 0, hh);

    const f0 = toWorld(-hw, d, -hh);
    const f1 = toWorld(hw, d, -hh);
    const f2 = toWorld(hw, d, hh);
    const f3 = toWorld(-hw, d, hh);

    const isWire = visualStyle === 'wireframe';

    drawQuad(ctx, [b3, b2, f2, f3], isWire ? 'transparent' : (colors.top || colors.front), colors.stroke);
    drawQuad(ctx, [b0, f0, f3, b3], isWire ? 'transparent' : (colors.side || colors.front), colors.stroke);
    drawQuad(ctx, [f1, b1, b2, f2], isWire ? 'transparent' : (colors.side || colors.front), colors.stroke);
    drawQuad(ctx, [f0, f1, f2, f3], isWire ? 'transparent' : colors.front, colors.stroke);

    return { toWorld, f0, f1, f2, f3 };
  }

  function drawQuad(targetCtx, pts, fill, stroke, lineWidth = 1) {
    targetCtx.beginPath();
    targetCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      targetCtx.lineTo(pts[i].x, pts[i].y);
    }
    targetCtx.closePath();
    if (fill && fill !== 'transparent') {
      targetCtx.fillStyle = fill;
      targetCtx.fill();
    }
    if (stroke) {
      targetCtx.strokeStyle = stroke;
      targetCtx.lineWidth = lineWidth;
      targetCtx.stroke();
    }
  }

  // ==================== RENDERIZAÇÃO PRINCIPAL DO VIEWPORT 3D BIM ====================
  function render() {
    if (!ctx || !canvas || !project) return;
    const w = canvas.width;
    const h = canvas.height;
    const isLight = document.body.classList.contains('light-theme');

    ctx.clearRect(0, 0, w, h);

    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (isLight) {
      bgGrad.addColorStop(0, '#e2e8f0');
      bgGrad.addColorStop(0.65, '#f8fafc');
      bgGrad.addColorStop(1, '#cbd5e1');
    } else {
      bgGrad.addColorStop(0, '#0a101d');
      bgGrad.addColorStop(0.65, '#131d31');
      bgGrad.addColorStop(1, '#090d16');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const center = getModelCenter();
    const visibleRooms = getFilteredRooms();

    // 1. Eixos de Nível BIM
    drawRevitLevelLines(center, visibleRooms);

    // 2. Laje de Piso e Ambientes 3D
    visibleRooms.forEach(room => {
      const p0 = project3D(room.x, room.y, 0, center);
      const p1 = project3D(room.x + room.w, room.y, 0, center);
      const p2 = project3D(room.x + room.w, room.y + room.h, 0, center);
      const p3 = project3D(room.x, room.y + room.h, 0, center);

      drawQuad(
        ctx,
        [p0, p1, p2, p3],
        visualStyle === 'wireframe' ? 'rgba(15, 23, 42, 0.2)' : (isLight ? 'rgba(203, 213, 225, 0.85)' : 'rgba(30, 41, 59, 0.78)'),
        '#475569',
        1.5
      );

      const pc = project3D(room.x + room.w / 2, room.y + room.h / 2, 0.02, center);
      ctx.fillStyle = isLight ? '#1e293b' : 'rgba(203, 213, 225, 0.72)';
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(room.name, pc.x, pc.y);
    });

    // 2b. Escadas 3D (Item 19)
    if (layers3d.stairs && roomFilterId === 'all') {
      (project.stairs || []).forEach(st => drawRevitStair3D(st, center));
    }

    // 3. Paredes 3D Extrudadas
    if (wallOpacity > 0.02) {
      visibleRooms.forEach(room => {
        const corners = [
          [room.x, room.y],
          [room.x + room.w, room.y],
          [room.x + room.w, room.y + room.h],
          [room.x, room.y + room.h]
        ];
        for (let i = 0; i < 4; i++) {
          const [x1, y1] = corners[i];
          const [x2, y2] = corners[(i + 1) % 4];
          const b1 = project3D(x1, y1, 0, center);
          const b2 = project3D(x2, y2, 0, center);
          const t2 = project3D(x2, y2, wallHeight, center);
          const t1 = project3D(x1, y1, wallHeight, center);

          drawQuad(
            ctx,
            [b1, b2, t2, t1],
            visualStyle === 'wireframe' ? 'transparent' : `rgba(100, 116, 139, ${wallOpacity})`,
            `rgba(148, 163, 184, ${Math.min(1, wallOpacity + 0.25)})`,
            1
          );
        }
      });
    }

    // 4. FAMÍLIAS ARQUITETÔNICAS 3D: PORTAS, JANELAS E VÃOS LIVRES
    if (layers3d.openings) {
      const visibleRoomIds = new Set(visibleRooms.map(r => r.id));
      const sortedOpenings = (project.openings || [])
        .filter(op => visibleRoomIds.has(op.roomId))
        .map(op => {
          const room = project.rooms.find(r => r.id === op.roomId);
          const geom = room ? window.NBR5410.getOpeningWorldGeometry(op, room) : null;
          const midZ = Number(op.sillHeight || 0) + Number(op.height || 2.1) / 2;
          const proj = geom ? project3D(geom.cx, geom.cy, midZ, center) : { depth: 0 };
          return { op, room, geom, proj };
        })
        .filter(item => item.geom)
        .sort((a, b) => a.proj.depth - b.proj.depth);

      sortedOpenings.forEach(({ op, geom }) => {
        drawRevitOpening3D(op, geom, center);
      });
    }

    // 5. Eletrodutos e Eletrocalhas 3D Estilo Revit MEP
    if (layers3d.conduits) {
      project.conduits.forEach(cd => {
        const pt1 = project.points.find(p => p.id === cd.fromId);
        const pt2 = project.points.find(p => p.id === cd.toId);
        if (!pt1 || !pt2) return;
        if (roomFilterId !== 'all' && pt1.roomId !== roomFilterId && pt2.roomId !== roomFilterId) return;
        drawRevitConduit3D(cd, center);
      });
    }

    // 6. Famílias Elétricas 3D do Revit (Filtradas por Layer 3D e Cômodo)
    const sortedPoints = project.points
      .filter(pt => isPointVisibleIn3D(pt))
      .map(pt => {
        const z = Number(pt.z ?? (pt.category === 'light' ? 2.8 : 0.3));
        const proj = project3D(pt.x, pt.y, z, center);
        return { pt, z, proj };
      })
      .sort((a, b) => a.proj.depth - b.proj.depth);

    sortedPoints.forEach(({ pt, z, proj }) => {
      drawRevitMEPFamily(pt, z, proj, center);
    });

    // 7. ViewCube interativo no canto superior direito
    drawRevitViewCube();
  }

  // Escada 3D com Degraus Extrudados (Item 19)
  function drawRevitStair3D(st, center) {
    const steps = Math.max(6, Number(st.steps || 14));
    const sw = Number(st.w || 1.2);
    const sh = Number(st.h || 2.8);
    const stepD = sh / steps;
    const stepH = wallHeight / steps;

    for (let i = 0; i < steps; i++) {
      const y0 = st.y + sh - (i + 1) * stepD;
      const y1 = st.y + sh - i * stepD;
      const z0 = i * stepH;
      const z1 = (i + 1) * stepH;

      const p0 = project3D(st.x, y0, z1, center);
      const p1 = project3D(st.x + sw, y0, z1, center);
      const p2 = project3D(st.x + sw, y1, z1, center);
      const p3 = project3D(st.x, y1, z1, center);

      const b2 = project3D(st.x + sw, y1, z0, center);
      const b3 = project3D(st.x, y1, z0, center);

      // Espelho e pisada do degrau
      drawQuad(ctx, [b3, b2, p2, p3], 'rgba(100, 116, 139, 0.85)', '#334155', 1);
      drawQuad(ctx, [p0, p1, p2, p3], 'rgba(203, 213, 225, 0.90)', '#475569', 1);
    }
  }

  // ==================== DESENHO 3D DE PORTAS, JANELAS E VÃOS (REVIT ARCHITECTURE) ====================
  function drawRevitOpening3D(op, geom, center) {
    const z0 = Number(op.sillHeight || 0.0);
    const h = Number(op.height || 2.10);
    const z1 = Math.min(wallHeight - 0.05, z0 + h);
    const isWire = visualStyle === 'wireframe';

    const pBL = project3D(geom.x1, geom.y1, z0, center);
    const pBR = project3D(geom.x2, geom.y2, z0, center);
    const pTR = project3D(geom.x2, geom.y2, z1, center);
    const pTL = project3D(geom.x1, geom.y1, z1, center);

    if (op.type === 'door') {
      drawQuad(
        ctx,
        [pBL, pBR, pTR, pTL],
        isWire ? 'transparent' : 'rgba(11, 17, 32, 0.72)',
        '#d97706',
        2.4
      );

      const swing = op.swing || 'in-left';
      const hingeAtStart = swing.endsWith('left');
      const dirSign = swing.startsWith('in') ? 1 : -1;
      const hx = hingeAtStart ? geom.x1 : geom.x2;
      const hy = hingeAtStart ? geom.y1 : geom.y2;
      const tDir = hingeAtStart ? 1 : -1;

      const openAngle = 0.95;
      const cosA = Math.cos(openAngle);
      const sinA = Math.sin(openAngle);
      const doorW = geom.width;

      const ex = hx + (geom.tx * tDir * cosA + geom.nx * dirSign * sinA) * doorW;
      const ey = hy + (geom.ty * tDir * cosA + geom.ny * dirSign * sinA) * doorW;

      const dHingeBot = project3D(hx, hy, z0, center);
      const dHingeTop = project3D(hx, hy, z1, center);
      const dFreeTop = project3D(ex, ey, z1, center);
      const dFreeBot = project3D(ex, ey, z0, center);

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(hingeAtStart ? pBR.x : pBL.x, hingeAtStart ? pBR.y : pBL.y);
      ctx.quadraticCurveTo(
        (dFreeBot.x + (hingeAtStart ? pBR.x : pBL.x)) / 2,
        (dFreeBot.y + (hingeAtStart ? pBR.y : pBL.y)) / 2,
        dFreeBot.x,
        dFreeBot.y
      );
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      drawQuad(
        ctx,
        [dHingeBot, dFreeBot, dFreeTop, dHingeTop],
        isWire ? 'transparent' : 'rgba(180, 83, 9, 0.86)',
        '#fde68a',
        1.8
      );

      const handleX = hx + (ex - hx) * 0.86;
      const handleY = hy + (ey - hy) * 0.86;
      const pHandle = project3D(handleX, handleY, 1.00, center);
      ctx.save();
      ctx.beginPath();
      ctx.arc(pHandle.x, pHandle.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else if (op.type === 'window') {
      drawQuad(
        ctx,
        [pBL, pBR, pTR, pTL],
        isWire ? 'transparent' : 'rgba(56, 189, 248, 0.30)',
        '#e2e8f0',
        2.4
      );

      const pMidB = project3D(geom.cx, geom.cy, z0, center);
      const pMidT = project3D(geom.cx, geom.cy, z1, center);
      ctx.save();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(pMidB.x, pMidB.y);
      ctx.lineTo(pMidT.x, pMidT.y);
      ctx.stroke();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pBL.x, pBL.y);
      ctx.lineTo(pBR.x, pBR.y);
      ctx.stroke();
      ctx.restore();
    } else if (op.type === 'opening') {
      drawQuad(
        ctx,
        [pBL, pBR, pTR, pTL],
        isWire ? 'transparent' : 'rgba(15, 23, 42, 0.55)',
        '#c084fc',
        2.0
      );
    }

    const pTopMid = project3D(geom.cx, geom.cy, z1 + 0.12, center);
    ctx.save();
    ctx.fillStyle = op.type === 'window' ? '#7dd3fc' : op.type === 'opening' ? '#d8b4fe' : '#fde68a';
    ctx.font = '700 9.5px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${op.label || op.type.toUpperCase()} (${geom.width.toFixed(2)}×${h.toFixed(2)}m)`, pTopMid.x, pTopMid.y);
    ctx.restore();
  }

  function drawRevitLevelLines(center, rooms) {
    if (!rooms || rooms.length === 0) return;
    let maxX = -Infinity, minY = Infinity;
    rooms.forEach(r => {
      maxX = Math.max(maxX, r.x + r.w);
      minY = Math.min(minY, r.y);
    });

    const levels = [
      { z: 0.0, label: 'Nível 1 - Piso (0.00 m)' },
      { z: 2.80, label: 'Nível 2 - Laje/Forro (2.80 m)' }
    ];

    levels.forEach(lv => {
      const pStart = project3D(maxX + 0.3, minY, lv.z, center);
      const pEnd = project3D(maxX + 1.5, minY, lv.z, center);

      ctx.save();
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(pEnd.x + 8, pEnd.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pEnd.x + 8, pEnd.y, 6, 0, Math.PI);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();

      ctx.fillStyle = '#bae6fd';
      ctx.font = '600 10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(lv.label, pEnd.x + 18, pEnd.y + 3);
      ctx.restore();
    });
  }

  function drawRevitConduit3D(cd, center) {
    const pt1 = project.points.find(p => p.id === cd.fromId);
    const pt2 = project.points.find(p => p.id === cd.toId);
    if (!pt1 || !pt2) return;

    const z1 = Number(pt1.z ?? 1.3);
    const z2 = Number(pt2.z ?? 1.3);
    const isTray = cd.mounting === 'eletrocalha' || cd.tray;
    const slabZ = cd.mounting === 'piso' ? 0.04 : isTray ? wallHeight - 0.18 : wallHeight;

    const a = project3D(pt1.x, pt1.y, z1, center);
    const aTop = project3D(pt1.x, pt1.y, slabZ, center);
    const bTop = project3D(pt2.x, pt2.y, slabZ, center);
    const b = project3D(pt2.x, pt2.y, z2, center);

    const outerColor = isTray ? '#059669' : cd.mounting === 'parede' ? '#0284c7' : cd.mounting === 'piso' ? '#7e22ce' : '#d97706';
    const highlightColor = isTray ? '#6ee7b7' : cd.mounting === 'parede' ? '#7dd3fc' : cd.mounting === 'piso' ? '#d8b4fe' : '#fde68a';
    const thickness = isTray ? 9.5 : cd.diameterMm >= 25 ? 5.2 : 3.8;

    ctx.save();
    ctx.lineCap = isTray ? 'butt' : 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = outerColor;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(aTop.x, aTop.y);
    ctx.lineTo(bTop.x, bTop.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    if (visualStyle !== 'wireframe') {
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = thickness * 0.35;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(aTop.x, aTop.y);
      ctx.lineTo(bTop.x, bTop.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    [aTop, bTop].forEach(joint => {
      ctx.beginPath();
      ctx.arc(joint.x, joint.y, thickness * 0.65, 0, Math.PI * 2);
      ctx.fillStyle = outerColor;
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.restore();
  }

  function drawRevitMEPFamily(pt, z, pos3d, center) {
    const floor3d = project3D(pt.x, pt.y, 0, center);
    const basis = getHostWallBasis(pt);
    const isHovered = hoveredPoint && hoveredPoint.id === pt.id;

    ctx.save();
    ctx.strokeStyle = isHovered ? '#f59e0b' : 'rgba(148, 163, 184, 0.25)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(floor3d.x, floor3d.y);
    ctx.lineTo(pos3d.x, pos3d.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (pt.category === 'qdc') {
      drawRevitQDCBoard3D(pt, z, basis, center, pos3d);
    } else if (pt.category === 'padrao') {
      drawRevitServiceEntrance3D(pt, z, basis, center, pos3d);
    } else if (pt.category === 'light' || pt.category === 'sensor') {
      drawRevitCeilingFixture3D(pt, z, center, pos3d, floor3d);
    } else if (pt.category === 'switch') {
      drawRevitSwitch4x2Family3D(pt, z, basis, center, pos3d);
    } else if (pt.category === 'tug' || pt.category === 'tue' || pt.category === 'telecom' || pt.category === 'bell') {
      drawRevitOutlet4x2Family3D(pt, z, basis, center, pos3d);
    } else {
      // Câmera CFTV, Caixa de Passagem ou Eletroduto Sobe/Desce
      draw3DBox(
        center,
        { x: pt.x, y: pt.y, z },
        basis,
        { w: 0.20, d: 0.12, h: 0.20 },
        { top: '#e2e8f0', side: '#94a3b8', front: pt.category === 'camera' ? '#f43f5e' : '#64748b', stroke: '#0f172a' }
      );
    }

    ctx.save();
    const tagY = pos3d.y - (pt.category === 'qdc' ? 28 : 20);
    const text = `${pt.circuitId || pt.label} • h=${z.toFixed(2)}m`;
    ctx.font = '700 10px JetBrains Mono, monospace';
    const tw = ctx.measureText(text).width + 10;

    ctx.fillStyle = isHovered ? 'rgba(245, 158, 11, 0.95)' : 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = isHovered ? '#fde68a' : '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pos3d.x - tw / 2, tagY - 11, tw, 15, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isHovered ? '#0f172a' : '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(text, pos3d.x, tagY);
    ctx.restore();
  }

  function drawRevitServiceEntrance3D(pt, z, basis, center, pos3d) {
    // Poste do padrão + Caixa de medição policarbonato
    draw3DBox(
      center,
      { x: pt.x, y: pt.y, z: 1.5 },
      basis,
      { w: 0.16, d: 0.16, h: 3.0 },
      { top: '#94a3b8', side: '#64748b', front: '#94a3b8', stroke: '#334155' }
    );
    draw3DBox(
      center,
      { x: pt.x + basis.nx * 0.10, y: pt.y + basis.ny * 0.10, z: 1.5 },
      basis,
      { w: 0.36, d: 0.18, h: 0.48 },
      { top: '#475569', side: '#334155', front: '#1e293b', stroke: '#f59e0b' }
    );
  }

  function drawRevitQDCBoard3D(pt, z, basis, center, pos3d) {
    const isPartial = pt.subtype === 'quadro_parcial';
    draw3DBox(
      center,
      { x: pt.x, y: pt.y, z },
      basis,
      { w: isPartial ? 0.36 : 0.46, d: 0.08, h: isPartial ? 0.42 : 0.56 },
      { top: '#94a3b8', side: '#64748b', front: '#cbd5e1', stroke: '#1e293b' }
    );

    const inner = draw3DBox(
      center,
      {
        x: pt.x + basis.nx * 0.082,
        y: pt.y + basis.ny * 0.082,
        z
      },
      basis,
      { w: isPartial ? 0.30 : 0.38, d: 0.01, h: isPartial ? 0.34 : 0.46 },
      { top: '#0f172a', side: '#0f172a', front: '#0f172a', stroke: isPartial ? '#a855f7' : '#f59e0b' }
    );

    ctx.save();
    for (const rowZ of [0.10, -0.06]) {
      const pL = inner.toWorld(-0.12, 0.015, rowZ);
      const pR = inner.toWorld(0.12, 0.015, rowZ);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(pR.x, pR.y);
      ctx.stroke();

      ctx.strokeStyle = rowZ > 0 ? '#f59e0b' : '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(pR.x, pR.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(pos3d.x, pos3d.y - 6);
    ctx.lineTo(pos3d.x + 5, pos3d.y + 4);
    ctx.lineTo(pos3d.x - 5, pos3d.y + 4);
    ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawRevitCeilingFixture3D(pt, z, center, pos3d, floor3d) {
    if (showLightCones && visualStyle !== 'wireframe' && pt.category === 'light') {
      const coneGrad = ctx.createRadialGradient(pos3d.x, pos3d.y, 3, floor3d.x, floor3d.y, 48);
      coneGrad.addColorStop(0, 'rgba(253, 224, 71, 0.42)');
      coneGrad.addColorStop(1, 'rgba(253, 224, 71, 0.0)');
      ctx.save();
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(pos3d.x - 9, pos3d.y);
      ctx.lineTo(pos3d.x + 9, pos3d.y);
      ctx.lineTo(floor3d.x + 45, floor3d.y);
      ctx.lineTo(floor3d.x - 45, floor3d.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const octTop = project3D(pt.x, pt.y, z + 0.07, center);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(octTop.x, octTop.y, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#eab308';
    ctx.fill();
    ctx.strokeStyle = '#713f12';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const rx = Math.max(11, zoom * 0.24);
    const ry = Math.max(6.5, zoom * 0.14);

    ctx.beginPath();
    ctx.ellipse(pos3d.x, pos3d.y - 4, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(pos3d.x, pos3d.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(pos3d.x, pos3d.y, rx * 0.78, ry * 0.78, 0, 0, Math.PI * 2);
    ctx.fillStyle = pt.category === 'sensor' ? '#6ee7b7' : '#fef08a';
    ctx.fill();
    ctx.strokeStyle = pt.category === 'sensor' ? '#10b981' : '#facc15';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawRevitOutlet4x2Family3D(pt, z, basis, center, pos3d) {
    const is20A = pt.category === 'tue' || Number(pt.powerVA) >= 600;
    const gangCount = pt.subtype === 'tug_tripla' ? 3 : pt.subtype === 'tug_dupla' ? 2 : 1;

    draw3DBox(
      center,
      {
        x: pt.x - basis.nx * 0.04,
        y: pt.y - basis.ny * 0.04,
        z
      },
      basis,
      { w: 0.18, d: 0.05, h: 0.28 },
      { top: '#facc15', side: '#ca8a04', front: '#eab308', stroke: '#854d0e' }
    );

    draw3DBox(
      center,
      { x: pt.x, y: pt.y, z },
      basis,
      { w: 0.22, d: 0.035, h: 0.32 },
      { top: '#ffffff', side: '#cbd5e1', front: '#f8fafc', stroke: '#475569' }
    );

    ctx.save();
    ctx.translate(pos3d.x, pos3d.y);

    const offsetsY = gangCount === 3 ? [-6, 0, 6] : gangCount === 2 ? [-4, 4] : [0];
    const modW = 13;
    const modH = gangCount === 1 ? 8.5 : 5.2;

    offsetsY.forEach(oy => {
      ctx.save();
      ctx.translate(0, oy);
      ctx.beginPath();
      ctx.moveTo(-modW * 0.65, -modH / 2);
      ctx.lineTo(modW * 0.65, -modH / 2);
      ctx.lineTo(modW * 0.85, 0);
      ctx.lineTo(modW * 0.65, modH / 2);
      ctx.lineTo(-modW * 0.65, modH / 2);
      ctx.lineTo(-modW * 0.85, 0);
      ctx.closePath();
      ctx.fillStyle = pt.category === 'telecom' ? '#06b6d4' : is20A ? '#dc2626' : '#e2e8f0';
      ctx.fill();
      ctx.strokeStyle = is20A ? '#7f1d1d' : '#64748b';
      ctx.lineWidth = 1;
      ctx.stroke();

      const holeColor = is20A ? '#ffffff' : '#0f172a';
      const holeRadius = 1.2;
      [
        { x: -3.8, y: 0.4 },
        { x: 0, y: -1.1 },
        { x: 3.8, y: 0.4 }
      ].forEach(h => {
        ctx.beginPath();
        ctx.arc(h.x, h.y, holeRadius, 0, Math.PI * 2);
        ctx.fillStyle = holeColor;
        ctx.fill();
      });
      ctx.restore();
    });

    ctx.restore();
  }

  function drawRevitSwitch4x2Family3D(pt, z, basis, center, pos3d) {
    const gang = pt.subtype === 'int_triplo' ? 3 : pt.subtype === 'int_duplo' ? 2 : 1;

    draw3DBox(
      center,
      {
        x: pt.x - basis.nx * 0.04,
        y: pt.y - basis.ny * 0.04,
        z
      },
      basis,
      { w: 0.18, d: 0.05, h: 0.28 },
      { top: '#facc15', side: '#ca8a04', front: '#eab308', stroke: '#854d0e' }
    );

    draw3DBox(
      center,
      { x: pt.x, y: pt.y, z },
      basis,
      { w: 0.22, d: 0.035, h: 0.32 },
      { top: '#ffffff', side: '#cbd5e1', front: '#f8fafc', stroke: '#475569' }
    );

    ctx.save();
    ctx.translate(pos3d.x, pos3d.y);
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.strokeRect(-6, -6, 12, 12);

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < gang; i++) {
      const y = gang === 1 ? 0 : -3.5 + (i * 7) / (gang - 1);
      ctx.beginPath();
      ctx.moveTo(-4, y);
      ctx.lineTo(4, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRevitViewCube() {
    const cx = canvas.width - 74;
    const cy = 78;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy + 8, 42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - 36);
    ctx.fillText('S', cx, cy + 58);
    ctx.fillText('O', cx - 48, cy + 11);
    ctx.fillText('L', cx + 48, cy + 11);

    ctx.beginPath();
    ctx.moveTo(cx, cy - 26);
    ctx.lineTo(cx + 26, cy - 13);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx - 26, cy - 13);
    ctx.closePath();
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 26, cy - 13);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + 28);
    ctx.lineTo(cx - 26, cy + 15);
    ctx.closePath();
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 26, cy - 13);
    ctx.lineTo(cx + 26, cy + 15);
    ctx.lineTo(cx, cy + 28);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 8px Inter, sans-serif';
    ctx.fillText('TOPO', cx, cy - 11);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('FRENTE', cx - 13, cy + 11);
    ctx.fillText('DIR', cx + 13, cy + 11);

    ctx.restore();
  }

  // ============================================================================
  // GUIA EXCLUSIVA 3D PARA O QUADRO ELÉTRICO (QDC / QGBT) COM COMPONENTES REAIS
  // Disjuntores DIN, DR (IDR), DPS, Bornes, Barramentos de Neutro/Terra/Fases (Item 5)
  // ============================================================================
  function projectBoardPt(x, y, z) {
    if (!boardCanvas) return { x: 0, y: 0, depth: 0 };
    const cosY = Math.cos(boardYaw);
    const sinY = Math.sin(boardYaw);
    const cosP = Math.cos(boardPitch);
    const sinP = Math.sin(boardPitch);

    // Rotação em torno de Y (horizontal) e X (vertical)
    const rx = x * cosY + z * sinY;
    const rz = -x * sinY + z * cosY;
    const ry = y * cosP - rz * sinP;
    const depth = y * sinP + rz * cosP;

    const perspective = 900 / Math.max(300, 900 - depth * 0.8);
    const sx = boardCanvas.width / 2 + boardPanX + rx * boardZoom * perspective;
    const sy = boardCanvas.height / 2 + boardPanY + ry * boardZoom * perspective;
    return { x: sx, y: sy, depth };
  }

  function drawBoardCuboid(x, y, z, w, h, d, colors) {
    const hw = w / 2;
    const hh = h / 2;
    const b0 = projectBoardPt(x - hw, y - hh, z);
    const b1 = projectBoardPt(x + hw, y - hh, z);
    const b2 = projectBoardPt(x + hw, y + hh, z);
    const b3 = projectBoardPt(x - hw, y + hh, z);

    const f0 = projectBoardPt(x - hw, y - hh, z + d);
    const f1 = projectBoardPt(x + hw, y - hh, z + d);
    const f2 = projectBoardPt(x + hw, y + hh, z + d);
    const f3 = projectBoardPt(x - hw, y + hh, z + d);

    // Faces laterais e topo/base
    if (boardPitch >= 0) {
      drawQuad(boardCtx, [b0, b1, f1, f0], colors.top || '#cbd5e1', colors.stroke || '#334155', 1);
    } else {
      drawQuad(boardCtx, [b3, b2, f2, f3], colors.top || '#94a3b8', colors.stroke || '#334155', 1);
    }

    if (boardYaw >= 0) {
      drawQuad(boardCtx, [b0, f0, f3, b3], colors.side || '#94a3b8', colors.stroke || '#334155', 1);
    } else {
      drawQuad(boardCtx, [b1, f1, f2, b2], colors.side || '#94a3b8', colors.stroke || '#334155', 1);
    }

    drawQuad(boardCtx, [f0, f1, f2, f3], colors.front || '#f8fafc', colors.stroke || '#334155', 1.2);
    return { f0, f1, f2, f3, centerFront: projectBoardPt(x, y, z + d + 1) };
  }

  // ============================================================================
  // CABEAMENTO PROFISSIONAL 3D (CANVA / INFOGRÁFICO / RENDER INDUSTRIAL)
  // Canaletas Perfuradas, Ilhós Tubulares, Anilhas de Identificação e Specular Shading
  // ============================================================================
  const CABLE_COLORS = {
    phaseR: { core: '#ef4444', dark: '#7f1d1d', highlight: 'rgba(254, 202, 202, 0.75)' },
    phaseS: { core: '#1e293b', dark: '#020617', highlight: 'rgba(148, 163, 184, 0.75)' },
    phaseT: { core: '#b45309', dark: '#451a03', highlight: 'rgba(253, 230, 138, 0.75)' },
    neutral: { core: '#0284c7', dark: '#082f49', highlight: 'rgba(125, 211, 252, 0.8)' },
    earth: { core: '#16a34a', dark: '#052e16', highlight: 'rgba(187, 247, 208, 0.8)' },
    circuitLight: { core: '#eab308', dark: '#713f12', highlight: 'rgba(254, 240, 138, 0.8)' },
    circuitPower: { core: '#dc2626', dark: '#7f1d1d', highlight: 'rgba(254, 202, 202, 0.8)' },
    circuitSpecial: { core: '#2563eb', dark: '#1e3a8a', highlight: 'rgba(147, 197, 253, 0.8)' }
  };

  function drawSlottedDuct(x, y, z, w, h, d, orientation) {
    drawBoardCuboid(x, y, z, w, h, d, {
      top: '#475569',
      side: '#1e293b',
      front: '#334155',
      stroke: '#0f172a'
    });

    boardCtx.save();
    boardCtx.strokeStyle = '#0f172a';
    boardCtx.lineWidth = Math.max(1, 1.2 * boardZoom);
    if (orientation === 'vertical') {
      const step = 14;
      const count = Math.floor(h / step);
      for (let i = -count / 2; i <= count / 2; i++) {
        const py = y + i * step;
        const pL = projectBoardPt(x - w / 2 + 1.5, py, z + d + 0.5);
        const pR = projectBoardPt(x + w / 2 - 1.5, py, z + d + 0.5);
        boardCtx.beginPath();
        boardCtx.moveTo(pL.x, pL.y);
        boardCtx.lineTo(pR.x, pR.y);
        boardCtx.stroke();
      }
    } else {
      const step = 14;
      const count = Math.floor(w / step);
      for (let i = -count / 2; i <= count / 2; i++) {
        const px = x + i * step;
        const pT = projectBoardPt(px, y - h / 2 + 1.5, z + d + 0.5);
        const pB = projectBoardPt(px, y + h / 2 - 1.5, z + d + 0.5);
        boardCtx.beginPath();
        boardCtx.moveTo(pT.x, pT.y);
        boardCtx.lineTo(pB.x, pB.y);
        boardCtx.stroke();
      }
    }
    boardCtx.restore();
  }

  function generateFilletedPoints(points3d, filletRadius = 12) {
    if (!points3d || points3d.length <= 2) return points3d || [];
    const result = [points3d[0]];
    for (let i = 1; i < points3d.length - 1; i++) {
      const pPrev = points3d[i - 1];
      const pCurr = points3d[i];
      const pNext = points3d[i + 1];

      const v1 = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y, z: pPrev.z - pCurr.z };
      const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y, z: pNext.z - pCurr.z };
      const d1 = Math.hypot(v1.x, v1.y, v1.z);
      const d2 = Math.hypot(v2.x, v2.y, v2.z);
      if (d1 < 1e-3 || d2 < 1e-3) {
        result.push(pCurr);
        continue;
      }
      const r = Math.min(filletRadius, d1 * 0.45, d2 * 0.45);
      const startFillet = {
        x: pCurr.x + (v1.x / d1) * r,
        y: pCurr.y + (v1.y / d1) * r,
        z: pCurr.z + (v1.z / d1) * r
      };
      const endFillet = {
        x: pCurr.x + (v2.x / d2) * r,
        y: pCurr.y + (v2.y / d2) * r,
        z: pCurr.z + (v2.z / d2) * r
      };
      result.push(startFillet);
      result.push({
        x: pCurr.x * 0.55 + (startFillet.x + endFillet.x) * 0.225,
        y: pCurr.y * 0.55 + (startFillet.y + endFillet.y) * 0.225,
        z: pCurr.z * 0.55 + (startFillet.z + endFillet.z) * 0.225
      });
      result.push(endFillet);
    }
    result.push(points3d[points3d.length - 1]);
    return result;
  }

  function getPointOnPolyline(pts, t) {
    if (!pts || pts.length === 0) return { x: 0, y: 0 };
    if (pts.length === 1) return pts[0];
    if (pts.length === 2) {
      return {
        x: pts[0].x + (pts[1].x - pts[0].x) * t,
        y: pts[0].y + (pts[1].y - pts[0].y) * t
      };
    }
    const idx = Math.min(pts.length - 2, Math.max(0, Math.floor(t * (pts.length - 1))));
    const segT = (t * (pts.length - 1)) - idx;
    return {
      x: pts[idx].x + (pts[idx + 1].x - pts[idx].x) * segT,
      y: pts[idx].y + (pts[idx + 1].y - pts[idx].y) * segT
    };
  }

  function drawTerminalFerrule(pt, angle = 0) {
    if (!pt) return;
    boardCtx.save();
    boardCtx.translate(pt.x, pt.y);
    boardCtx.rotate(angle);

    const fw = 6.5 * boardZoom;
    const fh = 9 * boardZoom;

    // Sombra do ilhós
    boardCtx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    boardCtx.fillRect(-fw / 2 + 1, -fh / 2 + 1, fw, fh);

    // Tubo metálico niquelado brilhante
    const ferruleGrad = boardCtx.createLinearGradient(-fw / 2, 0, fw / 2, 0);
    ferruleGrad.addColorStop(0, '#94a3b8');
    ferruleGrad.addColorStop(0.3, '#f8fafc');
    ferruleGrad.addColorStop(0.7, '#cbd5e1');
    ferruleGrad.addColorStop(1, '#64748b');

    boardCtx.fillStyle = ferruleGrad;
    boardCtx.fillRect(-fw / 2, -fh / 2, fw, fh);
    boardCtx.strokeStyle = '#334155';
    boardCtx.lineWidth = 0.8;
    boardCtx.strokeRect(-fw / 2, -fh / 2, fw, fh);

    // Colar plástico cônico de entrada do ilhós
    boardCtx.fillStyle = '#f59e0b';
    boardCtx.fillRect(-fw / 2 - 0.5, fh / 2 - 2 * boardZoom, fw + 1, 2.5 * boardZoom);

    // Crimpagem central
    boardCtx.strokeStyle = '#475569';
    boardCtx.beginPath();
    boardCtx.moveTo(-fw / 2, 0);
    boardCtx.lineTo(fw / 2, 0);
    boardCtx.stroke();

    boardCtx.restore();
  }

  function drawCableTag(pt, text, subText) {
    if (!pt) return;
    let mainLabel = String(text || '').trim();
    if (!mainLabel || mainLabel.toLowerCase() === 'undefined' || mainLabel.toLowerCase() === 'null') return;
    mainLabel = mainLabel.replace(/undefined/gi, '').trim();
    if (!mainLabel) return;

    let subLabel = subText !== undefined && subText !== null ? String(subText).trim() : '';
    if (!subLabel || subLabel.toLowerCase() === 'undefined' || subLabel.toLowerCase().includes('undefined') || subLabel === 'mm²') {
      subLabel = '';
    }

    boardCtx.save();
    boardCtx.translate(pt.x, pt.y);

    const fSize = Math.max(7, Math.round(8.5 * boardZoom));
    boardCtx.font = `800 ${fSize}px JetBrains Mono, monospace`;
    const tw = boardCtx.measureText(mainLabel).width;
    const subW = subLabel ? boardCtx.measureText(subLabel).width * 0.8 : 0;
    const maxW = Math.max(tw, subW);
    const tagW = Math.max(maxW + 9 * boardZoom, 24 * boardZoom);
    const tagH = (subLabel ? 18 : 13) * boardZoom;

    boardCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    boardCtx.shadowBlur = 4 * boardZoom;
    boardCtx.shadowOffsetX = 1.5 * boardZoom;
    boardCtx.shadowOffsetY = 2.5 * boardZoom;

    // Anilha amarela termocontrátil (Canva graphic look)
    boardCtx.fillStyle = '#facc15';
    boardCtx.strokeStyle = '#854d0e';
    boardCtx.lineWidth = 1;
    const rx = -tagW / 2;
    const ry = -tagH / 2;

    if (boardCtx.roundRect) {
      boardCtx.beginPath();
      boardCtx.roundRect(rx, ry, tagW, tagH, 3.5 * boardZoom);
      boardCtx.fill();
      boardCtx.stroke();
    } else {
      boardCtx.fillRect(rx, ry, tagW, tagH);
      boardCtx.strokeRect(rx, ry, tagW, tagH);
    }

    boardCtx.shadowColor = 'transparent';

    // Brilho superior
    boardCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    boardCtx.fillRect(rx + 2, ry + 1, tagW - 4, 2 * boardZoom);

    boardCtx.fillStyle = '#0f172a';
    boardCtx.textAlign = 'center';
    boardCtx.textBaseline = 'middle';
    if (subLabel) {
      boardCtx.fillText(mainLabel, 0, -3.2 * boardZoom);
      boardCtx.font = `700 ${Math.max(6, Math.round(7 * boardZoom))}px JetBrains Mono, monospace`;
      boardCtx.fillStyle = '#713f12';
      boardCtx.fillText(subLabel, 0, 4.5 * boardZoom);
    } else {
      boardCtx.fillText(mainLabel, 0, 0);
    }

    boardCtx.restore();
  }

  function drawZipTie(pt) {
    if (!pt) return;
    boardCtx.save();
    boardCtx.translate(pt.x, pt.y);
    const w = 7 * boardZoom;
    const h = 12 * boardZoom;

    boardCtx.fillStyle = '#f8fafc';
    boardCtx.strokeStyle = '#1e293b';
    boardCtx.lineWidth = 0.8;
    boardCtx.fillRect(-w / 2, -h / 2, w, h);
    boardCtx.strokeRect(-w / 2, -h / 2, w, h);

    boardCtx.fillStyle = '#cbd5e1';
    boardCtx.fillRect(-w / 2 - 1, -h / 2, 3 * boardZoom, 4 * boardZoom);
    boardCtx.strokeRect(-w / 2 - 1, -h / 2, 3 * boardZoom, 4 * boardZoom);

    boardCtx.restore();
  }

  function drawProCableSegment(pts2d, colorConfig, radius, options = {}) {
    if (!pts2d || pts2d.length < 2) return;
    boardCtx.save();
    boardCtx.lineCap = 'round';
    boardCtx.lineJoin = 'round';

    function buildPath() {
      boardCtx.beginPath();
      boardCtx.moveTo(pts2d[0].x, pts2d[0].y);
      if (pts2d.length === 2) {
        boardCtx.lineTo(pts2d[1].x, pts2d[1].y);
      } else {
        for (let i = 1; i < pts2d.length - 1; i++) {
          const xc = (pts2d[i].x + pts2d[i + 1].x) / 2;
          const yc = (pts2d[i].y + pts2d[i + 1].y) / 2;
          boardCtx.quadraticCurveTo(pts2d[i].x, pts2d[i].y, xc, yc);
        }
        boardCtx.lineTo(pts2d[pts2d.length - 1].x, pts2d[pts2d.length - 1].y);
      }
    }

    const r = Math.max(1.8, radius * boardZoom);

    // 1. Drop shadow 3D suave
    boardCtx.save();
    boardCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    boardCtx.shadowBlur = 4 * boardZoom;
    boardCtx.shadowOffsetX = 2.2 * boardZoom;
    boardCtx.shadowOffsetY = 2.8 * boardZoom;
    boardCtx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
    boardCtx.lineWidth = r * 2 + 1.8;
    buildPath();
    boardCtx.stroke();
    boardCtx.restore();

    // 2. Contorno externo escurecido
    boardCtx.strokeStyle = colorConfig.dark || '#0f172a';
    boardCtx.lineWidth = r * 2;
    buildPath();
    boardCtx.stroke();

    // 3. Capa condutora principal (Cor viva NBR 5410)
    boardCtx.strokeStyle = colorConfig.core || '#ef4444';
    boardCtx.lineWidth = Math.max(1.2, r * 2 - 1.6);
    buildPath();
    boardCtx.stroke();

    // 4. Efeito 3D Specular Highlight (Brilho tubular Canva / Cinema)
    boardCtx.save();
    boardCtx.translate(-0.7 * boardZoom, -0.9 * boardZoom);
    boardCtx.strokeStyle = colorConfig.highlight || 'rgba(255, 255, 255, 0.6)';
    boardCtx.lineWidth = Math.max(0.8, r * 0.7);
    buildPath();
    boardCtx.stroke();
    boardCtx.restore();

    // 5. Ilhós Tubular Metálico de Terminação (Ferrules nos bornes)
    if (options.ferruleStart) {
      drawTerminalFerrule(pts2d[0], options.ferruleAngleStart || 0);
    }
    if (options.ferruleEnd) {
      drawTerminalFerrule(pts2d[pts2d.length - 1], options.ferruleAngleEnd || 0);
    }

    // 6. Anilha de Identificação Técnica (Tag amarela estilo Canva / NBR)
    if (options.tag) {
      const tagT = options.tagPos !== undefined ? options.tagPos : 0.4;
      const ptTag = getPointOnPolyline(pts2d, tagT);
      drawCableTag(ptTag, options.tag, options.tagSub);
    }

    // 7. Abraçadeira de Nylon (Zip-tie)
    if (options.zipTie) {
      const ptTie = getPointOnPolyline(pts2d, options.zipTiePos || 0.5);
      drawZipTie(ptTie);
    }

    boardCtx.restore();
  }

  function drawProCable3D(points3d, colorConfig, radius, options = {}) {
    if (!points3d || points3d.length < 2) return;
    const filleted = options.noFillet ? points3d : generateFilletedPoints(points3d, options.filletRadius || 14);
    const pts2d = filleted.map(pt => projectBoardPt(pt.x, pt.y, pt.z));
    drawProCableSegment(pts2d, colorConfig, radius, options);
  }

  function renderBoard3D() {
    if (!boardCtx || !boardCanvas || !project) return;
    const w = boardCanvas.width;
    const h = boardCanvas.height;
    const isLight = document.body.classList.contains('light-theme');

    boardCtx.clearRect(0, 0, w, h);
    const grad = boardCtx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, Math.max(w, h) * 0.7);
    if (isLight) {
      grad.addColorStop(0, '#f8fafc');
      grad.addColorStop(1, '#cbd5e1');
    } else {
      grad.addColorStop(0, '#162238');
      grad.addColorStop(1, '#070b14');
    }
    boardCtx.fillStyle = grad;
    boardCtx.fillRect(0, 0, w, h);

    const evaluated = window.NBR5410.evaluateProjectCircuits(project);
    const board = window.NBR5410.calculateBoardSummary(project, evaluated);

    // 1. Caixa Metálica / PVC do Quadro de Distribuição (520 x 440 x 95)
    drawBoardCuboid(0, 0, -35, 560, 440, 35, {
      top: '#334155',
      side: '#1e293b',
      front: '#0f172a',
      stroke: '#475569'
    });
    // Chassi interno laranja/metálico
    drawBoardCuboid(0, 0, -4, 510, 395, 6, {
      top: '#475569',
      side: '#334155',
      front: '#1e293b',
      stroke: '#64748b'
    });

    // 2. Barramento de Neutro (Azul - Superior Esquerdo) com Bornes Parafusados
    const nBar = drawBoardCuboid(-165, -162, 4, 155, 22, 18, {
      top: '#0284c7',
      side: '#0369a1',
      front: '#0ea5e9',
      stroke: '#082f49'
    });
    for (let i = -60; i <= 60; i += 15) {
      const sp = projectBoardPt(-165 + i, -162, 23);
      boardCtx.beginPath();
      boardCtx.arc(sp.x, sp.y, 3.2 * boardZoom, 0, Math.PI * 2);
      boardCtx.fillStyle = '#e2e8f0';
      boardCtx.fill();
      boardCtx.strokeStyle = '#0f172a';
      boardCtx.stroke();
    }
    boardCtx.fillStyle = '#bae6fd';
    boardCtx.font = `700 ${Math.round(10 * boardZoom)}px JetBrains Mono, monospace`;
    boardCtx.textAlign = 'center';
    boardCtx.fillText('BARRAMENTO NEUTRO (N)', nBar.centerFront.x, nBar.centerFront.y - 16 * boardZoom);

    // 3. Barramento de Proteção Terra PE (Verde/Amarelo - Superior Direito) com Bornes Parafusados
    const peBar = drawBoardCuboid(165, -162, 4, 155, 22, 18, {
      top: '#15803d',
      side: '#166534',
      front: '#22c55e',
      stroke: '#052e16'
    });
    for (let i = -60; i <= 60; i += 15) {
      const sp = projectBoardPt(165 + i, -162, 23);
      boardCtx.beginPath();
      boardCtx.arc(sp.x, sp.y, 3.2 * boardZoom, 0, Math.PI * 2);
      boardCtx.fillStyle = '#fef08a';
      boardCtx.fill();
      boardCtx.strokeStyle = '#0f172a';
      boardCtx.stroke();
    }
    boardCtx.fillStyle = '#86efac';
    boardCtx.fillText('BARRAMENTO TERRA (PE)', peBar.centerFront.x, peBar.centerFront.y - 16 * boardZoom);

    // 4. Dois Trilhos DIN 35mm Metálicos (Trilho Superior: Proteção Geral | Trilho Inferior: Circuitos Terminais + Bornes)
    const railY1 = -62;
    const railY2 = 92;
    [railY1, railY2].forEach(ry => {
      drawBoardCuboid(0, ry, 2, 470, 28, 8, {
        top: '#cbd5e1',
        side: '#64748b',
        front: '#94a3b8',
        stroke: '#334155'
      });
    });

    // 4a. Canaletas de PVC Perfuradas (Trunking Slotted Ducts) Industriais
    drawSlottedDuct(-244, 0, 1, 22, 385, 24, 'vertical');
    drawSlottedDuct(244, 0, 1, 22, 385, 24, 'vertical');
    drawSlottedDuct(0, -122, 1, 466, 20, 22, 'horizontal');
    drawSlottedDuct(0, 15, 1, 466, 22, 22, 'horizontal');
    drawSlottedDuct(0, 168, 1, 466, 24, 22, 'horizontal');

    // 5. TRILHO SUPERIOR: Disjuntor Geral DIN + IDR Tetrapolar 30mA + 3/4 Cartuchos DPS Classe II + Bornes SAK
    // 5a. Disjuntor Geral (Tripolar ou Bipolar)
    const mainPoles = project.supply.system === 'Monofásico' ? 1 : project.supply.system === 'Bifásico' ? 2 : 3;
    const mainW = mainPoles * 28;
    const mainX = -175;
    drawRealisticBreaker3D(mainX, railY1, mainW, 82, 44, {
      title: 'DJ GERAL',
      rating: `${board.mainBreakerA}A`,
      curve: 'Curva C',
      poles: mainPoles,
      leverColor: '#ef4444'
    });

    // 5b. Interruptor Diferencial Residual (DR / IDR 4P 30mA)
    const idrX = -55;
    const idrBox = drawBoardCuboid(idrX, railY1, 10, 96, 82, 44, {
      top: '#f8fafc',
      side: '#cbd5e1',
      front: '#f1f5f9',
      stroke: '#475569'
    });
    // Alavanca Azul do DR + Botão de Teste "T"
    drawBoardCuboid(idrX - 18, railY1 + 4, 54, 42, 14, 12, {
      top: '#0284c7',
      side: '#0369a1',
      front: '#38bdf8',
      stroke: '#0c4a6e'
    });
    const testBtn = drawBoardCuboid(idrX + 24, railY1 - 14, 54, 18, 14, 6, {
      top: '#eab308',
      side: '#ca8a04',
      front: '#facc15',
      stroke: '#713f12'
    });
    boardCtx.fillStyle = '#0f172a';
    boardCtx.font = `800 ${Math.round(9 * boardZoom)}px Inter, sans-serif`;
    boardCtx.fillText('T', testBtn.centerFront.x, testBtn.centerFront.y + 3);
    boardCtx.fillStyle = '#0284c7';
    boardCtx.font = `800 ${Math.round(9.5 * boardZoom)}px JetBrains Mono, monospace`;
    boardCtx.fillText(`IDR ${board.idrMainA}A / 30mA`, idrBox.centerFront.x, idrBox.centerFront.y - 25 * boardZoom);
    boardCtx.fillStyle = '#334155';
    boardCtx.fillText('PROTEÇÃO DR', idrBox.centerFront.x, idrBox.centerFront.y + 30 * boardZoom);

    // 5c. DPS Classe II (Cartuchos Vermelhos 275V 20kA/45kA)
    const dpsCount = project.supply.system === 'Trifásico' ? 4 : 3;
    for (let i = 0; i < dpsCount; i++) {
      const dx = 35 + i * 26;
      // Base branca DIN do DPS
      drawBoardCuboid(dx, railY1, 10, 23, 80, 38, {
        top: '#e2e8f0',
        side: '#94a3b8',
        front: '#cbd5e1',
        stroke: '#475569'
      });
      // Cartucho plugável vermelho do DPS
      const cart = drawBoardCuboid(dx, railY1, 48, 19, 54, 8, {
        top: '#dc2626',
        side: '#991b1b',
        front: '#ef4444',
        stroke: '#7f1d1d'
      });
      // Visor verde de status OK do DPS
      const visor = projectBoardPt(dx, railY1 - 12, 57);
      boardCtx.fillStyle = '#22c55e';
      boardCtx.fillRect(visor.x - 4 * boardZoom, visor.y - 3 * boardZoom, 8 * boardZoom, 5 * boardZoom);
      boardCtx.fillStyle = '#ffffff';
      boardCtx.font = `700 ${Math.round(7.5 * boardZoom)}px JetBrains Mono, monospace`;
      boardCtx.fillText(i === dpsCount - 1 ? 'PE' : `F${i + 1}`, cart.centerFront.x, cart.centerFront.y + 14 * boardZoom);
    }
    const dpsHeader = projectBoardPt(35 + ((dpsCount - 1) * 26) / 2, railY1 - 54, 48);
    boardCtx.fillStyle = '#f87171';
    boardCtx.font = `800 ${Math.round(9.5 * boardZoom)}px JetBrains Mono, monospace`;
    boardCtx.fillText('DPS CLASSE II 275V 20kA', dpsHeader.x, dpsHeader.y);

    // 5d. Bornes de Passagem DIN (Cinza/Azul/Verde) na direita do trilho superior
    for (let b = 0; b < 5; b++) {
      const bx = 158 + b * 14;
      const bColor = b === 3 ? '#0ea5e9' : b === 4 ? '#22c55e' : '#94a3b8';
      drawBoardCuboid(bx, railY1, 10, 11, 74, 36, {
        top: bColor,
        side: '#475569',
        front: bColor,
        stroke: '#1e293b'
      });
    }
    const borneLbl = projectBoardPt(186, railY1 - 52, 46);
    boardCtx.fillStyle = '#cbd5e1';
    boardCtx.fillText('BORNES DIN', borneLbl.x, borneLbl.y);

    // 6. TRILHO INFERIOR: Barramento Pente de Fases (Cobre) + Disjuntores Terminais C1..Cn
    let cursorX = -210;
    const maxCircuitsRender = Math.min(evaluated.length, 12);

    // Pente de barramento de cobre isolado no topo dos disjuntores terminais
    drawBoardCuboid(-20, railY2 - 46, 36, 390, 14, 12, {
      top: '#b45309',
      side: '#92400e',
      front: '#d97706',
      stroke: '#451a03'
    });
    const busLbl = projectBoardPt(-20, railY2 - 60, 48);
    boardCtx.fillStyle = '#fde68a';
    boardCtx.font = `700 ${Math.round(9 * boardZoom)}px JetBrains Mono, monospace`;
    boardCtx.fillText('BARRAMENTO PENTE DE FASES COBRE (R / S / T)', busLbl.x, busLbl.y);

    for (let idx = 0; idx < maxCircuitsRender; idx++) {
      const c = evaluated[idx];
      const wMod = Math.max(1, c.poles || 1) * 24;
      const cx = cursorX + wMod / 2;
      const cTitle = c.id || ('C' + (idx + 1));
      const cRating = c.breakerA ? `${c.breakerA}A` : '16A';
      const cCurve = c.phase ? `Fase ${c.phase}` : 'Curva C';
      drawRealisticBreaker3D(cx, railY2, wMod - 2, 78, 42, {
        title: cTitle,
        rating: cRating,
        curve: cCurve,
        poles: c.poles || 1,
        leverColor: c.type === 'tue' ? '#f43f5e' : c.type === 'iluminacao' ? '#eab308' : '#0ea5e9'
      });
      cursorX += wMod + 4;
      if (cursorX > 205) break;
    }

    // 7. Cabeamento Interno 3D Profissional (Canva / Infográfico / Render Industrial NBR 5410)
    if (showBoardWiring) {
      const feederGauge = (board && (board.mainCableMm2 || board.feederCableMm2)) || 16;

      // 7a. Alimentação Geral da Entrada (Topo do QDC -> Geral / IDR / Barramento PE)
      for (let p = 0; p < mainPoles; p++) {
        const px = mainX - mainW / 2 + (mainW / mainPoles) * (p + 0.5);
        const pColor = p === 0 ? CABLE_COLORS.phaseR : (p === 1 ? CABLE_COLORS.phaseS : CABLE_COLORS.phaseT);
        const pTag = mainPoles === 1 ? 'FASE' : (p === 0 ? 'L1 (R)' : (p === 1 ? 'L2 (S)' : 'L3 (T)'));
        drawProCable3D([
          { x: px, y: -205, z: 28 },
          { x: px, y: -132, z: 28 },
          { x: px, y: -115, z: 36 },
          { x: px, y: railY1 - 32, z: 42 }
        ], pColor, 3.4, {
          ferruleEnd: true,
          tag: pTag,
          tagSub: `${feederGauge}mm²`,
          tagPos: 0.38,
          zipTie: true,
          zipTiePos: 0.16
        });
      }

      // Neutro Geral de Entrada -> Topo do IDR
      drawProCable3D([
        { x: -120, y: -205, z: 28 },
        { x: -120, y: -122, z: 26 },
        { x: idrX + 28, y: -122, z: 32 },
        { x: idrX + 28, y: railY1 - 32, z: 42 }
      ], CABLE_COLORS.neutral, 3.4, {
        ferruleEnd: true,
        tag: 'NEUTRO',
        tagSub: `${feederGauge}mm²`,
        tagPos: 0.38,
        zipTie: true,
        zipTiePos: 0.18
      });

      // Terra Geral de Entrada -> Barramento PE
      drawProCable3D([
        { x: 120, y: -205, z: 28 },
        { x: 120, y: -175, z: 28 },
        { x: 145, y: -162, z: 24 }
      ], CABLE_COLORS.earth, 3.4, {
        ferruleEnd: true,
        tag: 'PE (TERRA)',
        tagSub: `${feederGauge}mm²`,
        tagPos: 0.42
      });

      // 7b. Interligação Disjuntor Geral -> IDR Tetrapolar (Jumpers com Canaleta)
      for (let p = 0; p < mainPoles; p++) {
        const px = mainX - mainW / 2 + (mainW / mainPoles) * (p + 0.5);
        const idrInX = idrX - 34 + p * 22;
        const pColor = p === 0 ? CABLE_COLORS.phaseR : (p === 1 ? CABLE_COLORS.phaseS : CABLE_COLORS.phaseT);
        drawProCable3D([
          { x: px, y: railY1 + 32, z: 42 },
          { x: px, y: 15, z: 26 },
          { x: idrInX, y: 15, z: 26 },
          { x: idrInX, y: railY1 + 32, z: 42 }
        ], pColor, 3.2, {
          ferruleStart: true,
          ferruleEnd: true,
          tag: `L${p + 1}`,
          tagPos: 0.5
        });
      }

      // 7c. Saída de Fases do IDR -> Barramento Pente de Cobre
      drawProCable3D([
        { x: idrX - 16, y: railY1 + 32, z: 42 },
        { x: idrX - 16, y: 30, z: 26 },
        { x: -185, y: 30, z: 26 },
        { x: -185, y: railY2 - 46, z: 38 }
      ], CABLE_COLORS.phaseR, 3.4, {
        ferruleStart: true,
        ferruleEnd: true,
        tag: 'ALIM. PENTE',
        tagSub: `${feederGauge}mm²`,
        tagPos: 0.45,
        zipTie: true,
        zipTiePos: 0.22
      });

      // 7d. Saída de Neutro do IDR -> Barramento de Neutro
      drawProCable3D([
        { x: idrX + 28, y: railY1 + 32, z: 42 },
        { x: idrX + 28, y: 15, z: 26 },
        { x: -228, y: 15, z: 26 },
        { x: -228, y: -162, z: 22 },
        { x: -185, y: -162, z: 23 }
      ], CABLE_COLORS.neutral, 3.4, {
        ferruleStart: true,
        ferruleEnd: true,
        tag: 'N (IDR)',
        tagSub: `${feederGauge}mm²`,
        tagPos: 0.35,
        zipTie: true,
        zipTiePos: 0.2
      });

      // 7e. Proteção contra Surtos DPS Classe II -> Barramento PE & Derivações de Fase
      for (let i = 0; i < dpsCount; i++) {
        const dx = 35 + i * 26;
        if (i < dpsCount - 1) {
          const tapColor = i === 0 ? CABLE_COLORS.phaseR : (i === 1 ? CABLE_COLORS.phaseS : CABLE_COLORS.phaseT);
          drawProCable3D([
            { x: dx, y: -122, z: 26 },
            { x: dx, y: railY1 - 30, z: 38 }
          ], tapColor, 2.5, {
            ferruleEnd: true,
            tag: `DPS F${i + 1}`,
            tagPos: 0.5
          });
        }
        drawProCable3D([
          { x: dx, y: railY1 + 32, z: 30 },
          { x: dx, y: 15, z: 24 },
          { x: 228, y: 15, z: 24 },
          { x: 228, y: -162, z: 22 },
          { x: 195 - i * 12, y: -162, z: 23 }
        ], CABLE_COLORS.earth, 2.6, {
          ferruleStart: true,
          ferruleEnd: true,
          tag: i === dpsCount - 1 ? 'DPS-PE' : `DPS-T${i + 1}`,
          tagPos: 0.3
        });
      }

      // 7f. Circuitos Terminais de Saída C1..Cn (Fases, Neutros e Terras com Anilhas e Ilhós)
      let cCursorX = -210;
      for (let idx = 0; idx < maxCircuitsRender; idx++) {
        const c = evaluated[idx];
        const wMod = Math.max(1, c.poles || 1) * 24;
        const cx = cCursorX + wMod / 2;
        cCursorX += wMod + 4;
        if (cCursorX > 205) break;

        const cColor = c.type === 'iluminacao'
          ? CABLE_COLORS.circuitLight
          : (c.type === 'tue' ? CABLE_COLORS.circuitPower : (idx % 2 === 0 ? CABLE_COLORS.phaseR : CABLE_COLORS.circuitSpecial));

        const cId = c.id || ('C' + (idx + 1));
        const cGauge = c.sectionMm2 || c.cableMm2 || (c.type === 'iluminacao' ? 1.5 : 2.5);

        // Condutor de Fase do circuito saindo do borne inferior do disjuntor
        drawProCable3D([
          { x: cx, y: railY2 + 28, z: 42 },
          { x: cx, y: 145, z: 30 },
          { x: cx, y: 168, z: 24 },
          { x: cx, y: 205, z: 24 }
        ], cColor, 2.6, {
          ferruleStart: true,
          tag: cId,
          tagSub: `${cGauge}mm²`,
          tagPos: 0.4
        });

        // Condutores de Neutro (Azul) e Terra (Verde) emergindo juntos na canaleta inferior
        drawProCable3D([
          { x: cx + 4, y: 160, z: 22 },
          { x: cx + 4, y: 205, z: 22 }
        ], CABLE_COLORS.neutral, 2.2, {
          noFillet: true
        });

        drawProCable3D([
          { x: cx + 8, y: 160, z: 22 },
          { x: cx + 8, y: 205, z: 22 }
        ], CABLE_COLORS.earth, 2.2, {
          noFillet: true,
          zipTie: true,
          zipTiePos: 0.45
        });
      }
    }

    // 8. Tampa / Espelho Protetor Acrílico Fumê (se ativado)
    if (showBoardCover) {
      drawBoardCuboid(0, 0, 58, 530, 415, 4, {
        top: 'rgba(15, 23, 42, 0.35)',
        side: 'rgba(15, 23, 42, 0.35)',
        front: 'rgba(30, 41, 59, 0.38)',
        stroke: '#f59e0b'
      });
    }
  }

  function drawRealisticBreaker3D(cx, cy, w, h, d, spec) {
    const body = drawBoardCuboid(cx, cy, 10, w, h, d, {
      top: '#f8fafc',
      side: '#cbd5e1',
      front: '#e2e8f0',
      stroke: '#334155'
    });

    // Parafusos de borne superior e inferior de cada polo
    const poles = spec.poles || 1;
    const poleW = w / poles;
    for (let p = 0; p < poles; p++) {
      const px = cx - w / 2 + poleW * (p + 0.5);
      const topScrew = projectBoardPt(px, cy - h * 0.36, 10 + d + 1);
      const botScrew = projectBoardPt(px, cy + h * 0.36, 10 + d + 1);
      [topScrew, botScrew].forEach(sc => {
        boardCtx.beginPath();
        boardCtx.arc(sc.x, sc.y, 3.2 * boardZoom, 0, Math.PI * 2);
        boardCtx.fillStyle = '#475569';
        boardCtx.fill();
        boardCtx.strokeStyle = '#0f172a';
        boardCtx.stroke();
      });
    }

    // Alavanca Termomagnética 3D (ON - Vermelho visível)
    drawBoardCuboid(cx, cy + 2, 10 + d, w * 0.76, 13, 11, {
      top: spec.leverColor || '#0f172a',
      side: '#0f172a',
      front: spec.leverColor || '#1e293b',
      stroke: '#0f172a'
    });

    // Textos impressos no corpo do disjuntor
    boardCtx.fillStyle = '#0f172a';
    boardCtx.font = `800 ${Math.round(9 * boardZoom)}px JetBrains Mono, monospace`;
    boardCtx.textAlign = 'center';
    const brTitle = String(spec.title || '').replace(/undefined/gi, '').trim() || 'DJ';
    boardCtx.fillText(brTitle, body.centerFront.x, body.centerFront.y - 20 * boardZoom);

    boardCtx.fillStyle = '#b45309';
    boardCtx.font = `800 ${Math.round(8.5 * boardZoom)}px JetBrains Mono, monospace`;
    const brRating = String(spec.rating || '').replace(/undefined/gi, '').trim() || '16A';
    boardCtx.fillText(brRating, body.centerFront.x, body.centerFront.y - 9 * boardZoom);

    boardCtx.fillStyle = '#334155';
    boardCtx.font = `700 ${Math.round(7.5 * boardZoom)}px JetBrains Mono, monospace`;
    const brCurve = String(spec.curve || '').replace(/undefined/gi, '').trim() || 'Curva C';
    boardCtx.fillText(brCurve, body.centerFront.x, body.centerFront.y + 21 * boardZoom);
  }

  function captureSnapshotDataUrl() {
    if (!canvas) return null;
    render();
    return canvas.toDataURL('image/png');
  }

  function captureBoardSnapshotDataUrl() {
    if (!boardCanvas) return null;
    renderBoard3D();
    return boardCanvas.toDataURL('image/png');
  }

  return {
    init,
    initBoard3D,
    setProject,
    setWallOpacity,
    setVisualStyle,
    setLayer3D,
    setQuickFilter3D,
    setRoomFilter,
    toggleLightCones,
    resetCamera,
    resetBoardCamera,
    toggleBoardWiring,
    toggleBoardCover,
    resize,
    resizeBoard3D,
    render,
    renderBoard3D,
    captureSnapshotDataUrl,
    captureBoardSnapshotDataUrl
  };
})();
