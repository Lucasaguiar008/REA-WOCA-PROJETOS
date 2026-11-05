// ============================================================================
// CONTROLADOR PRINCIPAL DA APLICAÇÃO — LUCAS AGUIAR PROJETOS ELÉTRICOS
// ============================================================================

window.App = (function () {
  const STORAGE_KEY = 'lucas_aguiar_woca_projects_v1';

  let projects = [];
  let currentProject = null;
  let activeFilter = 'Todos';
  let searchQuery = '';
  let customPriceOverrides = {};

  function init() {
    loadProjectsFromStorage();
    bindGlobalEvents();
    renderDashboard();
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
            if (msg) showToast(msg);
          }
        }
      });
    }

    const c3d = document.getElementById('cad3dCanvas');
    if (c3d) {
      window.Viewer3D.init(c3d);
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
                <span class="metric-item-val">${proj.points.length}</span>
                <span class="metric-item-lbl">Pontos</span>
              </div>
              <div class="metric-item">
                <span class="metric-item-val">${proj.circuits.length}</span>
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

  function openNewProjectModal() {
    document.getElementById('newProjectModal').classList.add('active');
  }

  function closeNewProjectModal() {
    document.getElementById('newProjectModal').classList.remove('active');
  }

  function createNewProjectFromModal() {
    const name = document.getElementById('npName').value.trim() || 'Novo Projeto Elétrico';
    const client = document.getElementById('npClient').value.trim() || 'Cliente Particular';
    const category = document.getElementById('npCategory').value;
    const concessionaria = document.getElementById('npConcessionaria').value;
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
        system,
        phaseVoltage: Number(voltagePair[0] || 127),
        lineVoltage: Number(voltagePair[1] || 220)
      },
      rooms: [],
      points: [],
      conduits: [],
      circuits: []
    };

    if (templateType === 'residencial_padrao') {
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
    showToast(`Projeto "${newProj.name}" criado e pronto para edição!`);
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

    switchScreen('editorScreen');
    updateEditorHeaderStats();
    switchEditorTab('tab2d');

    requestAnimationFrame(() => {
      window.CAD2D.setProject(currentProject);
      window.Viewer3D.setProject(currentProject);
      // Seleciona automaticamente o primeiro cômodo ao abrir para exibir imediatamente as alças de edição CAD!
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
      subEl.textContent = `${currentProject.supply.system} ${currentProject.supply.phaseVoltage}/${currentProject.supply.lineVoltage}V • ${currentProject.rooms.length} Ambientes • ${currentProject.points.length} Pontos • Demanda: ${board.demandKVA} kVA`;
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
      requestAnimationFrame(() => {
        window.Viewer3D.setProject(currentProject);
        window.Viewer3D.resize();
      });
    } else if (tabId === 'tabRooms') {
      renderRoomsPanel();
    } else if (tabId === 'tabCircuits') {
      renderCircuitsPanel();
    } else if (tabId === 'tabBoard') {
      renderBoardAndUnifilarPanel();
    } else if (tabId === 'tabMaterials') {
      renderMaterialsPanel();
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

  // ==================== GESTÃO INTERATIVA DE CÔMODOS (CRIAR, DUPLICAR, EDITAR, EXCLUIR) ====================
  function renderSidebarRoomList() {
    const listEl = document.getElementById('sidebarRoomList');
    if (!listEl || !currentProject) return;
    const sel = window.CAD2D.getSelectedItem();

    if (!currentProject.rooms || currentProject.rooms.length === 0) {
      listEl.innerHTML = `<div style="font-size:11.5px; color:var(--text-muted); padding:6px;">Nenhum cômodo. Clique em "+ Novo Cômodo".</div>`;
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
    document.getElementById('arName').value = `Ambiente ${currentProject.rooms.length + 1}`;
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

    // Calcula posição livre ao lado dos cômodos existentes na planta
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
    showToast(`Pontos NBR 5410 recalculados para "${room.name}"!`);
  }

  function deleteRoomById(roomId) {
    if (!currentProject) return;
    window.CAD2D.selectById('room', roomId, false);
    window.CAD2D.deleteSelectedItem();
    renderRoomsPanel();
    renderSidebarRoomList();
  }

  // ==================== FERRAMENTAS DO EDITOR 2D ====================
  function selectCadTool(toolName, btnEl) {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    window.CAD2D.setTool(toolName);
    if (toolName === 'add_room') {
      showToast('Modo Desenhar Ambiente ativo: Clique e arraste no Canvas 2D para criar o cômodo!');
    }
  }

  function toggleCadLayer(layerName, checkboxEl) {
    window.CAD2D.setLayerVisible(layerName, checkboxEl.checked);
  }

  function runAutoGenerateNormative() {
    if (!currentProject) return;
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
    showToast('Dimensionamento e lançamento automático NBR 5410 concluídos!');
  }

  function handleFloorplanUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.dxf')) {
      showToast(`Planta CAD "${file.name}" importada! Eixos de referência alinhados.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = function (ev) {
      window.CAD2D.setBackgroundFloorplan(ev.target.result);
      showToast(`Planta de fundo "${file.name}" carregada no Canvas 2D!`);
    };
    reader.readAsDataURL(file);
  }

  // ==================== INSPETOR DE PROPRIEDADES (LADO DIREITO DO CAD) ====================
  function renderPropertyInspector(selection) {
    const box = document.getElementById('propertyInspectorContent');
    if (!box || !currentProject) return;

    if (!selection) {
      const evaluated = window.NBR5410.evaluateProjectCircuits(currentProject);
      const board = window.NBR5410.calculateBoardSummary(currentProject, evaluated);
      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Resumo do Projeto Ativo</div>
          <div class="form-group">
            <label>Nome do Projeto</label>
            <input type="text" class="form-input" value="${currentProject.name}" oninput="App.updateProjectMeta('name', this.value)" />
          </div>
          <div class="form-group">
            <label>Cliente / Proprietário</label>
            <input type="text" class="form-input" value="${currentProject.client}" oninput="App.updateProjectMeta('client', this.value)" />
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
          <button class="btn btn-primary btn-block btn-sm" onclick="App.openAddRoomModal()" style="margin-bottom:8px;">
            + Adicionar Novo Cômodo
          </button>
          <button class="btn btn-secondary btn-block btn-sm" onclick="App.selectCadTool('add_room', document.getElementById('btnDrawRoomTool'))">
            Desenhar Cômodo com o Mouse
          </button>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-section-title">Métricas Normativas (NBR 5410)</div>
          <div style="display:flex; flex-direction:column; gap:8px; font-size:12.5px;">
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted)">Potência Instalada:</span>
              <strong class="mono">${board.totalInstalledVA} VA (${board.totalInstalledW} W)</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted)">Demanda Estimada:</span>
              <strong class="mono" style="color:var(--brand-primary)">${board.demandVA} VA (${board.demandKVA} kVA)</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted)">Disjuntor Geral QDC:</span>
              <strong class="mono">${board.mainBreakerA}A (${currentProject.supply.system})</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted)">Cabo Ramal Entrada:</span>
              <strong class="mono">#${board.mainCableMm2} mm² Cu</strong>
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
          <div id="roomNormSummaryBox" style="background:var(--bg-primary); padding:10px; border-radius:6px; font-size:12px; margin-bottom:12px; border:1px solid var(--border-subtle);">
            <div>Área: <strong class="mono">${comp.area} m²</strong> | Perímetro: <strong class="mono">${comp.perimeter} m</strong></div>
            <div style="margin-top:4px;">Mín. Iluminação NBR: <strong class="mono">${comp.minLightingVA} VA</strong> (Atual: ${comp.installedLightingVA} VA)</div>
            <div>Mín. TUGs NBR: <strong class="mono">${comp.minTugCount} un / ${comp.minTugVA} VA</strong> (Atual: ${comp.installedTugCount} un / ${comp.installedTugVA} VA)</div>
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
    } else if (selection.kind === 'point') {
      const pt = currentProject.points.find(p => p.id === selection.id);
      if (!pt) return;
      const circuitOptions = currentProject.circuits.map(c =>
        `<option value="${c.id}" ${pt.circuitId === c.id ? 'selected' : ''}>${c.id} — ${c.name}</option>`
      ).join('');

      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Ponto Elétrico (${pt.category.toUpperCase()})</div>
          <div class="form-group">
            <label>Identificação / Etiqueta</label>
            <input type="text" id="inspectorPointLabel" class="form-input" value="${pt.label || ''}"
              oninput="App.updatePointPropLive('${pt.id}', 'label', this.value)" />
          </div>
          ${pt.category !== 'qdc' ? `
          <div class="form-group">
            <label>Circuito Associado</label>
            <select class="form-select" onchange="App.updatePointProp('${pt.id}', 'circuitId', this.value)">
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
          ${(pt.category === 'light' || pt.category === 'switch') ? `
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
              Remover Ponto Elétrico
            </button>
          </div>
        </div>
      `;
    } else if (selection.kind === 'conduit') {
      const cd = currentProject.conduits.find(c => c.id === selection.id);
      if (!cd) return;
      box.innerHTML = `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Trecho de Eletroduto</div>
          <div class="form-group">
            <label>Tipo de Instalação</label>
            <select class="form-select" onchange="App.updateConduitProp('${cd.id}', 'mounting', this.value)">
              <option value="laje" ${cd.mounting === 'laje' ? 'selected' : ''}>Embutido na Laje / Teto</option>
              <option value="parede" ${cd.mounting === 'parede' ? 'selected' : ''}>Embutido na Parede</option>
              <option value="piso" ${cd.mounting === 'piso' ? 'selected' : ''}>Embutido no Piso / Subterrâneo</option>
            </select>
          </div>
          <div class="form-group">
            <label>Diâmetro Nominal (mm)</label>
            <select class="form-select mono" onchange="App.updateConduitProp('${cd.id}', 'diameterMm', parseInt(this.value, 10))">
              <option value="20" ${cd.diameterMm === 20 ? 'selected' : ''}>Ø 20 mm (3/4")</option>
              <option value="25" ${cd.diameterMm === 25 ? 'selected' : ''}>Ø 25 mm (1")</option>
              <option value="32" ${cd.diameterMm === 32 ? 'selected' : ''}>Ø 32 mm (1 1/4")</option>
            </select>
          </div>
          <button class="btn btn-danger btn-block btn-sm" onclick="CAD2D.deleteSelectedItem()">Remover Eletroduto</button>
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

  // Atualização em tempo real sem perder foco do input
  function updateRoomPropLive(roomId, prop, val) {
    const room = currentProject.rooms.find(r => r.id === roomId);
    if (!room) return;
    room[prop] = val;
    saveProjectsToStorage();
    window.CAD2D.render();
    renderSidebarRoomList();
  }

  function updateRoomDimensionLive(roomId, prop, val) {
    if (isNaN(val)) return;
    const room = currentProject.rooms.find(r => r.id === roomId);
    if (!room) return;
    if ((prop === 'w' || prop === 'h') && val < 1.0) return;

    const oldX = room.x, oldY = room.y, oldW = room.w, oldH = room.h;
    room[prop] = val;

    // Reposiciona pontos do cômodo proporcionalmente
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

  function updateConduitProp(cdId, prop, val) {
    const cd = currentProject.conduits.find(c => c.id === cdId);
    if (!cd) return;
    cd[prop] = val;
    saveProjectsToStorage();
    window.CAD2D.render();
    renderPropertyInspector({ kind: 'conduit', id: cdId });
  }

  // ==================== ABA 3: AMBIENTES & PREVISÃO DE CARGAS (EDITÁVEL) ====================
  function renderRoomsPanel() {
    const tbody = document.getElementById('roomsTableBody');
    if (!tbody || !currentProject) return;

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

  // ==================== ABA 4: CIRCUITOS & DIMENSIONAMENTO AUTOMÁTICO ====================
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

  // ==================== ABA 5: QUADRO DE CARGAS & DIAGRAMA UNIFILAR ====================
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
              <span class="stat-label">Potência Total Instalada (${board.totalInstalledW} W)</span>
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
              <span class="stat-value mono">DJ ${board.mainBreakerA}A + IDR ${board.idrMainA}A</span>
              <span class="stat-label">Proteção Geral QDC (#${board.mainCableMm2}mm² Cu)</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-info">
              <span class="stat-value mono" style="color:#34d399">${board.unbalancePercent}%</span>
              <span class="stat-label">Desequilíbrio entre Fases</span>
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
    runAutoGenerateNormative,
    updateProjectMeta,
    updateSupplySystem,
    updateSupplyVoltage,
    updateRoomPropLive,
    updateRoomDimensionLive,
    updateRoomProp,
    updatePointPropLive,
    updatePointProp,
    updateConduitProp,
    updateCircuitProp,
    addNewCircuit,
    runAutoBalancePhases,
    downloadUnifilarSVG,
    updateMaterialUnitPrice,
    exportMaterialsCSV,
    exportCurrentProjectJSON
  };
})();

window.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
