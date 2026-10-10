
===== G:\Meu Drive\DINENG\dashboard\js\app.js =====

/**
 * ============================================
 *  APP â€” LÃ“GICA PRINCIPAL DO DASHBOARD
 * ============================================
 *  Fluxo: carregar â†’ tratar â†’ calcular KPIs â†’
 *  preencher filtros â†’ grÃ¡ficos.
 * ============================================
 */
let periodoJaInicializado = false;

/**
 * Retorna primeiro e Ãºltimo dia do mÃªs vigente (aaaa-mm-dd)
 */
function periodoMesVigente() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const ultimoDia = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  return {
    inicio: ano + "-" + mes + "-01",
    fim: ano + "-" + mes + "-" + String(ultimoDia).padStart(2, "0")
  };
}

// Dados brutos (como vÃªm da API) e vÃ¡lidos (jÃ¡ tratados)
let dadosBrutos = [];
let dadosValidos = [];

// InstÃ¢ncias dos grÃ¡ficos (para destruir/recriar ao filtrar)
let graficos = {};

const COLUNAS_SERVICO = ["Servico", "ServiÃ§o", "TipoServico", "Tipo"];

function valorServico(r) {
  const equipe = String(r["Equipe"] || "").trim().toUpperCase();         // coluna J
  const limpeza = String(r["TipodaLimpeza"] || "").trim().toUpperCase(); // coluna M

  if (equipe === "MECANIZADA" && limpeza === "DENSA") return "Mecanizada Densa";
  if (equipe === "MECANIZADA" && limpeza === "RALA")  return "Mecanizada Leve";
  if (equipe === "MANUAL"     && limpeza === "DENSA") return "Manual Densa";
  if (equipe === "MANUAL"     && limpeza === "RALA")  return "Manual Leve";

  // ServiÃ§o Adicional (coluna N) entra como categoria prÃ³pria
  if (String(r["ServiÃ§os Adicionais"] || "").trim()) return "ServiÃ§o Adicional";

  return ""; // sem tipo definido â†’ fora das opÃ§Ãµes do filtro
}

function valoresUnicosDe(registros, extrator) {
  const conjunto = new Set(registros.map(extrator).filter(v => v !== ""));
  return Array.from(conjunto).sort();
}


/**
 * Inicia o carregamento assim que a pÃ¡gina abre
 */

document.addEventListener("DOMContentLoaded", async function () {
  await carregarDados();
  document.getElementById("btn-aplicar-filtros")
    .addEventListener("click", aplicarFiltros);
  // Datas reagem na hora da mudanÃ§a
  ["filtro-inicio", "filtro-fim"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", aplicarFiltros);
  });
});

/**
 * Busca os dados na API, aplica o tratamento e atualiza a tela
 */
async function carregarDados() {
  const overlay = document.getElementById("loading-overlay");
  try {
    // ðŸ—“ï¸ ETAPA 1: preenche o perÃ­odo com o mÃªs vigente na primeira carga
    if (!periodoJaInicializado) {
      const periodo = periodoMesVigente();
      document.getElementById("filtro-inicio").value = periodo.inicio;
      document.getElementById("filtro-fim").value = periodo.fim;
      periodoJaInicializado = true;
    }
    dadosBrutos = await API.buscarDadosDashboard();
    dadosValidos = Tratamento.filtrarValidos(dadosBrutos);
    Multiselect.inicializar({
      os: valoresUnicos(dadosValidos, "OS"),
      encarregado: valoresUnicos(dadosValidos, "Encarregado"),
      servico: valoresUnicosDe(dadosValidos, valorServico),
      polo: valoresUnicos(dadosValidos, "Polo")
    }, 
    aplicarFiltros);
    // ðŸ”’ RestriÃ§Ã£o por polo do usuÃ¡rio logado
    const usuario = LoginAPI.usuarioLogado();
    const poloUsuario = usuario ? String(usuario.polo || "").trim() : "";
    if (poloUsuario && poloUsuario.toLowerCase() !== "todos") {
      Multiselect.travar("polo", poloUsuario);
    }
        // ðŸ™ˆ Energisa nÃ£o vÃª o filtro de Encarregado
    const nivelUsuario = usuario ? String(usuario.nivel || "").toLowerCase() : "";
    if (nivelUsuario === "energisa") {
      document.getElementById("filtro-encarregado").style.display = "none";
    }
    aplicarFiltros(); // jÃ¡ respeita o mÃªs vigente prÃ©-preenchido
    document.getElementById("footer-atualizacao").textContent =
      "Ãšltima atualizaÃ§Ã£o: " + new Date().toLocaleString("pt-BR");
  } catch (erro) {
    console.error("[app.js] Erro ao carregar dados:", erro);
    alert("Erro ao carregar dados: " + erro.message);
  } finally {
    overlay.classList.add("oculto");
  }
}

/**
 * Atualiza KPIs e grÃ¡ficos com uma lista de registros
 */
function atualizarTela(registros) {
  calcularKPIs(registros);
  Charts.renderizarTodos(registros, graficos);
}

/**
 * Recalcula as opÃ§Ãµes dos filtros em cascata:
 * cada lista mostra sÃ³ os valores que existem nos registros
 * do perÃ­odo + dos OUTROS filtros (ela mesma nÃ£o se limita).
 */
function atualizarOpcoesFiltros() {

  const os          = Multiselect.valores("os");
  const encarregado = Multiselect.valores("encarregado");
  const polo        = Multiselect.valores("polo");
  const inicio = document.getElementById("filtro-inicio").value;
  const fim    = document.getElementById("filtro-fim").value;
  
  const poloTravado = document.querySelector('.multiselect[data-filtro="polo"].ms-travado');
  if (!poloTravado) {
    Multiselect.atualizarOpcoes("polo", valoresUnicos(base(true, true, false), "Polo"));
  }
  // Base = dados vÃ¡lidos + perÃ­odo + os filtros informados
  function base(usarOs, usarEnc, usarPolo) {
    return dadosValidos.filter(function (r) {
      if (usarOs   && os.length          && !os.includes(String(r["OS"]).trim())) return false;
      if (usarEnc  && encarregado.length && !encarregado.includes(String(r["Encarregado"]).trim())) return false;
      if (usarPolo && polo.length        && !polo.includes(String(r["Polo"]).trim())) return false;
      if (inicio || fim) {
        const iso = Tratamento.dataParaISO(r["DataInicio"]);
        if (!iso) return false;
        if (inicio && iso < inicio) return false;
        if (fim && iso > fim) return false;
      }
      return true;
    });
  }

  Multiselect.atualizarOpcoes("os",           valoresUnicos(base(false, true,  true),  "OS"));
  Multiselect.atualizarOpcoes("encarregado",  valoresUnicos(base(true,  false, true),  "Encarregado"));
  Multiselect.atualizarOpcoes("polo",         valoresUnicos(base(true,  true,  false), "Polo"));
  Multiselect.atualizarOpcoes("servico", valoresUnicosDe(base(true, true, true), valorServico));
}


/**
 * Aplica os filtros selecionados e reatualiza a tela.
 * Listas vazias = sem filtro naquele campo.
 */
function aplicarFiltros() {
  const os = Multiselect.valores("os");
  const encarregado = Multiselect.valores("encarregado");
  const servico = Multiselect.valores("servico");
  const polo = Multiselect.valores("polo");
  const inicio = document.getElementById("filtro-inicio").value;
  const fim = document.getElementById("filtro-fim").value;
  const filtrados = dadosValidos.filter(function (r) {
    if (os.length && !os.includes(String(r["OS"]).trim())) return false;
    if (encarregado.length && !encarregado.includes(String(r["Encarregado"]).trim())) return false;
    if (servico.length && !servico.includes(valorServico(r))) return false;
    if (polo.length && !polo.includes(String(r["Polo"]).trim())) return false;
    // PerÃ­odo: converte a data do registro e compara com o intervalo
    if (inicio || fim) {
      const iso = Tratamento.dataParaISO(r["DataInicio"]);
      if (!iso) return false;
      if (inicio && iso < inicio) return false;
      if (fim && iso > fim) return false;
    }
    return true;
  });
  atualizarTela(filtrados);
  atualizarOpcoesFiltros(); // ðŸ”„ listas acompanham o perÃ­odo e os outros filtros
}



/**
 * Calcula os 4 KPIs de produÃ§Ã£o em km.
 * Recebe apenas registros vÃ¡lidos (jÃ¡ tratados).
 */
function calcularKPIs(registros) {
  // KPI 1: ProduÃ§Ã£o Geral (Manual / Mecanizada)
  const manual = registros.filter(r => Tratamento.tipoExecucao(r) === "MANUAL");
  const mecanizada = registros.filter(r => Tratamento.tipoExecucao(r) === "MECANIZADA");
  document.getElementById("kpi-prod-manual").textContent =
    Tratamento.formatarKm(Tratamento.somarKm(manual));
  document.getElementById("kpi-prod-mecanizada").textContent =
    Tratamento.formatarKm(Tratamento.somarKm(mecanizada));

  // KPI 2: ProduÃ§Ã£o DiÃ¡ria Geral (mÃ©dia por dia de cada tipo)
  document.getElementById("kpi-diaria-manual").textContent =
    Tratamento.formatarKm(Tratamento.producaoDiaria(registros, "MANUAL"));
  document.getElementById("kpi-diaria-mecanizada").textContent =
    Tratamento.formatarKm(Tratamento.producaoDiaria(registros, "MECANIZADA"));

  // KPI 3: ProduÃ§Ã£o Geral Total
  document.getElementById("kpi-prod-total").textContent =
    Tratamento.formatarKm(Tratamento.somarKm(registros));

  // KPI 4: ProduÃ§Ã£o DiÃ¡ria Total (mÃ©dia por dia geral)
  document.getElementById("kpi-diaria-total").textContent =
    Tratamento.formatarKm(Tratamento.producaoDiaria(registros));
}

/**
 * Extrai valores Ãºnicos e ordenados de uma coluna
 */
function valoresUnicos(registros, coluna) {
  const conjunto = new Set(
    registros.map(r => String(r[coluna] || "").trim()).filter(v => v !== "")
  );
  return Array.from(conjunto).sort();
}

===== G:\Meu Drive\DINENG\dashboard\js\tratamento.js =====

/**
 * ============================================
 *  TRATAMENTO â€” LIMPEZA E CONVERSÃƒO DE DADOS
 * ============================================
 *  Transforma os dados brutos da planilha em
 *  dados prontos para exibiÃ§Ã£o.
 *
 *  Regras aplicadas:
 *  1. Remove registros marcados como excluÃ­dos (Exclusao = SIM)
 *  2. MantÃ©m apenas trechos APROVADOS
 *  3. Converte extensÃ£o de metros para km
 *  4. Converte datas "dd/mm/aaaa" para formato comparÃ¡vel
 *  5. Converte nÃºmeros no formato BR ("296,07" â†’ 296.07)
 *
 *  âš ï¸ IMPORTANTE: dentro dos mÃ©todos usamos "Tratamento."
 *  em vez de "this." â€” assim as funÃ§Ãµes funcionam mesmo
 *  quando chamadas como apelido global pelo charts.js.
 * ============================================
 */

const Tratamento = {

  /**
   * Converte nÃºmeros no formato brasileiro para valor numÃ©rico.
   * Trata os 3 casos encontrados na planilha:
   *   296,07      â†’ 296.07
   *   210.012,00  â†’ 210012.00
   *   296.07      â†’ 296.07 (nÃºmero jÃ¡ convertido pelo Sheets)
   */
  paraNumero: function (valor) {
    if (typeof valor === "number") return valor;
    if (valor === null || valor === undefined) return 0;

    let texto = String(valor).trim();
    if (texto === "") return 0;

    // Remove pontos de milhar e troca vÃ­rgula decimal por ponto
    texto = texto.replace(/\./g, "").replace(",", ".");

    return parseFloat(texto) || 0;
  },

  /**
   * Converte a extensÃ£o do trecho (em metros) para km.
   * âš ï¸ Se a planilha jÃ¡ registrar em km, remova o "/ 1000".
   */
  kmDoTrecho: function (registro) {
    return Tratamento.paraNumero(registro["EXTENSAO DO TRECHO"]) / 1000;
  },

  /**
   * Converte "dd/mm/aaaa" (ou com hora) para "aaaa-mm-dd".
   * Aceita tambÃ©m objetos Date vindos do Apps Script.
   * Retorna "" se nÃ£o conseguir converter.
   */
  dataParaISO: function (valorData) {
    if (!valorData) return "";

    // Objeto Date real (antes de virar JSON)
    if (valorData instanceof Date && !isNaN(valorData)) {
      return valorData.toISOString().slice(0, 10);
    }

    const texto = String(valorData).trim();
    if (!texto) return "";

    // Formato ISO (como o Apps Script serializa datas do Sheets)
    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
      return texto.slice(0, 10);
    }

    // Formato brasileiro dd/mm/aaaa (com ou sem hora)
    const partes = texto.slice(0, 10).split("/");
    if (partes.length === 3) {
      return partes[2] + "-" + partes[1] + "-" + partes[0];
    }

    return "";
  },

  /**
   * Normaliza o tipo de execuÃ§Ã£o (Equipe: MANUAL / MECANIZADA)
   */
  tipoExecucao: function (registro) {
    return String(registro["Equipe"] || "").trim().toUpperCase();
  },

  /**
   * Verifica se o registro foi excluÃ­do (coluna Exclusao = SIM)
   */
  foiExcluido: function (registro) {
    return String(registro["Exclusao"] || "").trim().toUpperCase() === "SIM";
  },

  /**
   * Verifica se o registro estÃ¡ APROVADO na anÃ¡lise
   */
  ehAprovado: function (registro) {
    return String(registro["SituaÃ§Ã£o analise"] || "").trim().toUpperCase() === "APROVADO";
  },

  /**
   * Aplica todas as regras de validaÃ§Ã£o de uma vez:
   * remove excluÃ­dos e mantÃ©m apenas aprovados.
   */
  filtrarValidos: function (registros) {
    return registros.filter(function (r) {
      return !Tratamento.foiExcluido(r) && Tratamento.ehAprovado(r);
    });
  },

  /**
   * Soma os km de uma lista de registros
   */
  somarKm: function (registros) {
    return registros.reduce(function (total, r) {
      return total + Tratamento.kmDoTrecho(r);
    }, 0);
  },

  /**
   * Calcula a produÃ§Ã£o diÃ¡ria mÃ©dia:
   * km total dos lanÃ§amentos Ã· quantidade de dias distintos.
   *
   * Exemplo: 3 lanÃ§amentos dia 05/06 + 2 no dia 06/06 + 5 no dia 08/06
   * â†’ dias distintos = 3 â†’ produÃ§Ã£o diÃ¡ria = km total Ã· 3
   *
   * @param {Array}  registros - lista de registros (jÃ¡ filtrados)
   * @param {String} tipoFiltro - opcional: "MANUAL" ou "MECANIZADA".
   *                   Se informado, considera sÃ³ os lanÃ§amentos desse tipo
   *                   e divide pelos dias DELES.
   */
  producaoDiaria: function (registros, tipoFiltro) {
    // Filtra pelo tipo, se informado
    let lista = registros;
    if (tipoFiltro) {
      lista = registros.filter(function (r) {
        return Tratamento.tipoExecucao(r) === tipoFiltro;
      });
    }

    // 1. Dias distintos com lanÃ§amento
    const dias = new Set();
    lista.forEach(function (r) {
      const iso = Tratamento.dataParaISO(r["DataInicio"]);
      if (iso) dias.add(iso);
    });

    // 2. ProteÃ§Ã£o contra divisÃ£o por zero
    if (dias.size === 0) return 0;

    // 3. km total Ã· dias distintos
    return Tratamento.somarKm(lista) / dias.size;
  },




  /**
   * Agrupa registros por uma coluna e soma o km de cada grupo.
   * Retorna array de { chave, km } ordenado do maior para o menor.
   * Usado pelos grÃ¡ficos de polo e encarregado.
   */
  agruparPor: function (registros, coluna) {
    const mapa = {};

    registros.forEach(function (r) {
      const chave = String(r[coluna] || "").trim();
      if (!chave) return;
      mapa[chave] = (mapa[chave] || 0) + Tratamento.kmDoTrecho(r);
    });

    return Object.entries(mapa)
      .map(function (par) {
        return { chave: par[0], km: Number(par[1].toFixed(2)) };
      })
      .sort(function (a, b) { return b.km - a.km; });
  },

  /**
   * Formata km no padrÃ£o brasileiro (2 casas decimais)
   */
  formatarKm: function (valor) {
    return valor.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
};

/**
 * Apelidos globais â€” mantÃªm o charts.js funcionando sem alteraÃ§Ãµes,
 * pois ele chama kmDoTrecho(), paraNumero() etc. direto.
 * Como os mÃ©todos internos nÃ£o usam mais "this", os apelidos
 * funcionam em qualquer contexto de chamada.
 */
const paraNumero = Tratamento.paraNumero;
const kmDoTrecho = Tratamento.kmDoTrecho;
const dataParaISO = Tratamento.dataParaISO;
const tipoExecucao = Tratamento.tipoExecucao;
const formatarKm = Tratamento.formatarKm;

===== G:\Meu Drive\DINENG\dashboard\js\charts.js =====

/**
 * ============================================
 *  CHARTS â€” GRÃFICOS DO DASHBOARD
 * ============================================
 *  Usa a biblioteca Chart.js (carregada no index.html).
 *
 *  GrÃ¡ficos (espelham o Power BI):
 *  1. ProduÃ§Ã£o em km por Polo (barras Manual Ã— Mecanizada)
 *  2. ProduÃ§Ã£o em km por Encarregado (ranking)
 *  3. ProduÃ§Ã£o em km Linear Total por Polo (rosca)
 *  4. % SupressÃ£o de VegetaÃ§Ã£o (pizza por tipo de limpeza)
 *
 *  Design das pizzas/rosca (conforme referÃªncia):
 *  - Legenda Ã  esquerda com cÃ­rculos coloridos
 *  - Porcentagens fora do grÃ¡fico, com linhas de chamada
 *  - Paleta em tons de azul e verde
 * ============================================
 */

/**
 * Plugin: desenha o valor no fim de cada barra (grÃ¡ficos 1 e 2).
 */
const pluginValoresNasBarras = {
  id: "valoresNasBarras",
  afterDatasetsDraw: function (chart) {
    const ctx = chart.ctx;
    chart.data.datasets.forEach(function (dataset, i) {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach(function (barra, j) {
        const valor = dataset.data[j];
        if (!valor) return; // nÃ£o desenha zero
        ctx.save();
        ctx.fillStyle = "#1f2937";
        ctx.font = "600 11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
          Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
          barra.x + 5,
          barra.y
        );
        ctx.restore();
      });
    });
  }
};

/**
 * Plugin: porcentagens FORA da pizza/rosca, com linhas de chamada
 * conectando cada fatia ao seu rÃ³tulo (estilo Power BI).
 * Recalcula as % considerando apenas as fatias visÃ­veis.
 */
const pluginRotulosPercentuais = {
  id: "rotulosPercentuais",
  afterDatasetsDraw: function (chart) {
    const tipo = chart.config.type;
    if (tipo !== "pie" && tipo !== "doughnut") return;

    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    const data = chart.data.datasets[0].data;

    // Total apenas das fatias visÃ­veis (respeita cliques na legenda)
    let total = 0;
    data.forEach(function (v, i) {
      if (chart.getDataVisibility(i)) total += v;
    });
    if (!total) return;

    const area = chart.chartArea;
    const cx = area.left + (area.right - area.left) / 2;
    const cy = area.top + (area.bottom - area.top) / 2;
    const raio = meta.data[0] ? meta.data[0].outerRadius : 0;

    meta.data.forEach(function (arco, i) {
      if (!chart.getDataVisibility(i)) return;
      const pct = ((data[i] / total) * 100).toFixed(1) + "%";

      const angulo = (arco.startAngle + arco.endAngle) / 2;
      const cos = Math.cos(angulo);
      const sin = Math.sin(angulo);

      // Linha de chamada: borda da fatia â†’ ponto externo â†’ segmento reto
      const x1 = cx + cos * raio;
      const y1 = cy + sin * raio;
      const x2 = cx + cos * (raio + 10);
      const y2 = cy + sin * (raio + 10);
      const x3 = x2 + (cos >= 0 ? 12 : -12);

      ctx.save();
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y2);
      ctx.stroke();

      ctx.fillStyle = "#1f2937";
      ctx.font = "600 12px sans-serif";
      ctx.textAlign = cos >= 0 ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillText(pct, x3 + (cos >= 0 ? 4 : -4), y2);
      ctx.restore();
    });
  }
};

/**
 * Plugin: escreve o total no centro da rosca (grÃ¡fico 3).
 * O texto Ã© definido em options.plugins.textoCentral.
 */
const pluginTextoCentral = {
  id: "textoCentral",
  afterDraw: function (chart) {
    const cfg = chart.options.plugins.textoCentral;
    if (!cfg || !cfg.texto) return;

    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    if (!meta.data[0]) return;

    const cx = (meta.data[0].x);
    const cy = (meta.data[0].y);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#111827";
    ctx.font = "700 20px sans-serif";
    ctx.fillText(cfg.texto, cx, cy - 8);
    ctx.fillStyle = "#6b7280";
    ctx.font = "500 11px sans-serif";
    ctx.fillText(cfg.subtitulo || "", cx, cy + 12);
    ctx.restore();
  }
};

const Charts = {

  /**
   * Renderiza (ou re-renderiza) os 4 grÃ¡ficos.
   * Chamado pelo app.js a cada filtro aplicado.
   */
  renderizarTodos: function (registros, graficos) {
    this.graficoPorPolo(registros, graficos);
    this.graficoPorEncarregado(registros, graficos);
    this.graficoLinearPolo(registros, graficos);
    this.graficoSupressao(registros, graficos);
  },

  /**
   * DestrÃ³i um grÃ¡fico anterior antes de recriar
   */
  destruirSeExistir: function (graficos, chave) {
    if (graficos[chave]) {
      graficos[chave].destroy();
    }
  },

  /**
   * Paleta azul/verde da referÃªncia
   */
  cores: ["#1e40af", "#2563eb", "#0d9488", "#22c55e", "#60a5fa", "#34d399"],

  /**
   * OpÃ§Ãµes comuns de pizza/rosca: legenda Ã  esquerda com cÃ­rculos
   */
  opcoesPizza: function (extras) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 30 }, // espaÃ§o para os rÃ³tulos externos
      plugins: {
        legend: {
          position: "left",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            padding: 12
          }
        }
      }
    }, extras || {});
  },

  /**
   * 1. Barras horizontais agrupadas: km por Polo, Manual Ã— Mecanizada
   */
  graficoPorPolo: function (registros, graficos) {
    this.destruirSeExistir(graficos, "polo");

    const mapa = {};
    registros.forEach(function (r) {
      const polo = String(r["Polo"] || "").trim();
      if (!polo) return;
      if (!mapa[polo]) mapa[polo] = { manual: 0, mecanizada: 0 };
      if (tipoExecucao(r) === "MANUAL") {
        mapa[polo].manual += kmDoTrecho(r);
      } else if (tipoExecucao(r) === "MECANIZADA") {
        mapa[polo].mecanizada += kmDoTrecho(r);
      }
    });

    // Ordena do maior total para o menor
    const pares = Object.entries(mapa).sort(function (a, b) {
      return (b[1].manual + b[1].mecanizada) - (a[1].manual + a[1].mecanizada);
    });

    const polos = pares.map(p => p[0]);
    const kmManual = pares.map(p => Number(p[1].manual.toFixed(2)));
    const kmMecanizada = pares.map(p => Number(p[1].mecanizada.toFixed(2)));

    graficos.polo = new Chart(
      document.getElementById("grafico-prod-polo"),
      {
        type: "bar",
        data: {
          labels: polos,
          datasets: [
            { label: "Manual", data: kmManual, backgroundColor: "#93c5fd" },
            { label: "Mecanizada", data: kmMecanizada, backgroundColor: "#1e40af" }
          ]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "top" } },
          scales: { x: { beginAtZero: true } }
        },
        plugins: [pluginValoresNasBarras]
      }
    );
  },

  /**
   * 2. Barras horizontais: km por Encarregado (ranking decrescente)
   */
  graficoPorEncarregado: function (registros, graficos) {
    this.destruirSeExistir(graficos, "encarregado");

    const agrupado = Tratamento.agruparPor(registros, "Encarregado");
    const nomes = agrupado.map(a => a.chave);
    const valores = agrupado.map(a => a.km);

    graficos.encarregado = new Chart(
      document.getElementById("grafico-prod-encarregado"),
      {
        type: "bar",
        data: {
          labels: nomes,
          datasets: [{
            label: "km executados",
            data: valores,
            backgroundColor: "#2563eb"
          }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true } }
        },
        plugins: [pluginValoresNasBarras]
      }
    );
  },

  /**
   * 3. Rosca: participaÃ§Ã£o de cada polo no km linear total,
   * com o total no centro e % externas com linhas de chamada.
   */
  graficoLinearPolo: function (registros, graficos) {
    this.destruirSeExistir(graficos, "linear");

    const agrupado = Tratamento.agruparPor(registros, "Polo");
    const polos = agrupado.map(a => a.chave);
    const valores = agrupado.map(a => a.km);
    const totalKm = valores.reduce((a, b) => a + b, 0);

    graficos.linear = new Chart(
      document.getElementById("grafico-linear-polo"),
      {
        type: "doughnut",
        data: {
          labels: polos,
          datasets: [{
            data: valores,
            backgroundColor: this.cores.slice(0, polos.length),
            borderWidth: 2,
            borderColor: "#ffffff"
          }]
        },
        options: this.opcoesPizza({
          cutout: "55%",
          plugins: {
            legend: {
              position: "left",
              labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 12 }
            },
            textoCentral: {
              texto: Tratamento.formatarKm(totalKm),
              subtitulo: "km total"
            },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = ((ctx.raw / total) * 100).toFixed(1);
                  return ctx.label + ": " + Tratamento.formatarKm(ctx.raw) + " km (" + pct + "%)";
                }
              }
            }
          }
        }),
        plugins: [pluginRotulosPercentuais, pluginTextoCentral]
      }
    );
  },

  /**
   * 4. Pizza: % SupressÃ£o de VegetaÃ§Ã£o por tipo de limpeza.
   * Categorias = Equipe + TipodaLimpeza (MEC_DENSA, MEC_RALA,
   * MAN_RALA, MAN_DENSA). A % Ã© calculada sobre os km de cada tipo.
   */
  graficoSupressao: function (registros, graficos) {
    this.destruirSeExistir(graficos, "supressao");

    const mapa = {};
    registros.forEach(function (r) {
      const equipe = String(r["Equipe"] || "").trim().toUpperCase().slice(0, 3); // MEC / MAN
      const limpeza = String(r["TipodaLimpeza"] || "").trim().toUpperCase();     // DENSA / RALA
      if (!equipe || !limpeza) return;
      const chave = equipe + "_" + limpeza;
      mapa[chave] = (mapa[chave] || 0) + kmDoTrecho(r);
    });

    const categorias = Object.keys(mapa);
    const valores = categorias.map(c => Number(mapa[c].toFixed(2)));

    graficos.supressao = new Chart(
      document.getElementById("grafico-supressao"),
      {
        type: "pie",
        data: {
          labels: categorias,
          datasets: [{
            data: valores,
            backgroundColor: this.cores.slice(0, categorias.length),
            borderWidth: 2,
            borderColor: "#ffffff"
          }]
        },
        options: this.opcoesPizza({
          plugins: {
            legend: {
              position: "left",
              labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 12 }
            },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = ((ctx.raw / total) * 100).toFixed(1);
                  return ctx.label + ": " + pct + "%";
                }
              }
            }
          }
        }),
        plugins: [pluginRotulosPercentuais]
      }
    );
  }
};


===== G:\Meu Drive\DINENG\dashboard\js\multiselect.js =====

/**
 * ============================================
 *  MULTISELECT â€” FILTROS COM MÃšLTIPLA SELEÃ‡ÃƒO
 * ============================================
 *  Transforma divs .multiselect em dropdowns com
 *  checkboxes. Regras:
 *  - Nada marcado = TODOS os valores
 *  - Checkbox "Todos" marca/desmarca a lista inteira
 *  - Fecha ao clicar fora
 * ============================================
 */

const Multiselect = {

  // Estado atual: { os: ["OS-1"], encarregado: [], polo: [] }
  selecoes: {},

  /**
   * Monta todos os multiselects da pÃ¡gina.
   * @param {Object}   config    - { os: [...], encarregado: [...], polo: [...] }
   * @param {Function} aoAlterar - callback disparado a cada mudanÃ§a
   */
  inicializar: function (config, aoAlterar) {
    this.aoAlterar = aoAlterar;

    document.querySelectorAll(".multiselect").forEach(function (ms) {
      const chave = ms.dataset.filtro;
      const valores = config[chave] || [];

      // ComeÃ§a sem nada marcado = "Todos"
      Multiselect.selecoes[chave] = [];

      const toggle = ms.querySelector(".ms-toggle");
      const menu = ms.querySelector(".ms-menu");

      // Monta o menu: item "Todos" + um checkbox por valor
      menu.innerHTML = "";

      const labelTodos = document.createElement("label");
      labelTodos.className = "ms-todos";
      const cbTodos = document.createElement("input");
      cbTodos.type = "checkbox";
      cbTodos.checked = true;
      labelTodos.appendChild(cbTodos);
      labelTodos.appendChild(document.createTextNode(" Todos"));
      menu.appendChild(labelTodos);

      // BotÃ£o "Limpar": zera a seleÃ§Ã£o do filtro
      const btnLimpar = document.createElement("button");
      btnLimpar.type = "button";
      btnLimpar.className = "ms-limpar";
      btnLimpar.textContent = "âœ• Limpar";
      menu.appendChild(btnLimpar);

      btnLimpar.addEventListener("click", function (e) {
        e.stopPropagation();
        Multiselect.selecoes[chave] = [];
        menu.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
          cb.checked = cb.parentElement.classList.contains("ms-todos");
        });
        Multiselect.atualizarRotulo(ms, chave);
        Multiselect.aoAlterar();
      });


      valores.forEach(function (valor) {
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = valor;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(" " + valor));
        menu.appendChild(label);
      });

      // Abre/fecha o dropdown (fecha os outros)
      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        document.querySelectorAll(".multiselect.aberto").forEach(function (outro) {
          if (outro !== ms) outro.classList.remove("aberto");
        });
        ms.classList.toggle("aberto");
      });

      // Clique dentro do menu nÃ£o fecha o dropdown
      menu.addEventListener("click", function (e) {
        e.stopPropagation();
      });

      // MudanÃ§a em qualquer checkbox do menu
      menu.addEventListener("change", function (e) {
        const cb = e.target;
        if (cb.type !== "checkbox") return;

        const ehTodos = cb.parentElement.classList.contains("ms-todos");

       if (ehTodos) {
          // Comportamento original: marcado = sem filtro (todos),
          // desmarcado = limpa a seleÃ§Ã£o
          const marcar = cb.checked;
          menu.querySelectorAll('input[type="checkbox"]').forEach(function (outro) {
            if (!outro.parentElement.classList.contains("ms-todos")) {
              outro.checked = marcar;
            }
          });
          Multiselect.selecoes[chave] = marcar ? valores.slice() : [];
        } else if (cb.checked) {
          Multiselect.selecoes[chave].push(cb.value);
        } else {
          Multiselect.selecoes[chave] = Multiselect.selecoes[chave].filter(
            function (v) { return v !== cb.value; }
          );
        }

        Multiselect.atualizarRotulo(ms, chave);
        Multiselect.aoAlterar();
      });
    });

    // Fecha dropdowns abertos ao clicar fora
    document.addEventListener("click", function () {
      document.querySelectorAll(".multiselect.aberto").forEach(function (ms) {
        ms.classList.remove("aberto");
      });
    });
  },

  /**
   * Atualiza o texto do botÃ£o conforme a seleÃ§Ã£o
   */
  atualizarRotulo: function (ms, chave) {
    const selecionados = Multiselect.selecoes[chave];
    const toggle = ms.querySelector(".ms-toggle");

    if (selecionados.length === 0) {
      toggle.textContent = "Todos";
    } else if (selecionados.length <= 2) {
      toggle.textContent = selecionados.join(", ");
    } else {
      toggle.textContent = selecionados.length + " selecionados";
    }
  },

    /**
   * Atualiza as opÃ§Ãµes de um filtro (filtros em cascata),
   * mantendo apenas as seleÃ§Ãµes que ainda existem na lista.
   */
    /**
   * ðŸ”’ Trava um filtro em um Ãºnico valor (ex.: polo do usuÃ¡rio).
   * O dropdown fica desabilitado e sempre filtrado por esse valor.
   */
  travar: function (chave, valor) {
    const ms = document.querySelector('.multiselect[data-filtro="' + chave + '"]');
    if (!ms) return;

    Multiselect.selecoes[chave] = [valor];
    ms.classList.add("ms-travado");

    const toggle = ms.querySelector(".ms-toggle");
    toggle.textContent = valor;
    toggle.disabled = true;
  },
  atualizarOpcoes: function (chave, valores) {
    const ms = document.querySelector('.multiselect[data-filtro="' + chave + '"]');
    if (!ms) return;
    const menu = ms.querySelector(".ms-menu");

    // Descarta seleÃ§Ãµes que sumiram da lista (ex.: OS sem serviÃ§o no perÃ­odo)
    Multiselect.selecoes[chave] =
      (Multiselect.selecoes[chave] || []).filter(function (v) {
        return valores.includes(v);
      });
    const marcados = Multiselect.selecoes[chave];

    // ReconstrÃ³i os checkboxes (o item "Todos" fica)
    menu.querySelectorAll("label:not(.ms-todos)").forEach(function (l) {
      l.remove();
    });
    valores.forEach(function (valor) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = valor;
      cb.checked = marcados.includes(valor);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + valor));
      menu.appendChild(label);
    });

    // "Todos" volta a ficar marcado quando nada estÃ¡ selecionado
    const cbTodos = menu.querySelector(".ms-todos input");
    if (cbTodos) cbTodos.checked = marcados.length === 0;

    Multiselect.atualizarRotulo(ms, chave);
  },


  /**
   * Valores marcados de um filtro. Array vazio = todos.
   */
  valores: function (chave) {
    return Multiselect.selecoes[chave] || [];
  },

  /**
   * Limpa todas as seleÃ§Ãµes (botÃ£o "Limpar filtros")
   */
  limpar: function () {
    document.querySelectorAll(".multiselect").forEach(function (ms) {
      const chave = ms.dataset.filtro;
      Multiselect.selecoes[chave] = [];
      ms.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        cb.checked = cb.parentElement.classList.contains("ms-todos");
      });
      Multiselect.atualizarRotulo(ms, chave);
    });
  }
};

===== G:\Meu Drive\DINENG\dashboard\js\api.js =====

/**
 * ============================================
 *  API â€” COMUNICAÃ‡ÃƒO COM O APPS SCRIPT
 * ============================================
 *  Ãšnica camada que fala com o Web App.
 *  O resto do cÃ³digo chama as funÃ§Ãµes daqui.
 *
 *  ðŸ—“ï¸ O perÃ­odo dos filtros Ã© enviado Ã  API, que filtra
 *  NO SERVIDOR e devolve apenas o intervalo escolhido.
 * ============================================
 */

// âš ï¸ Substitua pela URL gerada na implantaÃ§Ã£o do Apps Script
const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw1aMVcpcLiU-ZYvbIiVhFezb7AHTp9l6S42H_oPNsJ1touoMHEgSf2CxWpQR8wJeGp/exec";

// âš ï¸ O mesmo token definido no Code.gs
const API_TOKEN = "dash-2026-dineng";

/**
 * FunÃ§Ã£o genÃ©rica para buscar dados do Apps Script.
 * @param {string} acao       - Nome da aÃ§Ã£o (ex.: "listar_produtividade")
 * @param {Object} parametros - ParÃ¢metros extras na query string
 * @returns {Promise<Array>}  - Lista de registros (objetos)
 */
async function buscarDados(acao, parametros = {}) {
  const url = new URL(APP_SCRIPT_URL);
  url.searchParams.set("acao", acao);
  url.searchParams.set("token", API_TOKEN);
  Object.entries(parametros).forEach(([chave, valor]) => {
    url.searchParams.set(chave, valor);
  });

  try {
    const resposta = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow" // obrigatÃ³rio: o Apps Script redireciona 2x
    });

    if (!resposta.ok) {
      throw new Error(`Erro HTTP ${resposta.status}`);
    }

    const dados = await resposta.json();
    if (!dados.success) {
      throw new Error(dados.error || "Erro desconhecido no servidor");
    }

    // ðŸ“¦ Formato compacto novo (colunas + linhas):
    // remonta em objetos com nome de campo
    if (dados.colunas && dados.linhas) {
      return dados.linhas.map(function (linha) {
        const obj = {};
        dados.colunas.forEach(function (coluna, i) {
          obj[coluna] = linha[i];
        });
        return obj;
      });
    }

    // Compatibilidade: formato antigo (data: [...])
    return dados.data;
  } catch (erro) {
    console.error("[api.js] Falha ao buscar dados:", erro.message);
    throw erro;
  }
}

/**
 * Busca os registros de Produtividade (km por trecho),
 * enviando o perÃ­odo selecionado nos filtros de data.
 * A API filtra no servidor e devolve sÃ³ o intervalo.
 * @returns {Promise<Array>} Lista de trechos executados no perÃ­odo
 */
function buscarDadosDashboard() {
  // ðŸ—“ï¸ PerÃ­odo selecionado nos filtros (aaaa-mm-dd)
  // const inicio = document.getElementById("filtro-inicio").value;
  // const fim = document.getElementById("filtro-fim").value;

  // const parametros = {};
  // if (inicio) parametros.data_inicio = inicio;
  // if (fim) parametros.data_fim = fim;

  return buscarDados("listar_produtividade");
}

/**
 * ExpÃµe as funÃ§Ãµes globalmente para app.js e charts.js
 */
window.API = {
  buscarDados,
  buscarDadosDashboard
};

===== G:\Meu Drive\DINENG\dashboard\js\login.js =====

/**
 * LOGIN â€” LÃ“GICA DA TELA (usa LoginAPI)
 */
const form         = document.getElementById("form-login");
const campoUsuario = document.getElementById("campo-usuario");
const campoSenha   = document.getElementById("campo-senha");
const btnEntrar    = document.getElementById("btn-entrar");
const btnOlho      = document.getElementById("btn-olho");
const msgErro      = document.getElementById("login-erro");
const msgSucesso   = document.getElementById("login-sucesso");

// JÃ¡ estÃ¡ logado? Vai direto pro dashboard
if (sessionStorage.getItem("sess_token")) {
  window.location.href = "dashboard.html";
}

// Olho da senha
btnOlho.addEventListener("click", function () {
  const oculta = campoSenha.type === "password";
  campoSenha.type = oculta ? "text" : "password";
  btnOlho.classList.toggle("ativo", oculta);
  btnOlho.title = oculta ? "Ocultar senha" : "Mostrar senha";
});

function mostrarMensagem(elemento, texto) {
  msgErro.classList.add("oculto");
  msgSucesso.classList.add("oculto");
  elemento.textContent = texto;
  elemento.classList.remove("oculto");
}

function botaoCarregando(carregando) {
  btnEntrar.disabled = carregando;
  btnEntrar.innerHTML = carregando
    ? '<span class="spinner"></span> Entrando...'
    : "Entrar";
}

form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const usuario = campoUsuario.value.trim();
  const senha   = campoSenha.value;

  if (!usuario || !senha) {
    mostrarMensagem(msgErro, "Informe usuÃ¡rio e senha.");
    return;
  }

  botaoCarregando(true);

  try {
    await LoginAPI.entrar(usuario, senha);
    mostrarMensagem(msgSucesso, "Login realizado! Carregando dashboard...");
    window.location.href = "dashboard.html";
  } catch (falha) {
    botaoCarregando(false);
    mostrarMensagem(msgErro, falha.message);
  }
});

// SessÃ£o vÃ¡lida? â†’ dashboard. Token morto? â†’ limpa e fica no login.
LoginAPI.redirecionarSeLogado();

===== G:\Meu Drive\DINENG\dashboard\js\loginapi.js =====

/**
 * ============================================
 *  LOGINAPI â€” CAMADA DE AUTENTICAÃ‡ÃƒO
 * ============================================
 *  Ãšnica camada que fala com o Apps Script
 *  para login e sessÃ£o.
 *
 *  ðŸ›¡ï¸ ProteÃ§Ã£o anti-loop:
 *  - sair() nÃ£o redireciona se jÃ¡ estÃ¡ no login
 *  - redirecionarSeLogado() sÃ³ manda pro dashboard
 *    com token VÃLIDO (token morto Ã© limpo, nÃ£o redireciona)
 *  - protegerPagina() nunca roda na pÃ¡gina de login
 */

const LOGIN_API_URL = "https://script.google.com/macros/s/AKfycbwWAYk_B78JmGH8NW16XarOnRJkQ9PoNkpEI7-4PiMsvsskN6_iSiVOU0x0PXwsTuNHOA/exec";

const PAGINA_LOGIN     = "index.html";
const PAGINA_DASHBOARD = "dashboard.html";

const LoginAPI = {

  /**
   * Chama o Apps Script via POST
   * (usuÃ¡rio e senha nunca vÃ£o na URL)
   */


  chamar(parametros) {
    return this._chamar(parametros);
  },
  async _chamar(parametros) {
    const corpo = new URLSearchParams(parametros);
    const resposta = await fetch(LOGIN_API_URL, {
      method: "POST",
      body: corpo
    });
    if (!resposta.ok) throw new Error("Erro " + resposta.status + " na API.");
    return resposta.json();
  },

  /**
   * A pÃ¡gina atual Ã© o login?
   * Cobre tambÃ©m a raiz do site ("/")
   */
  _estaNoLogin() {
    const arquivo = window.location.pathname.split("/").pop().toLowerCase();
    return arquivo === "" || arquivo === "index.html";
  },

  /**
   * Faz login e guarda a sessÃ£o no navegador.
   * Retorna os dados da sessÃ£o em caso de sucesso.
   */
  async entrar(usuario, senha) {
    const dados = await this._chamar({
      acao:    "login",
      usuario: usuario,
      senha:   senha
    });

    if (!dados.ok) throw new Error(dados.erro || "Falha no login.");

    sessionStorage.setItem("sess_token",   dados.token);
    sessionStorage.setItem("sess_usuario", dados.sessao.usuario);
    sessionStorage.setItem("sess_nivel",   dados.sessao.nivel);
    sessionStorage.setItem("sess_polo",    dados.sessao.polo);

    return dados.sessao;
  },

  /**
   * Confere se a sessÃ£o atual ainda Ã© vÃ¡lida.
   * Retorna true/false (nunca lanÃ§a erro).
   */
  async sessaoValida() {
    const token = sessionStorage.getItem("sess_token");
    if (!token) return false;

    try {
      const dados = await this._chamar({
        acao:  "validar_sessao",
        token: token
      });
      return !!dados.ok;
    } catch (falha) {
      console.error("[loginapi.js] Falha ao validar sessÃ£o:", falha);
      return false;
    }
  },

  /**
   * ðŸ  PARA A PÃGINA DE LOGIN (index.html)
   * JÃ¡ tem sessÃ£o vÃ¡lida? â†’ vai pro dashboard.
   * Token morto? â†’ limpa e FICA no login (quebra o loop).
   */
  async redirecionarSeLogado() {
    if (!this._estaNoLogin()) return;
    if (!sessionStorage.getItem("sess_token")) return; // sem token: fica

    const valida = await this.sessaoValida();
    if (valida) {
      window.location.replace(PAGINA_DASHBOARD);
    } else {
      sessionStorage.clear();
    }
  },

  /**
   * ðŸ” PARA O DASHBOARD (dashboard.html)
   * Exige sessÃ£o vÃ¡lida. Sem sessÃ£o â†’ volta pro login
   * (uma vez sÃ³, pois sair() tem guarda anti-loop).
   */
  async protegerPagina() {
    if (this._estaNoLogin()) return true; // nunca protege o prÃ³prio login
    const valida = await this.sessaoValida();
    if (!valida) this.sair();
    return valida;
  },

  /**
   * Dados do usuÃ¡rio logado (ou null)
   */
  usuarioLogado() {
    if (!sessionStorage.getItem("sess_token")) return null;
    return {
      usuario: sessionStorage.getItem("sess_usuario"),
      nivel:   sessionStorage.getItem("sess_nivel"),
      polo:    sessionStorage.getItem("sess_polo")
    };
  },

  /**
   * Encerra a sessÃ£o e volta pro login.
   * Se jÃ¡ estiver no login, sÃ³ limpa â€” sem redirecionar.
   */
  sair() {
    sessionStorage.clear();
    if (!this._estaNoLogin()) {
      window.location.replace(PAGINA_LOGIN);
    }
  }


};

window.LoginAPI = LoginAPI;

===== G:\Meu Drive\DINENG\dashboard\js\auth.js =====

/**
 * AUTH â€” PROTEGE O DASHBOARD (usa LoginAPI)
 */
const Sessao = LoginAPI.usuarioLogado();

(async function protegerPagina() {
  const valida = await LoginAPI.sessaoValida();
  if (!valida) LoginAPI.sair();
})();


/**
 * AUTH â€” protege o dashboard usando a LoginAPI
 */
LoginAPI.protegerPagina();

===== G:\Meu Drive\DINENG\dashboard\js\admin.js =====

/**
 * ADMIN â€” GESTÃƒO DE USUÃRIOS (sÃ³ nÃ­vel "adm")
 * Consulta, adiÃ§Ã£o e ediÃ§Ã£o via API.
 */

const formAdmin   = document.getElementById("form-usuario");
const campoModo   = document.getElementById("modo");
const fUsuario    = document.getElementById("f-usuario");
const fSenha      = document.getElementById("f-senha");
const fPolo       = document.getElementById("f-polo");
const fNivel      = document.getElementById("f-nivel");
const fAtivo      = document.getElementById("f-ativo");
const corpoTabela = document.getElementById("corpo-tabela");
const msgAdmin    = document.getElementById("admin-msg");
const btnCancelar = document.getElementById("btn-cancelar");
const btnSair     = document.getElementById("btn-sair");
const tituloForm  = document.getElementById("titulo-form");
const dicaSenha   = document.getElementById("dica-senha");

function mostrarMsg(texto, erro) {
  msgAdmin.textContent = texto;
  msgAdmin.className = erro ? "erro" : "ok";
}

/** Confirma acesso e carrega a tabela.
 *  âš ï¸ TEMPORÃRIO: sem exigÃªncia de admin (modo aberto).
 *  Depois de cadastrar o admin, restaurar o bloco original. */
(async function iniciarAdmin() {
  const usuario = LoginAPI.usuarioLogado();

  // NÃ£o Ã© admin â†’ manda pro dashboard
  if (!usuario || String(usuario.nivel).toLowerCase() !== "adm") {
    window.location.replace("dashboard.html");
    return;
  }

  document.getElementById("admin-nome").textContent = usuario.usuario;
  carregarUsuarios();
})();

/** Consulta: lista os usuÃ¡rios na tabela */
async function carregarUsuarios() {
  corpoTabela.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
  try {
    const resposta = await LoginAPI.chamar({
      acao:  "listar_usuarios",
      token: sessionStorage.getItem("sess_token"),
    });
    if (!resposta.ok) throw new Error(resposta.erro);

    corpoTabela.innerHTML = "";
    resposta.usuarios.forEach(function (u) {
      const linha = document.createElement("tr");
      linha.innerHTML =
        "<td>" + u.usuario + "</td>" +
        "<td>" + u.polo + "</td>" +
        "<td>" + u.nivel + "</td>" +
        "<td>" + (u.ativo === "SIM" ? "âœ…" : "âŒ") + "</td>" +
        "<td>" + (u.temSenha ? "configurada" : "âš ï¸ pendente") + "</td>" +
        '<td><button type="button" class="btn-editar">Editar</button></td>';
      linha.querySelector(".btn-editar").addEventListener("click", function () {
        preencherFormulario(u);
      });
      corpoTabela.appendChild(linha);
    });
  } catch (falha) {
    corpoTabela.innerHTML = '<tr><td colspan="6">' + falha.message + "</td></tr>";
  }
}

/** Clique em Editar â†’ modo ediÃ§Ã£o */
function preencherFormulario(u) {
  campoModo.value = "editar";
  tituloForm.textContent = "Editar usuÃ¡rio";
  fUsuario.value = u.usuario;
  fUsuario.readOnly = true; // o nome Ã© a chave, nÃ£o muda
  fSenha.value = "";
  dicaSenha.textContent = "(deixe vazio para manter a atual)";
  fPolo.value = u.polo;
  fNivel.value = u.nivel;
  fAtivo.value = u.ativo;
  btnCancelar.classList.remove("oculto");
  msgAdmin.className = "oculto";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Cancelar â†’ volta pro modo adicionar */
btnCancelar.addEventListener("click", function () {
  campoModo.value = "adicionar";
  tituloForm.textContent = "Adicionar usuÃ¡rio";
  formAdmin.reset();
  fUsuario.readOnly = false;
  dicaSenha.textContent = "";
  btnCancelar.classList.add("oculto");
  msgAdmin.className = "oculto";
});

/** Salvar â†’ chama adicionar_usuario ou editar_usuario */
formAdmin.addEventListener("submit", async function (e) {
  e.preventDefault();

  const parametros = {
    acao:  campoModo.value + "_usuario",
    token: sessionStorage.getItem("sess_token") || "", // opcional no modo aberto
    novo_usuario: fUsuario.value.trim(),
    senha:  fSenha.value,
    polo:   fPolo.value.trim(),
    nivel:  fNivel.value,
    ativo:  fAtivo.value
  };

  // No modo ediÃ§Ã£o, o campo usuÃ¡rio se chama "usuario"
  if (campoModo.value === "editar") {
    parametros.usuario = fUsuario.value.trim();
    delete parametros.novo_usuario;
    if (!parametros.senha) delete parametros.senha; // sem senha nova = mantÃ©m
  }

  try {
    const resposta = await LoginAPI.chamar(parametros);
    if (!resposta.ok) throw new Error(resposta.erro);

    mostrarMsg("âœ… " + resposta.msg, false);
    btnCancelar.click(); // reseta o formulÃ¡rio
    carregarUsuarios();
  } catch (falha) {
    mostrarMsg(falha.message, true);
  }
});


/** Sair */
btnSair.addEventListener("click", function () {
  LoginAPI.sair();
});

===== G:\Meu Drive\DINENG\dashboard\js\sidebar.js =====

/* js/sidebar.js â€” monta o sidebar em todas as pÃ¡ginas + comportamento */
(function () {
  const PAGINA_ATUAL = location.pathname.split("/").pop() || "dashboard.html";

  const LINKS = [
    { href: "dashboard.html", icone: "ðŸ“Š", texto: "Dashboard" },
    { href: "admin.html",     icone: "ðŸ‘¥", texto: "UsuÃ¡rios", soAdmin: true }
    // â† adicione novos itens aqui conforme o menu cresce
  ];

  const usuario = LoginAPI.usuarioLogado();
  const isAdmin = usuario && String(usuario.nivel).toLowerCase() === "adm";
  const inicial = usuario ? String(usuario.usuario).charAt(0).toUpperCase() : "â€”";

  const links = LINKS
    .filter(function (l) { return !l.soAdmin || isAdmin; }) // UsuÃ¡rios: sÃ³ adm
    .map(function (l) {
      const ativo = l.href === PAGINA_ATUAL ? " ativo" : "";
      return '<a href="' + l.href + '" class="sidebar-link' + ativo + '" data-titulo="' + l.texto + '">' +
             '<span class="sidebar-icone">' + l.icone + '</span>' +
             '<span class="sidebar-texto">' + l.texto + '</span></a>';
    })
    .join("");

  const html =
    '<aside class="sidebar" id="sidebar">' +
      '<div class="sidebar-marca">' +
        '<img src="assets/img/logo_nome.png" alt="ENDISA" class="sidebar-logo">' +
        '<button type="button" class="sidebar-toggle" id="btn-toggle">Â«</button>' +
      '</div>' +
      '<nav class="sidebar-nav">' + links + '</nav>' +
      '<div class="sidebar-rodape">' +
        '<div class="sidebar-usuario">' +
          '<div class="sidebar-avatar">' + inicial + '</div>' +
          '<div class="sidebar-nome">' + (usuario ? usuario.usuario : "â€”") + '</div>' +
        '</div>' +
        '<button type="button" class="sidebar-sair" id="btn-sair">Sair</button>' +
      '</div>' +
    '</aside>' +
    '<div class="sidebar-fundo" id="sidebar-fundo"></div>';

  document.body.insertAdjacentHTML("afterbegin", html);

  // ---------- Comportamento (agora os elementos EXISTEM) ----------

  // Recolher / expandir â€” UMA classe no body controla tudo
  const btnToggle = document.getElementById("btn-toggle");
  btnToggle.addEventListener("click", function () {
    document.body.classList.toggle("sidebar-recolhida");
    btnToggle.title = document.body.classList.contains("sidebar-recolhida")
      ? "Expandir menu" : "Recolher menu";
  });

  // Gaveta no mobile â€” o â˜° fica no cabeÃ§alho de cada pÃ¡gina
  const sidebar = document.getElementById("sidebar");
  const fundo   = document.getElementById("sidebar-fundo");
  const btnMenu = document.getElementById("btn-menu");

  function fechar() {
    sidebar.classList.remove("aberta");
    fundo.classList.remove("aberto");
  }

  if (btnMenu) {
    btnMenu.addEventListener("click", function () {
      sidebar.classList.toggle("aberta");
      fundo.classList.toggle("aberto");
    });
  }
  fundo.addEventListener("click", fechar);

  // Fechar a gaveta ao navegar
  document.querySelectorAll(".sidebar-link").forEach(function (link) {
    link.addEventListener("click", fechar);
  });

  // Sair
  document.getElementById("btn-sair").addEventListener("click", function () {
    LoginAPI.sair();
  });
})();

===== G:\Meu Drive\DINENG\dashboard\js\definir-senha.js =====

/* ============================================================
   DEFINIR SENHA â€” DASHBOARD ENDISA
   Grava a nova senha na planilha atravÃ©s do MESMO endpoint
   usado pelo admin.js (LoginAPI.chamar â†’ Apps Script â†’ Sheets).
   ============================================================ */

// â¬‡ï¸ Cole aqui a aÃ§Ã£o exata do admin.js (texto entre aspas no chamar()
//    quando ele salva o usuÃ¡rio). Ex.: const ACAO_FIXA = 'salvar_usuario';
const ACAO_FIXA = '';

// Candidatas em ordem: criar/cadastrar primeiro, depois editar
const ACOES_CANDIDATAS = [
  'cadastrar_usuario', 'salvar_usuario', 'adicionar_usuario',
  'criar_usuario', 'salvarUsuario', 'addUsuario',
  'editar_usuario', 'atualizar_usuario', 'salvar_usuario_editado'
];

const form = document.getElementById('form-definir-senha');
const msgErro = document.getElementById('msg-erro');
const msgSucesso = document.getElementById('msg-sucesso');
const btnSalvar = document.getElementById('btn-salvar');

function mostrarMsg(el, texto) {
  msgErro.hidden = true;
  msgSucesso.hidden = true;
  el.textContent = texto;
  el.hidden = false;
}

function aplicarHashSeHouver(senha) {
  for (const nome of ['hashSenha', 'criptografarSenha', 'gerarHash', 'sha256', 'hash']) {
    if (typeof window[nome] === 'function') return window[nome](senha);
  }
  return senha; // sem hash no front â†’ o Apps Script pode aplicar
}

// Tenta as aÃ§Ãµes uma a uma; para na primeira que o backend aceitar
async tentarGravar = async (payload) => {
  const lista = ACAO_FIXA ? [ACAO_FIXA] : ACOES_CANDIDATAS;
  const erros = [];
  for (const acao of lista) {
    try {
      console.log('ðŸ“¤ Tentando aÃ§Ã£o:', acao);
      const resp = await LoginAPI.chamar(acao, payload);
      console.log('âœ… Sucesso com:', acao, resp);
      return resp;
    } catch (e) {
      console.log('âš ï¸ Falhou:', acao, 'â†’', e.message || e);
      erros.push(acao);
    }
  }
  throw new Error('Nenhuma aÃ§Ã£o foi aceita pelo endpoint. Tentadas: ' + erros.join(', '));
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgErro.hidden = true;
  msgSucesso.hidden = true;

  const usuario = document.getElementById('campo-usuario').value.trim();
  const senha = document.getElementById('campo-senha').value;
  const senha2 = document.getElementById('campo-senha2').value;

  if (!usuario) return mostrarMsg(msgErro, 'Informe o usuÃ¡rio.');
  if (senha.length < 4) return mostrarMsg(msgErro, 'A senha deve ter pelo menos 4 caracteres.');
  if (senha !== senha2) return mostrarMsg(msgErro, 'As senhas nÃ£o conferem.');

  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';

  const payload = {
    usuario: usuario,
    senha: aplicarHashSeHouver(senha),
    ativo: 'SIM'
  };
  console.log('ðŸ“¤ Payload:', payload);

  try {
    await tentarGravar(payload);

    mostrarMsg(msgSucesso, 'Senha definida com sucesso! Voltando ao login...');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);

  } catch (erro) {
    console.error('âŒ Erro ao salvar senha:', erro);
    mostrarMsg(msgErro, 'Erro ao salvar: ' + (erro.message || 'tente novamente.'));
    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar senha';
  }
});

===== G:\Meu Drive\DINENG\dashboard\css\style.css =====

/* ============================================
   DASHBOARD â€” ESTILOS BASE
   Mobile-first: comeÃ§a pelo celular e evolui
   ============================================ */

/* --- VariÃ¡veis globais (paleta e espaÃ§amentos) --- */
:root {
  --cor-primaria: #2563eb;
  --cor-primaria-escura: #1e40af;
  --cor-texto: #1f2937;
  --cor-texto-suave: #6b7280;
  --cor-fundo: #f3f4f6;
  --cor-branco: #ffffff;
  --cor-borda: #e5e7eb;
  --cor-sucesso: #16a34a;
  --raio-borda: 8px;
  --sombra: 0 1px 3px rgba(0, 0, 0, 0.1);
  --espaco: 16px;
}

/* --- Reset bÃ¡sico --- */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* ============================================
   LAYOUT FLEX â€” O CONTAINER Ã‰ RELATIVO AO SIDEBAR
   body = flex | sidebar = largura prÃ³pria | conteudo = flex:1
   Sidebar aumenta â†’ conteÃºdo recolhe.
   Sidebar diminui â†’ conteÃºdo volta a crescer.
   SEM margens fixas: o navegador calcula a cada frame.
   ============================================ */
body {
  display: flex;
  min-height: 100vh;
  font-family: "Segoe UI", system-ui, Arial, sans-serif;
  background: var(--cor-fundo);
  color: var(--cor-texto);
  line-height: 1.5;
  margin: 0;
  
}

/* ConteÃºdo: ocupa SEMPRE o espaÃ§o que a sidebar deixar */
.conteudo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  height: 100vh;
  overflow-y: auto;
}


/* Container: preenche o espaÃ§o que a .conteudo der */
.container {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: var(--espaco) 24px;
  box-sizing: border-box;
  flex: 1;                      /* ocupa todo o espaÃ§o dentro de .conteudo */
  display: flex;                /* agora o margin-top: auto do footer funciona */
  flex-direction: column;
}

.footer {
  margin-top: auto;   /* agora funciona: empurra para o fim do .container */
  text-align: center;
  flex-shrink: 0;
}




/* Telas grandes: mais respiro nas laterais */
@media (min-width: 1024px) {
  .container {
    padding: var(--espaco) 48px;
  }
}


/* ============================================
   CABEÃ‡ALHO â€” LOGO, TÃTULO E USUÃRIO
   ============================================ */
.cabecalho {
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.cabecalho-conteudo {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14px;
}

.logo-img {
  height: 48px;
  width: auto;
  object-fit: contain;
  flex-shrink: 0;
}

.cabecalho-textos h1 {
  font-size: 19px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  line-height: 1.2;
}

.cabecalho-subtitulo {
  font-size: 13px;
  color: #64748b;
  margin: 2px 0 0;
}

.cabecalho-usuario { display: flex; align-items: center; gap: 10px; }
.cabecalho-nome { font-size: 14px; font-weight: 700; color: #0f172a; }
.cabecalho-nivel {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  background: #dbeafe; color: #1e40af;
  border-radius: 20px; padding: 3px 10px;
}

.btn-sair-topo {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px; font-weight: 600; color: #334155;
  cursor: pointer;
}
.btn-sair-topo:hover {
  background: #fee2e2; border-color: #fca5a5; color: #b91c1c;
}

.btn-menu {
  display: none;
  background: #f1f5f9;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  padding: 8px 12px;
  cursor: pointer;
}

/* Em telas pequenas: logo menor, tÃ­tulo quebra bem */
@media (max-width: 480px) {
  .cabecalho { padding: 12px 16px; }
  .logo-img { height: 38px; }
  .cabecalho-textos h1 { font-size: 17px; }
}

/* ============================================
   FILTROS
   ============================================ */
.filtros {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  background: var(--cor-branco);
  border-radius: var(--raio-borda);
  box-shadow: var(--sombra);
  padding: 16px;
  margin-bottom: var(--espaco);
}

.filtros__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.875rem;
  color: var(--cor-texto-suave);
}

/* PerÃ­odo: os dois campos de data no mesmo label */
.filtros__item--periodo {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filtros__periodo-campos {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.filtros__periodo-campos input[type="date"] {
  flex: 1;
  min-width: 0;
}

.filtros__ate {
  font-size: 0.875rem;
  color: var(--cor-texto-suave);
  white-space: nowrap;
}

/* Desktop/tablet: 6 colunas â€” OS | Encarregado | ServiÃ§o | Polo | PerÃ­odo | Aplicar */
@media (min-width: 640px) {
  .filtros {
    grid-template-columns: 1fr 1.2fr 1fr 1fr 1.8fr auto;
    align-items: end;
  }
  .filtros__periodo-campos input[type="date"] {
    padding: 8px 6px; /* reduz o espaÃ§o interno para caber "data atÃ© data" */
    font-size: 0.8125rem;
  }
}

select,
.input {
  padding: 8px 12px;
  border: 1px solid var(--cor-borda);
  border-radius: var(--raio-borda);
  font-size: 0.875rem;
  background: var(--cor-branco);
}

select:focus,
.input:focus {
  outline: 2px solid var(--cor-primaria);
  border-color: transparent;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: var(--raio-borda);
  background: var(--cor-primaria);
  color: var(--cor-branco);
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.2s;
}
.btn:hover { background: var(--cor-primaria-escura); }

/* ============================================
   KPIs
   ============================================ */
.kpis {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--espaco);
  margin-bottom: var(--espaco);
}

.card {
  background: var(--cor-branco);
  border-radius: var(--raio-borda);
  box-shadow: var(--sombra);
  padding: var(--espaco);
}

.card--kpi { text-align: center; }

.card__titulo {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--cor-texto-suave);
  margin-bottom: 8px;
}

.card__valor {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--cor-primaria);
}

.card__valor--destaque {
  font-size: 2rem;
  color: var(--cor-primaria-escura);
  margin: 8px 0 4px;
}

/* Tipos dentro do card (Manual | Mecanizada lado a lado) */
.kpi__tipos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.kpi__tipo {
  background: var(--cor-fundo);
  border-radius: var(--raio-borda);
  padding: 12px 8px;
  text-align: center;
}

.kpi__icone {
  font-size: 1.25rem;
  display: block;
  margin-bottom: 4px;
}

.kpi__rotulo {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--cor-texto-suave);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kpi__valor {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--cor-primaria);
  margin-top: 4px;
}

.kpi__unidade {
  display: block;
  font-size: 0.75rem;
  color: var(--cor-texto-suave);
  margin-top: 2px;
}

/* ============================================
   KPIs â€” CARDS DE TOTAL (design refinado)
   ============================================ */
.kpi-card {
  background: #ffffff;
  border: none;
  border-radius: 14px;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 8px 24px rgba(15, 23, 42, 0.08);
  padding: 22px 26px;
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.kpi-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 2px 4px rgba(15, 23, 42, 0.06),
    0 12px 32px rgba(15, 23, 42, 0.12);
}

/* Faixa lateral com brilho sutil no topo */
.kpi-card::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 5px;
  background: linear-gradient(180deg, #2563eb, #1e40af);
}

/* Variante diÃ¡ria: faixa verde */
.kpi-card.kpi-diaria::before {
  background: linear-gradient(180deg, #22c55e, #0d9488);
}

.kpi-icone {
  width: 50px;
  height: 50px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
  box-shadow: inset 0 -2px 4px rgba(0, 0, 0, 0.06);
}

.kpi-icone-azul { background: linear-gradient(145deg, #dbeafe, #bfdbfe); }
.kpi-icone-verde { background: linear-gradient(145deg, #ccfbf1, #a7f3d0); }

.kpi-rotulo {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.kpi-valor-linha {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 6px;
}

.kpi-valor {
  font-size: 30px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}

.kpi-unidade {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
}

/* ============================================
   GRÃFICOS
   ============================================ */
.graficos {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--espaco);
  margin-bottom: var(--espaco);
}

.grafico {
  min-height: 280px;
  width: 100%;
}

/* Card de grÃ¡fico: design refinado */
.grafico-card {
  background: #ffffff;
  border: none;
  border-radius: 14px;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 8px 24px rgba(15, 23, 42, 0.08);
  padding: 24px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  min-width: 0; /* permite o canvas encolher quando a sidebar expande */
}

.grafico-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 2px 4px rgba(15, 23, 42, 0.06),
    0 12px 32px rgba(15, 23, 42, 0.12);
}

/* TÃ­tulo do grÃ¡fico: discreto, com barra de destaque */
.grafico-card h3 {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin: 0 0 16px;
  padding-left: 12px;
  border-left: 4px solid #2563eb;
  line-height: 1.3;
}

/* Container do canvas: altura fixa para o Chart.js renderizar certo */
.grafico-container {
  position: relative;
  height: 320px;
}

/* Pizzas/rosca um pouco mais baixas */
.grafico-card.grafico-pizza .grafico-container { height: 300px; }

@media (max-width: 768px) {
  .grafico-card { padding: 18px; }
  .grafico-container { height: 260px; }
}

/* ============================================
   TABELA DE DETALHAMENTO
   ============================================ */
.tabela-section {
  background: var(--cor-branco);
  border-radius: var(--raio-borda);
  box-shadow: var(--sombra);
  padding: var(--espaco);
}

.tabela-section__topo {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

/* Ãrea com rolagem e cantos arredondados */
.tabela-wrapper {
  max-height: 480px;
  overflow-y: auto;
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.tabela th,
.tabela td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--cor-borda);
  white-space: nowrap;
}

.tabela th {
  background: var(--cor-fundo);
  font-weight: 600;
}

/* CabeÃ§alho: discreto, fixo ao rolar */
thead th {
  position: sticky;
  top: 0;
  background: #f8fafc;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  text-align: left;
  padding: 12px 16px;
  border-bottom: 2px solid #e2e8f0;
  z-index: 1;
}

tbody td {
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
  white-space: nowrap;
}

/* Zebra: linha sim, linha nÃ£o */
tbody tr:nth-child(even) { background: #f8fafc; }

/* Hover azul suave */
tbody tr:hover { background: #eff6ff; }

/* Km (Ãºltima coluna): alinhado Ã  direita, em negrito */
tbody td:last-child {
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Data (primeira coluna): dÃ­gitos alinhados */
tbody td:first-child { font-variant-numeric: tabular-nums; }

/* CabeÃ§alho "Km" alinhado com os valores */
thead th:last-child { text-align: right; }

/* BotÃ£o ocultar detalhamento */
.btn-ocultar {
  background: #f1f5f9;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s ease;
}
.btn-ocultar:hover { background: #e2e8f0; }
.btn-ocultar .seta {
  font-size: 10px;
  transition: transform 0.3s ease;
}

/* Estado recolhido: esconde a tabela e gira a seta */
.secao-tabela.recolhido .tabela-wrapper { display: none; }
.secao-tabela.recolhido .btn-ocultar .seta { transform: rotate(-90deg); }





/* ============================================
   MULTISELECT (filtros com mÃºltipla seleÃ§Ã£o)
   ============================================ */
.multiselect {
  position: relative;
  width: 100%;
  min-width: 180px;
}

.ms-toggle {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ms-toggle::after {
  content: "â–¾";
  float: right;
  color: #6b7280;
}

.ms-menu {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  min-width: 100%;
  max-height: 260px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 6px 0;
}

.multiselect.aberto .ms-menu { display: block; }

.ms-menu label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.ms-menu label:hover { background: #f3f4f6; }

.ms-todos {
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
  margin-bottom: 4px;
  padding-bottom: 8px;
}

/* BotÃ£o Limpar dentro do dropdown */
.ms-limpar {
  width: 100%;
  background: none;
  border: none;
  border-top: 1px solid #e5e7eb;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 12px;
  text-align: left;
  cursor: pointer;
}
.ms-limpar:hover { background: #fee2e2; }

/* Filtro travado por permissÃ£o do usuÃ¡rio */
.ms-travado .ms-toggle {
  opacity: .75;
  cursor: not-allowed;
  background: #eef2ff;
  border-color: #c7d2fe;
}
.ms-travado .ms-menu { display: none !important; }

/* ============================================
   OVERLAY DE CARREGAMENTO
   ============================================ */
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(243, 244, 246, 0.9);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  transition: opacity 0.4s ease;
}

/* Estado escondido (apÃ³s carregar) */
.loading-overlay.oculto {
  opacity: 0;
  pointer-events: none;
}

.loading-caixa {
  background: #fff;
  padding: 32px 48px;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  text-align: center;
}

.loading-spinner {
  width: 44px;
  height: 44px;
  margin: 0 auto 16px;
  border: 4px solid #dbeafe;
  border-top-color: #1e40af;
  border-radius: 50%;
  animation: girar 0.9s linear infinite;
}

@keyframes girar {
  to { transform: rotate(360deg); }
}

.loading-texto {
  margin: 0;
  font-weight: 600;
  color: #1f2937;
}

.loading-sub { color: #6b7280; }

/* ============================================
   SIDEBAR â€” participa do fluxo flex (sticky)
   ============================================ */
.sidebar {
  position: sticky;        /* substitui o fixed: agora EMPURRA o conteÃºdo */
  top: 0;
  align-self: flex-start;
  height: 100vh;
  width: 160px;            /* largura aberta */
  flex-shrink: 0;          /* o conteÃºdo nunca esmaga o menu */
  background: #0f172a;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  z-index: 100;
  transition: width .25s ease, transform .25s ease;
}

.sidebar-marca {
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 62px; /* altura fixa: o cabeÃ§alho nunca "pula" */
}

.sidebar-logo {
  height: 34px;
  width: auto;
  object-fit: contain;
  filter: brightness(0) invert(1); /* logo escura â†’ branca */
  transition: opacity .2s;
}

.sidebar-toggle {
  background: rgba(255,255,255,.08);
  color: #e2e8f0;
  border: none;
  border-radius: 8px;
  width: 30px; height: 30px;
  font-size: 15px;
  cursor: pointer;
  flex-shrink: 0;
}
.sidebar-toggle:hover { background: rgba(255,255,255,.18); }

.sidebar-nav {
  flex: 1;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden; /* nada vaza quando recolhe */
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 10px;
  color: #94a3b8;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  transition: background .2s, color .2s;
}
.sidebar-link:hover { background: rgba(255,255,255,.06); color: #fff; }
.sidebar-link.ativo { background: #2563eb; color: #fff; }
.sidebar-icone { font-size: 17px; flex-shrink: 0; }

.sidebar-rodape {
  padding: 14px 16px;
  border-top: 1px solid rgba(255,255,255,.08);
}

.sidebar-usuario {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  white-space: nowrap;
  overflow: hidden;
}

.sidebar-avatar {
  width: 34px; height: 34px;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}

.sidebar-nome {
  font-size: 13px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis;
}

.sidebar-sair {
  width: 100%;
  background: rgba(255,255,255,.08);
  color: #e2e8f0;
  border: 1px solid rgba(255,255,255,.15);
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.sidebar-sair:hover { background: rgba(255,255,255,.16); }

.sidebar-fundo {
  display: none;
  position: fixed; inset: 0;
  background: rgba(15,23,42,.5);
  z-index: 90;
}

/* ===== Estado recolhido: UMA regra no body controla tudo ===== */
/* A sidebar encolhe â†’ o flex: 1 do .conteudo devolve o espaÃ§o sozinho */
body.sidebar-recolhida .sidebar { width: 68px; }
body.sidebar-recolhida .sidebar-texto { display: none; }
body.sidebar-recolhida .sidebar-logo { display: none; }
body.sidebar-recolhida .sidebar-toggle { transform: rotate(180deg); }
body.sidebar-recolhida .sidebar-marca { justify-content: center; padding: 14px 8px; }
body.sidebar-recolhida .sidebar-link { justify-content: center; padding: 11px 0; }
body.sidebar-recolhida .sidebar-usuario { justify-content: center; }
body.sidebar-recolhida .sidebar-nome { display: none; }
body.sidebar-recolhida .sidebar-sair { font-size: 0; padding: 8px 0; }
body.sidebar-recolhida .sidebar-sair::after { content: "âŽ‹"; font-size: 15px; }

/* Recolhida: nome aparece como tooltip no hover */
body.sidebar-recolhida .sidebar-link { position: relative; }
body.sidebar-recolhida .sidebar-link:hover::after {
  content: attr(data-titulo);
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  background: #1e293b;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 6px;
  white-space: nowrap;
  z-index: 200;
}

/* ============================================
   RESPONSIVO â€” telas maiores (tablet e desktop)
   ============================================ */
@media (min-width: 640px) {
  .kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .kpis {
    grid-template-columns: repeat(4, 1fr);
  }
  .graficos {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ============================================
   MOBILE â€” gaveta (sidebar sai do fluxo flex)
   ============================================ */
@media (max-width: 900px) {
  .sidebar {
    position: fixed;   /* volta a flutuar: nÃ£o ocupa "coluna" no flex */
    transform: translateX(-100%);
    width: 240px !important;
  }
  .sidebar.aberta { transform: translateX(0); }
  .sidebar-fundo.aberto { display: block; }
  .sidebar-toggle { display: none; }
  .btn-menu { display: block; }
  .cabecalho-nivel { display: none; }
  /* o .conteudo continua flex: 1 â€” ocupa a tela toda sozinho */
}


===== G:\Meu Drive\DINENG\dashboard\css\fonts.css =====


===== G:\Meu Drive\DINENG\dashboard\css\login.css =====

/* ============================================
   LOGIN â€” DASHBOARD ENDISA
   Estilo da tela de acesso (index.html)
   Formato de referÃªncia: quadro vermelho na marca
   ============================================ */

* { margin: 0; padding: 0; box-sizing: border-box; }

/* Fundo azul escuro ocupando a tela toda */
body {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "Segoe UI", Arial, sans-serif;
  background: linear-gradient(160deg, #16324f 0%, #1a3a5a 100%);
}

/* ===== Card principal ===== */
.login-caixa {
  background: #fff;
  padding: 36px 32px;
  border-radius: 15px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .1), 0 12px 32px rgba(0, 0, 0, .25);
  width: min(380px, 92vw);
  text-align: center;
}

/* ===== Bloco da marca (quadro vermelho) ===== */
.login-marca {
  border: 2px solid #ff0000;
  border-radius: 10px;
  padding: 18px 14px 16px;
  margin-bottom: 24px;
}

.login-logo-texto {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin-bottom: 12px;
}

.logo-nome {
  font-size: 1.75rem;
  font-weight: 800;
  color: #1a3a5a;
  letter-spacing: 1px;
  line-height: 1;
}

.logo-sub {
  font-size: .62rem;
  font-weight: 600;
  color: #6b7a8d;
  letter-spacing: 2px;
}

.login-titulo {
  font-size: .9rem;
  font-weight: 600;
  color: #1a3a5a;
  letter-spacing: 1.5px;
  border-top: 1px solid #e3e8ef;
  padding-top: 10px;
}

/* ===== FormulÃ¡rio ===== */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.login-campo { position: relative; }

.login-campo span {
  display: block;
  font-size: .8rem;
  font-weight: 600;
  color: #4a5a6a;
  margin-bottom: 6px;
}

.login-campo input {
  width: 100%;
  height: 44px;
  padding: 0 42px 0 40px; /* espaÃ§o para os Ã­cones */
  border: 1px solid #d1d9e6;
  border-radius: 8px;
  font-size: .95rem;
  outline: none;
  transition: border-color .2s, box-shadow .2s;
}

.login-campo input:focus {
  border-color: #2e7dd1;
  box-shadow: 0 0 0 3px rgba(46, 125, 209, .15);
}

/* Ãcone Ã  esquerda do campo */
.login-campo .icone {
  position: absolute;
  left: 12px;
  bottom: 13px;
  width: 18px;
  height: 18px;
  fill: #a0aab8;
}

/* ===== BotÃ£o de olho (mostrar/ocultar senha) ===== */
.btn-olho {
  position: absolute;
  right: 10px;
  bottom: 10px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
}
.btn-olho svg { width: 18px; height: 18px; fill: #a0aab8; }
.btn-olho:hover svg { fill: #1a3a5a; }

/* Alterna entre olho aberto e fechado */
.btn-olho .olho-fechado { display: none; }
.btn-olho.ativo .olho-aberto  { display: none; }
.btn-olho.ativo .olho-fechado { display: block; }

/* ===== Mensagens de erro e sucesso ===== */
.login-erro,
.login-sucesso {
  border-radius: 8px;
  padding: 9px 12px;
  font-size: .85rem;
}
.login-erro {
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f5c6c2;
}
.login-sucesso {
  background: #e8f5e9;
  color: #1b5e20;
  border: 1px solid #a5d6a7;
}
.oculto { display: none; }

/* ===== BotÃ£o Entrar ===== */
.login-botao {
  background: #1a3a5a;
  color: #fff;
  border: none;
  border-radius: 8px;
  height: 44px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background .2s;
}
.login-botao:hover { background: #12283f; }
.login-botao:disabled { opacity: .7; cursor: wait; }

/* Spinner do botÃ£o (estado "Entrando...") */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, .4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: girar .7s linear infinite;
}
@keyframes girar { to { transform: rotate(360deg); } }

/* ===== RodapÃ© do card ===== */
.login-rodape {
  margin-top: 20px;
  font-size: .75rem;
  color: #a0aab8;
}

/* ===== Responsivo ===== */
@media (max-width: 420px) {
  .login-caixa { padding: 26px 20px; }
}   

===== G:\Meu Drive\DINENG\dashboard\css\admin.css =====

/* ADMIN â€” GestÃ£o de usuÃ¡rios */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: "Segoe UI", Arial, sans-serif;
  background: #f0f3f7;
  min-height: 100vh;
}

.admin-topo {
  background: #1a3a5a;
  color: #fff;
  padding: 14px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.admin-marca { font-weight: 800; letter-spacing: 1px; }
.admin-marca span { font-weight: 400; font-size: .85rem; opacity: .8; }
.admin-user { display: flex; align-items: center; gap: 12px; font-size: .9rem; }
.btn-sair {
  background: rgba(255,255,255,.15);
  color: #fff;
  border: 1px solid rgba(255,255,255,.4);
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
}
.btn-sair:hover { background: rgba(255,255,255,.25); }

.admin-corpo {
  max-width: 900px;
  margin: 24px auto;
  padding: 0 16px;
  display: grid;
  gap: 20px;
}

.admin-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
}
.admin-card h2 {
  color: #1a3a5a;
  font-size: 1.1rem;
  margin-bottom: 16px;
  border-left: 4px solid #ff0000;
  padding-left: 10px;
}

#form-usuario { display: grid; gap: 12px; }
#form-usuario label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: .85rem; font-weight: 600; color: #4a5a6a;
}
#form-usuario input, #form-usuario select {
  height: 40px;
  border: 1px solid #d1d9e6;
  border-radius: 8px;
  padding: 0 12px;
  font-size: .95rem;
}
#form-usuario input[readonly] { background: #eef1f5; color: #6b7a8d; }
#form-usuario small { font-weight: 400; color: #8a97a5; }

.admin-botoes { display: flex; gap: 10px; }
.admin-botoes button {
  height: 42px;
  padding: 0 24px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
#btn-salvar { background: #1a3a5a; color: #fff; }
#btn-salvar:hover { background: #12283f; }
#btn-cancelar { background: #e3e8ef; color: #4a5a6a; }

#admin-msg { border-radius: 8px; padding: 9px 12px; font-size: .85rem; }
#admin-msg.erro { background: #fdecea; color: #b3261e; }
#admin-msg.ok { background: #e8f5e9; color: #1b5e20; }
.oculto { display: none; }

.tabela-usuarios { width: 100%; border-collapse: collapse; font-size: .9rem; }
.tabela-usuarios th, .tabela-usuarios td {
  padding: 10px 8px;
  text-align: left;
  border-bottom: 1px solid #e3e8ef;
}
.tabela-usuarios th { color: #1a3a5a; font-size: .8rem; text-transform: uppercase; }
.btn-editar {
  background: none;
  border: 1px solid #1a3a5a;
  color: #1a3a5a;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: .8rem;
}
.btn-editar:hover { background: #1a3a5a; color: #fff; }

===== G:\Meu Drive\DINENG\dashboard\dashboard.html =====

<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Dashboard de produÃ§Ã£o de supressÃ£o vegetal conectado ao Google Sheets">
  <title>Dashboard de ProduÃ§Ã£o</title>

  <!-- Fontes e estilos -->
  <link rel="stylesheet" href="css/fonts.css">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <!-- ===== OVERLAY DE CARREGAMENTO =====
       Aparece enquanto a API responde e some ao carregar -->
  <div class="loading-overlay" id="loading-overlay">
    <div class="loading-caixa">
      <div class="loading-spinner"></div>
      <p class="loading-texto">Carregando dados...</p>
      <small class="loading-sub">Buscando informaÃ§Ãµes no Aplicativo</small>
    </div>
  </div>


  <main class="container">

    <!-- ===== BARRA DE FILTROS GLOBAIS =====
         OS, Encarregado e Polo agora sÃ£o MULTISELECT:
         dropdowns com checkboxes, mÃºltipla seleÃ§Ã£o.
         Nada marcado = Todos. Datas seguem como estÃ£o. -->
    <section class="filtros" aria-label="Filtros do dashboard">

      <div class="filtros__item">
        <span>OS</span>
        <div class="multiselect" data-filtro="os">
          <button type="button" class="ms-toggle">Todas</button>
          <div class="ms-menu"></div>
        </div>
      </div>

      <div class="filtros__item">
        <span>Encarregado</span>
        <div class="multiselect" data-filtro="encarregado">
          <button type="button" class="ms-toggle">Todos</button>
          <div class="ms-menu"></div>
        </div>
      </div>

      <div class="filtros__item">
        <span>ServiÃ§o</span>
        <div class="multiselect" data-filtro="servico">
          <button type="button" class="ms-toggle">Todos</button>
          <div class="ms-menu"></div>
        </div>
      </div>


      <div class="filtros__item">
        <span>Polo</span>
        <div class="multiselect" data-filtro="polo">
          <button type="button" class="ms-toggle">Todos</button>
          <div class="ms-menu"></div>
        </div>
      </div>

      <label class="filtros__item filtros__item--periodo">
        <span>PerÃ­odo</span>
        <span class="filtros__periodo-campos">
          <input type="date" id="filtro-inicio" class="input" title="Data inicial">
          <span class="filtros__ate">atÃ©</span>
          <input type="date" id="filtro-fim" class="input" title="Data final">
        </span>
      </label>

      <button class="btn" id="btn-aplicar-filtros">Aplicar</button>
    </section>

    <!-- ===== CARDS DE KPI (TELA PRINCIPAL) ===== -->
    <section class="kpis" aria-label="Indicadores principais">

      <!-- KPI 1: ProduÃ§Ã£o Geral -->
      <article class="card card--kpi">
        <h2 class="card__titulo">ProduÃ§Ã£o Geral</h2>
        <div class="kpi__tipos">
          <div class="kpi__tipo">
            <span class="kpi__icone" title="Manual">ðŸª“</span>
            <span class="kpi__rotulo">Manual</span>
            <p class="kpi__valor" id="kpi-prod-manual">â€”</p>
            <small class="kpi__unidade">km</small>
          </div>
          <div class="kpi__tipo">
            <span class="kpi__icone" title="Mecanizada">ðŸšœ</span>
            <span class="kpi__rotulo">Mecanizada</span>
            <p class="kpi__valor" id="kpi-prod-mecanizada">â€”</p>
            <small class="kpi__unidade">km</small>
          </div>
        </div>
      </article>

      <!-- KPI 2: ProduÃ§Ã£o DiÃ¡ria Geral -->
      <article class="card card--kpi">
        <h2 class="card__titulo">ProduÃ§Ã£o DiÃ¡ria Geral</h2>
        <div class="kpi__tipos">
          <div class="kpi__tipo">
            <span class="kpi__icone" title="Manual">ðŸª“</span>
            <span class="kpi__rotulo">Manual</span>
            <p class="kpi__valor" id="kpi-diaria-manual">â€”</p>
            <small class="kpi__unidade">km/dia</small>
          </div>
          <div class="kpi__tipo">
            <span class="kpi__icone" title="Mecanizada">ðŸšœ</span>
            <span class="kpi__rotulo">Mecanizada</span>
            <p class="kpi__valor" id="kpi-diaria-mecanizada">â€”</p>
            <small class="kpi__unidade">km/dia</small>
          </div>
        </div>
      </article>

      <!-- ===== KPI 3: PRODUÃ‡ÃƒO GERAL TOTAL ===== -->
      <div class="kpi-card kpi-total">
        <div class="kpi-icone kpi-icone-azul">Î£</div>
        <div class="kpi-info">
          <span class="kpi-rotulo">ProduÃ§Ã£o Geral Total</span>
          <div class="kpi-valor-linha">
            <span class="kpi-valor" id="kpi-prod-total">0,00</span>
            <span class="kpi-unidade">km</span>
          </div>
        </div>
      </div>

      <!-- ===== KPI 4: PRODUÃ‡ÃƒO DIÃRIA TOTAL ===== -->
      <div class="kpi-card kpi-total kpi-diaria">
        <div class="kpi-icone kpi-icone-verde">âš¡</div>
        <div class="kpi-info">
          <span class="kpi-rotulo">ProduÃ§Ã£o DiÃ¡ria Total</span>
          <div class="kpi-valor-linha">
            <span class="kpi-valor" id="kpi-diaria-total">0,00</span>
            <span class="kpi-unidade">km/dia</span>
          </div>
        </div>
      </div>

    </section>

    <!-- ===== GRÃFICOS DA TELA PRINCIPAL ===== -->
    <section class="graficos" aria-label="GrÃ¡ficos da tela principal">
      <!-- GrÃ¡fico 1: ProduÃ§Ã£o por Polo -->
      <div class="grafico-card">
        <h3>ProduÃ§Ã£o em km por Polo</h3>
        <div style="height: 350px;">
          <canvas id="grafico-prod-polo"></canvas>
        </div>
      </div>

      <!-- GrÃ¡fico 2: ProduÃ§Ã£o por Encarregado -->
      <div class="grafico-card">
        <h3>ProduÃ§Ã£o em km por Encarregado</h3>
        <div style="height: 400px;">
          <canvas id="grafico-prod-encarregado"></canvas>
        </div>
      </div>

      <!-- GrÃ¡fico 3: km Linear Total por Polo (rosca) -->
      <div class="grafico-card">
        <h3>ProduÃ§Ã£o em km Linear Total por Polo</h3>
        <div style="height: 300px;">
          <canvas id="grafico-linear-polo"></canvas>
        </div>
      </div>

      <!-- GrÃ¡fico 4: % SupressÃ£o de VegetaÃ§Ã£o (pizza) -->
      <div class="grafico-card">
        <h3>% SupressÃ£o de VegetaÃ§Ã£o</h3>
        <div style="height: 300px;">
          <canvas id="grafico-supressao"></canvas>
        </div>
      </div>

    </section>


  </main>

    <footer class="footer">
      <p id="footer-atualizacao">Dados carregados do aplicativo</p>
    </footer>
  </div>

  <!-- Biblioteca de grÃ¡ficos (Chart.js via CDN) -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

  <!-- Seus scripts (ordem importa) -->
  <script src="js/loginapi.js"></script>
  <script src="js/auth.js"></script>
  <script src="js/sidebar.js"></script>
  <script src="js/api.js" defer></script>
  <script src="js/tratamento.js" defer></script>
  <script src="js/multiselect.js" defer></script>
  <script src="js/charts.js" defer></script>
  <script src="js/app.js" defer></script>
  

</body>
</html>

===== G:\Meu Drive\DINENG\dashboard\index.html =====

<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Login do Dashboard de ProduÃ§Ã£o Endisa">
  <title>Login â€” Dashboard Endisa</title>

  <link rel="stylesheet" href="css/fonts.css">
  <link rel="stylesheet" href="css/login.css">
</head>
<body>

  <main class="login-caixa">

    <!-- Marca: logo + tÃ­tulo dentro do quadro vermelho -->
    <div class="login-marca">
      <div class="login-logo-texto">
        <span class="logo-nome">ENDISA</span>
        <span class="logo-sub">ENGENHARIA E MEIO AMBIENTE</span>
      </div>
      <h1 class="login-titulo">ACESSO RESTRITO</h1>
    </div>

    <form id="form-login" class="login-form">

      <!-- Campo UsuÃ¡rio -->
      <label class="login-campo">
        <span>UsuÃ¡rio</span>

        <svg class="icone" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
        </svg>

        <input type="text" id="campo-usuario" placeholder="Digite seu usuÃ¡rio ou e-mail"
               autocomplete="username" required>
      </label>

      <!-- Campo Senha -->
      <label class="login-campo">
        <span>Senha</span>

        <svg class="icone" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8h-1V6c0-2.8-2.2-5-5-5S7 3.2 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.7 1.3-3 3-3s3 1.3 3 3v2H9V6z"/>
        </svg>

        <input type="password" id="campo-senha" placeholder="Digite sua senha"
               autocomplete="current-password" required>
          <p class="login-rodape">
            Primeiro acesso? <a href="definir-senha.html">Definir senha</a>
          </p>
        <!-- BotÃ£o olho: mostra/oculta a senha -->
        <button type="button" class="btn-olho" id="btn-olho" title="Mostrar senha">
          <svg class="olho-aberto" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zm0 12.5c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm0-8c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"/>
          </svg>
          <svg class="olho-fechado" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 6c3.8 0 7.2 2.4 9.4 6-2.2 3.6-5.6 6-9.4 6s-7.2-2.4-9.4-6C4.8 8.4 8.2 6 12 6zm0 10.5c2.5 0 4.5-2 4.5-4.5s-2-4.5-4.5-4.5-4.5 2-4.5 4.5 2 4.5 4.5 4.5zM2.4 3.7 3.7 2.4l17.9 17.9-1.3 1.3z"/>
          </svg>
        </button>
        
      </label>

      <!-- Mensagens de erro e sucesso -->
      <p id="login-erro" class="login-erro oculto"></p>
      <p id="login-sucesso" class="login-sucesso oculto"></p>

      <!-- BotÃ£o Entrar -->
      <button type="submit" class="login-botao" id="btn-entrar">Entrar</button>
    </form>

    <p class="login-rodape">Dashboard de ProduÃ§Ã£o â€” km de supressÃ£o vegetal</p>
  </main>

 <!-- No index.html (login) -->
<script src="js/loginapi.js"></script>
<script src="js/login.js"></script>

<!-- No dashboard.html -->
<script src="js/loginapi.js"></script>
<script src="js/auth.js"></script>
<!-- ... resto igual -->
</body>
</html>

===== G:\Meu Drive\DINENG\dashboard\Login — Dashboard Endisa.html =====

<!DOCTYPE html>
<html lang="pt-BR" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login â€” Dashboard Endisa</title>
  
  <!-- Estilos base do sistema e Basecoat UI -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/basecoat-css@1.0.2/dist/basecoat.cdn.min.css">
  <style>
/* Skip artifact shell â€” fixed styles served beside every artifact.
   Complements basecoat; artifacts override --accent for their own identity. */
:root {
  color-scheme: light dark;
  --accent: #2563eb;
  --accent-contrast: #ffffff;
  --accent-text: color-mix(in srgb, var(--accent) 72%, #000);
  --bg: #f8f9fb;
  --surface: #ffffff;
  --text: #14171f;
  --text-muted: #5b6472;
  --border: rgba(20, 23, 31, 0.10);
  --radius: 10px;
  --shadow: 0 1px 3px rgba(20, 23, 31, 0.08);
  --space: 16px;
}
/* Theme resolution. Without data-theme the viewer's system preference decides,
   as it always did. With it, the artifact's own choice wins in BOTH directions:
   a page that hardcodes one palette must not be handed the opposite set of
   tokens by the machine it happens to be opened on. The dark values appear
   twice because a media query cannot be folded into a selector list.
   The attribute sits inside :where() so these blocks keep the specificity of a
   bare :root â€” the page's own <style> is linked after this file and must go on
   overriding any token it wants, exactly as it could before. */
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    --accent-text: color-mix(in srgb, var(--accent) 78%, #fff);
    --bg: #101318;
    --surface: #181c23;
    --text: #eef1f6;
    --text-muted: #9aa4b2;
    --border: rgba(238, 241, 246, 0.12);
    --shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }
}
:root:where([data-theme="dark"]) {
  color-scheme: dark;
  --accent-text: color-mix(in srgb, var(--accent) 78%, #fff);
  --bg: #101318;
  --surface: #181c23;
  --text: #eef1f6;
  --text-muted: #9aa4b2;
  --border: rgba(238, 241, 246, 0.12);
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
:root:where([data-theme="light"]) { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
img { max-width: 100%; display: block; }

.shell-container { max-width: 1100px; margin: 0 auto; padding: 0 20px; }
.shell-section { padding: calc(var(--space) * 2) 0; }
.shell-grid { display: grid; gap: var(--space); grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.shell-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: var(--space); }
.shell-footer { padding: 24px 0 40px; color: var(--text-muted); font-size: 13px; }

.shell-hero { padding: calc(var(--space) * 3) 0 calc(var(--space) * 2); }
.shell-hero h1 { font-size: clamp(26px, 4vw, 40px); line-height: 1.15; margin: 0 0 10px; text-wrap: balance; }
.shell-hero p { color: var(--text-muted); max-width: 60ch; margin: 0; }

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: var(--space);
}

.kpi { display: flex; flex-direction: column; gap: 4px; }
.kpi .kpi-value { font-size: 28px; font-weight: 650; line-height: 1.1; }
.kpi .kpi-label { font-size: 13px; color: var(--text-muted); }
.kpi .kpi-delta { font-size: 12.5px; font-weight: 600; }
.kpi .kpi-delta.up { color: #0a8f3c; }
.kpi .kpi-delta.down { color: #cf3131; }

table.shell-table { border-collapse: collapse; width: 100%; font-size: 14px; }
table.shell-table th {
  text-align: left; font-size: 11.5px; letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--text-muted); font-weight: 600;
}
table.shell-table th, table.shell-table td { padding: 9px 12px 9px 0; border-bottom: 1px solid var(--border); }
table.shell-table td.num, table.shell-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
table.shell-table tbody tr:hover { background: color-mix(in srgb, var(--accent) 6%, transparent); }

.chart-box { width: 100%; min-height: 220px; }
.chart-box svg { width: 100%; height: auto; display: block; }

.muted { color: var(--text-muted); }
.accent { color: var(--accent-text); }
.shell-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent-text);
}

@media (prefers-reduced-motion: no-preference) {
  .shell-fade { animation: shell-fade 400ms ease both; }
  @keyframes shell-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
}

</style>
  

  <style>
    /* VariÃ¡veis do tema corporativo Endisa */
    :root {
      --accent: #1a4d7a;
      --navy-dark: #0d2b45;
      --navy-mid: #1a4d7a;
      --navy-accent: #2e7dd1;
      --navy-accent-glow: rgba(46, 125, 209, 0.22);
      --slate-muted: #576d82;
      --card-bg: #ffffff;
      --text-main: #1d2b3a;
      --border-color: #cbd5e1;
      --error-bg: #fdecea;
      --error-text: #b3261e;
      --error-border: #f8c8c5;
      --success-bg: #e6f4ea;
      --success-text: #137333;
      --success-border: #ceead6;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: "Segoe UI", Arial, -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--navy-dark) 0%, var(--navy-mid) 100%);
      color: var(--text-main);
      padding: 1rem;
      position: relative;
      overflow-x: hidden;
    }

    /* Textura sutil decorativa de linhas elÃ©tricas no fundo */
    .bg-grid-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(46, 125, 209, 0.12) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(26, 77, 122, 0.18) 0%, transparent 45%);
      z-index: 0;
    }

    /* Card principal de autenticaÃ§Ã£o */
    .login-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 380px;
      background: var(--card-bg);
      border-radius: 14px;
      padding: 2.25rem 2rem 1.75rem;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.28), 0 8px 18px rgba(0, 0, 0, 0.16);
      border: 1px solid rgba(255, 255, 255, 0.15);
      animation: fadeIn 0.35s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* CabeÃ§alho do card */
    .card-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .logo-container {
      display: flex;
      justify-content: center;
      margin-bottom: 0.65rem;
    }

    .logo-brand {
      width: 100%;
      max-width: 180px;
      height: auto;
      display: block;
    }

    .subtitle {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--slate-muted);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      margin-top: 0.25rem;
    }

    /* FormulÃ¡rio e campos */
    .form-group {
      margin-bottom: 1.15rem;
    }

    .form-label {
      display: block;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #334155;
      margin-bottom: 0.4rem;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-icon-left {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      transition: color 0.15s ease;
    }

    .form-control {
      width: 100%;
      height: 44px;
      padding: 0 12px 0 40px;
      font-size: 0.9375rem;
      font-family: inherit;
      color: #0f172a;
      background-color: #f8fafc;
      border: 1.5px solid var(--border-color);
      border-radius: 8px;
      transition: all 0.2s ease;
      outline: none;
    }

    .form-control::placeholder {
      color: #94a3b8;
      font-size: 0.875rem;
    }

    .input-wrapper.has-toggle .form-control {
      padding-right: 44px;
    }

    .form-control:focus {
      border-color: var(--navy-accent);
      background-color: #ffffff;
      box-shadow: 0 0 0 3.5px var(--navy-accent-glow);
    }

    .form-control:focus ~ .input-icon-left {
      color: var(--navy-accent);
    }

    /* BotÃ£o de alternar visibilidade de senha */
    .toggle-password {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: #64748b;
      padding: 6px 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: color 0.15s ease, background-color 0.15s ease;
    }

    .toggle-password:hover {
      color: var(--navy-dark);
      background-color: #e2e8f0;
    }

    .toggle-password:focus-visible {
      outline: 2px solid var(--navy-accent);
      outline-offset: 1px;
    }

    /* Alertas de status (erro / sucesso) */
    .status-alert {
      display: none;
      font-size: 0.8125rem;
      font-weight: 500;
      line-height: 1.35;
      padding: 0.65rem 0.85rem;
      border-radius: 8px;
      margin-bottom: 1.15rem;
      align-items: center;
      gap: 0.5rem;
    }

    .status-alert.visible {
      display: flex;
      animation: alertSlide 0.2s ease-out;
    }

    @keyframes alertSlide {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .status-alert.alert-error {
      background-color: var(--error-bg);
      color: var(--error-text);
      border: 1px solid var(--error-border);
    }

    .status-alert.alert-success {
      background-color: var(--success-bg);
      color: var(--success-text);
      border: 1px solid var(--success-border);
    }

    .status-alert svg {
      flex-shrink: 0;
    }

    /* BotÃ£o Entrar */
    .btn-submit {
      width: 100%;
      height: 44px;
      background-color: var(--navy-mid);
      color: #ffffff;
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background-color 0.18s ease, transform 0.05s ease, box-shadow 0.18s ease;
      box-shadow: 0 4px 12px rgba(26, 77, 122, 0.28);
    }

    .btn-submit:hover:not(:disabled) {
      background-color: var(--navy-dark);
      box-shadow: 0 6px 14px rgba(13, 43, 69, 0.35);
    }

    .btn-submit:active:not(:disabled) {
      transform: translateY(1px);
    }

    .btn-submit:focus-visible {
      outline: 3px solid var(--navy-accent);
      outline-offset: 2px;
    }

    .btn-submit:disabled {
      opacity: 0.88;
      cursor: wait;
    }

    /* Spinner animado */
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: none;
    }

    .btn-submit.loading .spinner {
      display: inline-block;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* RodapÃ© do card */
    .card-footer {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
      text-align: center;
    }

    .footer-text {
      font-size: 0.75rem;
      color: #64748b;
      line-height: 1.4;
    }

    /* Responsividade para telas muito pequenas */
    @media (max-width: 420px) {
      .login-card {
        width: 92%;
        padding: 1.75rem 1.25rem 1.25rem;
        border-radius: 12px;
      }
      .logo-brand {
        max-width: 160px;
      }
    }
  </style>
</head>
<body>
  <div class="bg-grid-overlay" aria-hidden="true"></div>

  <main class="login-card" role="main">
    <!-- CabeÃ§alho com Logotipo Endisa e SubtÃ­tulo -->
    <header class="card-header">
      <div class="logo-container">
        <!-- Logomarca Endisa vetorial: Engenharia, Setor ElÃ©trico e SupressÃ£o Vegetal -->
        <svg class="logo-brand" viewBox="0 0 240 68" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Endisa Engenharia">
          <!-- Ãcone: Torre de transmissÃ£o estilizada e folha / supressÃ£o vegetal -->
          <g transform="translate(6, 4)">
            <!-- Torre de transmissÃ£o em azul marinho -->
            <path d="M26 4L38 48H14L26 4Z" stroke="#0d2b45" stroke-width="2.5" stroke-linejoin="round" fill="none" opacity="0.95" />
            <path d="M10 20H42M6 34H46" stroke="#0d2b45" stroke-width="2" stroke-linecap="round" />
            <path d="M17 20L35 34M35 20L17 34" stroke="#1a4d7a" stroke-width="1.8" />
            <path d="M12 34L38 48M40 34L14 48" stroke="#1a4d7a" stroke-width="1.8" />
            <!-- Folha vegetal sobreposta em verde e ciano/azul elÃ©trico -->
            <path d="M30 16C38 16 46 22 46 32C46 42 38 48 30 50C33 44 34 38 32 30C30 24 26 19 30 16Z" fill="#2e7dd1" opacity="0.9" />
            <path d="M24 22C30 22 36 28 35 38C32 44 26 48 22 49C24 43 25 36 24 30C23 26 21 24 24 22Z" fill="#1a4d7a" opacity="0.75" />
          </g>
          <!-- Tipografia ENDISA -->
          <text x="66" y="38" font-family="'Segoe UI', Arial, sans-serif" font-size="28" font-weight="900" fill="#0d2b45" letter-spacing="1">ENDISA</text>
          <!-- SubtÃ­tulo institucional -->
          <text x="67" y="52" font-family="'Segoe UI', Arial, sans-serif" font-size="8.5" font-weight="700" fill="#2e7dd1" letter-spacing="2.2">ENGENHARIA E MEIO AMBIENTE</text>
        </svg>
      </div>
      <p class="subtitle">Acesso Restrito</p>
    </header>

    <!-- Banner de Mensagens de Erro / Sucesso -->
    <div id="statusAlert" class="status-alert" role="alert" aria-live="polite">
      <!-- Ãcone injetado dinamicamente via JS -->
      <span id="alertIcon"></span>
      <span id="alertText"></span>
    </div>

    <!-- FormulÃ¡rio de AutenticaÃ§Ã£o -->
    <form id="loginForm" novalidate>
      <!-- Campo UsuÃ¡rio -->
      <div class="form-group">
        <label for="usernameInput" class="form-label">UsuÃ¡rio</label>
        <div class="input-wrapper">
          <!-- Ãcone inline SVG de usuÃ¡rio -->
          <span class="input-icon-left" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </span>
          <input 
            type="text" 
            id="usernameInput" 
            name="username" 
            class="form-control" 
            placeholder="Digite seu usuÃ¡rio ou e-mail" 
            autocomplete="username" 
            required
          >
        </div>
      </div>

      <!-- Campo Senha -->
      <div class="form-group">
        <label for="passwordInput" class="form-label">Senha</label>
        <div class="input-wrapper has-toggle">
          <!-- Ãcone inline SVG de cadeado -->
          <span class="input-icon-left" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </span>
          <input 
            type="password" 
            id="passwordInput" 
            name="password" 
            class="form-control" 
            placeholder="Digite sua senha" 
            autocomplete="current-password" 
            required
          >
          <!-- BotÃ£o mostrar/ocultar senha -->
          <button 
            type="button" 
            id="togglePasswordBtn" 
            class="toggle-password" 
            aria-label="Mostrar senha" 
            title="Mostrar ou ocultar senha"
          >
            <!-- Ãcone Olho Normal -->
            <svg id="eyeIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <!-- Ãcone Olho Fechado (oculto por padrÃ£o) -->
            <svg id="eyeOffIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- BotÃ£o de AÃ§Ã£o -->
      <button type="submit" id="submitBtn" class="btn-submit">
        <span class="spinner" aria-hidden="true"></span>
        <span id="submitBtnText">Entrar</span>
      </button>
    </form>

    <!-- RodapÃ© informativo do Dashboard -->
    <footer class="card-footer">
      <p class="footer-text">Dashboard de ProduÃ§Ã£o â€” km de supressÃ£o vegetal</p>
    </footer>
  </main>

  <script>
    /**
     * Script de preview de autenticaÃ§Ã£o do Dashboard Endisa
     * Implementa comportamento interativo 100% no cliente sem requisiÃ§Ãµes de rede.
     */
    document.addEventListener('DOMContentLoaded', () => {
      const loginForm = document.getElementById('loginForm');
      const usernameInput = document.getElementById('usernameInput');
      const passwordInput = document.getElementById('passwordInput');
      const submitBtn = document.getElementById('submitBtn');
      const submitBtnText = document.getElementById('submitBtnText');
      const togglePasswordBtn = document.getElementById('togglePasswordBtn');
      const eyeIcon = document.getElementById('eyeIcon');
      const eyeOffIcon = document.getElementById('eyeOffIcon');
      const statusAlert = document.getElementById('statusAlert');
      const alertIcon = document.getElementById('alertIcon');
      const alertText = document.getElementById('alertText');

      // SVG do Ã­cone de aviso/erro
      const errorSvg = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      `;

      // SVG do Ã­cone de sucesso
      const successSvg = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      `;

      /**
       * Exibe mensagem de feedback visual (erro ou sucesso)
       * @param {'error' | 'success'} type Tipo do alerta
       * @param {string} message Texto da mensagem
       */
      function showAlert(type, message) {
        statusAlert.className = 'status-alert visible';
        if (type === 'error') {
          statusAlert.classList.add('alert-error');
          alertIcon.innerHTML = errorSvg;
        } else {
          statusAlert.classList.add('alert-success');
          alertIcon.innerHTML = successSvg;
        }
        alertText.textContent = message;
      }

      /**
       * Oculta o banner de alerta
       */
      function hideAlert() {
        statusAlert.className = 'status-alert';
        alertText.textContent = '';
        alertIcon.innerHTML = '';
      }

      // Alternar visualizaÃ§Ã£o da senha
      togglePasswordBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        
        // Alterna os Ã­cones do olho
        eyeIcon.style.display = isPassword ? 'none' : 'block';
        eyeOffIcon.style.display = isPassword ? 'block' : 'none';
        
        // Atualiza acessibilidade
        togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
      });

      // Limpar erro ao digitar nos campos
      [usernameInput, passwordInput].forEach(input => {
        input.addEventListener('input', () => {
          if (statusAlert.classList.contains('alert-error')) {
            hideAlert();
          }
        });
      });

      // Processamento do envio do formulÃ¡rio
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const userVal = usernameInput.value.trim();
        const passVal = passwordInput.value.trim();

        // 1. ValidaÃ§Ã£o: campos vazios
        if (!userVal || !passVal) {
          showAlert('error', 'Informe usuÃ¡rio e senha.');
          if (!userVal) {
            usernameInput.focus();
          } else {
            passwordInput.focus();
          }
          return;
        }

        // 2. Estado de carregamento simulado (1,2 segundos)
        hideAlert();
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        submitBtnText.textContent = 'Entrando...';

        setTimeout(() => {
          // Restaura o botÃ£o ao estado padrÃ£o
          submitBtn.disabled = false;
          submitBtn.classList.remove('loading');
          submitBtnText.textContent = 'Entrar';

          // Exibe feedback de sucesso (preview de design)
          showAlert('success', 'Login vÃ¡lido! (preview de design â€” sem conexÃ£o real)');
        }, 1200);
      });
    });
  </script>
<script>
/* Skip artifact shell â€” fixed helpers served beside every artifact. */
(function () {
  "use strict";

  var fmt = {
    num: function (v, opts) { return new Intl.NumberFormat("pt-BR", opts || {}).format(v); },
    brl: function (v) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v); },
    pct: function (v) { return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(v); }
  };

  // axisFmt keeps axis tick labels short (compact notation) so long values
  // (e.g. full BRL amounts) never clip against the plot edge.
  function axisFmt(v) {
    return fmt.num(v, { notation: "compact", maximumFractionDigits: 1 });
  }

  // format accepts a function OR one of the fmt names ("num" | "brl" | "pct").
  function coerceFormat(spec) {
    if (typeof spec === "function") return spec;
    if (typeof spec === "string" && fmt[spec]) return fmt[spec];
    return function (v) { return fmt.num(v); };
  }

  function accent() {
    return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2563eb";
  }
  function mutedColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#5b6472";
  }
  function svgEl(tag, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function frame(el, w, h) {
    var svg = svgEl("svg", { viewBox: "0 0 " + w + " " + h, role: "img" });
    el.innerHTML = "";
    el.appendChild(svg);
    return svg;
  }

  // maxOf guards the axis scale: empty values would give -Infinity (truthy,
  // so "|| 1" can't catch it) and a non-positive max would flip the chart.
  function maxOf(values) {
    var m = values.length ? Math.max.apply(null, values) : 0;
    return m > 0 ? m : 1;
  }

  // bar(el, {labels:[], values:[], color?, format?}) â€” vertical bar chart.
  function bar(el, cfg) {
    var W = 640, H = 280, padL = 46, padB = 30, padT = 12;
    var svg = frame(el, W, H);
    var max = maxOf(cfg.values);
    var n = cfg.values.length;
    var plotW = W - padL - 12, plotH = H - padT - padB;
    var step = plotW / n, bw = Math.min(step * 0.62, 64);
    var color = cfg.color || accent();
    var f = coerceFormat(cfg.format);
    for (var g = 0; g <= 4; g++) {
      var gy = padT + plotH - (plotH * g) / 4;
      svg.appendChild(svgEl("line", { x1: padL, y1: gy, x2: W - 12, y2: gy, stroke: "currentColor", "stroke-opacity": 0.08 }));
      var lbl = svgEl("text", { x: padL - 8, y: gy + 4, "text-anchor": "end", "font-size": 10, fill: mutedColor() });
      lbl.textContent = axisFmt((max * g) / 4);
      svg.appendChild(lbl);
    }
    cfg.values.forEach(function (v, i) {
      var bh = Math.max(0, (v / max) * plotH);
      var x = padL + i * step + (step - bw) / 2;
      var y = padT + plotH - bh;
      var r = svgEl("rect", { x: x, y: y, width: bw, height: bh, rx: 4, fill: color });
      var t = svgEl("title", {});
      t.textContent = cfg.labels[i] + ": " + f(v);
      r.appendChild(t);
      svg.appendChild(r);
      var tx = svgEl("text", { x: x + bw / 2, y: H - 10, "text-anchor": "middle", "font-size": 11, fill: mutedColor() });
      tx.textContent = cfg.labels[i];
      svg.appendChild(tx);
    });
  }

  // line(el, {labels:[], values:[], color?, format?}) â€” single-series line.
  function line(el, cfg) {
    var W = 640, H = 280, padL = 46, padB = 30, padT = 12;
    var svg = frame(el, W, H);
    var max = maxOf(cfg.values);
    var n = cfg.values.length;
    var plotW = W - padL - 16, plotH = H - padT - padB;
    var color = cfg.color || accent();
    var f = coerceFormat(cfg.format);
    for (var g = 0; g <= 4; g++) {
      var gy = padT + plotH - (plotH * g) / 4;
      svg.appendChild(svgEl("line", { x1: padL, y1: gy, x2: W - 16, y2: gy, stroke: "currentColor", "stroke-opacity": 0.08 }));
      var lbl = svgEl("text", { x: padL - 8, y: gy + 4, "text-anchor": "end", "font-size": 10, fill: mutedColor() });
      lbl.textContent = axisFmt((max * g) / 4);
      svg.appendChild(lbl);
    }
    var pts = cfg.values.map(function (v, i) {
      var x = padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
      var y = padT + plotH - (v / max) * plotH;
      return [x, y];
    });
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    svg.appendChild(svgEl("path", { d: d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round" }));
    pts.forEach(function (p, i) {
      var c = svgEl("circle", { cx: p[0], cy: p[1], r: 3.5, fill: color });
      var t = svgEl("title", {});
      t.textContent = cfg.labels[i] + ": " + f(cfg.values[i]);
      c.appendChild(t);
      svg.appendChild(c);
      var tx = svgEl("text", { x: p[0], y: H - 10, "text-anchor": "middle", "font-size": 11, fill: mutedColor() });
      tx.textContent = cfg.labels[i];
      svg.appendChild(tx);
    });
  }

  // donut(el, {labels:[], values:[], colors?}) â€” donut with center total.
  function donut(el, cfg) {
    var W = 320, H = 280, cx = W / 2, cy = H / 2, R = 92, r = 58;
    var svg = frame(el, W, H);
    var total = cfg.values.reduce(function (a, b) { return a + b; }, 0) || 1;
    var palette = cfg.colors || [accent(), "#1baf7a", "#eda100", "#e34948", "#4a3aa7", "#e87ba4"];
    var a0 = -Math.PI / 2;
    cfg.values.forEach(function (v, i) {
      var a1 = a0 + (v / total) * Math.PI * 2;
      var large = a1 - a0 > Math.PI ? 1 : 0;
      var p = ["M", cx + R * Math.cos(a0), cy + R * Math.sin(a0),
        "A", R, R, 0, large, 1, cx + R * Math.cos(a1), cy + R * Math.sin(a1),
        "L", cx + r * Math.cos(a1), cy + r * Math.sin(a1),
        "A", r, r, 0, large, 0, cx + r * Math.cos(a0), cy + r * Math.sin(a0), "Z"].join(" ");
      var path = svgEl("path", { d: p, fill: palette[i % palette.length] });
      var t = svgEl("title", {});
      t.textContent = cfg.labels[i] + ": " + fmt.num(v) + " (" + fmt.pct(v / total) + ")";
      path.appendChild(t);
      svg.appendChild(path);
      a0 = a1;
    });
    var center = svgEl("text", { x: cx, y: cy + 5, "text-anchor": "middle", "font-size": 20, "font-weight": 650, fill: "currentColor" });
    center.textContent = fmt.num(total);
    svg.appendChild(center);
  }

  window.skipShell = { fmt: fmt };
  window.skipChart = { bar: bar, line: line, donut: donut };
})();

</script>
</body>
</html>

===== G:\Meu Drive\DINENG\dashboard\admin.html =====

<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UsuÃ¡rios â€” Dashboard Endisa</title>
  <link rel="stylesheet" href="css/fonts.css">
  <link rel="stylesheet" href="css/admin.css">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>

  <header class="admin-topo">
    <div class="admin-marca">ENDISA <span>| GestÃ£o de UsuÃ¡rios</span></div>
    <div class="admin-user">
      <span id="admin-nome"></span>
      <button id="btn-sair" class="btn-sair">Sair</button>
    </div>
  </header>

  <main class="admin-corpo">

    <!-- FormulÃ¡rio: adicionar / editar -->
    <section class="admin-card">
      <h2 id="titulo-form">Adicionar usuÃ¡rio</h2>

      <form id="form-usuario">
        <input type="hidden" id="modo" value="adicionar">

        <label>UsuÃ¡rio
          <input type="text" id="f-usuario" required>
        </label>

        <label>Senha <small id="dica-senha"></small>
          <input type="password" id="f-senha">
        </label>

        <label>Polo
          <input type="text" id="f-polo" placeholder="Ex.: ParaÃ­so ou todos">
        </label>

        <label>NÃ­vel
          <select id="f-nivel">
            <option value="adm">adm</option>
            <option value="energisa">energisa</option>
            <option value="cliente">cliente</option>
          </select>
        </label>

        <label>Ativo
          <select id="f-ativo">
            <option value="SIM">SIM</option>
            <option value="NAO">NÃƒO</option>
          </select>
        </label>

        <p id="admin-msg" class="oculto"></p>

        <div class="admin-botoes">
          <button type="submit" id="btn-salvar">Salvar</button>
          <button type="button" id="btn-cancelar" class="oculto">Cancelar</button>
        </div>
      </form>
    </section>

    <!-- Tabela de usuÃ¡rios -->
    <section class="admin-card">
      <h2>UsuÃ¡rios cadastrados</h2>
      <table class="tabela-usuarios">
        <thead>
          <tr><th>UsuÃ¡rio</th><th>Polo</th><th>NÃ­vel</th><th>Ativo</th><th>Senha</th><th></th></tr>
        </thead>
        <tbody id="corpo-tabela">
          <tr><td colspan="6">Carregando...</td></tr>
        </tbody>
      </table>
    </section>

  </main>

 <script src="js/loginapi.js"></script>
 <script src="js/sidebar.js"></script> 
  <script src="js/auth.js"></script>
  <script src="js/admin.js"></script>
</body>
</html>

===== G:\Meu Drive\DINENG\dashboard\definir-senha.html =====

<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Definir Senha â€” Dashboard Endisa</title>
  <style>
    /* ===== DEFINIR SENHA â€” DASHBOARD ENDISA ===== */

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0d2b45 0%, #1a4d7a 100%);
      padding: 16px;
    }

    .card {
      background: #ffffff;
      width: 100%;
      max-width: 400px;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      padding: 40px 32px;
    }

    /* --- Marca --- */
    .brand {
      text-align: center;
      margin-bottom: 28px;
    }

    .brand h1 {
      color: #0d2b45;
      font-size: 1.8rem;
      letter-spacing: 3px;
      font-weight: 800;
    }

    .brand p {
      color: #6b7280;
      font-size: 0.9rem;
      margin-top: 6px;
    }

    /* --- Campos --- */
    .campo {
      margin-bottom: 18px;
    }

    .campo label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: #0d2b45;
      margin-bottom: 6px;
    }

    .campo input {
      width: 100%;
      padding: 12px 14px;
      border: 1.5px solid #d1d5db;
      border-radius: 10px;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .campo input:focus {
      border-color: #1a4d7a;
      box-shadow: 0 0 0 3px rgba(26, 77, 122, 0.15);
    }

    /* --- Mensagens --- */
    .msg {
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.88rem;
      margin-bottom: 16px;
    }

    .msg-erro {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fca5a5;
    }

    .msg-sucesso {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #86efac;
    }

    /* --- BotÃ£o --- */
    .btn-salvar {
      width: 100%;
      padding: 13px;
      border: none;
      border-radius: 10px;
      background: linear-gradient(135deg, #0d2b45, #1a4d7a);
      color: #ffffff;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
    }

    .btn-salvar:hover:not(:disabled) {
      opacity: 0.9;
    }

    .btn-salvar:active:not(:disabled) {
      transform: scale(0.98);
    }

    .btn-salvar:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* --- RodapÃ© --- */
    .rodape {
      text-align: center;
      margin-top: 22px;
      font-size: 0.88rem;
    }

    .rodape a {
      color: #1a4d7a;
      text-decoration: none;
      font-weight: 600;
    }

    .rodape a:hover {
      text-decoration: underline;
    }

    /* --- Mobile --- */
    @media (max-width: 420px) {
      .card { padding: 32px 22px; }
      .brand h1 { font-size: 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <h1>ENDISA</h1>
      <p>Definir senha de acesso</p>
    </div>

    <form id="form-definir-senha">
      <div class="campo">
        <label for="campo-usuario">UsuÃ¡rio</label>
        <input type="text" id="campo-usuario" required autocomplete="username">
      </div>

      <div class="campo">
        <label for="campo-senha">Nova senha</label>
        <input type="password" id="campo-senha" required minlength="4" autocomplete="new-password">
      </div>

      <div class="campo">
        <label for="campo-senha2">Confirmar senha</label>
        <input type="password" id="campo-senha2" required autocomplete="new-password">
      </div>

      <div id="msg-erro" class="msg msg-erro" hidden></div>
      <div id="msg-sucesso" class="msg msg-sucesso" hidden></div>

      <button type="submit" id="btn-salvar" class="btn-salvar">Salvar senha</button>
    </form>

    <p class="rodape"><a href="index.html">â† Voltar ao login</a></p>
  </div>

  <!-- Reaproveita a camada de autenticaÃ§Ã£o que jÃ¡ existe -->
  <script src="js/loginapi.js"></script>
  <script src="js/definir-senha.js"></script>
</body>
</html>
