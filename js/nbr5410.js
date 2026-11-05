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
        installedTugCount += 1;
        installedTugVA += Number(pt.powerVA || 100);
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

  // Sugere e posiciona automaticamente todos os pontos da NBR 5410 na planta + traçado de eletrodutos
  function autoGenerateNormativePointsAndCircuits(project) {
    const newPoints = [];
    const newConduits = [];
    let ptCounter = 1;

    // Mantém ou cria Quadro de Distribuição (QDC)
    let qdc = project.points.find(p => p.category === 'qdc');
    if (!qdc) {
      const refRoom = project.rooms.find(r => r.type === 'corredor' || r.type === 'cozinha' || r.type === 'sala') || project.rooms[0];
      qdc = {
        id: 'pt-qdc-1',
        category: 'qdc',
        subtype: 'qdc_embutir',
        label: 'QDC-01',
        x: refRoom ? +(refRoom.x + 0.35).toFixed(2) : 2.0,
        y: refRoom ? +(refRoom.y + refRoom.h / 2).toFixed(2) : 2.0,
        z: 1.5,
        powerVA: 0,
        circuitId: null,
        roomId: refRoom ? refRoom.id : null
      };
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

      // 2. Interruptor próximo à porta/entrada do cômodo
      const swPt = {
        id: `pt-auto-${ptCounter++}`,
        category: 'switch',
        subtype: 'int_simples',
        label: `Int. ${room.name}`,
        command: commandId,
        x: +(room.x + 0.35).toFixed(2),
        y: +(room.y + room.h - 0.12).toFixed(2),
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

      // 3. TUGs distribuídas nas paredes do ambiente
      const tugCircuitId =
        room.type === 'cozinha'
          ? 'C4'
          : norms.wetArea
            ? 'C5'
            : 'C3';

      const wallPositions = getDistributedWallPositions(room, norms.minTugCount);
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
        const tuePt = {
          id: `pt-auto-${ptCounter++}`,
          category: 'tue',
          subtype: 'tue_alta',
          label: 'Chuveiro 6800W',
          x: +(room.x + room.w - 0.12).toFixed(2),
          y: +(room.y + room.h / 2).toFixed(2),
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
        const tuePt = {
          id: `pt-auto-${ptCounter++}`,
          category: 'tue',
          subtype: 'tue_alta',
          label: 'Split 12000 BTU',
          x: +(room.x + room.w / 2).toFixed(2),
          y: +(room.y + 0.12).toFixed(2),
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
    ensureProjectOpenings(project);
    return project;
  }

  function getDistributedWallPositions(room, count) {
    const positions = [];
    const margin = 0.14;
    const walls = [
      // Parede Norte
      (t) => ({ x: +(room.x + room.w * t).toFixed(2), y: +(room.y + margin).toFixed(2) }),
      // Parede Leste
      (t) => ({ x: +(room.x + room.w - margin).toFixed(2), y: +(room.y + room.h * t).toFixed(2) }),
      // Parede Oeste
      (t) => ({ x: +(room.x + margin).toFixed(2), y: +(room.y + room.h * t).toFixed(2) }),
      // Parede Sul
      (t) => ({ x: +(room.x + room.w * t).toFixed(2), y: +(room.y + room.h - margin).toFixed(2) })
    ];

    for (let i = 0; i < count; i++) {
      const wallFn = walls[i % walls.length];
      const slot = Math.floor(i / walls.length);
      const t = slot === 0 ? 0.5 : slot % 2 === 1 ? 0.28 : 0.72;
      positions.push(wallFn(t));
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

      // Eletroduto mínimo por ocupação
      const conduitMm = chosenRow.section >= 6 ? 25 : 20;

      // Alocação de fase
      const phase = circuit.phase || ['R', 'S', 'T'][idx % 3];

      return {
        ...circuit,
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
        phase,
        statusOk: ib <= breakerA && breakerA <= izReal + 2 && voltageDropPercent <= 4.0
      };
    });
  }

  // Calcula balanceamento entre fases R, S, T e Demanda Total do Quadro (QDC)
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

    const maxPhaseVA = Math.max(phases.R, phases.S, phases.T, 1);
    const minPhaseVA = Math.min(phases.R, phases.S, phases.T);
    const unbalancePercent = +(((maxPhaseVA - minPhaseVA) / maxPhaseVA) * 100).toFixed(1);

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
      idrMainA: mainBreakerA <= 40 ? 40 : 63,
      unbalancePercent
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

    // 2. Eletrodutos e Caixas de Passagem
    let conduit20m = 0;
    let conduit25m = 0;
    project.conduits.forEach(cd => {
      const p1 = project.points.find(p => p.id === cd.fromId);
      const p2 = project.points.find(p => p.id === cd.toId);
      const dist = p1 && p2 ? Math.hypot(p2.x - p1.x, p2.y - p1.y) + 1.8 : 4.5;
      if (Number(cd.diameterMm) >= 25) {
        conduit25m += dist;
      } else {
        conduit20m += dist;
      }
    });
    conduit20m = Math.max(25, Math.ceil(conduit20m * 1.1));
    conduit25m = Math.ceil(conduit25m * 1.1);

    items.push({
      category: 'Eletrodutos e Caixas',
      code: 'ELET-20',
      description: 'Eletroduto Corrugado Reforçado PVC Antichama Ø 20mm (3/4")',
      unit: 'm',
      qty: conduit20m,
      unitPrice: 3.20
    });
    if (conduit25m > 0) {
      items.push({
        category: 'Eletrodutos e Caixas',
        code: 'ELET-25',
        description: 'Eletroduto Corrugado Reforçado PVC Antichama Ø 25mm (1")',
        unit: 'm',
        qty: conduit25m,
        unitPrice: 4.80
      });
    }

    const lightsCount = project.points.filter(p => p.category === 'light').length;
    const tugsLowCount = project.points.filter(p => p.category === 'tug' && Number(p.powerVA) <= 100).length;
    const tugsHighCount = project.points.filter(p => p.category === 'tug' && Number(p.powerVA) > 100).length;
    const tuesCount = project.points.filter(p => p.category === 'tue').length;
    const switchesCount = project.points.filter(p => p.category === 'switch').length;
    const wallBoxesCount = tugsLowCount + tugsHighCount + tuesCount + switchesCount;

    items.push({
      category: 'Eletrodutos e Caixas',
      code: 'CX-4X2',
      description: 'Caixa de Passagem Embutir PVC 4x2" com Orelhas Reforçadas',
      unit: 'un',
      qty: Math.max(1, wallBoxesCount),
      unitPrice: 3.90
    });
    items.push({
      category: 'Eletrodutos e Caixas',
      code: 'CX-OCT',
      description: 'Caixa Octogonal de Laje/Teto 4x4" Fundo Móvel',
      unit: 'un',
      qty: Math.max(1, lightsCount),
      unitPrice: 5.50
    });

    // 3. Tomadas, Interruptores e Luminárias
    if (tugsLowCount > 0) {
      items.push({
        category: 'Tomadas, Interruptores e Iluminação',
        code: 'TOM-10A',
        description: 'Conjunto Tomada 2P+T 10A 250V NBR 14136 com Placa 4x2"',
        unit: 'un',
        qty: tugsLowCount,
        unitPrice: 16.90
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
        code: 'INT-1S',
        description: 'Conjunto Interruptor Simples 10A 250V com Placa 4x2"',
        unit: 'un',
        qty: switchesCount,
        unitPrice: 15.80
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

    // 4. Quadro de Distribuição e Proteção DIN
    items.push({
      category: 'Quadro de Distribuição e Proteção (NBR 5410)',
      code: 'QDC-24DIN',
      description: 'Quadro de Distribuição Embutir p/ 24 a 36 Disjuntores DIN c/ Barramentos Neutro/Terra',
      unit: 'un',
      qty: 1,
      unitPrice: 189.00
    });
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
    calculateRoomNormativeMinimums,
    inspectRoomCompliance,
    autoGenerateNormativePointsAndCircuits,
    evaluateProjectCircuits,
    calculateBoardSummary,
    autoBalancePhases,
    generateMaterialList
  };
})();

