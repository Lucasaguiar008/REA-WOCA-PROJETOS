// ============================================================================
// PROJETOS MODELO INICIAIS — LUCAS AGUIAR PROJETOS ELÉTRICOS
// ============================================================================

window.SampleProjects = (function () {
  function buildDefaultProjects() {
    const p1 = {
      id: 'proj-res-unifamiliar',
      name: 'Residência Unifamiliar Vila Nova',
      client: 'Eng. Carlos Eduardo & Família',
      category: 'Residencial',
      status: 'Em Execução',
      updatedAt: '05/11/2026',
      address: 'Rua das Figueiras, 420 — São Paulo/SP',
      supply: {
        concessionaria: 'Enel SP',
        system: 'Trifásico',
        phaseVoltage: 127,
        lineVoltage: 220
      },
      rooms: [
        { id: 'r-sala', name: 'Sala de Estar/Jantar', type: 'sala', x: 0, y: 0, w: 4.5, h: 4.2 },
        { id: 'r-cozinha', name: 'Cozinha Gourmet', type: 'cozinha', x: 4.5, y: 0, w: 3.6, h: 4.2 },
        { id: 'r-servico', name: 'Área de Serviço', type: 'servico', x: 8.1, y: 0, w: 2.2, h: 4.2 },
        { id: 'r-corredor', name: 'Circulação', type: 'corredor', x: 0, y: 4.2, w: 6.5, h: 1.2 },
        { id: 'r-banho', name: 'Banheiro Social', type: 'banheiro', x: 6.5, y: 4.2, w: 2.0, h: 2.4 },
        { id: 'r-quarto1', name: 'Dormitório 01', type: 'quarto', x: 0, y: 5.4, w: 3.4, h: 3.4 },
        { id: 'r-suite', name: 'Suíte Master', type: 'quarto', x: 3.4, y: 5.4, w: 3.1, h: 3.4 },
        { id: 'r-banho-suite', name: 'Banho Suíte', type: 'banheiro', x: 8.5, y: 4.2, w: 1.8, h: 2.4 }
      ],
      points: [],
      conduits: [],
      circuits: []
    };
    window.NBR5410.autoGenerateNormativePointsAndCircuits(p1);
    window.NBR5410.autoBalancePhases(p1);

    const p2 = {
      id: 'proj-apto-studio',
      name: 'Apartamento Studio Smart 58m²',
      client: 'Incorporadora Horizonte',
      category: 'Residencial',
      status: 'Aprovado',
      updatedAt: '04/11/2026',
      address: 'Av. Paulista, 1850 — Apto 1408 — SP',
      supply: {
        concessionaria: 'Enel SP',
        system: 'Bifásico',
        phaseVoltage: 127,
        lineVoltage: 220
      },
      rooms: [
        { id: 's-living', name: 'Living Integrado', type: 'sala', x: 0, y: 0, w: 4.2, h: 4.0 },
        { id: 's-coz', name: 'Cozinha Compacta', type: 'cozinha', x: 4.2, y: 0, w: 2.8, h: 2.6 },
        { id: 's-lav', name: 'Lavanderia', type: 'servico', x: 4.2, y: 2.6, w: 2.8, h: 1.4 },
        { id: 's-suite', name: 'Dormitório Suíte', type: 'quarto', x: 0, y: 4.0, w: 4.2, h: 3.4 },
        { id: 's-bwc', name: 'Banheiro Suíte', type: 'banheiro', x: 4.2, y: 4.0, w: 2.8, h: 2.2 },
        { id: 's-varanda', name: 'Varanda Técnica', type: 'garagem', x: 4.2, y: 6.2, w: 2.8, h: 1.2 }
      ],
      points: [],
      conduits: [],
      circuits: []
    };
    window.NBR5410.autoGenerateNormativePointsAndCircuits(p2);
    window.NBR5410.autoBalancePhases(p2);

    const p3 = {
      id: 'proj-comercial-cowork',
      name: 'Hub Comercial & Escritório Engenharia',
      client: 'Lucas Aguiar Participações',
      category: 'Comercial',
      status: 'Em Revisão',
      updatedAt: '05/11/2026',
      address: 'Av. Eng. Luís Carlos Berrini, 900 — SP',
      supply: {
        concessionaria: 'CPFL Energia',
        system: 'Trifásico',
        phaseVoltage: 220,
        lineVoltage: 380
      },
      rooms: [
        { id: 'c-recepcao', name: 'Recepção & Lounge', type: 'sala', x: 0, y: 0, w: 3.6, h: 4.0 },
        { id: 'c-open', name: 'Salão de Engenharia (Open Space)', type: 'escritorio', x: 3.6, y: 0, w: 5.4, h: 4.0 },
        { id: 'c-reuniao', name: 'Sala de Reuniões', type: 'escritorio', x: 0, y: 4.0, w: 4.2, h: 3.2 },
        { id: 'c-diretoria', name: 'Sala Diretoria', type: 'escritorio', x: 4.2, y: 4.0, w: 3.0, h: 3.2 },
        { id: 'c-copa', name: 'Copa & Café', type: 'cozinha', x: 7.2, y: 4.0, w: 1.8, h: 1.8 },
        { id: 'c-wc', name: 'Lavabo PNE', type: 'banheiro', x: 7.2, y: 5.8, w: 1.8, h: 1.4 }
      ],
      points: [],
      conduits: [],
      circuits: []
    };
    window.NBR5410.autoGenerateNormativePointsAndCircuits(p3);
    window.NBR5410.autoBalancePhases(p3);

    return [p1, p2, p3];
  }

  return {
    buildDefaultProjects
  };
})();

