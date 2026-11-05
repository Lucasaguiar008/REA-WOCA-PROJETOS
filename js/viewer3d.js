// ============================================================================
// VISUALIZADOR 3D BIM / ESTILO AUTODESK REVIT MEP — ARQUITETURA (PORTAS, JANELAS, VÃOS) + ELÉTRICA
// ============================================================================

window.Viewer3D = (function () {
  let canvas = null;
  let ctx = null;
  let project = null;

  // Câmera orbital 3D estilo Revit
  let yaw = 0.68;
  let pitch = 0.56;
  let zoom = 52;
  let panX = 0;
  let panY = 24;
  let wallHeight = 2.80;
  let wallOpacity = 0.26;
  let showLightCones = true;
  let visualStyle = 'realistic'; // 'realistic' | 'shaded' | 'wireframe'

  let isDragging = false;
  let dragMode = 'orbit';
  let lastMouse = { x: 0, y: 0 };
  let hoveredPoint = null;

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
        checkHoverPoint(mx, my);
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
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom = Math.max(22, Math.min(140, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
      render();
    }, { passive: false });

    window.addEventListener('resize', resize);
  }

  function setProject(proj) {
    project = proj;
    if (project && window.NBR5410 && window.NBR5410.ensureProjectOpenings) {
      window.NBR5410.ensureProjectOpenings(project);
    }
    resize();
    render();
  }

  function setWallOpacity(val) {
    wallOpacity = Number(val);
    render();
  }

  function setVisualStyle(style) {
    visualStyle = style;
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
    zoom = 52;
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

  function checkHoverPoint(mx, my) {
    if (!project || !project.points) return;
    const center = getModelCenter();
    let found = null;
    for (const pt of project.points) {
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

  function getModelCenter() {
    if (!project || !project.rooms || project.rooms.length === 0) {
      return { cx: 4, cy: 3 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    project.rooms.forEach(r => {
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

    drawQuad([b3, b2, f2, f3], isWire ? 'transparent' : (colors.top || colors.front), colors.stroke);
    drawQuad([b0, f0, f3, b3], isWire ? 'transparent' : (colors.side || colors.front), colors.stroke);
    drawQuad([f1, b1, b2, f2], isWire ? 'transparent' : (colors.side || colors.front), colors.stroke);
    drawQuad([f0, f1, f2, f3], isWire ? 'transparent' : colors.front, colors.stroke);

    return { toWorld, f0, f1, f2, f3 };
  }

  function drawQuad(pts, fill, stroke, lineWidth = 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    if (fill && fill !== 'transparent') {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  // ==================== RENDERIZAÇÃO PRINCIPAL DO VIEWPORT 3D BIM ====================
  function render() {
    if (!ctx || !canvas || !project) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0a101d');
    bgGrad.addColorStop(0.65, '#131d31');
    bgGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const center = getModelCenter();

    // 1. Eixos de Nível BIM
    drawRevitLevelLines(center);

    // 2. Laje de Piso e Ambientes 3D
    project.rooms.forEach(room => {
      const p0 = project3D(room.x, room.y, 0, center);
      const p1 = project3D(room.x + room.w, room.y, 0, center);
      const p2 = project3D(room.x + room.w, room.y + room.h, 0, center);
      const p3 = project3D(room.x, room.y + room.h, 0, center);

      drawQuad(
        [p0, p1, p2, p3],
        visualStyle === 'wireframe' ? 'rgba(15, 23, 42, 0.2)' : 'rgba(30, 41, 59, 0.78)',
        '#475569',
        1.5
      );

      const pc = project3D(room.x + room.w / 2, room.y + room.h / 2, 0.02, center);
      ctx.fillStyle = 'rgba(203, 213, 225, 0.72)';
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(room.name, pc.x, pc.y);
    });

    // 3. Paredes 3D Extrudadas
    if (wallOpacity > 0.02) {
      project.rooms.forEach(room => {
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
            [b1, b2, t2, t1],
            visualStyle === 'wireframe' ? 'transparent' : `rgba(100, 116, 139, ${wallOpacity})`,
            `rgba(148, 163, 184, ${Math.min(1, wallOpacity + 0.25)})`,
            1
          );
        }
      });
    }

    // 4. FAMÍLIAS ARQUITETÔNICAS 3D: PORTAS, JANELAS E VÃOS LIVRES (Ordenadas por profundidade)
    const sortedOpenings = (project.openings || []).map(op => {
      const room = project.rooms.find(r => r.id === op.roomId);
      const geom = room ? window.NBR5410.getOpeningWorldGeometry(op, room) : null;
      const midZ = Number(op.sillHeight || 0) + Number(op.height || 2.1) / 2;
      const proj = geom ? project3D(geom.cx, geom.cy, midZ, center) : { depth: 0 };
      return { op, room, geom, proj };
    }).filter(item => item.geom).sort((a, b) => a.proj.depth - b.proj.depth);

    sortedOpenings.forEach(({ op, geom }) => {
      drawRevitOpening3D(op, geom, center);
    });

    // 5. Eletrodutos 3D Tubulares Estilo Revit MEP
    project.conduits.forEach(cd => {
      drawRevitConduit3D(cd, center);
    });

    // 6. Famílias Elétricas 3D do Revit (Ordenadas por profundidade)
    const sortedPoints = [...project.points].map(pt => {
      const z = Number(pt.z ?? (pt.category === 'light' ? 2.8 : 0.3));
      const proj = project3D(pt.x, pt.y, z, center);
      return { pt, z, proj };
    }).sort((a, b) => a.proj.depth - b.proj.depth);

    sortedPoints.forEach(({ pt, z, proj }) => {
      drawRevitMEPFamily(pt, z, proj, center);
    });

    // 7. ViewCube interativo no canto superior direito
    drawRevitViewCube();
  }

  // ==================== DESENHO 3D DE PORTAS, JANELAS E VÃOS (REVIT ARCHITECTURE) ====================
  function drawRevitOpening3D(op, geom, center) {
    const z0 = Number(op.sillHeight || 0.0);
    const h = Number(op.height || 2.10);
    const z1 = Math.min(wallHeight - 0.05, z0 + h);
    const isWire = visualStyle === 'wireframe';

    // Vértices do vão recortado na parede
    const pBL = project3D(geom.x1, geom.y1, z0, center);
    const pBR = project3D(geom.x2, geom.y2, z0, center);
    const pTR = project3D(geom.x2, geom.y2, z1, center);
    const pTL = project3D(geom.x1, geom.y1, z1, center);

    if (op.type === 'door') {
      // 1. Vão escuro aberto da porta + Batente/Alizar 3D
      drawQuad(
        [pBL, pBR, pTR, pTL],
        isWire ? 'transparent' : 'rgba(11, 17, 32, 0.72)',
        '#d97706',
        2.4
      );

      // 2. Folha da Porta 3D aberta a 55° (respeitando o lado da dobradiça e sentido in/out!)
      const swing = op.swing || 'in-left';
      const hingeAtStart = swing.endsWith('left');
      const dirSign = swing.startsWith('in') ? 1 : -1;
      const hx = hingeAtStart ? geom.x1 : geom.x2;
      const hy = hingeAtStart ? geom.y1 : geom.y2;
      const tDir = hingeAtStart ? 1 : -1;

      const openAngle = 0.95; // ~55 graus em 3D
      const cosA = Math.cos(openAngle);
      const sinA = Math.sin(openAngle);
      const doorW = geom.width;

      // Extremidade livre da folha da porta aberta no espaço 3D
      const ex = hx + (geom.tx * tDir * cosA + geom.nx * dirSign * sinA) * doorW;
      const ey = hy + (geom.ty * tDir * cosA + geom.ny * dirSign * sinA) * doorW;

      const dHingeBot = project3D(hx, hy, z0, center);
      const dHingeTop = project3D(hx, hy, z1, center);
      const dFreeTop = project3D(ex, ey, z1, center);
      const dFreeBot = project3D(ex, ey, z0, center);

      // Arco de abertura 3D no piso (projeção BIM)
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

      // Folha 3D em madeira/verniz
      drawQuad(
        [dHingeBot, dFreeBot, dFreeTop, dHingeTop],
        isWire ? 'transparent' : 'rgba(180, 83, 9, 0.86)',
        '#fde68a',
        1.8
      );

      // Maçaneta cromada 3D a z = 1.00m perto da extremidade livre
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
      // FAMÍLIA REVIT 3D: JANELA DE CORRER EM ALUMÍNIO E VIDRO TEMPERADO
      drawQuad(
        [pBL, pBR, pTR, pTL],
        isWire ? 'transparent' : 'rgba(56, 189, 248, 0.30)',
        '#e2e8f0',
        2.4
      );

      // Divisória central vertical (2 folhas de correr) e travessa
      const pMidB = project3D(geom.cx, geom.cy, z0, center);
      const pMidT = project3D(geom.cx, geom.cy, z1, center);
      ctx.save();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(pMidB.x, pMidB.y);
      ctx.lineTo(pMidT.x, pMidT.y);
      ctx.stroke();

      // Peitoril saliente em granito/concreto na base da janela
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pBL.x, pBL.y);
      ctx.lineTo(pBR.x, pBR.y);
      ctx.stroke();
      ctx.restore();
    } else if (op.type === 'opening') {
      // FAMÍLIA REVIT 3D: VÃO LIVRE / PASSAGEM ARQUITETÔNICA
      drawQuad(
        [pBL, pBR, pTR, pTL],
        isWire ? 'transparent' : 'rgba(15, 23, 42, 0.55)',
        '#c084fc',
        2.0
      );
    }

    // Etiqueta 3D discreta na verga da porta/janela/vão
    const pTopMid = project3D(geom.cx, geom.cy, z1 + 0.12, center);
    ctx.save();
    ctx.fillStyle = op.type === 'window' ? '#7dd3fc' : op.type === 'opening' ? '#d8b4fe' : '#fde68a';
    ctx.font = '700 9.5px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${op.label || op.type.toUpperCase()} (${geom.width.toFixed(2)}×${h.toFixed(2)}m)`, pTopMid.x, pTopMid.y);
    ctx.restore();
  }

  function drawRevitLevelLines(center) {
    if (!project || !project.rooms || project.rooms.length === 0) return;
    let maxX = -Infinity, minY = Infinity;
    project.rooms.forEach(r => {
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
    const slabZ = cd.mounting === 'piso' ? 0.04 : wallHeight;

    const a = project3D(pt1.x, pt1.y, z1, center);
    const aTop = project3D(pt1.x, pt1.y, slabZ, center);
    const bTop = project3D(pt2.x, pt2.y, slabZ, center);
    const b = project3D(pt2.x, pt2.y, z2, center);

    const outerColor = cd.mounting === 'parede' ? '#0284c7' : cd.mounting === 'piso' ? '#7e22ce' : '#d97706';
    const highlightColor = cd.mounting === 'parede' ? '#7dd3fc' : cd.mounting === 'piso' ? '#d8b4fe' : '#fde68a';
    const thickness = cd.diameterMm >= 25 ? 5.2 : 3.8;

    ctx.save();
    ctx.lineCap = 'round';
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
      ctx.arc(joint.x, joint.y, thickness * 0.72, 0, Math.PI * 2);
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
    } else if (pt.category === 'light') {
      drawRevitCeilingFixture3D(pt, z, center, pos3d, floor3d);
    } else if (pt.category === 'switch') {
      drawRevitSwitch4x2Family3D(pt, z, basis, center, pos3d);
    } else if (pt.category === 'tug' || pt.category === 'tue') {
      drawRevitOutlet4x2Family3D(pt, z, basis, center, pos3d);
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

  function drawRevitQDCBoard3D(pt, z, basis, center, pos3d) {
    draw3DBox(
      center,
      { x: pt.x, y: pt.y, z },
      basis,
      { w: 0.46, d: 0.08, h: 0.56 },
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
      { w: 0.38, d: 0.01, h: 0.46 },
      { top: '#0f172a', side: '#0f172a', front: '#0f172a', stroke: '#f59e0b' }
    );

    ctx.save();
    for (const rowZ of [0.10, -0.06]) {
      const pL = inner.toWorld(-0.15, 0.015, rowZ);
      const pR = inner.toWorld(0.15, 0.015, rowZ);
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
    if (showLightCones && visualStyle !== 'wireframe') {
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
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawRevitOutlet4x2Family3D(pt, z, basis, center, pos3d) {
    const is20A = pt.category === 'tue' || Number(pt.powerVA) >= 600;

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

    const modW = 14;
    const modH = 9;
    ctx.beginPath();
    ctx.moveTo(-modW * 0.65, -modH / 2);
    ctx.lineTo(modW * 0.65, -modH / 2);
    ctx.lineTo(modW * 0.85, 0);
    ctx.lineTo(modW * 0.65, modH / 2);
    ctx.lineTo(-modW * 0.65, modH / 2);
    ctx.lineTo(-modW * 0.85, 0);
    ctx.closePath();
    ctx.fillStyle = is20A ? '#dc2626' : '#e2e8f0';
    ctx.fill();
    ctx.strokeStyle = is20A ? '#7f1d1d' : '#64748b';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const holeColor = is20A ? '#ffffff' : '#0f172a';
    const holeRadius = is20A ? 1.55 : 1.3;
    [
      { x: -4.2, y: 0.6 },
      { x: 0, y: -1.4 },
      { x: 4.2, y: 0.6 }
    ].forEach(h => {
      ctx.beginPath();
      ctx.arc(h.x, h.y, holeRadius, 0, Math.PI * 2);
      ctx.fillStyle = holeColor;
      ctx.fill();
    });

    ctx.restore();
  }

  function drawRevitSwitch4x2Family3D(pt, z, basis, center, pos3d) {
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
    ctx.fillRect(-6, -4.5, 12, 9);
    ctx.strokeRect(-6, -4.5, 12, 9);

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-3.5, 0);
    ctx.lineTo(3.5, 0);
    ctx.stroke();
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

  return {
    init,
    setProject,
    setWallOpacity,
    setVisualStyle,
    toggleLightCones,
    resetCamera,
    resize,
    render
  };
})();
