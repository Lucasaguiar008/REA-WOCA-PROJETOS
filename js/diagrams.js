// ============================================================================
// GERADOR AUTOMÁTICO DE DIAGRAMA UNIFILAR, QUADROS PARCIAIS E EXPORTADOR DXF
// ============================================================================

window.Diagrams = (function () {
  function generateUnifilarSVG(project) {
    const evaluated = window.NBR5410.evaluateProjectCircuits(project);
    const board = window.NBR5410.calculateBoardSummary(project, evaluated);
    const partialBoards = (project.points || []).filter(p => p.category === 'qdc' && p.subtype === 'quadro_parcial');

    const rowHeight = 120;
    const topMargin = 175;
    const bottomMargin = 230;
    const width = 2320;
    const extraPartialRows = partialBoards.length;
    const height = Math.max(920, topMargin + (evaluated.length + extraPartialRows) * rowHeight + bottomMargin);

    const supplyPhases =
      project.supply.system === 'Monofásico'
        ? 'F+N+PE'
        : project.supply.system === 'Bifásico'
          ? '2F+N+PE'
          : '3F+N+PE';

    let circuitsSvg = '';
    evaluated.forEach((c, idx) => {
      const y = topMargin + idx * rowHeight;
      const strokeColor = c.dr ? '#38bdf8' : '#f59e0b';
      const drBadge = c.dr
        ? `<rect x="1245" y="${y - 20}" width="105" height="38" rx="6" fill="rgba(56,189,248,0.18)" stroke="#38bdf8" stroke-width="1.8"/>
           <text x="1297" y="${y + 6}" fill="#38bdf8" font-size="19" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">IDR 30mA</text>`
        : '';

      // Traços de condutores NBR 5444 no ramal
      const condLines = c.poles === 2
        ? `<line x1="1010" y1="${y - 14}" x2="1010" y2="${y + 14}" stroke="#e2e8f0" stroke-width="2.5"/>
           <line x1="1022" y1="${y - 14}" x2="1022" y2="${y + 14}" stroke="#e2e8f0" stroke-width="2.5"/>
           <line x1="1034" y1="${y - 14}" x2="1034" y2="${y + 8}" stroke="#34d399" stroke-width="2.5"/>
           <line x1="1028" y1="${y - 14}" x2="1040" y2="${y - 14}" stroke="#34d399" stroke-width="2.5"/>`
        : `<line x1="1010" y1="${y - 14}" x2="1010" y2="${y + 14}" stroke="#e2e8f0" stroke-width="2.5"/>
           <line x1="1022" y1="${y - 14}" x2="1022" y2="${y + 14}" stroke="#38bdf8" stroke-width="2.5"/>
           <line x1="1028" y1="${y - 14}" x2="1022" y2="${y - 14}" stroke="#38bdf8" stroke-width="2.5"/>
           <line x1="1034" y1="${y - 14}" x2="1034" y2="${y + 8}" stroke="#34d399" stroke-width="2.5"/>
           <line x1="1028" y1="${y - 14}" x2="1040" y2="${y - 14}" stroke="#34d399" stroke-width="2.5"/>`;

      const boardTag = c.boardId && c.boardId !== 'QDC-01' ? `[${c.boardId}] ` : '';

      circuitsSvg += `
        <!-- Derivação do Barramento para Circuito ${c.id} -->
        <circle cx="820" cy="${y}" r="6" fill="${strokeColor}" />
        <line x1="820" y1="${y}" x2="870" y2="${y}" stroke="${strokeColor}" stroke-width="3.5" />

        <!-- Símbolo Disjuntor Termomagnético DIN -->
        <rect x="870" y="${y - 25}" width="105" height="50" rx="6" fill="#111827" stroke="${strokeColor}" stroke-width="2.5" />
        <path d="M 888 ${y + 8} Q 922 ${y - 14} 956 ${y + 8}" fill="none" stroke="${strokeColor}" stroke-width="2.5" />
        <text x="922" y="${y - 32}" fill="#f8fafc" font-size="21" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">
          ${c.poles}P ${c.breakerA}A (${c.curve})
        </text>

        <!-- Linha de Saída do Circuito c/ Seção do Cabo e Dimensionamento do Eletroduto -->
        <line x1="975" y1="${y}" x2="1360" y2="${y}" stroke="#64748b" stroke-width="3" />
        ${condLines}
        <rect x="1055" y="${y - 42}" width="180" height="32" rx="5" fill="#0f172a" stroke="#475569" stroke-width="1.5" />
        <text x="1145" y="${y - 20}" fill="#fde68a" font-size="20" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">
          ${c.conductorCount}x#${c.sectionMm2}mm²
        </text>

        <!-- Símbolo Eletroduto Dimensionado no Diagrama -->
        <circle cx="1068" cy="${y + 24}" r="9" fill="none" stroke="#38bdf8" stroke-width="2.2" />
        <line x1="1060" y1="${y + 32}" x2="1076" y2="${y + 16}" stroke="#38bdf8" stroke-width="2" />
        <text x="1170" y="${y + 29}" fill="#7dd3fc" font-size="19" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">
          Ø${c.conduitMm}mm (${c.conduitInch}) • ${c.conduitOccupancyPct}%
        </text>
        ${drBadge}

        <!-- Bloco Descritivo do Circuito -->
        <rect x="1360" y="${y - 38}" width="910" height="76" rx="8" fill="#111827" stroke="#334155" stroke-width="1.8" />
        <text x="1380" y="${y - 8}" fill="#fbbf24" font-size="23" font-weight="700" font-family="Inter, sans-serif">
          ${boardTag}${c.id} — ${c.name} (Fase ${c.phase})
        </text>
        <text x="1380" y="${y + 24}" fill="#cbd5e1" font-size="19.6" font-family="JetBrains Mono, monospace">
          P=${c.totalVA}VA (${c.totalW}W) | Ib=${c.ib}A | Iz=${c.izReal}A | Cabo #${c.sectionMm2}mm² | Eletroduto Ø${c.conduitMm}mm | ΔV=${c.voltageDropPercent}%
        </text>
      `;
    });

    // Renderiza Quadros Parciais derivados do QGBT/QDC-01 se existirem
    partialBoards.forEach((pb, pIdx) => {
      const y = topMargin + (evaluated.length + pIdx) * rowHeight;
      circuitsSvg += `
        <circle cx="820" cy="${y}" r="8" fill="#a855f7" />
        <line x1="820" y1="${y}" x2="870" y2="${y}" stroke="#a855f7" stroke-width="4" />
        <rect x="870" y="${y - 25}" width="105" height="50" rx="6" fill="#111827" stroke="#a855f7" stroke-width="2.5" />
        <text x="922" y="${y + 8}" fill="#e9d5ff" font-size="20" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">DJ 32A</text>
        <line x1="975" y1="${y}" x2="1360" y2="${y}" stroke="#a855f7" stroke-width="3.5" stroke-dasharray="10 5" />
        <text x="1165" y="${y - 14}" fill="#e9d5ff" font-size="20" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">Alimentador #6mm² • Ø25mm (1")</text>
        <rect x="1360" y="${y - 36}" width="910" height="72" rx="8" fill="rgba(168,85,247,0.12)" stroke="#a855f7" stroke-width="2" />
        <text x="1380" y="${y - 6}" fill="#e9d5ff" font-size="23" font-weight="800" font-family="Inter, sans-serif">
          QUADRO PARCIAL DERIVADO: ${pb.label || 'QD-02'}
        </text>
        <text x="1380" y="${y + 24}" fill="#cbd5e1" font-size="19.6" font-family="JetBrains Mono, monospace">
          Sub-Quadro de Distribuição Parcial interligado ao Barramento Principal
        </text>
      `;
    });

    const totalRows = Math.max(1, evaluated.length + partialBoards.length);
    const busTop = topMargin - 40;
    const busBottom = topMargin + (totalRows - 1) * rowHeight + 40;
    const midY = Math.round((busTop + busBottom) / 2);

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="max-width:${width}px;background:#070b14;border-radius:8px;">
        <!-- Moldura Técnica ABNT -->
        <rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="#475569" stroke-width="3" />
        <rect x="22" y="22" width="${width - 44}" height="${height - 44}" fill="none" stroke="#334155" stroke-width="1.8" />

        <!-- Cabeçalho do Diagrama Unifilar -->
        <text x="40" y="60" fill="#f8fafc" font-size="31" font-weight="800" font-family="Inter, sans-serif">
          DIAGRAMA UNIFILAR GERAL E PADRÃO DE ENTRADA — ${project.name.toUpperCase()}
        </text>
        <text x="40" y="98" fill="#94a3b8" font-size="22" font-family="JetBrains Mono, monospace">
          Concessionária: ${project.supply.concessionaria} | Padrão: ${board.entrance.categoryCode} (${board.entrance.entranceType}) | Sistema: ${project.supply.system} (${project.supply.phaseVoltage}/${project.supply.lineVoltage}V) | Demanda: ${board.demandKVA} kVA
        </text>
        <text x="40" y="132" fill="#38bdf8" font-size="21" font-family="JetBrains Mono, monospace">
          Ramal Principal: #${board.mainCableMm2}mm² Cu (750V) em Eletroduto Ø${board.mainConduitMm}mm | Aterramento: ${board.entrance.groundRodsCount} Hastes Copperweld 5/8"x2,40m
        </text>

        <!-- Padrão de Entrada da Concessionária (Poste + Medidor kWh + DJ Padrão) -->
        <rect x="40" y="${midY - 95}" width="260" height="190" rx="8" fill="#111827" stroke="#f59e0b" stroke-width="2.5" />
        <text x="170" y="${midY - 62}" fill="#f59e0b" font-size="20" font-weight="800" text-anchor="middle" font-family="Inter, sans-serif">PADRÃO DE ENTRADA</text>
        <circle cx="170" cy="${midY - 20}" r="24" fill="#0f172a" stroke="#fbbf24" stroke-width="2.5" />
        <text x="170" y="${midY - 12}" fill="#fde68a" font-size="19" font-weight="800" text-anchor="middle" font-family="JetBrains Mono, monospace">kWh</text>
        <text x="170" y="${midY + 28}" fill="#e2e8f0" font-size="19" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">${board.entrance.categoryCode} (${supplyPhases})</text>
        <text x="170" y="${midY + 54}" fill="#94a3b8" font-size="18" text-anchor="middle" font-family="JetBrains Mono, monospace">Cabo #${board.entrance.ramalSectionMm2}mm²</text>
        <text x="170" y="${midY + 78}" fill="#38bdf8" font-size="18" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">Eletroduto Ø${board.entrance.conduitMm}mm</text>

        <!-- Ramal Alimentador Medidor -> QDC -->
        <line x1="300" y1="${midY}" x2="390" y2="${midY}" stroke="#f59e0b" stroke-width="4" />
        <text x="345" y="${midY - 16}" fill="#fde68a" font-size="18" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">#${board.mainCableMm2}mm²</text>
        <text x="345" y="${midY + 24}" fill="#38bdf8" font-size="17" text-anchor="middle" font-family="JetBrains Mono, monospace">Ø${board.mainConduitMm}mm</text>

        <!-- Disjuntor Geral DIN -->
        <rect x="390" y="${midY - 42}" width="145" height="84" rx="8" fill="#111827" stroke="#f59e0b" stroke-width="2.5" />
        <text x="462" y="${midY - 8}" fill="#fbbf24" font-size="21" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">DJ GERAL</text>
        <text x="462" y="${midY + 24}" fill="#f8fafc" font-size="21" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">${board.mainBreakerA}A Curva C</text>

        <line x1="535" y1="${midY}" x2="600" y2="${midY}" stroke="#f59e0b" stroke-width="4" />

        <!-- IDR Geral + DPS Classe II -->
        <rect x="600" y="${midY - 42}" width="165" height="84" rx="8" fill="#111827" stroke="#38bdf8" stroke-width="2.5" />
        <text x="682" y="${midY - 8}" fill="#38bdf8" font-size="21" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">IDR ${board.idrMainA}A</text>
        <text x="682" y="${midY + 24}" fill="#bae6fd" font-size="19" text-anchor="middle" font-family="JetBrains Mono, monospace">30mA + DPS</text>

        <!-- Derivação DPS + Aterramento TN-S -->
        <line x1="568" y1="${midY}" x2="568" y2="${midY + 110}" stroke="#34d399" stroke-width="3" stroke-dasharray="6 4" />
        <rect x="498" y="${midY + 110}" width="140" height="64" rx="6" fill="#111827" stroke="#34d399" stroke-width="2" />
        <text x="568" y="${midY + 137}" fill="#34d399" font-size="19" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">DPS 20kA</text>
        <text x="568" y="${midY + 160}" fill="#6ee7b7" font-size="17" text-anchor="middle" font-family="JetBrains Mono, monospace">275V Cl.II</text>
        <!-- Símbolo Terra -->
        <line x1="568" y1="${midY + 174}" x2="568" y2="${midY + 200}" stroke="#34d399" stroke-width="3" />
        <line x1="538" y1="${midY + 200}" x2="598" y2="${midY + 200}" stroke="#34d399" stroke-width="3.5" />
        <line x1="548" y1="${midY + 208}" x2="588" y2="${midY + 208}" stroke="#34d399" stroke-width="3" />
        <line x1="558" y1="${midY + 216}" x2="578" y2="${midY + 216}" stroke="#34d399" stroke-width="2.5" />

        <!-- Ligação ao Barramento Principal do QDC -->
        <line x1="765" y1="${midY}" x2="820" y2="${midY}" stroke="#f59e0b" stroke-width="4" />
        <line x1="820" y1="${busTop}" x2="820" y2="${busBottom}" stroke="#f59e0b" stroke-width="6" />
        <text x="820" y="${busTop - 14}" fill="#fbbf24" font-size="21" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">BARRAMENTO QDC-01</text>

        <!-- Circuitos Terminais -->
        ${circuitsSvg}

        <!-- Carimbo Técnico ABNT — LUCAS AGUIAR -->
        <g transform="translate(${width - 850}, ${height - 180})">
          <rect x="0" y="0" width="810" height="148" rx="8" fill="#0f172a" stroke="#f59e0b" stroke-width="2.5" />
          <line x1="280" y1="0" x2="280" y2="148" stroke="#334155" stroke-width="2" />
          <text x="24" y="48" fill="#f59e0b" font-size="26" font-weight="800" font-family="Inter, sans-serif">LUCAS AGUIAR</text>
          <text x="24" y="84" fill="#cbd5e1" font-size="19" font-weight="600" font-family="Inter, sans-serif">PROJETOS ELÉTRICOS</text>
          <text x="24" y="118" fill="#64748b" font-size="17" font-family="JetBrains Mono, monospace">ABNT NBR 5410 / 5444</text>

          <text x="300" y="38" fill="#f8fafc" font-size="21" font-weight="700" font-family="Inter, sans-serif">Projeto: ${project.name}</text>
          <text x="300" y="70" fill="#cbd5e1" font-size="19" font-family="Inter, sans-serif">Cliente: ${project.client}</text>
          <text x="300" y="100" fill="#94a3b8" font-size="19" font-family="JetBrains Mono, monospace">Pot. Instalada: ${board.totalInstalledVA} VA | Demanda: ${board.demandVA} VA</text>
          <text x="300" y="128" fill="#38bdf8" font-size="18" font-family="JetBrains Mono, monospace">Resp. Técnico: Lucas Aguiar | Data: ${project.updatedAt}</text>
        </g>
      </svg>
    `;
  }

  // Exportador DXF nativo (AutoCAD R12/2000 ASCII) com Layers técnicos ABNT (Item 20)
  function exportProjectDXF(project) {
    const lines = [];
    const push = (code, val) => {
      lines.push(String(code));
      lines.push(String(val));
    };

    // Cabeçalho DXF
    push(0, 'SECTION');
    push(2, 'HEADER');
    push(9, '$ACADVER');
    push(1, 'AC1009');
    push(0, 'ENDSEC');

    // Tabela de Layers
    push(0, 'SECTION');
    push(2, 'TABLES');
    push(0, 'TABLE');
    push(2, 'LAYER');
    push(70, 6);

    const layers = [
      { name: 'ARQUITETURA_PAREDES', color: 7 },
      { name: 'ABERTURAS', color: 3 },
      { name: 'ELETRICA_PONTOS', color: 2 },
      { name: 'ELETRODUTOS_CALHAS', color: 4 },
      { name: 'COTAS_TEXTOS', color: 6 },
      { name: 'ESCADAS', color: 8 }
    ];
    layers.forEach(l => {
      push(0, 'LAYER');
      push(2, l.name);
      push(70, 0);
      push(62, l.color);
      push(6, 'CONTINUOUS');
    });
    push(0, 'ENDTAB');
    push(0, 'ENDSEC');

    // Entidades Geométricas (Coordenadas em metros, Y invertido para sistema cartesiano CAD)
    push(0, 'SECTION');
    push(2, 'ENTITIES');

    const addLine = (layer, x1, y1, x2, y2) => {
      push(0, 'LINE');
      push(8, layer);
      push(10, x1.toFixed(3));
      push(20, (-y1).toFixed(3));
      push(30, '0.0');
      push(11, x2.toFixed(3));
      push(21, (-y2).toFixed(3));
      push(31, '0.0');
    };

    const addCircle = (layer, cx, cy, r) => {
      push(0, 'CIRCLE');
      push(8, layer);
      push(10, cx.toFixed(3));
      push(20, (-cy).toFixed(3));
      push(30, '0.0');
      push(40, r.toFixed(3));
    };

    const addText = (layer, x, y, height, str) => {
      push(0, 'TEXT');
      push(8, layer);
      push(10, x.toFixed(3));
      push(20, (-y).toFixed(3));
      push(30, '0.0');
      push(40, height.toFixed(3));
      push(1, String(str || '').replace(/[^\x20-\x7EÀ-ÿ]/g, ''));
    };

    // 1. Cômodos (Paredes e Textos)
    (project.rooms || []).forEach(r => {
      addLine('ARQUITETURA_PAREDES', r.x, r.y, r.x + r.w, r.y);
      addLine('ARQUITETURA_PAREDES', r.x + r.w, r.y, r.x + r.w, r.y + r.h);
      addLine('ARQUITETURA_PAREDES', r.x + r.w, r.y + r.h, r.x, r.y + r.h);
      addLine('ARQUITETURA_PAREDES', r.x, r.y + r.h, r.x, r.y);
      addText('COTAS_TEXTOS', r.x + r.w * 0.25, r.y + r.h * 0.5, 0.18, `${r.name} (${(r.w * r.h).toFixed(1)}m2)`);
    });

    // 2. Portas, Janelas e Vãos
    (project.openings || []).forEach(op => {
      const room = (project.rooms || []).find(rm => rm.id === op.roomId);
      const geom = window.NBR5410.getOpeningWorldGeometry(op, room);
      if (geom) {
        addLine('ABERTURAS', geom.x1, geom.y1, geom.x2, geom.y2);
        addText('ABERTURAS', geom.cx, geom.cy, 0.12, op.label || op.type);
      }
    });

    // 3. Escadas
    (project.stairs || []).forEach(st => {
      const w = Number(st.w || 1.2);
      const h = Number(st.h || 2.8);
      addLine('ESCADAS', st.x, st.y, st.x + w, st.y);
      addLine('ESCADAS', st.x + w, st.y, st.x + w, st.y + h);
      addLine('ESCADAS', st.x + w, st.y + h, st.x, st.y + h);
      addLine('ESCADAS', st.x, st.y + h, st.x, st.y);
      addText('ESCADAS', st.x + 0.2, st.y + h / 2, 0.14, st.label || 'ESCADA');
    });

    // 4. Eletrodutos e Eletrocalhas
    (project.conduits || []).forEach(cd => {
      const p1 = (project.points || []).find(p => p.id === cd.fromId);
      const p2 = (project.points || []).find(p => p.id === cd.toId);
      if (p1 && p2) {
        addLine('ELETRODUTOS_CALHAS', p1.x, p1.y, p2.x, p2.y);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        addText('ELETRODUTOS_CALHAS', mx, my, 0.10, `${cd.mounting === 'eletrocalha' ? 'CALHA' : 'D' + (cd.diameterMm || 20) + 'mm'}`);
      }
    });

    // 5. Pontos Elétricos NBR 5444
    (project.points || []).forEach(pt => {
      addCircle('ELETRICA_PONTOS', pt.x, pt.y, pt.category === 'light' ? 0.22 : 0.14);
      addText('ELETRICA_PONTOS', pt.x + 0.16, pt.y - 0.08, 0.11, `${pt.label || pt.category} ${pt.circuitId || ''}`);
    });

    // 6. Cotas Manuais e Textos
    (project.dimensions || []).forEach(dm => {
      addLine('COTAS_TEXTOS', dm.x1, dm.y1, dm.x2, dm.y2);
      const d = Math.hypot(dm.x2 - dm.x1, dm.y2 - dm.y1).toFixed(2);
      addText('COTAS_TEXTOS', (dm.x1 + dm.x2) / 2, (dm.y1 + dm.y2) / 2, 0.14, `${d}m`);
    });
    (project.texts || []).forEach(tx => {
      addText('COTAS_TEXTOS', tx.x, tx.y, 0.18, tx.text);
    });

    push(0, 'ENDSEC');
    push(0, 'EOF');
    return lines.join('\r\n');
  }

  return {
    generateUnifilarSVG,
    exportProjectDXF
  };
})();
