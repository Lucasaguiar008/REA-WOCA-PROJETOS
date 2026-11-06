// ============================================================================
// MOTOR DE CÁLCULO E AUTOMAÇÃO NBR 5410 — LUCAS AGUIAR PROJETOS ELÉTRICOS
// ============================================================================

window.NBR5410 = (function () {
  // Tabela 36 NBR 5410 - Capacidade de condução de corrente (A) - Método B1 (Eletroduto embutido em alvenaria, PVC 70°C)
  const AMPACITY_TABLE_B1 = [
    { section: 1.5, iz2: 17.5, iz3: 15.5, ohmKm: 12.1 },
    { section: 2.5, iz2: 24.0, iz3: 21.0, ohmKm: 7.41 },
    { section: 4.0, iz2: 32.0, iz3: 28.0, ohmKm: 4.61 },
    { section: 6.0, iz2: 41.0, iz3: 36.0, ohmKm: 3.08 },
    { section: 10.0, iz2: 57.0, iz3: 50.0, ohmKm: 1.83 },
    { section: 16.0, iz2: 76.0, iz3: 68.0, ohmKm: 1.15 },
    { section: 25.0, iz2: 101.0, iz3: 89.0, ohmKm: 0.727 },
    { section: 35.0, iz2: 125.0, iz3: 110.0, ohmKm: 0.524 }
  ];

  const STANDARD_BREAKERS = [10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100];

  // Fator de correção de agrupamento (Tabela 42 NBR 5410)
  const GROUPING_FACTORS = {
    1: 1.00,
    2: 0.80,
    3: 0.70,
    4: 0.65,
    5: 0.60,
    6: 0.57
  };

  // Tipos de ambiente e regras NBR 5410
  const ROOM_TYPES = {
    sala: { label: 'Sala de Estar / Jantar', perimeterStep: 5.0, highPowerTugs: 0, wetArea: false, color: '#1e3a5f' },
    quarto: { label: 'Dormitório / Suíte', perimeterStep: 5.0, highPowerTugs: 0, wetArea: false, color: '#24304c' },
    cozinha: { label: 'Cozinha / Copa', perimeterStep: 3.5, highPowerTugs: 3, wetArea: true, color: '#3b2820' },
    servico: { label: 'Área de Serviço / Lavanderia', perimeterStep: 3.5, highPowerTugs: 3, wetArea: true, color: '#2d3748' },
    banheiro: { label: 'Banheiro / Lavabo', perimeterStep: 0, highPowerTugs: 1, wetArea: true, color: '#163d4a' },
    corredor: { label: 'Circulação / Hall', perimeterStep: 0, highPowerTugs: 0, wetArea: false, color: '#1f2937' },
    garagem: { label: 'Garagem / Varanda', perimeterStep: 5.0, highPowerTugs: 1, wetArea: true, color: '#27272a' },
    escritorio: { label: 'Escritório / Home Office', perimeterStep: 4.0, highPowerTugs: 0, wetArea: false, color: '#262b44' }
  };

  // Calcula cargas mínimas exigidas pela NBR 5410 para um cômodo
  function calculateRoomNormativeMinimums(room) {
    const area = +(room.w * room.h).toFixed(2);
    const perimeter = +(2 * (room.w + room.h)).toFixed(2);
    const typeInfo = ROOM_TYPES[room.type] || ROOM_TYPES.sala;

    // 1. Iluminação (9.5.2.1.2 NBR 5410)
    let minLightingVA = 100;
    if (area > 6) {
      const extraSteps = Math.floor((area - 6) / 4);
      minLightingVA = 100 + extraSteps * 60;
    }

    // 2. TUGs (9.5.2.2.1 NBR 5410)
    let minTugCount = 1;
    if (room.type === 'banheiro') {
      minTugCount = 1;
    } else if (room.type === 'corredor') {
      minTugCount = 1;
    } else if (typeInfo.perimeterStep > 0) {
      minTugCount = Math.max(1, Math.ceil(perimeter / typeInfo.perimeterStep));
    }

    const highCount = Math.min(minTugCount, typeInfo.highPowerTugs);
    const lowCount = Math.max(0, minTugCount - highCount);
    const minTugVA = highCount * 600 + lowCount * 100;

    return {
      area,
      perimeter,
      typeLabel: typeInfo.label,
      wetArea: typeInfo.wetArea,
      minLightingVA,
      minTugCount,
      highCount,
      lowCount,
      minTugVA
    };
  }

  // Analisa pontos reais lançados dentro de um cômodo e compara com a NBR 5410
  function inspectRoomCompliance(room, allPoints) {
    const norms = calculateRoomNormativeMinimums(room);
    const roomPoints = allPoints.filter(p => isPointInRoom(p, room));

    let installedLightingVA = 0;
    let installedTugCount = 0;
    let installedTugVA = 0;
    let installedTueVA = 0;
    const tueList = [];

    roomPoints.forEach(pt => {
      if (pt.category === 'light') {
        installedLightingVA += Number(pt.powerVA || 100);
      } else if (pt.category === 'tug') {
        const mult = pt.subtype === 'tug_tripla' ? 3 : pt.subtype === 'tug_dupla' ? 2 : 1;
        installedTugCount += mult;
        installedTugVA += Number(pt.powerVA || (100 * mult));
      } else if (pt.category === 'tue') {
        installedTueVA += Number(pt.powerVA || 0);
        tueList.push(pt.label || 'TUE');
      }
    });

    const lightOk = installedLightingVA >= norms.minLightingVA;
    const tugCountOk = installedTugCount >= norms.minTugCount;
    const tugPowerOk = installedTugVA >= norms.minTugVA;
    const compliant = lightOk && tugCountOk && tugPowerOk;

    return {
      ...norms,
      installedLightingVA,
      installedTugCount,
      installedTugVA,
      installedTueVA,
      tueList,
      lightOk,
      tugCountOk,
      tugPowerOk,
      compliant
    };
  }

  function isPointInRoom(pt, room) {
    if (pt.roomId && pt.roomId === room.id) return true;
    return (
      pt.x >= room.x - 0.15 &&
      pt.x <= room.x + room.w + 0.15 &&
      pt.y >= room.y - 0.15 &&
      pt.y <= room.y + room.h + 0.15
    );
  }

  // Verifica se um candidato (x, y) na parede colide com alguma porta ou vão livre (do próprio cômodo ou cômodo adjacente)
  function isPointCollidingWithDoorOrOpening(x, y, project, marginMeters = 0.22) {
    if (!project || !Array.isArray(project.openings)) return false;
    for (const op of project.openings) {
      // Portas e vãos livres não têm parede física; janelas altas permitem tomada baixa, mas evitamos sobrepor se possível
      if (op.type !== 'door' && op.type !== 'opening') continue;
      const opRoom = (project.rooms || []).find(r => r.id === op.roomId);
      if (!opRoom) continue;
      const geom = getOpeningWorldGeometry(op, opRoom);
      if (!geom) continue;

      // Distância do ponto (x,y) ao segmento da abertura (x1,y1)-(x2,y2)
      const dx = geom.x2 - geom.x1;
      const dy = geom.y2 - geom.y1;
      const lenSq = dx * dx + dy * dy;
      let t = 0.5;
      if (lenSq > 0.0001) {
        t = Math.max(0, Math.min(1, ((x - geom.x1) * dx + (y - geom.y1) * dy) / lenSq));
      }
      const projX = geom.x1 + t * dx;
      const projY = geom.y1 + t * dy;
      const dist = Math.hypot(x - projX, y - projY);
      if (dist < marginMeters) {
        return true;
      }
    }
    return false;
  }

  // Encontra uma posição segura na parede do cômodo que NÃO colida com portas ou vãos livres
  function findSafeWallPoint(room, preferredWall, preferredT, project, inset = 0.14) {
    const wallOrder = [preferredWall, 'n', 'e', 'w', 's'].filter((v, i, a) => a.indexOf(v) === i);
    const candidateTs = [preferredT, 0.22, 0.78, 0.35, 0.65, 0.15, 0.85, 0.50];

    const evalWallPoint = (w, t) => {
      if (w === 'n') return { x: +(room.x + room.w * t).toFixed(2), y: +(room.y + inset).toFixed(2), wall: 'n' };
      if (w === 's') return { x: +(room.x + room.w * t).toFixed(2), y: +(room.y + room.h - inset).toFixed(2), wall: 's' };
      if (w === 'e') return { x: +(room.x + room.w - inset).toFixed(2), y: +(room.y + room.h * t).toFixed(2), wall: 'e' };
      return { x: +(room.x + inset).toFixed(2), y: +(room.y + room.h * t).toFixed(2), wall: 'w' };
    };

    for (const w of wallOrder) {
      for (const t of candidateTs) {
        const pt = evalWallPoint(w, t);
        if (!isPointCollidingWithDoorOrOpening(pt.x, pt.y, project, 0.24)) {
          return pt;
        }
      }
    }
    return evalWallPoint(preferredWall, preferredT);
  }

  // Posiciona interruptor automaticamente ao lado da maçaneta da porta do cômodo (fora do vão da porta)
  function findSwitchPositionNearRoomDoor(room, project, inset = 0.14) {
    if (project && Array.isArray(project.openings)) {
      const roomDoor = project.openings.find(op => op.roomId === room.id && op.type === 'door');
      if (roomDoor) {
        const w = roomDoor.wall || 's';
        const wallLen = (w === 'n' || w === 's') ? room.w : room.h;
        const halfW = (Number(roomDoor.width) || 0.8) / 2;
        const doorOff = Number(roomDoor.offset) || wallLen / 2;
        // Tenta posicionar a 18cm após a borda da porta ou antes da borda
        const candidates = [doorOff + halfW + 0.20, doorOff - halfW - 0.20];
        for (const off of candidates) {
          if (off >= 0.18 && off <= wallLen - 0.18) {
            const t = off / wallLen;
            const pt = findSafeWallPoint(room, w, t, project, inset);
            if (!isPointCollidingWithDoorOrOpening(pt.x, pt.y, project, 0.18)) {
              return pt;
            }
          }
        }
      }
    }
    return findSafeWallPoint(room, 's', 0.25, project, inset);
  }

  // Sugere e posiciona automaticamente todos os pontos da NBR 5410 na planta + traçado de eletrodutos
  function autoGenerateNormativePointsAndCircuits(project) {
    ensureProjectOpenings(project);
    const newPoints = [];
    const newConduits = [];
    let ptCounter = 1;

    // Mantém ou cria Quadro de Distribuição (QDC) garantindo que não fique em porta ou vão livre
    let qdc = project.points.find(p => p.category === 'qdc');
    const refRoom = project.rooms.find(r => r.type === 'corredor' || r.type === 'cozinha' || r.type === 'sala') || project.rooms[0];
    if (!qdc) {
      const safeQdcPos = refRoom ? findSafeWallPoint(refRoom, 'w', 0.5, project, 0.16) : { x: 2.0, y: 2.0 };
      qdc = {
        id: 'pt-qdc-1',
        category: 'qdc',
        subtype: 'qdc_embutir',
        label: 'QDC-01',
        x: safeQdcPos.x,
        y: safeQdcPos.y,
        z: 1.5,
        powerVA: 0,
        circuitId: null,
        roomId: refRoom ? refRoom.id : null
      };
    } else if (refRoom && isPointCollidingWithDoorOrOpening(qdc.x, qdc.y, project, 0.25)) {
      const safeQdcPos = findSafeWallPoint(refRoom, 'n', 0.5, project, 0.16);
      qdc.x = safeQdcPos.x;
      qdc.y = safeQdcPos.y;
    }
    newPoints.push(qdc);

    // Criação de circuitos base
    const circuits = [
      { id: 'C1', number: 1, name: 'Iluminação Social / Íntima', type: 'iluminacao', voltage: project.supply.phaseVoltage, pf: 1.0, phase: 'R', dr: false, fca: 0.8 },
      { id: 'C2', number: 2, name: 'Iluminação Serviço / Áreas Molhadas', type: 'iluminacao', voltage: project.supply.phaseVoltage, pf: 1.0, phase: 'S', dr: true, fca: 0.8 },
      { id: 'C3', number: 3, name: 'TUGs Salas e Dormitórios', type: 'tug', voltage: project.supply.phaseVoltage, pf: 0.8, phase: 'R', dr: false, fca: 0.8 },
      { id: 'C4', number: 4, name: 'TUGs Cozinha e Copa', type: 'tug', voltage: project.supply.phaseVoltage, pf: 0.8, phase: 'S', dr: true, fca: 0.8 },
      { id: 'C5', number: 5, name: 'TUGs Área de Serviço e Banheiros', type: 'tug', voltage: project.supply.phaseVoltage, pf: 0.8, phase: 'T', dr: true, fca: 0.8 }
    ];

    let nextCircuitNum = 6;

    project.rooms.forEach((room, rIdx) => {
      const norms = calculateRoomNormativeMinimums(room);
      const cx = +(room.x + room.w / 2).toFixed(2);
      const cy = +(room.y + room.h / 2).toFixed(2);
      const lightCircuitId = norms.wetArea ? 'C2' : 'C1';
      const commandId = `a${rIdx + 1}`;

      // 1. Ponto de Luz no Teto
      const lightPt = {
        id: `pt-auto-${ptCounter++}`,
        category: 'light',
        subtype: 'luz_teto',
        label: `Luz ${room.name}`,
        command: commandId,
        x: cx,
        y: cy,
        z: 2.8,
        powerVA: norms.minLightingVA,
        circuitId: lightCircuitId,
        roomId: room.id
      };
      newPoints.push(lightPt);

      // 2. Interruptor próximo à porta/entrada do cômodo (sem colidir com vão/porta)
      const swPos = findSwitchPositionNearRoomDoor(room, project, 0.14);
      const swPt = {
        id: `pt-auto-${ptCounter++}`,
        category: 'switch',
        subtype: 'int_simples',
        label: `Int. ${room.name}`,
        command: commandId,
        x: swPos.x,
        y: swPos.y,
        z: 1.2,
        powerVA: 0,
        circuitId: lightCircuitId,
        roomId: room.id
      };
      newPoints.push(swPt);

      // Eletroduto QDC -> Luz Teto -> Interruptor
      newConduits.push({
        id: `cd-auto-${ptCounter++}`,
        fromId: qdc.id,
        toId: lightPt.id,
        mounting: 'laje',
        diameterMm: 20
      });
      newConduits.push({
        id: `cd-auto-${ptCounter++}`,
        fromId: lightPt.id,
        toId: swPt.id,
        mounting: 'parede',
        diameterMm: 20
      });

      // 3. TUGs distribuídas nas paredes do ambiente (evitando portas e vãos livres)
      const tugCircuitId =
        room.type === 'cozinha'
          ? 'C4'
          : norms.wetArea
            ? 'C5'
            : 'C3';

      const wallPositions = getDistributedWallPositions(room, norms.minTugCount, project);
      wallPositions.forEach((pos, idx) => {
        const isHigh = idx < norms.highCount;
        const tugPt = {
          id: `pt-auto-${ptCounter++}`,
          category: 'tug',
          subtype: isHigh ? 'tug_media' : 'tug_baixa',
          label: isHigh ? 'TUG 600VA' : 'TUG 100VA',
          x: pos.x,
          y: pos.y,
          z: isHigh ? 1.3 : 0.3,
          powerVA: isHigh ? 600 : 100,
          circuitId: tugCircuitId,
          roomId: room.id
        };
        newPoints.push(tugPt);
        newConduits.push({
          id: `cd-auto-${ptCounter++}`,
          idCircuit: tugCircuitId,
          fromId: lightPt.id,
          toId: tugPt.id,
          mounting: 'parede',
          diameterMm: 20
        });
      });

      // 4. TUEs automáticas por tipo de ambiente (Chuveiro no Banheiro, Ar-Condicionado em Quarto/Sala, Torneira na Cozinha)
      if (room.type === 'banheiro') {
        const cId = `C${nextCircuitNum}`;
        const vTue = project.supply.lineVoltage || 220;
        circuits.push({
          id: cId,
          number: nextCircuitNum++,
          name: `Chuveiro Elétrico (${room.name})`,
          type: 'tue',
          voltage: vTue,
          pf: 1.0,
          phase: 'R+S',
          dr: true,
          fca: 1.0
        });
        const tuePos = findSafeWallPoint(room, 'e', 0.5, project, 0.14);
        const tuePt = {
          id: `pt-auto-${ptCounter++}`,
          category: 'tue',
          subtype: 'tue_alta',
          label: 'Chuveiro 6800W',
          x: tuePos.x,
          y: tuePos.y,
          z: 2.2,
          powerVA: 6800,
          circuitId: cId,
          roomId: room.id
        };
        newPoints.push(tuePt);
        newConduits.push({
          id: `cd-auto-${ptCounter++}`,
          fromId: qdc.id,
          toId: tuePt.id,
          mounting: 'laje',
          diameterMm: 25
        });
      } else if (room.type === 'quarto') {
        const cId = `C${nextCircuitNum}`;
        const vTue = project.supply.lineVoltage || 220;
        circuits.push({
          id: cId,
          number: nextCircuitNum++,
          name: `Ar-Condicionado Split (${room.name})`,
          type: 'tue',
          voltage: vTue,
          pf: 0.92,
          phase: 'S+T',
          dr: false,
          fca: 0.8
        });
        const tuePos = findSafeWallPoint(room, 'n', 0.5, project, 0.14);
        const tuePt = {
          id: `pt-auto-${ptCounter++}`,
          category: 'tue',
          subtype: 'tue_alta',
          label: 'Split 12000 BTU',
          x: tuePos.x,
          y: tuePos.y,
          z: 2.2,
          powerVA: 1400,
          circuitId: cId,
          roomId: room.id
        };
        newPoints.push(tuePt);
        newConduits.push({
          id: `cd-auto-${ptCounter++}`,
          fromId: lightPt.id,
          toId: tuePt.id,
          mounting: 'parede',
          diameterMm: 20
        });
      }
    });

    project.points = newPoints;
    project.conduits = newConduits;
    project.circuits = circuits;
    return project;
  }

  function getDistributedWallPositions(room, count, project) {
    const positions = [];
    const margin = 0.14;
    const wallCodes = ['n', 'e', 'w', 's'];

    for (let i = 0; i < count; i++) {
      const wallCode = wallCodes[i % wallCodes.length];
      const slot = Math.floor(i / wallCodes.length);
      const preferredT = slot === 0 ? 0.5 : slot % 2 === 1 ? 0.28 : 0.72;
      const safePt = findSafeWallPoint(room, wallCode, preferredT, project, margin);
      // Evita duplicar exatamente a mesma coordenada caso uma parede inteira seja vão livre
      const tooClose = positions.some(p => Math.hypot(p.x - safePt.x, p.y - safePt.y) < 0.25);
      if (tooClose) {
        const altWall = wallCodes[(i + 1) % wallCodes.length];
        positions.push(findSafeWallPoint(room, altWall, (preferredT + 0.23) % 0.8 + 0.1, project, margin));
      } else {
        positions.push(safePt);
      }
    }
    return positions;
  }

  // Dimensiona automaticamente todos os circuitos do projeto conforme NBR 5410
  function evaluateProjectCircuits(project) {
    const qdc = project.points.find(p => p.category === 'qdc') || { x: 0, y: 0 };

    return project.circuits.map((circuit, idx) => {
      const assignedPoints = project.points.filter(p => p.circuitId === circuit.id);
      const totalVA = assignedPoints.reduce((acc, p) => acc + Number(p.powerVA || 0), 0);
      const pf = Number(circuit.pf || (circuit.type === 'iluminacao' ? 1.0 : 0.8));
      const totalW = +(totalVA * pf).toFixed(0);
      const voltage = Number(circuit.voltage || project.supply.phaseVoltage || 127);

      // Distância máxima até o ponto mais distante do circuito (com fator de verticalidade +2.5m)
      let maxDistMeters = 12;
      assignedPoints.forEach(p => {
        const d = Math.hypot(p.x - qdc.x, p.y - qdc.y) * 1.25 + 2.5;
        if (d > maxDistMeters) maxDistMeters = d;
      });
      maxDistMeters = +maxDistMeters.toFixed(1);

      // Corrente de projeto Ib
      const isThreePhase = circuit.phase && circuit.phase.split('+').length === 3;
      const ib = isThreePhase
        ? totalVA / (Math.sqrt(3) * voltage)
        : totalVA / Math.max(voltage, 1);

      const fca = Number(circuit.fca || 0.80);
      const fct = 1.00; // 30°C ambiente
      const ibCorrected = ib / (fca * fct);

      // Seção mínima normativa (Tabela 47 NBR 5410): 1.5 mm² iluminação, 2.5 mm² força
      const minNormativeSection = circuit.type === 'iluminacao' ? 1.5 : 2.5;
      const loadedConductors = (circuit.phase && circuit.phase.includes('+')) ? 3 : 2;

      // Seleção do condutor por capacidade de condução E queda de tensão (máx 4%)
      let chosenRow = AMPACITY_TABLE_B1.find(r => r.section >= minNormativeSection);
      for (const row of AMPACITY_TABLE_B1) {
        if (row.section < minNormativeSection) continue;
        const izBase = loadedConductors === 3 ? row.iz3 : row.iz2;
        const izReal = izBase * fca * fct;
        const vDropPercent = ((2 * maxDistMeters * ib * row.ohmKm) / (1000 * voltage)) * 100;
        if (izReal >= ib && vDropPercent <= 4.0) {
          chosenRow = row;
          break;
        }
      }
      if (!chosenRow) chosenRow = AMPACITY_TABLE_B1[AMPACITY_TABLE_B1.length - 1];

      const izBase = loadedConductors === 3 ? chosenRow.iz3 : chosenRow.iz2;
      const izReal = +(izBase * fca * fct).toFixed(1);
      const voltageDropPercent = +(((2 * maxDistMeters * ib * chosenRow.ohmKm) / (1000 * voltage)) * 100).toFixed(2);

      // Escolha do Disjuntor (Ib <= In <= Iz)
      let breakerA = STANDARD_BREAKERS.find(b => b >= Math.max(ib, 10) && b <= izReal);
      if (!breakerA) {
        breakerA = STANDARD_BREAKERS.find(b => b >= Math.max(ib, 10)) || 16;
      }

      const poles = circuit.phase && circuit.phase.includes('+')
        ? circuit.phase.split('+').length
        : 1;
      const curve = circuit.type === 'iluminacao' || (circuit.type === 'tue' && pf === 1.0) ? 'B' : 'C';

      // Eletroduto mínimo por ocupação (NBR 5410 item 6.2.11.1.6: máx 40% para 3 ou mais condutores)
      const conductorCount = poles + (poles === 1 || circuit.type !== 'tue' ? 1 : 0) + 1 + (circuit.type === 'iluminacao' ? 1 : 0);
      // Área externa aproximada do cabo isolado 750V (mm²) conforme seção nominal
      const cableOuterAreaMap = { 1.5: 7.1, 2.5: 10.2, 4.0: 13.8, 6.0: 18.9, 10.0: 30.2, 16.0: 43.0, 25.0: 66.5, 35.0: 88.2 };
      const singleWireOuterArea = cableOuterAreaMap[chosenRow.section] || 12.0;
      const totalWireOuterArea = +(conductorCount * singleWireOuterArea).toFixed(1);

      // Áreas internas úteis dos eletrodutos comerciais PVC (mm²) e limite de 40%
      const conduitSizes = [
        { mm: 20, inch: '3/4"', internalArea: 215 },
        { mm: 25, inch: '1"', internalArea: 360 },
        { mm: 32, inch: '1.1/4"', internalArea: 615 },
        { mm: 40, inch: '1.1/2"', internalArea: 960 },
        { mm: 50, inch: '2"', internalArea: 1590 }
      ];
      let chosenConduit = conduitSizes.find(cd => (totalWireOuterArea / cd.internalArea) <= 0.40 && (chosenRow.section < 6 || cd.mm >= 25)) || conduitSizes[conduitSizes.length - 1];
      const conduitMm = chosenConduit.mm;
      const conduitInch = chosenConduit.inch;
      const conduitOccupancyPct = Math.min(99, Math.round((totalWireOuterArea / chosenConduit.internalArea) * 100));

      // Alocação de fase
      const phase = circuit.phase || ['R', 'S', 'T'][idx % 3];
      const boardId = circuit.boardId || 'QDC-01';

      return {
        ...circuit,
        boardId,
        pointsCount: assignedPoints.length,
        totalVA,
        totalW,
        pf,
        voltage,
        maxDistMeters,
        ib: +ib.toFixed(2),
        fca,
        ibCorrected: +ibCorrected.toFixed(2),
        sectionMm2: chosenRow.section,
        izReal,
        voltageDropPercent,
        breakerA,
        poles,
        curve,
        conduitMm,
        conduitInch,
        conductorCount,
        conduitOccupancyPct,
        phase,
        statusOk: ib <= breakerA && breakerA <= izReal + 2 && voltageDropPercent <= 4.0
      };
    });
  }

  // Calcula balanceamento entre fases R, S, T, Demanda Total do Quadro (QDC) e Padrão de Entrada da Concessionária
  function calculateBoardSummary(project, evaluatedCircuits) {
    const phases = { R: 0, S: 0, T: 0 };
    let totalInstalledVA = 0;
    let totalInstalledW = 0;
    let ilumTugVA = 0;
    let tueVA = 0;

    evaluatedCircuits.forEach(c => {
      totalInstalledVA += c.totalVA;
      totalInstalledW += c.totalW;
      if (c.type === 'tue') {
        tueVA += c.totalVA;
      } else {
        ilumTugVA += c.totalVA;
      }

      const parts = String(c.phase || 'R').split('+');
      const share = c.totalVA / parts.length;
      parts.forEach(ph => {
        const key = ph.trim().toUpperCase();
        if (phases[key] !== undefined) {
          phases[key] += share;
        }
      });
    });

    // Fator de demanda típico NBR 5410 / Concessionárias (Iluminação+TUG progressivo + TUE 0.75)
    const fdIlumTug = ilumTugVA <= 1000 ? 0.86 : ilumTugVA <= 3000 ? 0.75 : ilumTugVA <= 6000 ? 0.60 : 0.50;
    const fdTue = 0.75;
    const demandVA = Math.round(ilumTugVA * fdIlumTug + tueVA * fdTue);
    const demandKVA = +(demandVA / 1000).toFixed(2);

    const supplyType = project.supply.system || 'Trifásico';
    const lineV = Number(project.supply.lineVoltage || 220);
    const phaseV = Number(project.supply.phaseVoltage || 127);

    let mainCurrentA = 0;
    if (supplyType === 'Trifásico') {
      mainCurrentA = demandVA / (Math.sqrt(3) * lineV);
    } else if (supplyType === 'Bifásico') {
      mainCurrentA = demandVA / lineV;
    } else {
      mainCurrentA = demandVA / phaseV;
    }

    const mainBreakerA = STANDARD_BREAKERS.find(b => b >= Math.max(mainCurrentA * 1.1, 32)) || 63;
    const mainCableRow = AMPACITY_TABLE_B1.find(r => r.iz3 >= mainBreakerA) || AMPACITY_TABLE_B1[4];
    const mainConduitMm = mainCableRow.section >= 16 ? 40 : mainCableRow.section >= 10 ? 32 : 25;

    const maxPhaseVA = Math.max(phases.R, phases.S, phases.T, 1);
    const minPhaseVA = Math.min(phases.R, phases.S, phases.T);
    const unbalancePercent = +(((maxPhaseVA - minPhaseVA) / maxPhaseVA) * 100).toFixed(1);

    // Dimensionamento do Padrão de Entrada da Concessionária (Item 6)
    const entranceType = project.supply.entranceType || 'Aéreo com Poste Pontalete';
    const utilityName = project.supply.utilityName || 'Concessionária Local (Enel / CPFL / Cemig / Equatorial)';
    const categoryCode =
      supplyType === 'Monofásico'
        ? (demandKVA <= 10 ? 'M1 / C1' : 'M2 / C2')
        : supplyType === 'Bifásico'
          ? (demandKVA <= 15 ? 'B1 / C2' : 'B2 / C3')
          : (demandKVA <= 25 ? 'T1 / C3' : 'T2 / C4');
    const groundRodsCount = supplyType === 'Trifásico' ? 3 : 2;
    const postSteelDaN = mainCableRow.section >= 16 ? 'Poste Concreto/Aço 7,0m - 200 daN' : 'Poste Concreto/Aço 7,0m - 100 daN';

    return {
      phases: {
        R: Math.round(phases.R),
        S: Math.round(phases.S),
        T: Math.round(phases.T)
      },
      totalInstalledVA: Math.round(totalInstalledVA),
      totalInstalledW: Math.round(totalInstalledW),
      ilumTugVA: Math.round(ilumTugVA),
      tueVA: Math.round(tueVA),
      fdIlumTug,
      fdTue,
      demandVA,
      demandKVA,
      mainCurrentA: +mainCurrentA.toFixed(1),
      mainBreakerA,
      mainCableMm2: mainCableRow.section,
      mainConduitMm,
      idrMainA: mainBreakerA <= 40 ? 40 : 63,
      unbalancePercent,
      entrance: {
        entranceType,
        utilityName,
        categoryCode,
        groundRodsCount,
        postSpec: postSteelDaN,
        ramalSectionMm2: Math.max(10, mainCableRow.section),
        conduitMm: Math.max(32, mainConduitMm)
      }
    };
  }

  // Balanceia automaticamente as fases R, S, T dos circuitos
  function autoBalancePhases(project) {
    const supplySystem = project.supply.system || 'Trifásico';
    const availablePhases =
      supplySystem === 'Monofásico'
        ? ['R']
        : supplySystem === 'Bifásico'
          ? ['R', 'S']
          : ['R', 'S', 'T'];

    const loads = { R: 0, S: 0, T: 0 };

    // Ordena circuitos do maior para o menor para distribuir de forma equilibrada
    const evaluated = evaluateProjectCircuits(project);
    const sorted = [...evaluated].sort((a, b) => b.totalVA - a.totalVA);

    sorted.forEach(cEval => {
      const target = project.circuits.find(c => c.id === cEval.id);
      if (!target) return;

      const isBiphasic = cEval.voltage >= 220 && Number(project.supply.phaseVoltage) === 127 && availablePhases.length >= 2;
      if (isBiphasic) {
        // Escolhe as 2 fases com menor carga acumulada
        const ordered = [...availablePhases].sort((a, b) => loads[a] - loads[b]);
        const p1 = ordered[0];
        const p2 = ordered[1] || ordered[0];
        target.phase = `${p1}+${p2}`;
        loads[p1] += cEval.totalVA / 2;
        loads[p2] += cEval.totalVA / 2;
      } else {
        const ordered = [...availablePhases].sort((a, b) => loads[a] - loads[b]);
        const bestPhase = ordered[0];
        target.phase = bestPhase;
        loads[bestPhase] += cEval.totalVA;
      }
    });
  }

  // Gera a Lista Quantitativa de Materiais (BOM) com base na planta e circuitos
  function generateMaterialList(project) {
    const evaluated = evaluateProjectCircuits(project);
    const board = calculateBoardSummary(project, evaluated);

    const items = [];

    // 1. Condutores por bitola (Fase, Neutro, Terra, Retorno)
    const wireLengthsBySection = {};
    evaluated.forEach(c => {
      const sec = c.sectionMm2;
      if (!wireLengthsBySection[sec]) {
        wireLengthsBySection[sec] = { fase: 0, neutro: 0, terra: 0, retorno: 0 };
      }
      const baseRun = Math.max(c.maxDistMeters * (1 + c.pointsCount * 0.28), 8);
      const margin = 1.15; // 15% folga de corte e conexão
      wireLengthsBySection[sec].fase += Math.ceil(baseRun * c.poles * margin);
      if (c.poles === 1 || c.type !== 'tue') {
        wireLengthsBySection[sec].neutro += Math.ceil(baseRun * margin);
      }
      wireLengthsBySection[sec].terra += Math.ceil(baseRun * margin);
      if (c.type === 'iluminacao') {
        wireLengthsBySection[sec].retorno += Math.ceil(baseRun * 0.65 * margin);
      }
    });

    const wireUnitPrices = { 1.5: 2.15, 2.5: 3.40, 4.0: 5.60, 6.0: 8.45, 10.0: 14.90, 16.0: 23.50 };

    Object.keys(wireLengthsBySection).sort((a, b) => Number(a) - Number(b)).forEach(sec => {
      const w = wireLengthsBySection[sec];
      const unitPrice = wireUnitPrices[sec] || 5.0;
      if (w.fase > 0) {
        items.push({
          category: 'Cabos e Condutores (NBR NM 247-3)',
          code: `CAB-F-${sec}`,
          description: `Cabo Flexível Antichama 750V ${sec} mm² - Preto/Vermelho (Fase)`,
          unit: 'm',
          qty: w.fase,
          unitPrice
        });
      }
      if (w.neutro > 0) {
        items.push({
          category: 'Cabos e Condutores (NBR NM 247-3)',
          code: `CAB-N-${sec}`,
          description: `Cabo Flexível Antichama 750V ${sec} mm² - Azul Claro (Neutro)`,
          unit: 'm',
          qty: w.neutro,
          unitPrice
        });
      }
      if (w.terra > 0) {
        items.push({
          category: 'Cabos e Condutores (NBR NM 247-3)',
          code: `CAB-PE-${sec}`,
          description: `Cabo Flexível Antichama 750V ${sec} mm² - Verde (Proteção PE)`,
          unit: 'm',
          qty: w.terra,
          unitPrice
        });
      }
      if (w.retorno > 0) {
        items.push({
          category: 'Cabos e Condutores (NBR NM 247-3)',
          code: `CAB-RET-${sec}`,
          description: `Cabo Flexível Antichama 750V ${sec} mm² - Amarelo (Retorno)`,
          unit: 'm',
          qty: w.retorno,
          unitPrice
        });
      }
    });

    // 2. Eletrodutos, Eletrocalhas e Caixas de Passagem
    let conduit20m = 0;
    let conduit25m = 0;
    let conduit32m = 0;
    let trayMeters = 0;
    project.conduits.forEach(cd => {
      const p1 = project.points.find(p => p.id === cd.fromId);
      const p2 = project.points.find(p => p.id === cd.toId);
      const dist = p1 && p2 ? Math.hypot(p2.x - p1.x, p2.y - p1.y) + 1.8 : 4.5;
      if (cd.mounting === 'eletrocalha' || cd.tray) {
        trayMeters += dist;
      } else if (Number(cd.diameterMm) >= 32) {
        conduit32m += dist;
      } else if (Number(cd.diameterMm) >= 25) {
        conduit25m += dist;
      } else {
        conduit20m += dist;
      }
    });
    conduit20m = Math.max(15, Math.ceil(conduit20m * 1.1));
    conduit25m = Math.ceil(conduit25m * 1.1);
    conduit32m = Math.ceil(conduit32m * 1.1);
    trayMeters = Math.ceil(trayMeters * 1.1);

    items.push({
      category: 'Eletrodutos, Eletrocalhas e Caixas',
      code: 'ELET-20',
      description: 'Eletroduto Corrugado Reforçado PVC Antichama Ø 20mm (3/4")',
      unit: 'm',
      qty: conduit20m,
      unitPrice: 3.20
    });
    if (conduit25m > 0) {
      items.push({
        category: 'Eletrodutos, Eletrocalhas e Caixas',
        code: 'ELET-25',
        description: 'Eletroduto Corrugado Reforçado PVC Antichama Ø 25mm (1")',
        unit: 'm',
        qty: conduit25m,
        unitPrice: 4.80
      });
    }
    if (conduit32m > 0) {
      items.push({
        category: 'Eletrodutos, Eletrocalhas e Caixas',
        code: 'ELET-32',
        description: 'Eletroduto Rígido/Corrugado PVC Pesado Ø 32mm (1.1/4")',
        unit: 'm',
        qty: conduit32m,
        unitPrice: 7.90
      });
    }
    if (trayMeters > 0) {
      items.push({
        category: 'Eletrodutos, Eletrocalhas e Caixas',
        code: 'CALHA-100X50',
        description: 'Eletrocalha Lisa/Perfurada Galvanizada 100x50mm com Tampa e Suportes',
        unit: 'm',
        qty: trayMeters,
        unitPrice: 34.50
      });
    }

    const lightsCount = project.points.filter(p => p.category === 'light').length;
    const tugSimplesCount = project.points.filter(p => p.category === 'tug' && p.subtype !== 'tug_dupla' && p.subtype !== 'tug_tripla' && Number(p.powerVA) <= 100).length;
    const tugDuplaCount = project.points.filter(p => p.category === 'tug' && p.subtype === 'tug_dupla').length;
    const tugTriplaCount = project.points.filter(p => p.category === 'tug' && p.subtype === 'tug_tripla').length;
    const tugsHighCount = project.points.filter(p => p.category === 'tug' && p.subtype !== 'tug_dupla' && p.subtype !== 'tug_tripla' && Number(p.powerVA) > 100).length;
    const tuesCount = project.points.filter(p => p.category === 'tue').length;
    const switchesCount = project.points.filter(p => p.category === 'switch').length;
    const sensorsCount = project.points.filter(p => p.category === 'sensor').length;
    const telecomCount = project.points.filter(p => p.category === 'telecom').length;
    const bellCount = project.points.filter(p => p.category === 'bell').length;
    const camCount = project.points.filter(p => p.category === 'camera').length;
    const jboxCount = project.points.filter(p => p.category === 'jbox').length;
    const partialBoardsCount = project.points.filter(p => p.category === 'qdc' && p.subtype === 'quadro_parcial').length;

    const wallBoxesCount = tugSimplesCount + tugDuplaCount + tugTriplaCount + tugsHighCount + tuesCount + switchesCount + telecomCount + bellCount;

    items.push({
      category: 'Eletrodutos, Eletrocalhas e Caixas',
      code: 'CX-4X2',
      description: 'Caixa de Passagem Embutir PVC 4x2" com Orelhas Reforçadas',
      unit: 'un',
      qty: Math.max(1, wallBoxesCount),
      unitPrice: 3.90
    });
    items.push({
      category: 'Eletrodutos, Eletrocalhas e Caixas',
      code: 'CX-OCT',
      description: 'Caixa Octogonal de Laje/Teto 4x4" Fundo Móvel',
      unit: 'un',
      qty: Math.max(1, lightsCount + sensorsCount),
      unitPrice: 5.50
    });
    if (jboxCount > 0) {
      items.push({
        category: 'Eletrodutos, Eletrocalhas e Caixas',
        code: 'CX-PASS-4X4',
        description: 'Caixa de Passagem 4x4" / 15x15cm com Tampa Cega Parafusada',
        unit: 'un',
        qty: jboxCount,
        unitPrice: 12.80
      });
    }

    // 3. Tomadas, Interruptores, Sensores, Telecom, CFTV e Luminárias
    if (tugSimplesCount > 0) {
      items.push({
        category: 'Tomadas, Interruptores e Iluminação',
        code: 'TOM-10A',
        description: 'Conjunto Tomada Simples 2P+T 10A 250V NBR 14136 com Placa 4x2"',
        unit: 'un',
        qty: tugSimplesCount,
        unitPrice: 16.90
      });
    }
    if (tugDuplaCount > 0) {
      items.push({
        category: 'Tomadas, Interruptores e Iluminação',
        code: 'TOM-DUPLA-10A',
        description: 'Conjunto Tomada Dupla (2x 2P+T) 10A 250V NBR 14136 com Placa 4x2"',
        unit: 'un',
        qty: tugDuplaCount,
        unitPrice: 27.50
      });
    }
    if (tugTriplaCount > 0) {
      items.push({
        category: 'Tomadas, Interruptores e Iluminação',
        code: 'TOM-TRIPLA-10A',
        description: 'Conjunto Tomada Tripla (3x 2P+T) 10A 250V NBR 14136 com Placa 4x2"',
        unit: 'un',
        qty: tugTriplaCount,
        unitPrice: 36.90
      });
    }
    if (tugsHighCount + tuesCount > 0) {
      items.push({
        category: 'Tomadas, Interruptores e Iluminação',
        code: 'TOM-20A',
        description: 'Conjunto Tomada 2P+T 20A 250V NBR 14136 (Uso Específico / 600VA) com Placa 4x2"',
        unit: 'un',
        qty: tugsHighCount + tuesCount,
        unitPrice: 21.50
      });
    }
    if (switchesCount > 0) {
      items.push({
        category: 'Tomadas, Interruptores e Iluminação',
        code: 'INT-MOD',
        description: 'Conjunto Interruptor (Simples / Duplo / Triplo / Paralelo Three-Way / Four-Way) 10A 250V',
        unit: 'un',
        qty: switchesCount,
        unitPrice: 21.80
      });
    }
    if (sensorsCount > 0) {
      items.push({
        category: 'Tomadas, Interruptores e Iluminação',
        code: 'SENS-PRES',
        description: 'Sensor de Presença Infravermelho 360° Teto/Parede Bivolt c/ Fotocélula',
        unit: 'un',
        qty: sensorsCount,
        unitPrice: 44.90
      });
    }
    if (telecomCount > 0) {
      items.push({
        category: 'Telecomunicações, CFTV e Dados',
        code: 'TOM-RJ45-RJ11',
        description: 'Conjunto Tomada de Dados RJ45 Cat6 / Voz Telefone RJ11 com Placa 4x2"',
        unit: 'un',
        qty: telecomCount,
        unitPrice: 32.00
      });
    }
    if (bellCount > 0) {
      items.push({
        category: 'Telecomunicações, CFTV e Dados',
        code: 'CAMP-CIG',
        description: 'Conjunto Campainha Eletrônica / Cigarra Embutir + Pulsador Externo',
        unit: 'un',
        qty: bellCount,
        unitPrice: 29.90
      });
    }
    if (camCount > 0) {
      items.push({
        category: 'Telecomunicações, CFTV e Dados',
        code: 'CAM-IP-POE',
        description: 'Câmera de Segurança CFTV IP PoE Full HD Infravermelho (Dome/Bullet)',
        unit: 'un',
        qty: camCount,
        unitPrice: 210.00
      });
    }
    if (lightsCount > 0) {
      items.push({
        category: 'Tomadas, Interruptores e Iluminação',
        code: 'LUM-LED18',
        description: 'Painel Plafon LED Embutir/Sobrepor 18W Bivolt 4000K',
        unit: 'un',
        qty: lightsCount,
        unitPrice: 38.00
      });
    }

    // 4. Padrão de Entrada da Concessionária + Quadros de Distribuição e Proteção DIN
    items.push({
      category: 'Padrão de Entrada Concessionária',
      code: `PAD-${board.entrance.categoryCode.replace(/[^A-Z0-9]/g, '')}`,
      description: `Kit Padrão de Entrada ${board.entrance.entranceType} (${board.entrance.categoryCode}) c/ Caixa Policarbonato, Poste e ${board.entrance.groundRodsCount} Hastes Aterramento Copperweld 2,40m`,
      unit: 'cj',
      qty: 1,
      unitPrice: 890.00
    });
    items.push({
      category: 'Quadro de Distribuição e Proteção (NBR 5410)',
      code: 'QDC-24DIN',
      description: 'Quadro de Distribuição Geral (QGBT/QDC) Embutir p/ 24 a 36 Disjuntores DIN c/ Barramentos Neutro/Terra',
      unit: 'un',
      qty: 1,
      unitPrice: 189.00
    });
    if (partialBoardsCount > 0) {
      items.push({
        category: 'Quadro de Distribuição e Proteção (NBR 5410)',
        code: 'QD-PARCIAL-12',
        description: 'Quadro de Distribuição Parcial (QD) Embutir p/ 12 a 18 Disjuntores DIN c/ Barramentos',
        unit: 'un',
        qty: partialBoardsCount,
        unitPrice: 118.00
      });
    }
    items.push({
      category: 'Quadro de Distribuição e Proteção (NBR 5410)',
      code: `DJ-GERAL-${board.mainBreakerA}`,
      description: `Disjuntor Geral DIN ${project.supply.system} ${board.mainBreakerA}A Curva C 5kA`,
      unit: 'un',
      qty: 1,
      unitPrice: 84.00
    });
    items.push({
      category: 'Quadro de Distribuição e Proteção (NBR 5410)',
      code: `IDR-${board.idrMainA}A`,
      description: `Interruptor Diferencial Residual (IDR) Tetrapolar ${board.idrMainA}A / 30mA Classe AC`,
      unit: 'un',
      qty: 1,
      unitPrice: 165.00
    });
    items.push({
      category: 'Quadro de Distribuição e Proteção (NBR 5410)',
      code: 'DPS-275V',
      description: 'Dispositivo de Proteção contra Surtos (DPS) Classe II 20kA/45kA 275V',
      unit: 'un',
      qty: project.supply.system === 'Trifásico' ? 4 : 3,
      unitPrice: 68.00
    });

    // Agrupa disjuntores por especificação
    const breakerGroups = {};
    evaluated.forEach(c => {
      const key = `${c.poles}P-${c.breakerA}A-Curva ${c.curve}`;
      breakerGroups[key] = (breakerGroups[key] || 0) + 1;
    });
    Object.entries(breakerGroups).forEach(([spec, count]) => {
      const isMulti = !spec.startsWith('1P');
      items.push({
        category: 'Quadro de Distribuição e Proteção (NBR 5410)',
        code: `DJ-${spec.replace(/\s+/g, '')}`,
        description: `Disjuntor Termomagnético DIN ${spec} 3kA (IEC 60898)`,
        unit: 'un',
        qty: count,
        unitPrice: isMulti ? 42.00 : 16.50
      });
    });

    return items.map((it, idx) => ({
      id: `bom-${idx + 1}`,
      ...it,
      totalPrice: +(it.qty * it.unitPrice).toFixed(2)
    }));
  }

  // Garante que todo projeto possua portas, janelas e vãos editáveis em seus ambientes
  function ensureProjectOpenings(project) {
    if (!project) return;
    if (Array.isArray(project.openings) && project.openings.length > 0) return;
    project.openings = [];
    let doorNum = 1;
    let winNum = 1;

    (project.rooms || []).forEach((room) => {
      // 1. Porta padrão na parede sul (ou leste para corredores)
      if (room.type === 'corredor') {
        project.openings.push({
          id: `op-v-${room.id}`,
          type: 'opening',
          roomId: room.id,
          wall: 'w',
          offset: +(room.h / 2).toFixed(2),
          width: 1.10,
          height: 2.10,
          sillHeight: 0.00,
          swing: 'in-left',
          label: `Vão 1,10×2,10`
        });
      } else {
        const doorW = room.type === 'banheiro' ? 0.70 : room.type === 'sala' ? 0.90 : 0.80;
        project.openings.push({
          id: `op-d-${room.id}`,
          type: 'door',
          roomId: room.id,
          wall: 's',
          offset: +(Math.min(0.65, room.w * 0.25)).toFixed(2),
          width: doorW,
          height: 2.10,
          sillHeight: 0.00,
          swing: 'in-left',
          label: `P${doorNum++}`
        });
      }

      // 2. Janela padrão na parede norte (ou leste para banheiros/serviço)
      if (room.type !== 'corredor') {
        const isBath = room.type === 'banheiro';
        const winW = isBath ? 0.60 : Math.min(1.50, +(room.w * 0.42).toFixed(2));
        const winH = isBath ? 0.60 : 1.10;
        const sill = isBath ? 1.60 : 1.00;
        project.openings.push({
          id: `op-w-${room.id}`,
          type: 'window',
          roomId: room.id,
          wall: 'n',
          offset: +(room.w / 2).toFixed(2),
          width: winW,
          height: winH,
          sillHeight: sill,
          swing: 'in-left',
          label: `J${winNum++}`
        });
      }
    });
  }

  // Calcula geometria mundial (x1,y1)-(x2,y2), centro e vetores tangente/normal de uma abertura (porta/janela/vão)
  function getOpeningWorldGeometry(op, room) {
    if (!room) return null;
    const wall = op.wall || 's';
    const wallLen = (wall === 'n' || wall === 's') ? room.w : room.h;
    const w = Math.min(Number(op.width || 0.8), Math.max(0.4, wallLen - 0.1));
    const halfW = w / 2;
    const clampedOffset = Math.max(halfW + 0.05, Math.min(wallLen - halfW - 0.05, Number(op.offset || wallLen / 2)));

    let cx = room.x;
    let cy = room.y;
    let tx = 1, ty = 0; // Vetor tangente ao longo da parede
    let nx = 0, ny = 1; // Vetor normal apontando para DENTRO do cômodo

    if (wall === 'n') {
      cx = room.x + clampedOffset;
      cy = room.y;
      tx = 1; ty = 0;
      nx = 0; ny = 1;
    } else if (wall === 's') {
      cx = room.x + clampedOffset;
      cy = room.y + room.h;
      tx = 1; ty = 0;
      nx = 0; ny = -1;
    } else if (wall === 'w') {
      cx = room.x;
      cy = room.y + clampedOffset;
      tx = 0; ty = 1;
      nx = 1; ny = 0;
    } else if (wall === 'e') {
      cx = room.x + room.w;
      cy = room.y + clampedOffset;
      tx = 0; ty = 1;
      nx = -1; ny = 0;
    }

    const x1 = cx - tx * halfW;
    const y1 = cy - ty * halfW;
    const x2 = cx + tx * halfW;
    const y2 = cy + ty * halfW;

    return {
      cx, cy, x1, y1, x2, y2,
      tx, ty, nx, ny,
      width: w,
      clampedOffset,
      wallLen
    };
  }

  return {
    ROOM_TYPES,
    AMPACITY_TABLE_B1,
    STANDARD_BREAKERS,
    ensureProjectOpenings,
    getOpeningWorldGeometry,
    isPointCollidingWithDoorOrOpening,
    findSafeWallPoint,
    findSwitchPositionNearRoomDoor,
    calculateRoomNormativeMinimums,
    inspectRoomCompliance,
    autoGenerateNormativePointsAndCircuits,
    evaluateProjectCircuits,
    calculateBoardSummary,
    autoBalancePhases,
    generateMaterialList
  };
})();

