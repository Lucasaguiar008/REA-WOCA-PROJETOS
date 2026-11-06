# Lucas Aguiar — Engenharia & Projetos Elétricos

> **Plataforma Web CAD 2D & BIM 3D para Projetos Elétricos conforme a ABNT NBR 5410.**  
> Inspirada na usabilidade moderna do WOCA (Ocalev), com identidade própria, motor de cálculo eletrotécnico em tempo real, geração de diagramas unifilares, montagem realista de quadros elétricos em 3D, exportação DXF e diagramação de pranchas de impressão.

---

## ⚡ Principais Funcionalidades

### 1. Automação Normativa e Dimensionamento (ABNT NBR 5410)
- **Lançamento Automático Inteligente**: Distribui pontos de iluminação, tomadas (TUG/TUE), interruptores e quadros respeitando perímetros e áreas, com **desvio automático de portas, esquadrias e vãos livres**.
- **Dimensionamento dos Circuitos Terminais**:
  - Corrente de projeto (\(I_b\)), Fator de Correção por Agrupamento (FCA) e Temperatura (FCT).
  - Capacidade de condução de corrente dos condutores de cobre (\(I_z\), Método B1 em eletroduto embutido).
  - Limite normativo de queda de tensão (\(\Delta V \le 4\%\)).
  - Proteção por disjuntores DIN termomagnéticos (Curvas B e C) e IDR diferencial-residual (\(30\text{ mA}\)).
- **Dimensionamento de Eletrodutos e Ocupação**:
  - Cálculo automático da taxa de ocupação máxima (\(\le 40\%\) para 3 ou mais condutores).
  - Indicação do diâmetro nominal em milímetros e polegadas (\(\varnothing 20\text{ mm} - 3/4"\), \(\varnothing 25\text{ mm} - 1"\), etc.) em tabelas, diagrama e pranchas.
- **Padrão de Entrada da Concessionária**:
  - Enquadramento nas categorias de fornecimento das principais concessionárias (Enel, CPFL, CEMIG, Neoenergia, Copel, Celesc, Equatorial, Light).
  - Cálculo do ramal de entrada, eletroduto de alimentação, disjuntor de proteção geral do medidor e quantidade de hastes de aterramento (malha TN-S).
- **Balanceamento Automático Trifásico**:
  - Algoritmo que distribui as cargas monofásicas e bifásicas de forma otimizada entre as fases R, S e T para minimizar o percentual de desequilíbrio.

---

### 2. Planta Baixa 2D Interativa (Canvas CAD)
- **Modelagem de Ambientes**:
  - Inserção por medidas exatas ou desenho livre com o mouse.
  - Seleção, redimensionamento via alças CAD, movimentação e exclusão.
  - Recálculo normativo instantâneo por cômodo.
- **Portas, Janelas e Vãos Livres**:
  - Inserção paramétrica nas paredes com ajuste de largura, altura e peitoril.
  - Portas de giro com arco tracejado e inversão de sentido de abertura (tecla `R`).
- **Simbologia Técnica NBR 5444 / 5410**:
  - **Quadros**: Quadro de Distribuição Geral (QDC), Quadro Parcial (QD-02) e Padrão de Entrada com medidor kWh.
  - **Iluminação e Sensores**: Luminárias de teto/arandela e Sensores de Presença infravermelho (PIR).
  - **Interruptores**: Simples (1S), Duplo (2S), Triplo (3S), Paralelo (Three-Way), Intermediário (Four-Way) e Pulsador de Campainha.
  - **Tomadas NBR 14136**: Simples (baixa/média/alta), Tomada Dupla (2x na caixa 4x2"), Tomada Tripla (3x na caixa 4x2") e Tomadas de Uso Específico (TUE - chuveiro, ar-condicionado, torneira elétrica).
  - **Telecomunicação & Segurança**: Tomada de Rede RJ45 (Cat6), Telefone/Interfone RJ11, Campainha/Cigarra e Câmeras de Monitoramento CFTV IP.
  - **Infraestrutura**: Eletrodutos flexíveis/rígidos, Eletrocalhas/Perfilados metálicos, Caixas de Passagem (CP) e indicação de prumadas verticais (Eletroduto que Sobe ↗ e Eletroduto que Desce ↘).
- **Anotações e Medições**:
  - Ferramenta de **Texto Livre / Notas Técnicas** na planta.
  - Ferramenta de **Cota de Medição Manual** entre dois pontos arbitrários.
- **Produtividade CAD**:
  - Histórico completo com **Reverter** (`Ctrl+Z`), **Refazer** (`Ctrl+Y`), **Copiar** (`Ctrl+C`), **Colar** (`Ctrl+V`), **Duplicar** (`Ctrl+D`) e **Excluir** (`Del`).
  - Alternância de **Grid de Alinhamento** e controle de camadas visíveis (Arquitetura, Eletrodutos, Iluminação, Tomadas, Telecom, Etiquetas e Cotas).
  - **Importação de Planta de Fundo (DXF / Imagem)** independente por projeto com botão para remover a qualquer momento.
  - Botão **Limpar Tudo** para zerar a planta preservando as configurações do projeto.

---

### 3. Visualização 3D BIM (Famílias Revit MEP)
- Renderização tridimensional interativa via WebGL/Canvas:
  - Caixas de embutir 4x2" amarelas com placas NBR 14136 e módulos de tomadas (pretos para 10A e vermelhos para 20A/TUE).
  - Caixas octogonais de teto com plafons LED e cones translúcidos de feixe luminoso.
  - Eletrodutos corrugados e eletrocalhas metálicas suspensas.
  - Paredes arquitetônicas com portas e janelas abertas no volume 3D.
  - Escadas arquitetônicas modeladas em 3D (Reta, em L com patamar, em U e Caracol/Helicoidal).
- **Filtro 3D por Cômodo**: Isolação de um único cômodo ou visualização de toda a edificação.
- **Filtro de Camadas 3D**: Visualização focada com botões rápidos (Tudo, Só Tomadas TUG, Só Tomadas TUE, Só Luminárias) e toggles individuais.
- Estilos visuais: Realista, Sombreado e Estrutura de Arame (Raio-X), além de controle de opacidade das paredes.

---

### 4. Quadro Elétrico 3D (Inspeção de Painel QDC)
Aba exclusiva dedicada à montagem interna tridimensional do Quadro de Distribuição:
- Trilhos DIN 35 mm metálicos galvanizados.
- **Disjuntor Geral DIN** com alavanca de manobra.
- **IDR Tetrapolar (30 mA)** com botão de teste **T**.
- **DPS Classe II (275V / 20-40 kA)** com cartuchos vermelhos de proteção contra surtos.
- **Barramento Pente Trifásico** de cobre interligando as fases R, S e T.
- **Barramento de Neutro** isolado (azul).
- **Barramento de Proteção PE** (verde/terra).
- **Disjuntores Termomagnéticos dos Circuitos** individuais com etiquetas numéricas (C1, C2, etc.).
- **Bornes de Passagem DIN (SAK)** para entrada e saída de cabos.
- Recursos interativos para ligar/desligar chicotes de fiação e porta fumê frontal.

---

### 5. Diagramas Unifilares & Exportação DXF
- **Diagrama Unifilar Vetorial (SVG)**:
  - Esquema unifilar gerado dinamicamente com base nas cargas calculadas.
  - Exibe padrão da concessionária, ramal de entrada, proteção geral, barramento e cada circuito terminal com:
    - Número e identificação da carga.
    - Seção nominal do condutor (`# mm² Cu`).
    - Bitola dimensionada do eletroduto (`Ø mm` e polegadas) e taxa de ocupação.
    - Corrente nominal do disjuntor e proteção DR.
    - Fase atribuída (R, S, T).
- **Exportação DXF (AutoCAD)**:
  - Gera arquivos `.dxf` ASCII válidos compatíveis com AutoCAD, Revit, LibreCAD, ZWCAD e BricsCAD.
  - Camadas estruturadas: `ARQUITETURA_PAREDES`, `ABERTURAS`, `ELETRICA_PONTOS`, `ELETRODUTOS_CALHAS`, `COTAS_TEXTOS` e `ESCADAS`.

---

### 6. Ajustes de Impressão & Pranchas Técnicas (ABNT)
- Aba de diagramação de pranchas técnicas prontas para plotagem ou emissão de PDF:
  - Formatos normatizados: **A4, A3, A2, A1 e A0**.
  - Escalas normalizadas: **1:25, 1:50, 1:75, 1:100** e ajuste automático.
  - Ajuste de zoom e enquadramento dos desenhos.
  - Seleção de vistas integradas na folha: Planta 2D, Vista 3D BIM, Quadro 3D, Diagrama Unifilar e Tabelas de Circuitos.
  - **Carimbo Técnico ABNT completo**: Empresa, Responsável Técnico, registro CREA/CFT, Título da Folha, Revisão e Numeração.
  - **Gerenciador de Múltiplas Folhas**: Possibilidade de criar e gerenciar pranchas complementares (Folha 01, Folha 02, etc.) no mesmo projeto.

---

### 7. Lista de Materiais e Orçamento
- Quantitativo automatizado de todos os itens do projeto:
  - Metragens lineares de cabos de cobre por bitola e função (fase, neutro, terra, retorno).
  - Metragens de eletrodutos flexíveis e rígidos por diâmetro.
  - Metragens de eletrocalhas metálicas.
  - Caixas 4x2", octogonais e de passagem.
  - Módulos de tomadas, interruptores simples, múltiplos, 3-way, 4-way e sensores.
  - Disjuntores DIN, DPS, IDR, barramentos e caixas de QDC.
  - Kit padrão de entrada (poste, caixa de medição, hastes de terra).
- Preços unitários editáveis em tempo real.
- Exportação em **CSV / Excel** com suporte a caracteres UTF-8.

---

### 8. Gestão de Projetos e Interface
- **Novo Projeto em Branco**: Opção para iniciar do zero (0 cômodos e sem pré-dimensionamento) ou por templates residenciais e comerciais.
- **Tema Claro / Escuro**: Alternância instantânea com adaptação de contraste do canvas CAD, diagramas e menus.
- **Responsividade**: Botões com quebra automática de texto (`word-break: break-word`), sem transbordamento em telas menores.
- **Persistência**: Armazenamento local no navegador (`localStorage`) com suporte a exportação e importação de backups em formato `.json`.

---

## 📂 Estrutura de Arquivos

```
CLONE WOCA/
├── index.html           # Interface principal, dashboard, estúdio CAD, abas 3D, unifilar e pranchas
├── styles.css           # Estilização completa, variáveis de tema claro/escuro, componentes e carimbo
├── js/
│   ├── nbr5410.js       # Motor de cálculo eletrotécnico NBR 5410, ocupação de eletrodutos e materiais
│   ├── sample-projects.js # Projetos de demonstração e geração de templates residenciais/comerciais
│   ├── canvas2d.js      # Engine CAD 2D, manipulação de geometrias, portas, cotas, textos e atalhos
│   ├── viewer3d.js      # Engine 3D BIM (instalações e quadro elétrico realista com trilhos e disjuntores)
│   ├── diagrams.js      # Gerador de Diagrama Unifilar vetorial SVG e exportador AutoCAD DXF
│   └── app.js           # Orquestrador da aplicação, gerenciamento de projetos, eventos e pranchas
└── README.md            # Documentação técnica do projeto
```

---

## 🚀 Como Executar o Projeto

Como a aplicação é construída com tecnologias web puras (HTML5, CSS3 moderno e JavaScript ES6+), não há dependência de compiladores ou etapas de build.

### Opção 1: Servidor Node.js (Recomendado)
```bash
# Na raiz do projeto:
npx -y http-server . -p 8080 -c-1 --cors
```
Abra o navegador em `http://localhost:8080`.

### Opção 2: Python HTTP Server
```bash
# Python 3
python -m http.server 8080
```
Abra o navegador em `http://localhost:8080`.

### Opção 3: Extensão VS Code
Abra a pasta no VS Code e utilize a extensão **Live Server** clicando em "Go Live" sobre o arquivo `index.html`.

---

## 📐 Normas Técnicas de Referência

- **ABNT NBR 5410**: Instalações elétricas de baixa tensão.
- **ABNT NBR 5444**: Símbolos gráficos para instalações elétricas prediais.
- **ABNT NBR 14136**: Plugues e tomadas para uso doméstico e análogo até 20 A / 250 V em corrente alternada.
- **ABNT NBR 6492 / NBR 10068**: Representação de projetos de arquitetura e folhas de desenho (formatos e carimbo).
- **Normas das Concessionárias de Distribuição de Energia**: Requisitos para fornecimento de energia elétrica em tensão secundária (Enel, CPFL, CEMIG, etc.).

---

## 👨‍💻 Autoria & Identidade Visual

**Lucas Aguiar — Engenharia & Projetos Elétricos**  
Todos os direitos reservados.
