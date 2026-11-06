// ============================================================================
// CONTROLADOR PRINCIPAL DA APLICAÇÃO — LUCAS AGUIAR PROJETOS ELÉTRICOS
// ============================================================================

window.App = (function () {
  const STORAGE_KEY = 'lucas_aguiar_woca_projects_v1';
  const THEME_KEY = 'lucas_aguiar_theme_v1';

  let projects = [];
  let currentProject = null;
  let activeFilter = 'Todos';
  let searchQuery = '';
  let customPriceOverrides = {};
  let activePrintSheetIndex = 0;

  function init() {
    initTheme();
    loadProjectsFromStorage();
    bindGlobalEvents();
    renderDashboard();
  }

  // ==================== TEMA CLARO / ESCURO (ITEM 7) ====================
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
  }

  function applyTheme(theme) {
    const isLight = theme === 'light';
    document.body.classList.toggle('light-theme', isLight);
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    document.querySelectorAll('.js-theme-label').forEach(el => {
      el.textContent = isLight ? 'Tema Escuro' : 'Tema Claro';
    });
    if (window.CAD2D) window.CAD2D.render();
    if (window.Viewer3D) {
      window.Viewer3D.render();
      if (window.Viewer3D.renderBoard3D) window.Viewer3D.renderBoard3D();
    }
  }

  function toggleTheme() {
    const isLight = document.body.classList.contains('light-theme');
    const next = isLight ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    showToast(`Tema alterado para ${next === 'light' ? 'Modo Claro' : 'Modo Escuro'}!`);
  }

  function loadProjectsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          projects = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('Erro ao ler projetos salvos:', e);
    }
    projects = window.SampleProjects.buildDefaultProjects();
    saveProjectsToStorage();
  }

  function saveProjectsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.warn('Erro ao salvar projetos:', e);
    }
  }

  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f59e0b" stroke-width="2.2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
      <span>${message}</span>
    `;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s';
      setTimeout(() => el.remove(), 260);
    }, 2800);
  }

  function switchScreen(screenId) {
    document.querySelectorAll('.view-screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
  }

  // ==================== EVENTOS GLOBAIS ====================
  function bindGlobalEvents() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('loginEmail').value.trim();
        const displayUser = document.getElementById('navUserName');
        if (displayUser && emailInput) {
          displayUser.textContent = 'Lucas Aguiar';
        }
        switchScreen('dashboardScreen');
        renderDashboard();
        showToast('Bem-vindo ao Studio Lucas Aguiar — Projetos Elétricos!');
      });
    }

    const searchInput = document.getElementById('projectSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderProjectsGrid();
      });
    }

    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter || 'Todos';
        renderProjectsGrid();
      });
    });

    const newProjForm = document.getElementById('newProjectForm');
    if (newProjForm) {
      newProjForm.addEventListener('submit', (e) => {
        e.preventDefault();
        createNewProjectFromModal();
      });
    }

    const newRoomForm = document.getElementById('addRoomModalForm');
    if (newRoomForm) {
      newRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        createRoomFromModal();
      });
    }

    const importJsonInput = document.getElementById('importProjectJsonInput');
    if (importJsonInput) {
      importJsonInput.addEventListener('change', handleImportProjectJson);
    }

    const floorplanInput = document.getElementById('floorplanFileInput');
    if (floorplanInput) {
      floorplanInput.addEventListener('change', handleFloorplanUpload);
    }

    const c2d = document.getElementById('cad2dCanvas');
    if (c2d) {
      window.CAD2D.init(c2d, {
        onSelectionChange: (sel) => {
          renderPropertyInspector(sel);
          renderSidebarRoomList();
        },
        onToolChange: (toolName) => {
          document.querySelectorAll('.tool-btn[data-tool]').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === toolName);
          });
        },
        onStateChange: (state) => {
          updateHistoryClipboardButtons(state);
        },
        onProjectMutate: (msg) => {
          if (currentProject) {
            currentProject.updatedAt = new Date().toLocaleDateString('pt-BR');
            saveProjectsToStorage();
            updateEditorHeaderStats();
            renderSidebarRoomList();
            populate3DRoomFilterDropdown();
            updateRemoveFloorplanBtnState();
            if (msg) showToast(msg);
          }
        }
      });
    }

    const c3d = document.getElementById('cad3dCanvas');
    if (c3d) {
      window.Viewer3D.init(c3d);
    }

    const b3d = document.getElementById('board3dCanvas');
    if (b3d && window.Viewer3D.initBoard3D) {
      window.Viewer3D.initBoard3D(b3d);
    }
  }

  // ==================== DASHBOARD (/projetos) ====================
  function renderDashboard() {
    let totalRooms = 0;
    let totalArea = 0;
    let totalVA = 0;

    projects.forEach(p => {
      totalRooms += (p.rooms || []).length;
      (p.rooms || []).forEach(r => { totalArea += r.w * r.h; });
      const evalC = window.NBR5410.evaluateProjectCircuits(p);
      evalC.forEach(c => { totalVA += c.totalVA; });
    });

    const statCount = document.getElementById('statProjectsCount');
    const statArea = document.getElementById('statTotalArea');
    const statPower = document.getElementById('statTotalPower');
    const statRooms = document.getElementById('statTotalRooms');

    if (statCount) statCount.textContent = projects.length;
    if (statArea) statArea.textContent = `${totalArea.toFixed(0)} m²`;
    if (statPower) statPower.textContent = `${(totalVA / 1000).toFixed(1)} kVA`;
    if (statRooms) statRooms.textContent = `${totalRooms} cômodos`;

    renderProjectsGrid();
  }

  function renderProjectsGrid() {
    const grid = document.getElementById('projectsGrid');
    if (!grid) return;

    const filtered = projects.filter(p => {
      const matchCat = activeFilter === 'Todos' || p.category === activeFilter;
      const matchSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery) ||
        (p.client && p.client.toLowerCase().includes(searchQuery)) ||
        (p.address && p.address.toLowerCase().includes(searchQuery));
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 48px; background: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: 12px;">
          <h3 style="margin-bottom:8px;">Nenhum projeto encontrado</h3>
          <p style="color:var(--text-muted); margin-bottom:16px;">Tente ajustar os filtros ou crie um novo projeto elétrico.</p>
          <button class="btn btn-primary" onclick="App.openNewProjectModal()">+ Criar Novo Projeto</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(proj => {
      const area = (proj.rooms || []).reduce((acc, r) => acc + r.w * r.h, 0).toFixed(1);
      const evaluated = window.NBR5410.evaluateProjectCircuits(proj);
      const board = window.NBR5410.calculateBoardSummary(proj, evaluated);
      const badgeClass = proj.category === 'Comercial' ? 'badge-blue' : 'badge-amber';

      return `
        <div class="project-card">
          <div class="project-card-preview" onclick="App.openProject('${proj.id}')" title="Clique para abrir e editar o projeto no Studio">
            <canvas id="preview-canvas-${proj.id}"></canvas>
            <div class="project-badge-group">
              <span class="badge ${badgeClass}">${proj.category}</span>
              <span class="badge badge-green">${proj.supply.system} ${proj.supply.phaseVoltage}/${proj.supply.lineVoltage}V</span>
            </div>
          </div>
          <div class="project-card-body">
            <div class="project-card-title" onclick="App.openProject('${proj.id}')">${proj.name}</div>
            <div class="project-card-client">${proj.client} • ${proj.address || 'Brasil'}</div>
            <div class="project-metrics">
              <div class="metric-item">
                <span class="metric-item-val">${area}m²</span>
                <span class="metric-item-lbl">Área</span>
              </div>
              <div class="metric-item">
                <span class="metric-item-val">${(proj.points || []).length}</span>
                <span class="metric-item-lbl">Pontos</span>
              </div>
              <div class="metric-item">
                <span class="metric-item-val">${(proj.circuits || []).length}</span>
                <span class="metric-item-lbl">Circuitos</span>
              </div>
              <div class="metric-item">
                <span class="metric-item-val">${board.demandKVA}kVA</span>
                <span class="metric-item-lbl">Demanda</span>
              </div>
            </div>
            <div class="project-card-footer">
              <span class="project-date">Atualizado em ${proj.updatedAt}</span>
              <div class="project-actions">
                <button class="btn btn-secondary btn-sm" onclick="App.duplicateProject('${proj.id}')" title="Duplicar Projeto">Duplicar</button>
                <button class="btn btn-danger btn-sm" onclick="App.deleteProject('${proj.id}')" title="Excluir Projeto">Excluir</button>
                <button class="btn btn-primary btn-sm" onclick="App.openProject('${proj.id}')">Abrir Studio</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    requestAnimationFrame(() => {
      filtered.forEach(proj => {
        const c = document.getElementById(`preview-canvas-${proj.id}`);
        if (c) window.CAD2D.renderProjectPreviewToCanvas(c, proj);
      });
    });
  }

  function openNewProjectModal(defaultTemplate) {
    const tplSelect = document.getElementById('npTemplate');
    if (tplSelect && defaultTemplate) {
      tplSelect.value = defaultTemplate;
    }
    document.getElementById('newProjectModal').classList.add('active');
  }

  function closeNewProjectModal() {
    document.getElementById('newProjectModal').classList.remove('active');
  }

  // ==================== CRIAÇÃO DE NOVO PROJETO (INCLUINDO EM BRANCO - ITEM 13) ====================
  function createNewProjectFromModal() {
    const name = document.getElementById('npName').value.trim() || 'Novo Projeto Elétrico';
    const client = document.getElementById('npClient').value.trim() || 'Cliente Particular';
    const category = document.getElementById('npCategory').value;
    const concessionaria = document.getElementById('npConcessionaria').value;
    const entranceEl = document.getElementById('npEntranceType');
    const entranceType = entranceEl ? entranceEl.value : 'Aéreo (Poste c/ Mureta)';
    const system = document.getElementById('npSystem').value;
    const voltagePair = document.getElementById('npVoltage').value.split('/');
    const templateType = document.getElementById('npTemplate').value;

    const newProj = {
      id: `proj-${Date.now()}`,
      name,
      client,
      category,
      status: 'Em Elaboração',
      updatedAt: new Date().toLocaleDateString('pt-BR'),
      address: document.getElementById('npAddress').value.trim() || 'São Paulo/SP',
      supply: {
        concessionaria,
        entranceType,
        system,
        phaseVoltage: Number(voltagePair[0] || 127),
        lineVoltage: Number(voltagePair[1] || 220)
      },
      rooms: [],
      openings: [],
      points: [],
      conduits: [],
      texts: [],
      dimensions: [],
      stairs: [],
      circuits: [],
      backgroundFloorplanDataUrl: null
    };

    if (templateType === 'em_branco') {
      // Projeto 100% em branco: sem cômodos pré-gerados e sem pré-dimensionamento
      newProj.circuits = [
        { id: 'C1', number: 1, name: 'Iluminação Geral', type: 'iluminacao', voltage: newProj.supply.phaseVoltage, pf: 1.0, phase: 'R', dr: false, fca: 1.0 },
        { id: 'C2', number: 2, name: 'Tomadas de Uso Geral (TUG)', type: 'tug', voltage: newProj.supply.phaseVoltage, pf: 0.8, phase: 'S', dr: true, fca: 1.0 }
      ];
    } else if (templateType === 'residencial_padrao') {
      newProj.rooms = [
        { id: 'r1', name: 'Sala de Estar', type: 'sala', x: 0, y: 0, w: 4.2, h: 3.8 },
        { id: 'r2', name: 'Cozinha', type: 'cozinha', x: 4.2, y: 0, w: 3.4, h: 3.8 },
        { id: 'r3', name: 'Área de Serviço', type: 'servico', x: 7.6, y: 0, w: 2.0, h: 3.8 },
        { id: 'r4', name: 'Dormitório Casal', type: 'quarto', x: 0, y: 3.8, w: 3.8, h: 3.4 },
        { id: 'r5', name: 'Banheiro Social', type: 'banheiro', x: 3.8, y: 3.8, w: 2.0, h: 2.4 },
        { id: 'r6', name: 'Dormitório Solteiro', type: 'quarto', x: 5.8, y: 3.8, w: 3.8, h: 3.4 }
      ];
      window.NBR5410.autoGenerateNormativePointsAndCircuits(newProj);
      window.NBR5410.autoBalancePhases(newProj);
    } else if (templateType === 'comercial_escritorio') {
      newProj.rooms = [
        { id: 'c1', name: 'Recepção', type: 'sala', x: 0, y: 0, w: 3.5, h: 3.6 },
        { id: 'c2', name: 'Área Operacional', type: 'escritorio', x: 3.5, y: 0, w: 5.5, h: 3.6 },
        { id: 'c3', name: 'Sala de Reunião', type: 'escritorio', x: 0, y: 3.6, w: 4.5, h: 3.0 },
        { id: 'c4', name: 'Copa', type: 'cozinha', x: 4.5, y: 3.6, w: 2.5, h: 3.0 },
        { id: 'c5', name: 'Lavabo', type: 'banheiro', x: 7.0, y: 3.6, w: 2.0, h: 3.0 }
      ];
      window.NBR5410.autoGenerateNormativePointsAndCircuits(newProj);
      window.NBR5410.autoBalancePhases(newProj);
    } else {
      newProj.rooms = [
        { id: 'b1', name: 'Sala Principal', type: 'sala', x: 0, y: 0, w: 4.0, h: 4.0 },
        { id: 'b2', name: 'Cozinha', type: 'cozinha', x: 4.0, y: 0, w: 3.2, h: 4.0 }
      ];
      window.NBR5410.autoGenerateNormativePointsAndCircuits(newProj);
    }

    projects.unshift(newProj);
    saveProjectsToStorage();
    closeNewProjectModal();
    openProject(newProj.id);
    showToast(
      templateType === 'em_branco'
        ? `Projeto em branco "${newProj.name}" criado! Desenhe cômodos ou importe uma planta.`
        : `Projeto "${newProj.name}" criado e pronto para edição!`
    );
  }

  function duplicateProject(id) {
    const orig = projects.find(p => p.id === id);
    if (!orig) return;
    const copy = JSON.parse(JSON.stringify(orig));
    copy.id = `proj-${Date.now()}`;
    copy.name = `${orig.name} (Cópia)`;
    copy.updatedAt = new Date().toLocaleDateString('pt-BR');
    projects.unshift(copy);
    saveProjectsToStorage();
    renderDashboard();
    showToast(`Projeto duplicado: ${copy.name}`);
  }

  function deleteProject(id) {
    if (projects.length <= 1) {
      showToast('Mantenha pelo menos um projeto ativo na plataforma.');
      return;
    }
    const target = projects.find(p => p.id === id);
    if (!target) return;
    projects = projects.filter(p => p.id !== id);
    saveProjectsToStorage();
    renderDashboard();
    showToast(`Projeto "${target.name}" removido.`);
  }

  function resetDemoProjects() {
    projects = window.SampleProjects.buildDefaultProjects();
    saveProjectsToStorage();
    renderDashboard();
    showToast('Projetos padrão restaurados com sucesso!');
  }

  // ==================== ABERTURA DO STUDIO DE PROJETO ====================
  function openProject(id) {
    const found = projects.find(p => p.id === id);
    if (!found) return;
    currentProject = found;
    if (!Array.isArray(currentProject.texts)) currentProject.texts = [];
    if (!Array.isArray(currentProject.dimensions)) currentProject.dimensions = [];
    if (!Array.isArray(currentProject.stairs)) currentProject.stairs = [];
    if (!Array.isArray(currentProject.openings)) currentProject.openings = [];
    if (!currentProject.supply.entranceType) currentProject.supply.entranceType = 'Aéreo (Poste c/ Mureta)';
    activePrintSheetIndex = 0;

    switchScreen('editorScreen');
    updateEditorHeaderStats();
    populate3DRoomFilterDropdown();
    updateRemoveFloorplanBtnState();
    switchEditorTab('tab2d');

    requestAnimationFrame(() => {
      window.CAD2D.setProject(currentProject);
      window.Viewer3D.setProject(currentProject);
      updateLockRoomsUI(window.CAD2D.isRoomsLocked());
      if (currentProject.rooms && currentProject.rooms.length > 0) {
        window.CAD2D.selectById('room', currentProject.rooms[0].id, false);
      } else {
        renderPropertyInspector(null);
      }
      renderSidebarRoomList();
    });
  }

  function backToDashboard() {
    saveProjectsToStorage();
    switchScreen('dashboardScreen');
    renderDashboard();
  }

  function updateEditorHeaderStats() {
    if (!currentProject) return;
    const titleEl = document.getElementById('editorProjectTitle');
    const subEl = document.getElementById('editorProjectSub');
    const evaluated = window.NBR5410.evaluateProjectCircuits(currentProject);
    const board = window.NBR5410.calculateBoardSummary(currentProject, evaluated);

    if (titleEl) titleEl.textContent = currentProject.name;
    if (subEl) {
      subEl.textContent = `${currentProject.supply.system} ${currentProject.supply.phaseVoltage}/${currentProject.supply.lineVoltage}V • ${(currentProject.rooms || []).length} Ambientes • ${(currentProject.points || []).length} Pontos • Demanda: ${board.demandKVA} kVA`;
    }
  }

  function switchEditorTab(tabId) {
    document.querySelectorAll('.editor-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });

    if (!currentProject) return;

    if (tabId === 'tab2d') {
      requestAnimationFrame(() => {
        window.CAD2D.resize();
        window.CAD2D.render();
        renderSidebarRoomList();
      });
    } else if (tabId === 'tab3d') {
      populate3DRoomFilterDropdown();
      requestAnimationFrame(() => {
        window.Viewer3D.setProject(currentProject);
        window.Viewer3D.resize();
      });
    } else if (tabId === 'tabBoard3d') {
      requestAnimationFrame(() => {
        window.Viewer3D.setProject(currentProject);
        if (window.Viewer3D.resizeBoard3D) window.Viewer3D.resizeBoard3D();
        if (window.Viewer3D.renderBoard3D) window.Viewer3D.renderBoard3D();
      });
    } else if (tabId === 'tabRooms') {
      renderRoomsPanel();
    } else if (tabId === 'tabCircuits') {
      renderCircuitsPanel();
    } else if (tabId === 'tabBoard') {
      renderBoardAndUnifilarPanel();
    } else if (tabId === 'tabMaterials') {
      renderMaterialsPanel();
    } else if (tabId === 'tabPrint') {
      renderPrintSetupTab();
    }
  }

  function updateHistoryClipboardButtons(state) {
    if (!state) return;
    document.querySelectorAll('.js-btn-undo').forEach(b => { b.disabled = !state.canUndo; });
    document.querySelectorAll('.js-btn-redo').forEach(b => { b.disabled = !state.canRedo; });
    document.querySelectorAll('.js-btn-copy').forEach(b => { b.disabled = !state.canCopy; });
    document.querySelectorAll('.js-btn-paste').forEach(b => { b.disabled = !state.canPaste; });
    document.querySelectorAll('.js-btn-delete').forEach(b => { b.disabled = !state.hasSelection; });
  }

  // ==================== FILTROS 3D POR CÔMODO E POR LAYER (ITENS 3 e 4) ====================
  function populate3DRoomFilterDropdown() {
    const sel = document.getElementById('select3dRoomFilter');
    if (!sel || !currentProject) return;
    const prevVal = sel.value || 'all';
    const opts = [`<option value="all">Todos os Cômodos (Planta Completa)</option>`];
    (currentProject.rooms || []).forEach(r => {
      opts.push(`<option value="${r.id}" ${prevVal === r.id ? 'selected' : ''}>Isolar: ${r.name} (${r.w}×${r.h}m)</option>`);
    });
    sel.innerHTML = opts.join('');
  }

  function filter3DByRoom(roomId) {
    const sel = document.getElementById('select3dRoomFilter');
    if (sel) sel.value = roomId || 'all';
    window.Viewer3D.setRoomFilter(roomId || 'all');
    if (roomId && roomId !== 'all' && currentProject) {
      const r = currentProject.rooms.find(rm => rm.id === roomId);
      if (r) showToast(`Visão 3D isolada para o cômodo: ${r.name}`);
    } else {
      showToast('Visão 3D exibindo todos os cômodos da planta.');
    }
  }

  function setQuickFilter3D(mode) {
    window.Viewer3D.setQuickFilter3D(mode);
    const setChk = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = val;
    };
    if (mode === 'all') {
      setChk('chk3dTug', true);
      setChk('chk3dTue', true);
      setChk('chk3dLight', true);
      setChk('chk3dSwitches', true);
      setChk('chk3dBoards', true);
      setChk('chk3dConduits', true);
      setChk('chk3dTelecom', true);
      setChk('chk3dOpenings', true);
      showToast('Exibindo todas as camadas na Vista 3D.');
    } else if (mode === 'only_tug') {
      setChk('chk3dTug', true);
      setChk('chk3dTue', false);
      setChk('chk3dLight', false);
      setChk('chk3dSwitches', false);
      setChk('chk3dBoards', false);
      setChk('chk3dConduits', false);
      setChk('chk3dTelecom', false);
      showToast('Filtro 3D: Exibindo apenas Tomadas TUG!');
    } else if (mode === 'only_tue') {
      setChk('chk3dTug', false);
      setChk('chk3dTue', true);
      setChk('chk3dLight', false);
      setChk('chk3dSwitches', false);
      setChk('chk3dBoards', false);
      setChk('chk3dConduits', false);
      setChk('chk3dTelecom', false);
      showToast('Filtro 3D: Exibindo apenas Tomadas TUE (Uso Específico)!');
    } else if (mode === 'only_light') {
      setChk('chk3dTug', false);
      setChk('chk3dTue', false);
      setChk('chk3dLight', true);
      setChk('chk3dSwitches', false);
      setChk('chk3dBoards', false);
      setChk('chk3dConduits', false);
      setChk('chk3dTelecom', false);
      showToast('Filtro 3D: Exibindo apenas Luminárias e Sensores!');
    }
  }

  // ==================== GESTÃO INTERATIVA DE CÔMODOS ====================
  function renderSidebarRoomList() {
    const listEl = document.getElementById('sidebarRoomList');
    if (!listEl || !currentProject) return;
    const sel = window.CAD2D.getSelectedItem();

    if (!currentProject.rooms || currentProject.rooms.length === 0) {
      listEl.innerHTML = `<div style="font-size:11.5px; color:var(--text-muted); padding:6px;">Planta vazia. Clique em "+ Novo" ou desenhe no Canvas.</div>`;
      return;
    }

    listEl.innerHTML = currentProject.rooms.map(r => {
      const isSel = sel && sel.kind === 'room' && sel.id === r.id;
      const area = (r.w * r.h).toFixed(1);
      return `
        <div class="layer-toggle" style="border-color:${isSel ? '#f59e0b' : 'var(--border-subtle)'}; background:${isSel ? 'rgba(245,158,11,0.14)' : 'var(--bg-primary)'};"
             onclick="App.selectRoomFromList('${r.id}')">
          <span class="layer-toggle-left" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <span class="layer-dot" style="background:${isSel ? '#f59e0b' : '#38bdf8'}"></span>
            <strong style="font-size:12px;">${r.name}</strong>
          </span>
          <span class="mono" style="font-size:11px; color:var(--text-muted);">${r.w}×${r.h}m (${area}m²)</span>
        </div>
      `;
    }).join('');
  }

  function selectRoomFromList(roomId) {
    window.CAD2D.selectById('room', roomId, false);
  }

  function openAddRoomModal() {
    const modal = document.getElementById('addRoomModal');
    if (!modal || !currentProject) return;
    document.getElementById('arName').value = `Ambiente ${(currentProject.rooms || []).length + 1}`;
    document.getElementById('arType').value = 'quarto';
    document.getElementById('arWidth').value = '3.5';
    document.getElementById('arHeight').value = '3.2';
    modal.classList.add('active');
  }

  function closeAddRoomModal() {
    const modal = document.getElementById('addRoomModal');
    if (modal) modal.classList.remove('active');
  }

  function createRoomFromModal() {
    if (!currentProject) return;
    window.CAD2D.pushHistorySnapshot();
    const name = document.getElementById('arName').value.trim() || `Ambiente ${currentProject.rooms.length + 1}`;
    const type = document.getElementById('arType').value || 'quarto';
    const w = Math.max(1.2, parseFloat(document.getElementById('arWidth').value) || 3.4);
    const h = Math.max(1.2, parseFloat(document.getElementById('arHeight').value) || 3.2);
    const autoNbr = document.getElementById('arAutoNbr').checked;

    let nextX = 0;
    let nextY = 0;
    if (currentProject.rooms.length > 0) {
      let maxX = -Infinity;
      let minYAtMaxX = 0;
      currentProject.rooms.forEach(r => {
        if (r.x + r.w > maxX) {
          maxX = +(r.x + r.w).toFixed(2);
          minYAtMaxX = r.y;
        }
      });
      nextX = maxX;
      nextY = minYAtMaxX;
    }

    const newRoom = {
      id: `room-${Date.now()}`,
      name,
      type,
      x: nextX,
      y: nextY,
      w: +w.toFixed(2),
      h: +h.toFixed(2)
    };

    currentProject.rooms.push(newRoom);
    if (autoNbr) {
      window.CAD2D.populateSingleRoomNormativePoints(newRoom);
    }

    currentProject.updatedAt = new Date().toLocaleDateString('pt-BR');
    saveProjectsToStorage();
    closeAddRoomModal();

    window.CAD2D.fitToView();
    window.CAD2D.selectById('room', newRoom.id, true);
    renderSidebarRoomList();
    populate3DRoomFilterDropdown();
    renderRoomsPanel();
    updateEditorHeaderStats();
    showToast(`Cômodo "${newRoom.name}" (${newRoom.w}m × ${newRoom.h}m) adicionado à planta!`);
  }

  function duplicateRoom(roomId) {
    if (!currentProject) return;
    const orig = currentProject.rooms.find(r => r.id === roomId);
    if (!orig) return;
    window.CAD2D.pushHistorySnapshot();
    const newRoom = {
      id: `room-${Date.now()}`,
      name: `${orig.name} (2)`,
      type: orig.type,
      x: +(orig.x + orig.w).toFixed(2),
      y: orig.y,
      w: orig.w,
      h: orig.h
    };
    currentProject.rooms.push(newRoom);
    window.CAD2D.populateSingleRoomNormativePoints(newRoom);
    saveProjectsToStorage();
    window.CAD2D.fitToView();
    window.CAD2D.selectById('room', newRoom.id, true);
    renderSidebarRoomList();
    populate3DRoomFilterDropdown();
    renderRoomsPanel();
    updateEditorHeaderStats();
    showToast(`Cômodo "${newRoom.name}" duplicado com pontos NBR 5410!`);
  }

  function regenerateSingleRoomPoints(roomId) {
    if (!currentProject) return;
    const room = currentProject.rooms.find(r => r.id === roomId);
    if (!room) return;
    window.CAD2D.pushHistorySnapshot();
    window.CAD2D.populateSingleRoomNormativePoints(room);
    saveProjectsToStorage();
    window.CAD2D.render();
    renderPropertyInspector({ kind: 'room', id: roomId });
    renderRoomsPanel();
    updateEditorHeaderStats();
    showToast(`Pontos NBR 5410 recalculados para "${room.name}" (desviando de portas e vãos)!`);
  }

  function deleteRoomById(roomId) {
    if (!currentProject) return;
    window.CAD2D.selectById('room', roomId, false);
    window.CAD2D.deleteSelectedItem();
    renderRoomsPanel();
    renderSidebarRoomList();
    populate3DRoomFilterDropdown();
  }

  // ==================== FERRAMENTAS DO EDITOR 2D, GRID, LIMPAR TUDO & DXF/IMG ====================
  function selectCadTool(toolName, btnEl) {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    window.CAD2D.setTool(toolName);
    if (toolName === 'add_room') {
      showToast('Modo Desenhar Ambiente ativo: Clique e arraste no Canvas 2D para criar o cômodo!');
    } else if (toolName === 'dimension') {
      showToast('Modo Cota Manual: Clique no 1º ponto e depois no 2º ponto para medir!');
    } else if (toolName === 'text') {
      showToast('Modo Texto: Clique em qualquer ponto da planta para inserir uma anotação!');
    } else if (toolName === 'stair') {
      showToast('Modo Escada: Clique na planta para posicionar uma escada (Reta, L, U ou Caracol)!');
    }
  }

  function toggleCadLayer(layerName, checkboxEl) {
    window.CAD2D.setLayerVisible(layerName, checkboxEl.checked);
  }

  function toggleCadGrid(checkboxEl) {
    window.CAD2D.setGridVisible(checkboxEl.checked);
    showToast(checkboxEl.checked ? 'Grid da planta 2D exibido.' : 'Grid da planta 2D ocultado.');
  }

  function toggleLockRooms() {
    const isLocked = window.CAD2D.toggleLockRooms();
    updateLockRoomsUI(isLocked);
    saveProjectsToStorage();
    showToast(isLocked ? '🔒 Todos os cômodos foram travados contra movimentação!' : '🔓 Cômodos destravados para edição de posição!');
  }

  function setLockRooms(locked) {
    const isLocked = window.CAD2D.setLockRooms(locked);
    updateLockRoomsUI(isLocked);
    saveProjectsToStorage();
    showToast(isLocked ? '🔒 Todos os cômodos foram travados contra movimentação!' : '🔓 Cômodos destravados para edição de posição!');
  }

  function updateLockRoomsUI(isLocked) {
    const btn = document.getElementById('btnLockRooms');
    const txt = document.getElementById('btnLockRoomsText');
    const chk = document.getElementById('chkLockRooms');
    if (btn) {
      if (isLocked) {
        btn.classList.add('btn-locked');
        btn.classList.remove('btn-secondary');
      } else {
        btn.classList.remove('btn-locked');
        btn.classList.add('btn-secondary');
      }
    }
    if (txt) {
      txt.textContent = isLocked ? 'Destravar Cômodos' : 'Travar Cômodos';
    }
    if (chk) {
      chk.checked = Boolean(isLocked);
    }
  }

  function toggleRoomLock(roomId, locked) {
    if (!currentProject || !currentProject.rooms) return;
    const room = currentProject.rooms.find(r => r.id === roomId);
    if (!room) return;
    room.locked = locked !== undefined ? Boolean(locked) : !room.locked;
    saveProjectsToStorage();
    window.CAD2D.render();
    renderPropertyInspector({ kind: 'room', id: roomId });
    renderRoomsPanel();
    showToast(room.locked ? `🔒 Cômodo "${room.name}" travado contra movimentação!` : `🔓 Cômodo "${room.name}" destravado!`);
  }

  function clearAllCurrentProject() {
    if (!currentProject) return;
    window.CAD2D.clearAllProject();
    currentProject.updatedAt = new Date().toLocaleDateString('pt-BR');
    saveProjectsToStorage();
    updateEditorHeaderStats();
    renderSidebarRoomList();
    populate3DRoomFilterDropdown();
    renderRoomsPanel();
    renderCircuitsPanel();
    renderPropertyInspector(null);
  }

  function runAutoGenerateNormative() {
    if (!currentProject) return;
    if (!currentProject.rooms || currentProject.rooms.length === 0) {
      showToast('Adicione ou desenhe pelo menos um cômodo antes de executar o lançamento automático!');
      return;
    }
    window.CAD2D.pushHistorySnapshot();
    window.NBR5410.autoGenerateNormativePointsAndCircuits(currentProject);
    window.NBR5410.autoBalancePhases(currentProject);
    currentProject.updatedAt = new Date().toLocaleDateString('pt-BR');
    saveProjectsToStorage();
    window.CAD2D.setProject(currentProject);
    if (currentProject.rooms.length > 0) {
      window.CAD2D.selectById('room', currentProject.rooms[0].id, false);
    }
    updateEditorHeaderStats();
    renderRoomsPanel();
    showToast('Lançamento automático NBR 5410 concluído (livre de vãos e portas)!');
  }

  function handleFloorplanUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || !currentProject) return;
    if (file.name.toLowerCase().endsWith('.dxf')) {
      // Gera representação visual da planta DXF exclusiva para este projeto
      const off = document.createElement('canvas');
      off.width = 900;
      off.height = 650;
      const octx = off.getContext('2d');
      octx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      octx.lineWidth = 2;
      octx.strokeRect(40, 40, 820, 570);
      octx.strokeRect(40, 40, 420, 320);
      octx.strokeRect(460, 40, 400, 320);
      octx.strokeRect(40, 360, 360, 250);
      octx.strokeRect(400, 360, 460, 250);
      octx.fillStyle = 'rgba(56, 189, 248, 0.75)';
      octx.font = 'bold 16px JetBrains Mono, monospace';
      octx.fillText(`REFERÊNCIA CAD DXF: ${file.name}`, 56, 72);
      const dataUrl = off.toDataURL('image/png');
      currentProject.backgroundFloorplanName = file.name;
      window.CAD2D.setBackgroundFloorplan(dataUrl);
      saveProjectsToStorage();
      updateRemoveFloorplanBtnState();
      showToast(`Planta DXF "${file.name}" vinculada exclusivamente a este projeto!`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = function (ev) {
      currentProject.backgroundFloorplanName = file.name;
      window.CAD2D.setBackgroundFloorplan(ev.target.result);
      saveProjectsToStorage();
      updateRemoveFloorplanBtnState();
      showToast(`Planta "${file.name}" carregada neste projeto (sem afetar outros projetos)!`);
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  }

  function removeCurrentProjectFloorplan() {
    if (!currentProject) return;
    if (!currentProject.backgroundFloorplanDataUrl && !currentProject.backgroundFloorplanName) {
      showToast('Nenhuma planta DXF/Imagem importada neste projeto.');
      return;
    }
    currentProject.backgroundFloorplanName = null;
    window.CAD2D.removeBackgroundFloorplan();
    const inp = document.getElementById('floorplanFileInput');
    if (inp) inp.value = '';
    saveProjectsToStorage();
    updateRemoveFloorplanBtnState();
  }

  function updateRemoveFloorplanBtnState() {
    const btn = document.getElementById('btnRemoveFloorplan');
    if (!btn) return;
    const hasBg = Boolean(currentProject && (currentProject.backgroundFloorplanDataUrl || currentProject.backgroundFloorplanName));
    btn.disabled = !hasBg;
    btn.style.opacity = hasBg ? '1' : '0.45';
  }

  function exportCurrentProjectDXF() {
    if (!currentProject) return;
    const dxfContent = window.Diagrams.exportProjectDXF(currentProject);
    const blob = new Blob([dxfContent], { type: 'application/dxf;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Planta_Eletrica_${currentProject.name.replace(/\s+/g, '_')}_Lucas_Aguiar.dxf`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Planta elétrica exportada em formato AutoCAD (.DXF)!');
  }

  // ==================== INSPETOR DE PROPRIEDADES (LADO DIREITO DO CAD) ====================
  function renderPropertyInspector(selection) {
    const box = document.getElementById('propertyInspectorContent');
    if (!box || !currentProject) return;

    if (!selection) {
      const evaluated = window.NBR5410.evaluateProjectCircuits(currentProject);
      const board = window.NBR5410.calculateBoardSummary(currentProject, evaluated);
      const entranceType = currentProject.supply.entranceType || 'Aéreo (Poste c/ Mureta)';
      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Resumo &amp; Padrão de Entrada</div>
          <div class="form-group">
            <label>Nome do Projeto</label>
            <input type="text" class="form-input" value="${currentProject.name}" oninput="App.updateProjectMeta('name', this.value)" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Concessionária</label>
              <select class="form-select" onchange="App.updateSupplyField('concessionaria', this.value)">
                <option value="Enel" ${currentProject.supply.concessionaria === 'Enel' ? 'selected' : ''}>Enel</option>
                <option value="CPFL Energia" ${currentProject.supply.concessionaria === 'CPFL Energia' ? 'selected' : ''}>CPFL Energia</option>
                <option value="CEMIG" ${currentProject.supply.concessionaria === 'CEMIG' ? 'selected' : ''}>CEMIG</option>
                <option value="Neoenergia" ${currentProject.supply.concessionaria === 'Neoenergia' ? 'selected' : ''}>Neoenergia</option>
                <option value="Copel" ${currentProject.supply.concessionaria === 'Copel' ? 'selected' : ''}>Copel</option>
                <option value="Celesc" ${currentProject.supply.concessionaria === 'Celesc' ? 'selected' : ''}>Celesc</option>
                <option value="Equatorial" ${currentProject.supply.concessionaria === 'Equatorial' ? 'selected' : ''}>Equatorial</option>
                <option value="Light" ${currentProject.supply.concessionaria === 'Light' ? 'selected' : ''}>Light</option>
              </select>
            </div>
            <div class="form-group">
              <label>Tipo do Padrão</label>
              <select class="form-select" onchange="App.updateSupplyField('entranceType', this.value)">
                <option value="Aéreo (Poste c/ Mureta)" ${entranceType.includes('Aéreo') ? 'selected' : ''}>Aéreo (Poste/Mureta)</option>
                <option value="Subterrâneo (Caixa de Passagem)" ${entranceType.includes('Subterrâneo') ? 'selected' : ''}>Subterrâneo</option>
                <option value="Fachada / Pontalete" ${entranceType.includes('Fachada') ? 'selected' : ''}>Fachada / Pontalete</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Sistema</label>
              <select class="form-select" onchange="App.updateSupplySystem(this.value)">
                <option value="Monofásico" ${currentProject.supply.system === 'Monofásico' ? 'selected' : ''}>Monofásico</option>
                <option value="Bifásico" ${currentProject.supply.system === 'Bifásico' ? 'selected' : ''}>Bifásico</option>
                <option value="Trifásico" ${currentProject.supply.system === 'Trifásico' ? 'selected' : ''}>Trifásico</option>
              </select>
            </div>
            <div class="form-group">
              <label>Tensão (V)</label>
              <select class="form-select" onchange="App.updateSupplyVoltage(this.value)">
                <option value="127/220" ${currentProject.supply.phaseVoltage === 127 ? 'selected' : ''}>127 / 220V</option>
                <option value="220/380" ${currentProject.supply.phaseVoltage === 220 ? 'selected' : ''}>220 / 380V</option>
              </select>
            </div>
          </div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-section-title">Ações Rápidas de Planta</div>
          <button class="btn btn-primary btn-block btn-sm" onclick="App.openAddRoomModal()" style="margin-bottom:6px;">
            + Adicionar Novo Cômodo
          </button>
          <button class="btn btn-secondary btn-block btn-sm" onclick="App.selectCadTool('add_room', document.getElementById('btnDrawRoomTool'))" style="margin-bottom:6px;">
            Desenhar Cômodo com o Mouse
          </button>
          <button class="btn btn-accent btn-block btn-sm" onclick="App.exportCurrentProjectDXF()">
            Exportar Planta em .DXF
          </button>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-section-title">Métricas Normativas &amp; Entrada</div>
          <div style="display:flex; flex-direction:column; gap:7px; font-size:12px;">
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted)">Potência Instalada:</span>
              <strong class="mono">${board.totalInstalledVA} VA (${board.totalInstalledW} W)</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted)">Demanda Estimada:</span>
              <strong class="mono" style="color:var(--brand-primary)">${board.demandVA} VA (${board.demandKVA} kVA)</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted)">Padrão Concessionária:</span>
              <strong class="mono">Cat. ${board.entrance.categoryCode} (${board.mainBreakerA}A)</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted)">Ramal / Eletroduto Entrada:</span>
              <strong class="mono">#${board.mainCableMm2}mm² • Ø${board.entrance.conduitMm}mm</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted)">Malha de Aterramento:</span>
              <strong class="mono">${board.entrance.groundRodsCount}x Hastes Copperweld</strong>
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (selection.kind === 'room') {
      const room = currentProject.rooms.find(r => r.id === selection.id);
      if (!room) return;
      const comp = window.NBR5410.inspectRoomCompliance(room, currentProject.points);
      const roomTypesHtml = Object.entries(window.NBR5410.ROOM_TYPES).map(([k, v]) =>
        `<option value="${k}" ${room.type === k ? 'selected' : ''}>${v.label}</option>`
      ).join('');

      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            <span>Editar Cômodo Selecionado</span>
            <span class="badge ${comp.compliant ? 'badge-green' : 'badge-amber'}">${comp.compliant ? 'NBR 5410 OK' : 'Abaixo do Mínimo'}</span>
          </div>
          <div class="form-group">
            <label>Nome do Ambiente</label>
            <input type="text" id="inspectorRoomName" class="form-input" value="${room.name}"
              oninput="App.updateRoomPropLive('${room.id}', 'name', this.value)" />
          </div>
          <div class="form-group">
            <label>Tipo de Ambiente (NBR 5410)</label>
            <select class="form-select" onchange="App.updateRoomProp('${room.id}', 'type', this.value)">
              ${roomTypesHtml}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Largura X (m)</label>
              <input type="number" step="0.1" min="1.2" class="form-input mono" value="${room.w}"
                oninput="App.updateRoomDimensionLive('${room.id}', 'w', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Comprimento Y (m)</label>
              <input type="number" step="0.1" min="1.2" class="form-input mono" value="${room.h}"
                oninput="App.updateRoomDimensionLive('${room.id}', 'h', parseFloat(this.value))" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Posição X (m)</label>
              <input type="number" step="0.2" class="form-input mono" value="${room.x}"
                oninput="App.updateRoomDimensionLive('${room.id}', 'x', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Posição Y (m)</label>
              <input type="number" step="0.2" class="form-input mono" value="${room.y}"
                oninput="App.updateRoomDimensionLive('${room.id}', 'y', parseFloat(this.value))" />
            </div>
          </div>
          <div id="roomNormSummaryBox" style="background:var(--bg-primary); padding:10px; border-radius:6px; font-size:12px; margin-bottom:10px; border:1px solid var(--border-subtle);">
            <div>Área: <strong class="mono">${comp.area} m²</strong> | Perímetro: <strong class="mono">${comp.perimeter} m</strong></div>
            <div style="margin-top:4px;">Mín. Iluminação NBR: <strong class="mono">${comp.minLightingVA} VA</strong> (Atual: ${comp.installedLightingVA} VA)</div>
            <div>Mín. TUGs NBR: <strong class="mono">${comp.minTugCount} un / ${comp.minTugVA} VA</strong> (Atual: ${comp.installedTugCount} un / ${comp.installedTugVA} VA)</div>
          </div>
          <div class="form-group" style="background:var(--bg-primary); padding:8px 10px; border-radius:6px; border:1px solid ${room.locked ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)'}; margin-bottom:10px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; font-weight:600; margin:0; color:${room.locked ? '#f87171' : 'inherit'};">
              <input type="checkbox" ${room.locked ? 'checked' : ''} onchange="App.toggleRoomLock('${room.id}', this.checked)" />
              <span>🔒 Travar posição deste cômodo</span>
            </label>
          </div>
          <div style="margin-bottom:10px;">
            <label style="display:block; font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">Inserir Abertura Neste Cômodo</label>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">
              <button class="btn btn-secondary btn-sm" onclick="App.addOpeningToRoom('${room.id}', 'door')">+ Porta</button>
              <button class="btn btn-secondary btn-sm" onclick="App.addOpeningToRoom('${room.id}', 'window')">+ Janela</button>
              <button class="btn btn-secondary btn-sm" onclick="App.addOpeningToRoom('${room.id}', 'opening')">+ Vão</button>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:7px;">
            <button class="btn btn-primary btn-block btn-sm" onclick="App.regenerateSingleRoomPoints('${room.id}')">
              Recalcular Pontos NBR 5410 deste Cômodo
            </button>
            <button class="btn btn-secondary btn-block btn-sm" onclick="App.duplicateRoom('${room.id}')">
              Duplicar Este Cômodo
            </button>
            <button class="btn btn-danger btn-block btn-sm" onclick="CAD2D.deleteSelectedItem()">
              Excluir Cômodo
            </button>
          </div>
        </div>
      `;
    } else if (selection.kind === 'opening') {
      const op = (currentProject.openings || []).find(o => o.id === selection.id);
      if (!op) return;
      const roomOptions = currentProject.rooms.map(r =>
        `<option value="${r.id}" ${op.roomId === r.id ? 'selected' : ''}>${r.name}</option>`
      ).join('');
      const typeTitle = op.type === 'door' ? 'Porta de Giro' : op.type === 'window' ? 'Janela / Esquadria' : 'Vão Livre / Passagem';

      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            <span>${typeTitle}</span>
            <span class="badge badge-blue">2D &amp; 3D</span>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Tipo de Abertura</label>
              <select class="form-select" onchange="App.updateOpeningProp('${op.id}', 'type', this.value)">
                <option value="door" ${op.type === 'door' ? 'selected' : ''}>Porta de Giro</option>
                <option value="window" ${op.type === 'window' ? 'selected' : ''}>Janela</option>
                <option value="opening" ${op.type === 'opening' ? 'selected' : ''}>Vão Livre</option>
              </select>
            </div>
            <div class="form-group">
              <label>Código / Etiqueta</label>
              <input type="text" class="form-input mono" value="${op.label || ''}"
                oninput="App.updateOpeningPropLive('${op.id}', 'label', this.value)" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Ambiente</label>
              <select class="form-select" onchange="App.updateOpeningProp('${op.id}', 'roomId', this.value)">
                ${roomOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Parede</label>
              <select class="form-select" onchange="App.updateOpeningProp('${op.id}', 'wall', this.value)">
                <option value="n" ${op.wall === 'n' ? 'selected' : ''}>Norte (Superior)</option>
                <option value="s" ${op.wall === 's' ? 'selected' : ''}>Sul (Inferior)</option>
                <option value="w" ${op.wall === 'w' ? 'selected' : ''}>Oeste (Esquerda)</option>
                <option value="e" ${op.wall === 'e' ? 'selected' : ''}>Leste (Direita)</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Posição na Parede (m)</label>
              <input type="number" step="0.1" min="0.3" class="form-input mono" value="${op.offset}"
                oninput="App.updateOpeningPropLive('${op.id}', 'offset', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Largura do Vão (m)</label>
              <input type="number" step="0.05" min="0.4" max="5.0" class="form-input mono" value="${op.width}"
                oninput="App.updateOpeningPropLive('${op.id}', 'width', parseFloat(this.value))" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Altura (m)</label>
              <input type="number" step="0.05" min="0.4" max="2.7" class="form-input mono" value="${op.height ?? 2.1}"
                oninput="App.updateOpeningPropLive('${op.id}', 'height', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Peitoril Z (m)</label>
              <input type="number" step="0.05" min="0.0" max="2.2" class="form-input mono" value="${op.sillHeight ?? 0}"
                oninput="App.updateOpeningPropLive('${op.id}', 'sillHeight', parseFloat(this.value))" />
            </div>
          </div>
          ${op.type === 'door' ? `
          <div class="form-group">
            <label>Sentido de Abertura da Folha (Giro 90°)</label>
            <select class="form-select" onchange="App.updateOpeningProp('${op.id}', 'swing', this.value)">
              <option value="in-left" ${op.swing === 'in-left' ? 'selected' : ''}>Para Dentro • Dobradiça à Esquerda</option>
              <option value="in-right" ${op.swing === 'in-right' ? 'selected' : ''}>Para Dentro • Dobradiça à Direita</option>
              <option value="out-left" ${op.swing === 'out-left' ? 'selected' : ''}>Para Fora • Dobradiça à Esquerda</option>
              <option value="out-right" ${op.swing === 'out-right' ? 'selected' : ''}>Para Fora • Dobradiça à Direita</option>
            </select>
          </div>
          ` : ''}
          <div style="display:flex; flex-direction:column; gap:7px; margin-top:8px;">
            ${op.type === 'door' ? `
            <button class="btn btn-primary btn-block btn-sm" onclick="CAD2D.flipSelectedOpeningSwing()">
              Inverter Lado de Abertura (Tecla R)
            </button>
            ` : ''}
            <button class="btn btn-secondary btn-block btn-sm" onclick="CAD2D.duplicateSelected()">
              Duplicar Abertura (Ctrl+D)
            </button>
            <button class="btn btn-danger btn-block btn-sm" onclick="CAD2D.deleteSelectedItem()">
              Remover Abertura (Delete)
            </button>
          </div>
        </div>
      `;
    } else if (selection.kind === 'point') {
      const pt = currentProject.points.find(p => p.id === selection.id);
      if (!pt) return;
      const circuitOptions = (currentProject.circuits || []).map(c =>
        `<option value="${c.id}" ${pt.circuitId === c.id ? 'selected' : ''}>${c.id} — ${c.name}</option>`
      ).join('');

      let subtypeSelectorHtml = '';
      if (pt.category === 'tug') {
        subtypeSelectorHtml = `
          <div class="form-group">
            <label>Tipo de Tomada (Simples / Dupla / Tripla)</label>
            <select class="form-select" onchange="App.updatePointSubtype('${pt.id}', this.value)">
              <option value="baixa" ${pt.subtype === 'baixa' ? 'selected' : ''}>Tomada Simples Baixa (0.30m)</option>
              <option value="dupla" ${pt.subtype === 'dupla' ? 'selected' : ''}>Tomada Dupla 2x (0.30m)</option>
              <option value="tripla" ${pt.subtype === 'tripla' ? 'selected' : ''}>Tomada Tripla 3x (0.30m)</option>
              <option value="media" ${pt.subtype === 'media' ? 'selected' : ''}>Tomada Média (1.30m)</option>
            </select>
          </div>
        `;
      } else if (pt.category === 'switch') {
        subtypeSelectorHtml = `
          <div class="form-group">
            <label>Tipo de Interruptor</label>
            <select class="form-select" onchange="App.updatePointSubtype('${pt.id}', this.value)">
              <option value="simples" ${pt.subtype === 'simples' ? 'selected' : ''}>Interruptor Simples (1 Seção)</option>
              <option value="duplo" ${pt.subtype === 'duplo' ? 'selected' : ''}>Interruptor Duplo (2 Seções)</option>
              <option value="triplo" ${pt.subtype === 'triplo' ? 'selected' : ''}>Interruptor Triplo (3 Seções)</option>
              <option value="3way" ${pt.subtype === '3way' ? 'selected' : ''}>Interruptor Paralelo (Three-Way)</option>
              <option value="4way" ${pt.subtype === '4way' ? 'selected' : ''}>Interruptor Intermediário (Four-Way)</option>
              <option value="campainha" ${pt.subtype === 'campainha' ? 'selected' : ''}>Pulsador de Campainha</option>
            </select>
          </div>
        `;
      }

      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Ponto (${pt.category.toUpperCase()})</div>
          <div class="form-group">
            <label>Identificação / Etiqueta</label>
            <input type="text" id="inspectorPointLabel" class="form-input" value="${pt.label || ''}"
              oninput="App.updatePointPropLive('${pt.id}', 'label', this.value)" />
          </div>
          ${subtypeSelectorHtml}
          ${!['qdc', 'quadro_parcial', 'padrao_entrada', 'caixa_passagem', 'conduit_sobe', 'conduit_desce'].includes(pt.category) ? `
          <div class="form-group">
            <label>Circuito Associado</label>
            <select class="form-select" onchange="App.updatePointProp('${pt.id}', 'circuitId', this.value)">
              <option value="—" ${!pt.circuitId || pt.circuitId === '—' ? 'selected' : ''}>Sem Circuito / Telecom</option>
              ${circuitOptions}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Potência (VA)</label>
              <input type="number" step="10" min="0" class="form-input mono" value="${pt.powerVA || 0}"
                oninput="App.updatePointPropLive('${pt.id}', 'powerVA', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Altura Z (m)</label>
              <input type="number" step="0.1" min="0" max="4" class="form-input mono" value="${pt.z ?? 1.3}"
                oninput="App.updatePointPropLive('${pt.id}', 'z', parseFloat(this.value))" />
            </div>
          </div>
          ` : ''}
          ${(pt.category === 'light' || pt.category === 'switch' || pt.category === 'sensor_presenca') ? `
          <div class="form-group">
            <label>Letra de Comando (Retorno)</label>
            <input type="text" class="form-input mono" value="${pt.command || 'a1'}"
              oninput="App.updatePointPropLive('${pt.id}', 'command', this.value)" />
          </div>
          ` : ''}
          <div class="form-row">
            <div class="form-group">
              <label>Coord. X (m)</label>
              <input type="number" step="0.1" class="form-input mono" value="${pt.x}"
                oninput="App.updatePointPropLive('${pt.id}', 'x', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Coord. Y (m)</label>
              <input type="number" step="0.1" class="form-input mono" value="${pt.y}"
                oninput="App.updatePointPropLive('${pt.id}', 'y', parseFloat(this.value))" />
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:7px;">
            <button class="btn btn-secondary btn-block btn-sm" onclick="CAD2D.rotateSelectedPoint()">
              Rotacionar Símbolo 90° (Tecla R)
            </button>
            <button class="btn btn-danger btn-block btn-sm" onclick="CAD2D.deleteSelectedItem()">
              Remover Componente
            </button>
          </div>
        </div>
      `;
    } else if (selection.kind === 'conduit') {
      const cd = currentProject.conduits.find(c => c.id === selection.id);
      if (!cd) return;
      const isTray = cd.infraType === 'eletrocalha';
      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">${isTray ? 'Trecho de Eletrocalha' : 'Trecho de Eletroduto'}</div>
          <div class="form-group">
            <label>Tipo de Conduto (Eletroduto ou Eletrocalha)</label>
            <select class="form-select" onchange="App.updateConduitProp('${cd.id}', 'infraType', this.value)">
              <option value="conduit" ${!isTray ? 'selected' : ''}>Eletroduto Fechado (PVC / PEAD)</option>
              <option value="eletrocalha" ${isTray ? 'selected' : ''}>Eletrocalha / Perfilado Metálico</option>
            </select>
          </div>
          <div class="form-group">
            <label>Método de Instalação</label>
            <select class="form-select" onchange="App.updateConduitProp('${cd.id}', 'mounting', this.value)">
              <option value="laje" ${cd.mounting === 'laje' ? 'selected' : ''}>Embutido na Laje / Teto</option>
              <option value="parede" ${cd.mounting === 'parede' ? 'selected' : ''}>Embutido na Parede</option>
              <option value="piso" ${cd.mounting === 'piso' ? 'selected' : ''}>Embutido no Piso / Subterrâneo</option>
              <option value="aparente" ${cd.mounting === 'aparente' ? 'selected' : ''}>Aparente / Aéreo Suspenso</option>
            </select>
          </div>
          <div class="form-group">
            <label>Dimensão Nominal (mm)</label>
            <select class="form-select mono" onchange="App.updateConduitProp('${cd.id}', 'diameterMm', parseInt(this.value, 10))">
              <option value="20" ${cd.diameterMm === 20 ? 'selected' : ''}>Ø 20 mm (3/4")</option>
              <option value="25" ${cd.diameterMm === 25 ? 'selected' : ''}>Ø 25 mm (1")</option>
              <option value="32" ${cd.diameterMm === 32 ? 'selected' : ''}>Ø 32 mm (1 1/4")</option>
              <option value="40" ${cd.diameterMm === 40 ? 'selected' : ''}>Ø 40 mm (1 1/2")</option>
              <option value="50" ${cd.diameterMm === 50 ? 'selected' : ''}>50 mm (Eletrocalha 50×50 / Ø2")</option>
              <option value="100" ${cd.diameterMm === 100 ? 'selected' : ''}>100 mm (Eletrocalha 100×50mm)</option>
            </select>
          </div>
          <button class="btn btn-danger btn-block btn-sm" onclick="CAD2D.deleteSelectedItem()">Remover Trecho</button>
        </div>
      `;
    } else if (selection.kind === 'text') {
      const tx = (currentProject.texts || []).find(t => t.id === selection.id);
      if (!tx) return;
      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Texto / Observação na Planta</div>
          <div class="form-group">
            <label>Conteúdo do Texto</label>
            <input type="text" class="form-input" value="${tx.text || ''}"
              oninput="App.updateTextPropLive('${tx.id}', 'text', this.value)" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Tamanho Fonte (px)</label>
              <input type="number" min="9" max="28" class="form-input mono" value="${tx.fontSize || 12}"
                oninput="App.updateTextPropLive('${tx.id}', 'fontSize', parseInt(this.value, 10))" />
            </div>
            <div class="form-group">
              <label>Cor Destaque</label>
              <select class="form-select" onchange="App.updateTextPropLive('${tx.id}', 'color', this.value)">
                <option value="#fbbf24" ${tx.color === '#fbbf24' ? 'selected' : ''}>Âmbar Técnico</option>
                <option value="#38bdf8" ${tx.color === '#38bdf8' ? 'selected' : ''}>Azul Ciano</option>
                <option value="#34d399" ${tx.color === '#34d399' ? 'selected' : ''}>Verde Norma</option>
                <option value="#f43f5e" ${tx.color === '#f43f5e' ? 'selected' : ''}>Vermelho Alerta</option>
                <option value="#f8fafc" ${tx.color === '#f8fafc' ? 'selected' : ''}>Branco Neutro</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Posição X (m)</label>
              <input type="number" step="0.1" class="form-input mono" value="${tx.x}"
                oninput="App.updateTextPropLive('${tx.id}', 'x', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Posição Y (m)</label>
              <input type="number" step="0.1" class="form-input mono" value="${tx.y}"
                oninput="App.updateTextPropLive('${tx.id}', 'y', parseFloat(this.value))" />
            </div>
          </div>
          <button class="btn btn-danger btn-block btn-sm" onclick="CAD2D.deleteSelectedItem()">Remover Texto</button>
        </div>
      `;
    } else if (selection.kind === 'dimension') {
      const dm = (currentProject.dimensions || []).find(d => d.id === selection.id);
      if (!dm) return;
      const dist = Math.hypot(dm.x2 - dm.x1, dm.y2 - dm.y1).toFixed(2);
      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Cota de Medição Manual</div>
          <div style="background:var(--bg-primary); padding:10px; border-radius:6px; margin-bottom:10px; border:1px solid var(--border-subtle);">
            Distância Medida: <strong class="mono" style="color:var(--brand-primary); font-size:14px;">${dist} m</strong>
          </div>
          <div class="form-group">
            <label>Texto Personalizado da Cota (Opcional)</label>
            <input type="text" class="form-input mono" placeholder="${dist} m" value="${dm.label || ''}"
              oninput="App.updateDimensionPropLive('${dm.id}', 'label', this.value)" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Início X1 (m)</label>
              <input type="number" step="0.1" class="form-input mono" value="${dm.x1}"
                oninput="App.updateDimensionPropLive('${dm.id}', 'x1', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Início Y1 (m)</label>
              <input type="number" step="0.1" class="form-input mono" value="${dm.y1}"
                oninput="App.updateDimensionPropLive('${dm.id}', 'y1', parseFloat(this.value))" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Fim X2 (m)</label>
              <input type="number" step="0.1" class="form-input mono" value="${dm.x2}"
                oninput="App.updateDimensionPropLive('${dm.id}', 'x2', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Fim Y2 (m)</label>
              <input type="number" step="0.1" class="form-input mono" value="${dm.y2}"
                oninput="App.updateDimensionPropLive('${dm.id}', 'y2', parseFloat(this.value))" />
            </div>
          </div>
          <button class="btn btn-danger btn-block btn-sm" onclick="CAD2D.deleteSelectedItem()">Remover Cota</button>
        </div>
      `;
    } else if (selection.kind === 'stair') {
      const st = (currentProject.stairs || []).find(s => s.id === selection.id);
      if (!st) return;
      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            <span>Escada Arquitetônica</span>
            <span class="badge badge-amber">2D &amp; 3D</span>
          </div>
          <div class="form-group">
            <label>Tipo de Escada</label>
            <select class="form-select" onchange="App.updateStairProp('${st.id}', 'stairType', this.value)">
              <option value="reta" ${st.stairType === 'reta' ? 'selected' : ''}>Escada Reta (1 Lance)</option>
              <option value="em_l" ${st.stairType === 'em_l' ? 'selected' : ''}>Escada em L (Com Patamar)</option>
              <option value="em_u" ${st.stairType === 'em_u' ? 'selected' : ''}>Escada em U (2 Lances + Patamar)</option>
              <option value="caracol" ${st.stairType === 'caracol' ? 'selected' : ''}>Escada Caracol / Helicoidal</option>
            </select>
          </div>
          <div class="form-group">
            <label>Identificação</label>
            <input type="text" class="form-input" value="${st.label || 'Escada'}"
              oninput="App.updateStairPropLive('${st.id}', 'label', this.value)" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Largura X (m)</label>
              <input type="number" step="0.1" min="0.8" class="form-input mono" value="${st.w}"
                oninput="App.updateStairPropLive('${st.id}', 'w', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Comprimento Y (m)</label>
              <input type="number" step="0.1" min="1.0" class="form-input mono" value="${st.h}"
                oninput="App.updateStairPropLive('${st.id}', 'h', parseFloat(this.value))" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Posição X (m)</label>
              <input type="number" step="0.1" class="form-input mono" value="${st.x}"
                oninput="App.updateStairPropLive('${st.id}', 'x', parseFloat(this.value))" />
            </div>
            <div class="form-group">
              <label>Posição Y (m)</label>
              <input type="number" step="0.1" class="form-input mono" value="${st.y}"
                oninput="App.updateStairPropLive('${st.id}', 'y', parseFloat(this.value))" />
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:7px;">
            <button class="btn btn-secondary btn-block btn-sm" onclick="CAD2D.rotateSelectedPoint()">
              Rotacionar Escada 90° (Tecla R)
            </button>
            <button class="btn btn-danger btn-block btn-sm" onclick="CAD2D.deleteSelectedItem()">
              Remover Escada
            </button>
          </div>
        </div>
      `;
    }
  }

  function updateProjectMeta(field, val) {
    if (!currentProject) return;
    currentProject[field] = val;
    saveProjectsToStorage();
    updateEditorHeaderStats();
  }

  function updateSupplyField(field, val) {
    if (!currentProject) return;
    currentProject.supply[field] = val;
    saveProjectsToStorage();
    updateEditorHeaderStats();
    renderPropertyInspector(null);
  }

  function updateSupplySystem(val) {
    if (!currentProject) return;
    currentProject.supply.system = val;
    window.NBR5410.autoBalancePhases(currentProject);
    saveProjectsToStorage();
    updateEditorHeaderStats();
    renderPropertyInspector(null);
  }

  function updateSupplyVoltage(val) {
    if (!currentProject) return;
    const parts = val.split('/');
    currentProject.supply.phaseVoltage = Number(parts[0]);
    currentProject.supply.lineVoltage = Number(parts[1]);
    saveProjectsToStorage();
    updateEditorHeaderStats();
    renderPropertyInspector(null);
  }

  function updateRoomPropLive(roomId, prop, val) {
    const room = currentProject.rooms.find(r => r.id === roomId);
    if (!room) return;
    room[prop] = val;
    saveProjectsToStorage();
    window.CAD2D.render();
    renderSidebarRoomList();
    populate3DRoomFilterDropdown();
  }

  function updateRoomDimensionLive(roomId, prop, val) {
    if (isNaN(val)) return;
    const room = currentProject.rooms.find(r => r.id === roomId);
    if (!room) return;
    if ((prop === 'w' || prop === 'h') && val < 1.0) return;

    const oldX = room.x, oldY = room.y, oldW = room.w, oldH = room.h;
    room[prop] = val;

    currentProject.points.forEach(p => {
      if (p.roomId === room.id) {
        const relX = oldW > 0 ? (p.x - oldX) / oldW : 0.5;
        const relY = oldH > 0 ? (p.y - oldY) / oldH : 0.5;
        p.x = +(room.x + relX * room.w).toFixed(2);
        p.y = +(room.y + relY * room.h).toFixed(2);
      }
    });

    saveProjectsToStorage();
    window.CAD2D.render();
    renderSidebarRoomList();
    populate3DRoomFilterDropdown();
    updateEditorHeaderStats();

    const summaryBox = document.getElementById('roomNormSummaryBox');
    if (summaryBox) {
      const comp = window.NBR5410.inspectRoomCompliance(room, currentProject.points);
      summaryBox.innerHTML = `
        <div>Área: <strong class="mono">${comp.area} m²</strong> | Perímetro: <strong class="mono">${comp.perimeter} m</strong></div>
        <div style="margin-top:4px;">Mín. Iluminação NBR: <strong class="mono">${comp.minLightingVA} VA</strong> (Atual: ${comp.installedLightingVA} VA)</div>
        <div>Mín. TUGs NBR: <strong class="mono">${comp.minTugCount} un / ${comp.minTugVA} VA</strong> (Atual: ${comp.installedTugCount} un / ${comp.installedTugVA} VA)</div>
      `;
    }
  }

  function updateRoomProp(roomId, prop, val) {
    const room = currentProject.rooms.find(r => r.id === roomId);
    if (!room) return;
    room[prop] = val;
    saveProjectsToStorage();
    window.CAD2D.render();
    renderSidebarRoomList();
    updateEditorHeaderStats();
    renderPropertyInspector({ kind: 'room', id: roomId });
  }

  function updatePointPropLive(ptId, prop, val) {
    const pt = currentProject.points.find(p => p.id === ptId);
    if (!pt) return;
    if (typeof val === 'number' && isNaN(val)) return;
    pt[prop] = val;
    saveProjectsToStorage();
    window.CAD2D.render();
    updateEditorHeaderStats();
  }

  function updatePointProp(ptId, prop, val) {
    const pt = currentProject.points.find(p => p.id === ptId);
    if (!pt) return;
    pt[prop] = val;
    saveProjectsToStorage();
    window.CAD2D.render();
    updateEditorHeaderStats();
    renderPropertyInspector({ kind: 'point', id: ptId });
  }

  function updatePointSubtype(ptId, newSubtype) {
    const pt = currentProject.points.find(p => p.id === ptId);
    if (!pt) return;
    pt.subtype = newSubtype;
    if (pt.category === 'tug') {
      if (newSubtype === 'dupla') { pt.powerVA = 200; pt.label = 'TUG Dupla (2x100VA)'; }
      else if (newSubtype === 'tripla') { pt.powerVA = 300; pt.label = 'TUG Tripla (3x100VA)'; }
      else if (newSubtype === 'media') { pt.powerVA = 600; pt.z = 1.3; pt.label = 'TUG 600VA'; }
      else { pt.powerVA = 100; pt.z = 0.3; pt.label = 'TUG 100VA'; }
    } else if (pt.category === 'switch') {
      const labels = {
        simples: 'Int. Simples',
        duplo: 'Int. Duplo (a/b)',
        triplo: 'Int. Triplo (a/b/c)',
        '3way': 'Int. Three-Way',
        '4way': 'Int. Four-Way',
        campainha: 'Pulsador Campainha'
      };
      pt.label = labels[newSubtype] || pt.label;
    }
    saveProjectsToStorage();
    window.CAD2D.render();
    window.Viewer3D.render();
    updateEditorHeaderStats();
    renderPropertyInspector({ kind: 'point', id: ptId });
  }

  function updateConduitProp(cdId, prop, val) {
    const cd = currentProject.conduits.find(c => c.id === cdId);
    if (!cd) return;
    cd[prop] = val;
    if (prop === 'infraType' && val === 'eletrocalha' && cd.diameterMm < 50) {
      cd.diameterMm = 50;
      cd.mounting = 'aparente';
    }
    saveProjectsToStorage();
    window.CAD2D.render();
    window.Viewer3D.render();
    renderPropertyInspector({ kind: 'conduit', id: cdId });
  }

  function updateTextPropLive(txId, prop, val) {
    const tx = (currentProject.texts || []).find(t => t.id === txId);
    if (!tx) return;
    if (typeof val === 'number' && isNaN(val)) return;
    tx[prop] = val;
    saveProjectsToStorage();
    window.CAD2D.render();
  }

  function updateDimensionPropLive(dmId, prop, val) {
    const dm = (currentProject.dimensions || []).find(d => d.id === dmId);
    if (!dm) return;
    if (typeof val === 'number' && isNaN(val)) return;
    dm[prop] = val;
    saveProjectsToStorage();
    window.CAD2D.render();
  }

  function updateStairPropLive(stId, prop, val) {
    const st = (currentProject.stairs || []).find(s => s.id === stId);
    if (!st) return;
    if (typeof val === 'number' && isNaN(val)) return;
    st[prop] = val;
    saveProjectsToStorage();
    window.CAD2D.render();
    window.Viewer3D.render();
  }

  function updateStairProp(stId, prop, val) {
    const st = (currentProject.stairs || []).find(s => s.id === stId);
    if (!st) return;
    st[prop] = val;
    const names = { reta: 'Escada Reta', em_l: 'Escada em L', em_u: 'Escada em U', caracol: 'Escada Caracol' };
    if (prop === 'stairType' && names[val]) {
      st.label = names[val];
      if (val === 'caracol') { st.w = 1.8; st.h = 1.8; }
      else if (val === 'em_u') { st.w = 2.4; st.h = 2.8; }
      else if (val === 'em_l') { st.w = 2.2; st.h = 2.4; }
      else { st.w = 1.2; st.h = 2.8; }
    }
    saveProjectsToStorage();
    window.CAD2D.render();
    window.Viewer3D.render();
    renderPropertyInspector({ kind: 'stair', id: stId });
  }

  function addOpeningToRoom(roomId, openingType) {
    if (!currentProject) return;
    const room = currentProject.rooms.find(r => r.id === roomId);
    if (!room) return;
    const defaultWall = openingType === 'window' ? 'n' : openingType === 'opening' ? 'e' : 's';
    window.CAD2D.placeNewOpeningAt(room.x + room.w / 2, room.y + room.h / 2, openingType, roomId, defaultWall);
  }

  function updateOpeningPropLive(opId, prop, val) {
    if (!currentProject || !Array.isArray(currentProject.openings)) return;
    if (typeof val === 'number' && isNaN(val)) return;
    const op = currentProject.openings.find(o => o.id === opId);
    if (!op) return;
    op[prop] = val;
    saveProjectsToStorage();
    window.CAD2D.render();
    window.Viewer3D.render();
  }

  function updateOpeningProp(opId, prop, val) {
    if (!currentProject || !Array.isArray(currentProject.openings)) return;
    window.CAD2D.pushHistorySnapshot();
    const op = currentProject.openings.find(o => o.id === opId);
    if (!op) return;
    op[prop] = val;
    if (prop === 'type') {
      if (val === 'window' && Number(op.sillHeight) === 0) {
        op.sillHeight = 1.00;
        op.height = 1.10;
      } else if (val !== 'window') {
        op.sillHeight = 0.00;
        op.height = 2.10;
      }
    }
    saveProjectsToStorage();
    window.CAD2D.render();
    window.Viewer3D.render();
    renderPropertyInspector({ kind: 'opening', id: opId });
  }

  // ==================== ABA 3: AMBIENTES & PREVISÃO DE CARGAS (EDITÁVEL) ====================
  function renderRoomsPanel() {
    const tbody = document.getElementById('roomsTableBody');
    if (!tbody || !currentProject) return;

    if (!currentProject.rooms || currentProject.rooms.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);">Nenhum cômodo cadastrado. Clique em "+ Adicionar Novo Cômodo" acima.</td></tr>`;
      return;
    }

    tbody.innerHTML = currentProject.rooms.map(room => {
      const c = window.NBR5410.inspectRoomCompliance(room, currentProject.points);
      const typeOptions = Object.entries(window.NBR5410.ROOM_TYPES).map(([k, v]) =>
        `<option value="${k}" ${room.type === k ? 'selected' : ''}>${v.label}</option>`
      ).join('');

      return `
        <tr>
          <td>
            <input type="text" class="form-input" style="padding:5px 8px; font-weight:700;" value="${room.name}"
              onchange="App.updateRoomFromTable('${room.id}', 'name', this.value)" />
          </td>
          <td>
            <select class="form-select" style="padding:5px 8px;" onchange="App.updateRoomFromTable('${room.id}', 'type', this.value)">
              ${typeOptions}
            </select>
          </td>
          <td class="mono" style="white-space:nowrap;">
            <input type="number" step="0.1" min="1.2" class="form-input mono" style="width:68px; display:inline-block; padding:4px 6px;" value="${room.w}"
              onchange="App.updateRoomFromTable('${room.id}', 'w', parseFloat(this.value))" />
            ×
            <input type="number" step="0.1" min="1.2" class="form-input mono" style="width:68px; display:inline-block; padding:4px 6px;" value="${room.h}"
              onchange="App.updateRoomFromTable('${room.id}', 'h', parseFloat(this.value))" /> m
          </td>
          <td class="mono"><strong>${c.area} m²</strong></td>
          <td class="mono">${c.perimeter} m</td>
          <td class="mono">
            ${c.installedLightingVA} VA
            <span style="color:var(--text-muted); font-size:11px;">(Mín: ${c.minLightingVA} VA)</span>
          </td>
          <td class="mono">
            ${c.installedTugCount} un / ${c.installedTugVA} VA
            <span style="color:var(--text-muted); font-size:11px;">(Mín: ${c.minTugCount} un / ${c.minTugVA} VA)</span>
          </td>
          <td class="mono">${c.installedTueVA > 0 ? `${c.installedTueVA} VA` : '—'}</td>
          <td>
            <div style="display:flex; gap:6px; align-items:center;">
              <span class="badge ${c.compliant ? 'badge-green' : 'badge-amber'}">
                ${c.compliant ? 'OK' : 'Ajustar'}
              </span>
              <button class="btn ${room.locked ? 'btn-accent' : 'btn-secondary'} btn-sm" onclick="App.toggleRoomLock('${room.id}', ${!room.locked})" title="${room.locked ? 'Destravar posição do cômodo' : 'Travar posição do cômodo contra movimentação'}">
                ${room.locked ? '🔒 Travado' : '🔓 Destravar'}
              </button>
              <button class="btn btn-secondary btn-sm" onclick="App.regenerateSingleRoomPoints('${room.id}')" title="Gerar pontos NBR 5410 para este ambiente">Gerar NBR</button>
              <button class="btn btn-danger btn-sm" onclick="App.deleteRoomById('${room.id}')" title="Excluir ambiente">✕</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function updateRoomFromTable(roomId, prop, val) {
    if ((prop === 'w' || prop === 'h') && (isNaN(val) || val < 1.0)) return;
    updateRoomDimensionLive(roomId, prop, val);
    renderRoomsPanel();
  }

  // ==================== ABA 4: CIRCUITOS, SEÇÃO DO CABO E DIMENSIONAMENTO DO ELETRODUTO (ITENS 10 e 11) ====================
  function renderCircuitsPanel() {
    const tbody = document.getElementById('circuitsTableBody');
    if (!tbody || !currentProject) return;

    const evaluated = window.NBR5410.evaluateProjectCircuits(currentProject);

    tbody.innerHTML = evaluated.map(c => `
      <tr>
        <td class="mono"><strong>${c.id}</strong></td>
        <td>
          <input type="text" class="form-input" style="padding:5px 8px; font-size:12.5px;" value="${c.name}"
            onchange="App.updateCircuitProp('${c.id}', 'name', this.value)" />
        </td>
        <td>
          <select class="form-select" style="padding:5px 8px; font-size:12px;" onchange="App.updateCircuitProp('${c.id}', 'type', this.value)">
            <option value="iluminacao" ${c.type === 'iluminacao' ? 'selected' : ''}>Iluminação</option>
            <option value="tug" ${c.type === 'tug' ? 'selected' : ''}>Força (TUG)</option>
            <option value="tue" ${c.type === 'tue' ? 'selected' : ''}>Específico (TUE)</option>
          </select>
        </td>
        <td class="mono">
          <select class="form-select mono" style="padding:5px 6px; font-size:12px;" onchange="App.updateCircuitProp('${c.id}', 'voltage', parseInt(this.value, 10))">
            <option value="127" ${c.voltage === 127 ? 'selected' : ''}>127V</option>
            <option value="220" ${c.voltage === 220 ? 'selected' : ''}>220V</option>
            <option value="380" ${c.voltage === 380 ? 'selected' : ''}>380V</option>
          </select>
        </td>
        <td class="mono">${c.pointsCount} pts</td>
        <td class="mono"><strong>${c.totalVA} VA</strong> (${c.totalW}W)</td>
        <td class="mono">${c.ib} A</td>
        <td class="mono">${c.fca}</td>
        <td class="mono"><strong>#${c.sectionMm2} mm²</strong> <span style="color:var(--text-muted)">(Iz=${c.izReal}A)</span></td>
        <td class="mono">
          <strong style="color:#f59e0b;">Ø${c.conduitMm}mm (${c.conduitInch})</strong>
          <div style="font-size:10.5px; color:var(--text-muted);">${c.conductorCount} cond. • Ocup. ${c.conduitOccupancyPct}%</div>
        </td>
        <td class="mono" style="color:${c.voltageDropPercent <= 4 ? '#34d399' : '#fb7185'}">${c.voltageDropPercent}%</td>
        <td class="mono"><strong>${c.poles}P ${c.breakerA}A (Curva ${c.curve})</strong></td>
        <td>
          <input type="checkbox" ${c.dr ? 'checked' : ''} onchange="App.updateCircuitProp('${c.id}', 'dr', this.checked)" />
          <span style="font-size:11.5px;">30mA</span>
        </td>
        <td class="mono">
          <select class="form-select mono" style="padding:5px 6px; font-size:12px;" onchange="App.updateCircuitProp('${c.id}', 'phase', this.value)">
            <option value="R" ${c.phase === 'R' ? 'selected' : ''}>Fase R</option>
            <option value="S" ${c.phase === 'S' ? 'selected' : ''}>Fase S</option>
            <option value="T" ${c.phase === 'T' ? 'selected' : ''}>Fase T</option>
            <option value="R+S" ${c.phase === 'R+S' ? 'selected' : ''}>R + S</option>
            <option value="S+T" ${c.phase === 'S+T' ? 'selected' : ''}>S + T</option>
            <option value="R+T" ${c.phase === 'R+T' ? 'selected' : ''}>R + T</option>
            <option value="R+S+T" ${c.phase === 'R+S+T' ? 'selected' : ''}>R+S+T</option>
          </select>
        </td>
        <td>
          <span class="badge ${c.statusOk ? 'badge-green' : 'badge-amber'}">${c.statusOk ? 'Dimensionado' : 'Verificar'}</span>
        </td>
      </tr>
    `).join('');
  }

  function updateCircuitProp(circuitId, prop, val) {
    if (!currentProject) return;
    const c = currentProject.circuits.find(item => item.id === circuitId);
    if (!c) return;
    c[prop] = val;
    saveProjectsToStorage();
    renderCircuitsPanel();
    updateEditorHeaderStats();
  }

  function addNewCircuit() {
    if (!currentProject) return;
    const num = currentProject.circuits.length + 1;
    const id = `C${num}`;
    currentProject.circuits.push({
      id,
      number: num,
      name: `Circuito Reserva / Expansão ${num}`,
      type: 'tug',
      voltage: currentProject.supply.phaseVoltage,
      pf: 0.8,
      phase: 'R',
      dr: true,
      fca: 0.8
    });
    saveProjectsToStorage();
    renderCircuitsPanel();
    showToast(`Circuito ${id} adicionado ao quadro!`);
  }

  function runAutoBalancePhases() {
    if (!currentProject) return;
    window.NBR5410.autoBalancePhases(currentProject);
    saveProjectsToStorage();
    renderCircuitsPanel();
    renderBoardAndUnifilarPanel();
    showToast('Fases R, S e T balanceadas automaticamente para menor desequilíbrio!');
  }

  // ==================== ABA 5: QUADRO DE CARGAS, PADRÃO DE ENTRADA & DIAGRAMA UNIFILAR ====================
  function renderBoardAndUnifilarPanel() {
    if (!currentProject) return;
    const evaluated = window.NBR5410.evaluateProjectCircuits(currentProject);
    const board = window.NBR5410.calculateBoardSummary(currentProject, evaluated);

    const maxPhase = Math.max(board.phases.R, board.phases.S, board.phases.T, 1);
    const phaseBarsEl = document.getElementById('phaseBalanceContainer');
    if (phaseBarsEl) {
      phaseBarsEl.innerHTML = ['R', 'S', 'T'].map((ph, idx) => {
        const val = board.phases[ph];
        const pct = Math.round((val / maxPhase) * 100);
        const colors = ['#f59e0b', '#38bdf8', '#10b981'];
        return `
          <div class="phase-box">
            <div class="phase-box-header">
              <span>FASE ${ph}</span>
              <span class="mono">${val} VA</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${pct}%; background:${colors[idx]}"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    const summaryEl = document.getElementById('boardTechnicalSummary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="dashboard-stats" style="margin-bottom:0;">
          <div class="stat-card">
            <div class="stat-info">
              <span class="stat-value mono">${board.totalInstalledVA} VA</span>
              <span class="stat-label">Potência Instalada (${board.totalInstalledW} W)</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-info">
              <span class="stat-value mono" style="color:var(--brand-primary)">${board.demandVA} VA (${board.demandKVA} kVA)</span>
              <span class="stat-label">Demanda Calculada (FD Ilum/TUG=${board.fdIlumTug})</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-info">
              <span class="stat-value mono">Padrão Cat. ${board.entrance.categoryCode} (${board.mainBreakerA}A)</span>
              <span class="stat-label">${currentProject.supply.concessionaria} • ${board.entrance.entranceType}</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-info">
              <span class="stat-value mono" style="color:#34d399">#${board.mainCableMm2}mm² • Ø${board.entrance.conduitMm}mm</span>
              <span class="stat-label">Ramal de Entrada + ${board.entrance.groundRodsCount} Hastes Terra</span>
            </div>
          </div>
        </div>
      `;
    }

    const svgBox = document.getElementById('unifilarSvgContainer');
    if (svgBox) {
      svgBox.innerHTML = window.Diagrams.generateUnifilarSVG(currentProject);
    }
  }

  function downloadUnifilarSVG() {
    if (!currentProject) return;
    const svgContent = window.Diagrams.generateUnifilarSVG(currentProject);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Diagrama_Unifilar_${currentProject.name.replace(/\s+/g, '_')}_Lucas_Aguiar.svg`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Diagrama Unifilar exportado em SVG!');
  }

  // ==================== ABA 6: LISTA DE MATERIAIS E ORÇAMENTO ====================
  function renderMaterialsPanel() {
    if (!currentProject) return;
    const bom = window.NBR5410.generateMaterialList(currentProject);
    const tbody = document.getElementById('materialsTableBody');
    const totalEl = document.getElementById('materialsGrandTotal');
    if (!tbody) return;

    let grandTotal = 0;

    tbody.innerHTML = bom.map(item => {
      const overrideKey = `${currentProject.id}_${item.code}`;
      const unitPrice = customPriceOverrides[overrideKey] !== undefined
        ? customPriceOverrides[overrideKey]
        : item.unitPrice;
      const total = +(item.qty * unitPrice).toFixed(2);
      grandTotal += total;

      return `
        <tr>
          <td class="mono">${item.code}</td>
          <td><span class="badge badge-blue">${item.category}</span></td>
          <td><strong>${item.description}</strong></td>
          <td class="mono">${item.unit}</td>
          <td class="mono"><strong>${item.qty}</strong></td>
          <td class="mono">
            R$ <input type="number" step="0.10" min="0" class="form-input mono" style="width:95px; display:inline-block; padding:4px 8px;"
              value="${unitPrice.toFixed(2)}"
              onchange="App.updateMaterialUnitPrice('${overrideKey}', parseFloat(this.value))" />
          </td>
          <td class="mono"><strong>R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
        </tr>
      `;
    }).join('');

    if (totalEl) {
      totalEl.textContent = `R$ ${grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  function updateMaterialUnitPrice(key, newPrice) {
    customPriceOverrides[key] = isNaN(newPrice) ? 0 : newPrice;
    renderMaterialsPanel();
  }

  function exportMaterialsCSV() {
    if (!currentProject) return;
    const bom = window.NBR5410.generateMaterialList(currentProject);
    const rows = [
      ['Codigo', 'Categoria', 'Descricao do Material', 'Unidade', 'Quantidade', 'Preco Unitario (R$)', 'Subtotal (R$)']
    ];

    bom.forEach(item => {
      const overrideKey = `${currentProject.id}_${item.code}`;
      const unitPrice = customPriceOverrides[overrideKey] !== undefined
        ? customPriceOverrides[overrideKey]
        : item.unitPrice;
      const total = (item.qty * unitPrice).toFixed(2);
      rows.push([
        item.code,
        `"${item.category}"`,
        `"${item.description}"`,
        item.unit,
        item.qty,
        unitPrice.toFixed(2),
        total
      ]);
    });

    const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lista_Materiais_${currentProject.name.replace(/\s+/g, '_')}_Lucas_Aguiar.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Planilha quantitativa de materiais exportada em CSV/Excel!');
  }

  // ==================== ABA 7: AJUSTES DE IMPRESSÃO, CARIMBO, VISTAS 3D E MÚLTIPLAS PRANCHAS (ITEM 9) ====================
  function ensureProjectPrintSheets() {
    if (!currentProject) return;
    if (!Array.isArray(currentProject.printSheets) || currentProject.printSheets.length === 0) {
      currentProject.printSheets = [
        {
          id: `sheet-1`,
          name: 'Prancha 01 — Planta 2D, Vistas 3D e Unifilar',
          paperSize: 'A3',
          scale: '1:50',
          zoomPct: 100,
          show2D: true,
          show3D: true,
          showBoard3D: true,
          showUnifilar: true,
          showTables: false,
          title: 'PROJETO ELÉTRICO — PLANTA BAIXA, 3D E DIAGRAMA UNIFILAR',
          author: 'Eng. Lucas Aguiar',
          crea: 'CREA-SP 507123456',
          revision: 'REV. 01'
        }
      ];
    }
    if (activePrintSheetIndex >= currentProject.printSheets.length) {
      activePrintSheetIndex = 0;
    }
  }

  function renderPrintSetupTab() {
    if (!currentProject) return;
    ensureProjectPrintSheets();
    const sheets = currentProject.printSheets;
    const active = sheets[activePrintSheetIndex] || sheets[0];

    // Lista de pranchas na lateral
    const listEl = document.getElementById('printSheetsList');
    if (listEl) {
      listEl.innerHTML = sheets.map((sh, idx) => `
        <div class="layer-toggle" style="border-color:${idx === activePrintSheetIndex ? '#f59e0b' : 'var(--border-subtle)'}; background:${idx === activePrintSheetIndex ? 'rgba(245,158,11,0.14)' : 'var(--bg-primary)'};"
             onclick="App.selectPrintSheet(${idx})">
          <span class="layer-toggle-left">
            <span class="layer-dot" style="background:${idx === activePrintSheetIndex ? '#f59e0b' : '#38bdf8'}"></span>
            <strong style="font-size:12px;">Folha 0${idx + 1} (${sh.paperSize})</strong>
          </span>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="mono" style="font-size:11px; color:var(--text-muted);">${sh.scale}</span>
            ${sheets.length > 1 ? `<button class="btn btn-danger btn-sm" style="padding:1px 5px; font-size:10px;" onclick="event.stopPropagation(); App.deletePrintSheet(${idx})">✕</button>` : ''}
          </div>
        </div>
      `).join('');
    }

    // Sincroniza controles com a folha ativa
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = Boolean(v); };

    setVal('printPaperSize', active.paperSize || 'A3');
    setVal('printDrawingScale', active.scale || '1:50');
    setVal('printDrawingZoom', active.zoomPct || 100);
    setChk('chkPrint2D', active.show2D);
    setChk('chkPrint3D', active.show3D);
    setChk('chkPrintBoard3D', active.showBoard3D);
    setChk('chkPrintUnifilar', active.showUnifilar);
    setChk('chkPrintTables', active.showTables);
    setVal('printSheetTitle', active.title || '');
    setVal('printAuthor', active.author || 'Eng. Lucas Aguiar');
    setVal('printCrea', active.crea || 'CREA-SP 507123456');
    setVal('printRev', active.revision || 'REV. 01');
    setVal('printSheetNum', `0${activePrintSheetIndex + 1} / 0${sheets.length}`);

    renderPrintPreviewSheets();
  }

  function selectPrintSheet(idx) {
    activePrintSheetIndex = idx;
    renderPrintSetupTab();
  }

  function addPrintSheet() {
    if (!currentProject) return;
    ensureProjectPrintSheets();
    const num = currentProject.printSheets.length + 1;
    currentProject.printSheets.push({
      id: `sheet-${Date.now()}`,
      name: `Prancha 0${num} — Detalhamento e Quantitativos`,
      paperSize: 'A3',
      scale: '1:50',
      zoomPct: 100,
      show2D: num % 2 === 1,
      show3D: true,
      showBoard3D: true,
      showUnifilar: true,
      showTables: true,
      title: `PROJETO ELÉTRICO — PRANCHA COMPLEMENTAR 0${num}`,
      author: 'Eng. Lucas Aguiar',
      crea: 'CREA-SP 507123456',
      revision: 'REV. 01'
    });
    activePrintSheetIndex = currentProject.printSheets.length - 1;
    saveProjectsToStorage();
    renderPrintSetupTab();
    showToast(`Folha 0${num} adicionada ao conjunto de impressão!`);
  }

  function deletePrintSheet(idx) {
    if (!currentProject || !currentProject.printSheets || currentProject.printSheets.length <= 1) return;
    currentProject.printSheets.splice(idx, 1);
    if (activePrintSheetIndex >= currentProject.printSheets.length) {
      activePrintSheetIndex = currentProject.printSheets.length - 1;
    }
    saveProjectsToStorage();
    renderPrintSetupTab();
    showToast('Folha removida do conjunto de impressão.');
  }

  function updateActivePrintSheet(prop, val) {
    if (!currentProject) return;
    ensureProjectPrintSheets();
    const sheet = currentProject.printSheets[activePrintSheetIndex];
    if (!sheet) return;
    sheet[prop] = val;
    saveProjectsToStorage();
    renderPrintPreviewSheets();
  }

  function renderPrintPreviewSheets() {
    const container = document.getElementById('printPreviewSheetsContainer');
    if (!container || !currentProject) return;
    ensureProjectPrintSheets();

    // Gera snapshots das vistas 2D, 3D e Quadro 3D
    const temp2d = document.createElement('canvas');
    temp2d.width = 760;
    temp2d.height = 420;
    window.CAD2D.renderProjectPreviewToCanvas(temp2d, currentProject);
    const snap2dUrl = temp2d.toDataURL('image/png');

    window.Viewer3D.setProject(currentProject);
    const snap3dUrl = window.Viewer3D.captureSnapshotDataUrl ? window.Viewer3D.captureSnapshotDataUrl() : '';
    const snapBoard3dUrl = window.Viewer3D.captureBoardSnapshotDataUrl ? window.Viewer3D.captureBoardSnapshotDataUrl() : '';
    const unifilarSvg = window.Diagrams.generateUnifilarSVG(currentProject);
    const evaluated = window.NBR5410.evaluateProjectCircuits(currentProject);
    const board = window.NBR5410.calculateBoardSummary(currentProject, evaluated);

    const paperWidths = { A4: '860px', A3: '1040px', A2: '1140px', A1: '1220px', A0: '1280px' };

    container.innerHTML = currentProject.printSheets.map((sh, idx) => {
      const zoomScale = (Number(sh.zoomPct) || 100) / 100;
      const wStyle = paperWidths[sh.paperSize] || '1040px';

      return `
        <div class="print-sheet-paper" style="width:100%; max-width:${wStyle};">
          <div class="print-sheet-frame">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #0f172a; padding-bottom:8px; margin-bottom:12px;">
              <div>
                <strong style="font-size:15px; color:#0f172a;">LUCAS AGUIAR — ENGENHARIA &amp; PROJETOS ELÉTRICOS (ABNT NBR 5410)</strong>
                <div style="font-size:11.5px; color:#334155;">Empreendimento: <strong>${currentProject.name}</strong> • Cliente: ${currentProject.client} • Local: ${currentProject.address}</div>
              </div>
              <div style="text-align:right; font-family:'JetBrains Mono', monospace; font-size:11.5px; color:#0f172a;">
                <div>FORMATO <strong>${sh.paperSize}</strong> • ESCALA <strong>${sh.scale}</strong></div>
                <div>FOLHA <strong>0${idx + 1} / 0${currentProject.printSheets.length}</strong></div>
              </div>
            </div>

            <div style="transform: scale(${zoomScale}); transform-origin: top center; display:flex; flex-direction:column; gap:14px;">
              ${(sh.show2D || sh.show3D || sh.showBoard3D) ? `
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">
                ${sh.show2D ? `
                <div style="border:1px solid #94a3b8; border-radius:6px; padding:8px; background:#0f172a;">
                  <div style="font-size:11px; font-weight:700; color:#fbbf24; margin-bottom:4px;">1. PLANTA BAIXA ELÉTRICA 2D (ESCALA ${sh.scale})</div>
                  <img src="${snap2dUrl}" alt="Planta 2D" style="width:100%; height:220px; object-fit:contain; display:block;" />
                </div>
                ` : ''}
                ${sh.show3D ? `
                <div style="border:1px solid #94a3b8; border-radius:6px; padding:8px; background:#0f172a;">
                  <div style="font-size:11px; font-weight:700; color:#38bdf8; margin-bottom:4px;">2. VISTA ISOMÉTRICA 3D BIM (REVIT MEP)</div>
                  <img src="${snap3dUrl}" alt="Vista 3D" style="width:100%; height:220px; object-fit:contain; display:block;" />
                </div>
                ` : ''}
                ${sh.showBoard3D ? `
                <div style="border:1px solid #94a3b8; border-radius:6px; padding:8px; background:#0f172a;">
                  <div style="font-size:11px; font-weight:700; color:#34d399; margin-bottom:4px;">3. VISTA 3D DO QUADRO DE DISTRIBUIÇÃO (QDC)</div>
                  <img src="${snapBoard3dUrl}" alt="Quadro 3D" style="width:100%; height:220px; object-fit:contain; display:block;" />
                </div>
                ` : ''}
              </div>
              ` : ''}

              ${sh.showUnifilar ? `
              <div style="border:1px solid #94a3b8; border-radius:6px; padding:8px; background:#060a12; overflow:hidden;">
                <div style="font-size:11px; font-weight:700; color:#f59e0b; margin-bottom:4px;">DIAGRAMA UNIFILAR COMPLETO (SEÇÃO DE CONDUTORES E DIMENSIONAMENTO DE ELETRODUTOS)</div>
                <div style="width:100%; overflow-x:auto;">${unifilarSvg}</div>
              </div>
              ` : ''}

              ${sh.showTables ? `
              <div style="border:1px solid #0f172a; border-radius:4px; padding:8px; background:#f8fafc; color:#0f172a;">
                <div style="font-size:11.5px; font-weight:800; margin-bottom:6px;">QUADRO RESUMO DE CIRCUITOS E DIMENSIONAMENTO DE ELETRODUTOS</div>
                <table style="width:100%; border-collapse:collapse; font-size:10.5px; font-family:'JetBrains Mono', monospace;">
                  <thead>
                    <tr style="background:#e2e8f0; text-align:left;">
                      <th style="padding:4px; border:1px solid #94a3b8;">Circ.</th>
                      <th style="padding:4px; border:1px solid #94a3b8;">Descrição</th>
                      <th style="padding:4px; border:1px solid #94a3b8;">Tensão</th>
                      <th style="padding:4px; border:1px solid #94a3b8;">Potência</th>
                      <th style="padding:4px; border:1px solid #94a3b8;">Cabo (mm²)</th>
                      <th style="padding:4px; border:1px solid #94a3b8;">Eletroduto (Ø)</th>
                      <th style="padding:4px; border:1px solid #94a3b8;">Proteção DIN</th>
                      <th style="padding:4px; border:1px solid #94a3b8;">Fase</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${evaluated.map(c => `
                      <tr>
                        <td style="padding:3px 4px; border:1px solid #cbd5e1;"><strong>${c.id}</strong></td>
                        <td style="padding:3px 4px; border:1px solid #cbd5e1;">${c.name}</td>
                        <td style="padding:3px 4px; border:1px solid #cbd5e1;">${c.voltage}V</td>
                        <td style="padding:3px 4px; border:1px solid #cbd5e1;">${c.totalVA} VA</td>
                        <td style="padding:3px 4px; border:1px solid #cbd5e1;">#${c.sectionMm2} mm²</td>
                        <td style="padding:3px 4px; border:1px solid #cbd5e1;">Ø${c.conduitMm}mm (${c.conduitInch})</td>
                        <td style="padding:3px 4px; border:1px solid #cbd5e1;">${c.poles}P ${c.breakerA}A (${c.curve})</td>
                        <td style="padding:3px 4px; border:1px solid #cbd5e1;">${c.phase}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              ` : ''}
            </div>

            <!-- CARIMBO TÉCNICO ABNT -->
            <div class="print-carimbo">
              <div>
                <div style="font-size:10px; color:#475569;">EMPRESA / AUTORIA</div>
                <strong style="font-size:13px;">LUCAS AGUIAR — ENGENHARIA ELÉTRICA</strong>
                <div>Resp. Técnico: <strong>${sh.author}</strong> • ${sh.crea}</div>
                <div>Padrão Entrada: ${currentProject.supply.concessionaria} Cat. ${board.entrance.categoryCode} (${board.entrance.entranceType})</div>
              </div>
              <div>
                <div style="font-size:10px; color:#475569;">TÍTULO DA PRANCHA / CONTEÚDO</div>
                <strong style="font-size:12px;">${sh.title}</strong>
                <div>Cliente: ${currentProject.client} • Obra: ${currentProject.name}</div>
                <div>Potência Instalada: ${board.totalInstalledVA} VA | Demanda: ${board.demandKVA} kVA</div>
              </div>
              <div>
                <div style="font-size:10px; color:#475569;">FORMATO / ESCALA</div>
                <strong style="font-size:13px;">${sh.paperSize} — ${sh.scale}</strong>
                <div>Data: ${currentProject.updatedAt}</div>
                <div>Norma: ABNT NBR 5410</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:10px; color:#475569;">PRANCHA / REVISÃO</div>
                <strong style="font-size:16px; display:block; margin:2px 0;">0${idx + 1} / 0${currentProject.printSheets.length}</strong>
                <span style="background:#0f172a; color:#f8fafc; padding:2px 6px; border-radius:4px; font-weight:700;">${sh.revision}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function exportCurrentProjectJSON() {
    if (!currentProject) return;
    const json = JSON.stringify(currentProject, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name.replace(/\s+/g, '_')}_Lucas_Aguiar.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Arquivo de projeto (.json) exportado!');
  }

  function handleImportProjectJson(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const imported = JSON.parse(ev.target.result);
        if (imported && imported.name && Array.isArray(imported.rooms)) {
          imported.id = `proj-${Date.now()}`;
          projects.unshift(imported);
          saveProjectsToStorage();
          renderDashboard();
          showToast(`Projeto "${imported.name}" importado com sucesso!`);
        } else {
          showToast('Formato de arquivo inválido.');
        }
      } catch (err) {
        showToast('Erro ao ler o arquivo JSON.');
      }
    };
    reader.readAsText(file);
  }

  return {
    init,
    toggleTheme,
    switchScreen,
    openProject,
    backToDashboard,
    openNewProjectModal,
    closeNewProjectModal,
    openAddRoomModal,
    closeAddRoomModal,
    selectRoomFromList,
    duplicateRoom,
    regenerateSingleRoomPoints,
    deleteRoomById,
    updateRoomFromTable,
    duplicateProject,
    deleteProject,
    resetDemoProjects,
    switchEditorTab,
    selectCadTool,
    toggleCadLayer,
    toggleCadGrid,
    toggleLockRooms,
    setLockRooms,
    toggleRoomLock,
    clearAllCurrentProject,
    removeCurrentProjectFloorplan,
    exportCurrentProjectDXF,
    filter3DByRoom,
    setQuickFilter3D,
    runAutoGenerateNormative,
    updateProjectMeta,
    updateSupplyField,
    updateSupplySystem,
    updateSupplyVoltage,
    updateRoomPropLive,
    updateRoomDimensionLive,
    updateRoomProp,
    updatePointPropLive,
    updatePointProp,
    updatePointSubtype,
    updateConduitProp,
    updateTextPropLive,
    updateDimensionPropLive,
    updateStairPropLive,
    updateStairProp,
    addOpeningToRoom,
    updateOpeningPropLive,
    updateOpeningProp,
    updateCircuitProp,
    addNewCircuit,
    runAutoBalancePhases,
    downloadUnifilarSVG,
    updateMaterialUnitPrice,
    exportMaterialsCSV,
    exportCurrentProjectJSON,
    selectPrintSheet,
    addPrintSheet,
    deletePrintSheet,
    updateActivePrintSheet
  };
})();

window.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
