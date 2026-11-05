// ============================================================================
// GERADOR AUTOMÁTICO DE DIAGRAMA UNIFILAR E LAYOUT DO QUADRO (QDC) EM SVG
// ============================================================================

window.Diagrams = (function () {
  function generateUnifilarSVG(project) {
    const evaluated = window.NBR5410.evaluateProjectCircuits(project);
    const board = window.NBR5410.calculateBoardSummary(project, evaluated);

    const rowHeight = 62;
    const topMargin = 110;
    const bottomMargin = 130;
    const width = 1060;
    const height = Math.max(580, topMargin + evaluated.length * rowHeight + bottomMargin);

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
        ? `<rect x="650" y="${y - 11}" width="54" height="20" rx="4" fill="rgba(56,189,248,0.18)" stroke="#38bdf8" stroke-width="1"/>
           <text x="677" y="${y + 3}" fill="#38bdf8" font-size="10" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">IDR 30mA</text>`
        : '';

      // Traços de condutores no ramal
      const condLines = c.poles === 2
        ? `<line x1="560" y1="${y - 7}" x2="560" y2="${y + 7}" stroke="#e2e8f0" stroke-width="1.5"/>
           <line x1="566" y1="${y - 7}" x2="566" y2="${y + 7}" stroke="#e2e8f0" stroke-width="1.5"/>
           <line x1="572" y1="${y - 7}" x2="572" y2="${y + 7}" stroke="#34d399" stroke-width="1.5"/>`
        : `<line x1="560" y1="${y - 7}" x2="560" y2="${y + 7}" stroke="#e2e8f0" stroke-width="1.5"/>
           <line x1="566" y1="${y - 7}" x2="566" y2="${y + 7}" stroke="#38bdf8" stroke-width="1.5"/>
           <line x1="572" y1="${y - 7}" x2="572" y2="${y + 7}" stroke="#34d399" stroke-width="1.5"/>`;

      circuitsSvg += `
        <!-- Derivação do Barramento para Circuito ${c.id} -->
        <circle cx="430" cy="${y}" r="3.5" fill="${strokeColor}" />
        <line x1="430" y1="${y}" x2="475" y2="${y}" stroke="${strokeColor}" stroke-width="2" />

        <!-- Símbolo Disjuntor Termomagnético DIN -->
        <rect x="475" y="${y - 13}" width="52" height="26" rx="4" fill="#111827" stroke="${strokeColor}" stroke-width="1.8" />
        <path d="M 486 ${y + 4} Q 501 ${y - 8} 516 ${y + 4}" fill="none" stroke="${strokeColor}" stroke-width="1.6" />
        <text x="501" y="${y - 17}" fill="#f8fafc" font-size="10.5" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">
          ${c.poles}P ${c.breakerA}A (${c.curve})
        </text>

        <!-- Linha de Saída do Circuito -->
        <line x1="527" y1="${y}" x2="720" y2="${y}" stroke="#64748b" stroke-width="1.8" />
        ${condLines}
        <text x="566" y="${y - 11}" fill="#cbd5e1" font-size="10" text-anchor="middle" font-family="JetBrains Mono, monospace">
          #${c.sectionMm2}mm²
        </text>
        <text x="615" y="${y + 14}" fill="#94a3b8" font-size="9.5" text-anchor="middle" font-family="JetBrains Mono, monospace">
          Ø${c.conduitMm}mm (${c.phase})
        </text>
        ${drBadge}

        <!-- Bloco Descritivo do Circuito -->
        <rect x="720" y="${y - 19}" width="305" height="38" rx="6" fill="#111827" stroke="#334155" stroke-width="1.2" />
        <text x="732" y="${y - 3}" fill="#fbbf24" font-size="11.5" font-weight="700" font-family="Inter, sans-serif">
          ${c.id} — ${c.name}
        </text>
        <text x="732" y="${y + 12}" fill="#94a3b8" font-size="10" font-family="JetBrains Mono, monospace">
          ${c.totalVA} VA (${c.totalW}W) | V=${c.voltage}V | Ib=${c.ib}A | ΔV=${c.voltageDropPercent}%
        </text>
      `;
    });

    const busTop = topMargin - 20;
    const busBottom = topMargin + Math.max(0, evaluated.length - 1) * rowHeight + 20;
    const midY = Math.round((busTop + busBottom) / 2);

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="max-width:${width}px;background:#070b14;border-radius:8px;">
        <!-- Moldura Técnica ABNT -->
        <rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="#475569" stroke-width="2" />
        <rect x="18" y="18" width="${width - 36}" height="${height - 36}" fill="none" stroke="#334155" stroke-width="1" />

        <!-- Cabeçalho do Diagrama Unifilar -->
        <text x="36" y="46" fill="#f8fafc" font-size="16" font-weight="800" font-family="Inter, sans-serif">
          DIAGRAMA UNIFILAR GERAL — QDC-01 (${project.name.toUpperCase()})
        </text>
        <text x="36" y="65" fill="#94a3b8" font-size="11.5" font-family="JetBrains Mono, monospace">
          Fornecimento: ${project.supply.concessionaria} | Sistema: ${project.supply.system} (${project.supply.phaseVoltage}/${project.supply.lineVoltage}V) | Demanda Calculada: ${board.demandKVA} kVA
        </text>

        <!-- Ramal de Entrada e Medição -->
        <rect x="36" y="${midY - 40}" width="115" height="80" rx="6" fill="#111827" stroke="#f59e0b" stroke-width="1.8" />
        <text x="93" y="${midY - 14}" fill="#f59e0b" font-size="11" font-weight="700" text-anchor="middle" font-family="Inter, sans-serif">REDE / MEDIDOR</text>
        <text x="93" y="${midY + 4}" fill="#e2e8f0" font-size="10.5" text-anchor="middle" font-family="JetBrains Mono, monospace">${supplyPhases}</text>
        <text x="93" y="${midY + 21}" fill="#94a3b8" font-size="10" text-anchor="middle" font-family="JetBrains Mono, monospace">#${board.mainCableMm2}mm² Cu</text>

        <line x1="151" y1="${midY}" x2="205" y2="${midY}" stroke="#f59e0b" stroke-width="2.5" />

        <!-- Disjuntor Geral DIN -->
        <rect x="205" y="${midY - 22}" width="72" height="44" rx="5" fill="#111827" stroke="#f59e0b" stroke-width="2" />
        <text x="241" y="${midY - 4}" fill="#fbbf24" font-size="11" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">DJ GERAL</text>
        <text x="241" y="${midY + 12}" fill="#f8fafc" font-size="11" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">${board.mainBreakerA}A Curva C</text>

        <line x1="277" y1="${midY}" x2="325" y2="${midY}" stroke="#f59e0b" stroke-width="2.5" />

        <!-- IDR Geral + DPS Classe II -->
        <rect x="325" y="${midY - 22}" width="78" height="44" rx="5" fill="#111827" stroke="#38bdf8" stroke-width="1.8" />
        <text x="364" y="${midY - 4}" fill="#38bdf8" font-size="10.5" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">IDR ${board.idrMainA}A</text>
        <text x="364" y="${midY + 12}" fill="#bae6fd" font-size="9.5" text-anchor="middle" font-family="JetBrains Mono, monospace">30mA + DPS</text>

        <!-- Derivação DPS + Aterramento TN-S -->
        <line x1="302" y1="${midY}" x2="302" y2="${midY + 62}" stroke="#34d399" stroke-width="1.8" stroke-dasharray="4 3" />
        <rect x="272" y="${midY + 62}" width="60" height="32" rx="4" fill="#111827" stroke="#34d399" stroke-width="1.5" />
        <text x="302" y="${midY + 77}" fill="#34d399" font-size="9.5" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">DPS 20kA</text>
        <text x="302" y="${midY + 89}" fill="#6ee7b7" font-size="8.5" text-anchor="middle" font-family="JetBrains Mono, monospace">275V Cl.II</text>
        <!-- Símbolo Terra -->
        <line x1="302" y1="${midY + 94}" x2="302" y2="${midY + 108}" stroke="#34d399" stroke-width="1.8" />
        <line x1="290" y1="${midY + 108}" x2="314" y2="${midY + 108}" stroke="#34d399" stroke-width="2" />
        <line x1="294" y1="${midY + 113}" x2="310" y2="${midY + 113}" stroke="#34d399" stroke-width="1.8" />
        <line x1="298" y1="${midY + 118}" x2="306" y2="${midY + 118}" stroke="#34d399" stroke-width="1.5" />

        <!-- Ligação ao Barramento Principal do QDC -->
        <line x1="403" y1="${midY}" x2="430" y2="${midY}" stroke="#f59e0b" stroke-width="2.5" />
        <line x1="430" y1="${busTop}" x2="430" y2="${busBottom}" stroke="#f59e0b" stroke-width="4" />
        <text x="430" y="${busTop - 8}" fill="#fbbf24" font-size="10.5" font-weight="700" text-anchor="middle" font-family="JetBrains Mono, monospace">BARRAMENTO QDC</text>

        <!-- Circuitos Terminais -->
        ${circuitsSvg}

        <!-- Carimbo Técnico ABNT — LUCAS AGUIAR -->
        <g transform="translate(${width - 420}, ${height - 96})">
          <rect x="0" y="0" width="394" height="72" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="1.6" />
          <line x1="145" y1="0" x2="145" y2="72" stroke="#334155" stroke-width="1" />
          <text x="14" y="26" fill="#f59e0b" font-size="13" font-weight="800" font-family="Inter, sans-serif">LUCAS AGUIAR</text>
          <text x="14" y="43" fill="#cbd5e1" font-size="9.5" font-weight="600" font-family="Inter, sans-serif">PROJETOS ELÉTRICOS</text>
          <text x="14" y="58" fill="#64748b" font-size="8.5" font-family="JetBrains Mono, monospace">ABNT NBR 5410 / 5444</text>

          <text x="157" y="20" fill="#f8fafc" font-size="10.5" font-weight="700" font-family="Inter, sans-serif">Projeto: ${project.name}</text>
          <text x="157" y="36" fill="#cbd5e1" font-size="9.5" font-family="Inter, sans-serif">Cliente: ${project.client}</text>
          <text x="157" y="51" fill="#94a3b8" font-size="9.5" font-family="JetBrains Mono, monospace">Pot. Instalada: ${board.totalInstalledVA} VA | Demanda: ${board.demandVA} VA</text>
          <text x="157" y="64" fill="#38bdf8" font-size="9" font-family="JetBrains Mono, monospace">Resp. Técnico: Lucas Aguiar | Data: ${project.updatedAt}</text>
        </g>
      </svg>
    `;
  }

  return {
    generateUnifilarSVG
  };
})();

