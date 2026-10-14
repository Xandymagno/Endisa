/**
 * Acompanha a meta de duas APRs por encarregado em cada dia útil.
 */
(function () {
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const META_DIARIA = 2;
  const FORMATO_INTEIRO = new Intl.NumberFormat("pt-BR");
  const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR");
  const ESTADOS = {
    REALIZADO: "✅ Meta realizada",
    PARCIAL: "🟠 Parcial",
    FALTANDO: "❌ Faltando",
    JUSTIFICADO: "🟡 Justificado"
  };

  let dados = null;
  let dadosEmCache = null;
  let cacheAtualizadoEm = 0;
  let grafico = null;
  let detalheAtual = "";

  function normalizar(valor) {
    return String(valor === null || valor === undefined ? "" : valor)
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }

  function normalizarId(valor) {
    const texto = String(valor === null || valor === undefined ? "" : valor).trim();
    return /^\d+$/.test(texto) ? texto.replace(/^0+(?=\d)/, "") : normalizar(texto);
  }

  function chaveCampo(chave) {
    return normalizar(chave);
  }

  function valorCampo(registro, aliases) {
    const chaves = Object.keys(registro || {});
    for (let i = 0; i < aliases.length; i++) {
      const chave = chaves.find(function (nome) { return chaveCampo(nome) === normalizar(aliases[i]); });
      if (chave !== undefined && String(registro[chave] || "").trim() !== "") return registro[chave];
    }
    for (let i = 0; i < aliases.length; i++) {
      const esperado = normalizar(aliases[i]);
      const chave = chaves.find(function (nome) {
        return chaveCampo(nome).includes(esperado) && String(registro[nome] || "").trim() !== "";
      });
      if (chave !== undefined) return registro[chave];
    }
    return "";
  }

  function criarData(ano, mes, dia) {
    const data = new Date(ano, mes - 1, dia);
    if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return "";
    return [ano, String(mes).padStart(2, "0"), String(dia).padStart(2, "0")].join("-");
  }

  function dataISO(valor) {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
      return criarData(valor.getFullYear(), valor.getMonth() + 1, valor.getDate());
    }
    const texto = String(valor === null || valor === undefined ? "" : valor).trim();
    let partes = texto.match(/(?:^|\D)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/);
    if (partes) return criarData(Number(partes[1]), Number(partes[2]), Number(partes[3]));
    partes = texto.match(/(?:^|\D)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\D|$)/);
    if (partes) return criarData(Number(partes[3]), Number(partes[2]), Number(partes[1]));
    return "";
  }

  function dataDeISO(iso) {
    const partes = iso.split("-").map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2]);
  }

  function formatarData(iso) {
    if (!iso) return "—";
    return FORMATO_DATA.format(dataDeISO(iso));
  }

  function formatarISO(data) {
    return [data.getFullYear(), String(data.getMonth() + 1).padStart(2, "0"),
      String(data.getDate()).padStart(2, "0")].join("-");
  }

  function somarDias(iso, quantidade) {
    const data = dataDeISO(iso);
    data.setDate(data.getDate() + quantidade);
    return formatarISO(data);
  }

  function ehDiaUtil(iso) {
    const dia = dataDeISO(iso).getDay();
    return dia >= 1 && dia <= 5;
  }

  function datasEntre(inicio, fim) {
    const datas = [];
    if (!inicio || !fim || inicio > fim) return datas;
    for (let dia = inicio; dia <= fim; dia = somarDias(dia, 1)) datas.push(dia);
    return datas;
  }

  function matricula(registro) {
    return normalizarId(valorCampo(registro, [
      "MATRICULA CODIGO", "MATRICULA/CODIGO", "MATRICULA", "CODIGO", "COD",
      "ID ENCARREGADO", "CODIGO ENCARREGADO", "RESPONSAVEL PELA ATIVIDADE"
    ]));
  }

  function nome(registro) {
    return String(valorCampo(registro, [
      "NOME COMPLETO", "NOME", "COLABORADOR", "FUNCIONARIO", "RESPONSAVEL", "ENCARREGADO"
    ]) || "").trim();
  }

  function dataInicioContrato(registro) {
    return dataISO(valorCampo(registro, [
      "DATA INICIO CONTRATO", "DATA DE INICIO CONTRATO", "DATA DE ADIMICAO",
      "DATA DE ADMISSAO", "DATA ADMISSAO", "INICIO CONTRATO", "DATA INICIO", "INICIO"
    ]));
  }

  function dataFimContrato(registro) {
    return dataISO(valorCampo(registro, [
      "DATA FIM CONTRATO", "DATA DE FIM CONTRATO", "FIM CONTRATO",
      "DATA ENCERRAMENTO CONTRATO", "DATA DEMISSAO", "DATA FIM", "FIM"
    ]));
  }

  function funcionariosEncarregados(registros) {
    return registros.filter(function (registro) {
      const cargo = normalizar(valorCampo(registro, ["FUNCAO", "CARGO", "FUNCAO/CARGO"]));
      return cargo.includes("ENCARREGADO");
    }).map(function (registro) {
      return {
        id: matricula(registro),
        nome: nome(registro),
        inicioContrato: dataInicioContrato(registro),
        fimContrato: dataFimContrato(registro)
      };
    }).filter(function (registro) { return registro.id && registro.nome; });
  }

  function dataAPR(registro) {
    const aliases = [
      "DATA APR", "DATA DA APR", "DATA DE REALIZACAO", "DATA REALIZACAO",
      "DATA E HORA", "DATA/HORA", "CARIMBO DE DATA/HORA", "TIMESTAMP", "DATA"
    ];
    return dataISO(valorCampo(registro, aliases));
  }

  function indiceEncarregado(registros) {
    const porId = new Map();
    const porNome = new Map();
    registros.forEach(function (funcionario) {
      porId.set(funcionario.id, funcionario);
      porNome.set(normalizar(funcionario.nome), funcionario);
    });
    return { porId: porId, porNome: porNome };
  }

  function funcionarioDoRegistro(registro, indice) {
    const idDireto = matricula(registro);
    if (idDireto && indice.porId.has(idDireto)) return indice.porId.get(idDireto);
    const referencia = String(valorCampo(registro, [
      "ENCARREGADO", "NOME ENCARREGADO", "COLABORADOR", "NOME", "RESPONSAVEL"
    ]) || "").trim();
    const idReferencia = normalizarId(referencia);
    if (indice.porId.has(idReferencia)) return indice.porId.get(idReferencia);
    return indice.porNome.get(normalizar(referencia)) || null;
  }

  function mapaAPRs(registros, indice) {
    const mapa = new Map();
    let associadas = 0;
    registros.forEach(function (registro) {
      const dia = dataAPR(registro);
      const funcionario = funcionarioDoRegistro(registro, indice);
      if (!dia || !funcionario) return;
      associadas++;
      if (!mapa.has(funcionario.id)) mapa.set(funcionario.id, new Map());
      const diasFuncionario = mapa.get(funcionario.id);
      diasFuncionario.set(dia, (diasFuncionario.get(dia) || 0) + 1);
    });
    return { porFuncionario: mapa, associadas: associadas };
  }

  function mapaAusencias(registros) {
    const mapa = new Map();
    registros.forEach(function (registro) {
      const aplicacao = normalizar(valorCampo(registro, ["APLICACAO", "APLICA EM", "TIPO DE DISPENSA"]) || "CHECKLIST");
      if (aplicacao !== "APR" && aplicacao !== "AMBOS") return;
      const id = normalizarId(valorCampo(registro, [
        "MATRICULA CODIGO", "MATRICULA/CODIGO", "MATRICULA", "CODIGO",
        "ENCARREGADO", "ID ENCARREGADO", "CODIGO ENCARREGADO"
      ]));
      if (!id) return;
      const inicioDatas = datasExtraidas(valorCampo(registro, [
        "DATA INICIO", "DATA INICIAL", "PER INICIO", "INICIO", "DATA", "PERIODO AUSENCIA"
      ]));
      const fimDatas = datasExtraidas(valorCampo(registro, ["DATA FIM", "DATA FINAL", "PER FIM", "FIM", "ATE"]));
      let inicio = inicioDatas[0] || "";
      let fim = fimDatas[fimDatas.length - 1] || inicioDatas[inicioDatas.length - 1] || inicio;
      if (!inicio) return;
      if (inicio > fim) [inicio, fim] = [fim, inicio];
      const motivo = String(valorCampo(registro, ["MOTIVO", "JUSTIFICATIVA", "DESCRICAO", "OBSERVACAO"]) || "")
        .trim() || "Ausência justificada";
      const quantidadeRaw = Number(valorCampo(registro, [
        "QUANTIDADE APR", "APRS JUSTIFICADAS", "QTD APR", "QUANTIDADE DE APR"
      ]));
      const quantidade = quantidadeRaw === 1 ? 1 : META_DIARIA;
      datasEntre(inicio, fim).forEach(function (dia) {
        if (!mapa.has(id)) mapa.set(id, new Map());
        if (!mapa.get(id).has(dia)) {
          mapa.get(id).set(dia, { motivo: motivo, quantidade: quantidade });
        }
      });
    });
    return mapa;
  }

  function datasExtraidas(valor) {
    const texto = String(valor === null || valor === undefined ? "" : valor).trim();
    if (!texto) return [];
    const achados = texto.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/g) || [];
    const datas = achados.map(dataISO).filter(Boolean);
    if (datas.length) return Array.from(new Set(datas)).sort();
    const unica = dataISO(texto);
    return unica ? [unica] : [];
  }

  function calcularEncarregado(funcionario, inicioPeriodo, fimPeriodo, aprs, ausencias) {
    const inicioContrato = funcionario.inicioContrato || inicioPeriodo;
    const fimContrato = funcionario.fimContrato || fimPeriodo;
    const inicio = inicioContrato > inicioPeriodo ? inicioContrato : inicioPeriodo;
    const fim = fimContrato < fimPeriodo ? fimContrato : fimPeriodo;
    const aprsDiarias = aprs.get(funcionario.id) || new Map();
    const justificativas = new Map(ausencias.get("TODOS") || []);
    (ausencias.get(funcionario.id) || new Map()).forEach(function (justificativa, dia) {
      justificativas.set(dia, justificativa);
    });
    const diarias = [];
    let previsto = 0;
    let realizados = 0;
    let justificados = 0;

    if (inicio <= fim) {
      datasEntre(inicio, fim).filter(ehDiaUtil).forEach(function (dia) {
        const quantidade = aprsDiarias.get(dia) || 0;
        const realizadoNoDia = Math.min(quantidade, META_DIARIA);
        const justificativa = justificativas.get(dia);
        const motivo = justificativa ? justificativa.motivo : "";
        const quantidadeJustificada = justificativa
          ? Math.min(justificativa.quantidade, META_DIARIA - realizadoNoDia)
          : 0;
        const previstoNoDia = META_DIARIA - quantidadeJustificada;
        let status;
        previsto += previstoNoDia;
        realizados += realizadoNoDia;
        justificados += quantidadeJustificada;
        if (quantidadeJustificada) {
          status = ESTADOS.JUSTIFICADO;
        } else if (realizadoNoDia === META_DIARIA) {
          status = ESTADOS.REALIZADO;
        } else {
          status = realizadoNoDia ? ESTADOS.PARCIAL : ESTADOS.FALTANDO;
        }
        diarias.push({
          data: dia,
          quantidade: quantidade,
          realizado: realizadoNoDia,
          prevista: previstoNoDia,
          justificada: quantidadeJustificada,
          status: status,
          motivo: motivo
        });
      });
    }

    const faltando = Math.max(0, previsto - realizados);
    return {
      id: funcionario.id,
      nome: funcionario.nome,
      inicioContrato: funcionario.inicioContrato,
      fimContrato: funcionario.fimContrato,
      previsto: previsto,
      realizados: realizados,
      faltando: faltando,
      justificados: justificados,
      conformidade: previsto > 0 ? Math.min(100, realizados / previsto * 100) : 100,
      diarias: diarias
    };
  }

  function obterResumo(inicio, fim, busca) {
    const listaEncarregados = funcionariosEncarregados(dados.encarregados);
    if (!listaEncarregados.length) {
      throw new Error("Não foi possível identificar encarregados na aba BANCO COLABORADOR.");
    }
    const indice = indiceEncarregado(listaEncarregados);
    const mapeamento = mapaAPRs(dados.aprs, indice);
    dados.aprsAssociadas = mapeamento.associadas;
    dados.aprsNaoAssociadas = dados.aprs.length - mapeamento.associadas;
    if (dados.aprs.length && listaEncarregados.length && !mapeamento.associadas) {
      throw new Error("Não foi possível identificar data e encarregado nos registros da aba APR. Confira os cabeçalhos de data, matrícula ou nome.");
    }
    const aprs = mapeamento.porFuncionario;
    const ausencias = mapaAusencias(dados.justAusencia);
    const buscaNormalizada = normalizar(busca);
    return listaEncarregados.map(function (funcionario) {
      return calcularEncarregado(funcionario, inicio, fim, aprs, ausencias);
    }).filter(function (registro) {
      return !buscaNormalizada ||
        normalizar(registro.nome).includes(buscaNormalizada) ||
        normalizar(registro.id).includes(buscaNormalizada);
    }).sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
  }

  async function carregarDados(forcar) {
    if (!forcar && dadosEmCache && Date.now() - cacheAtualizadoEm < CACHE_TTL_MS) return dadosEmCache;
    const resultados = await Promise.all([
      API.buscarDadosAPR(),
      API.buscarDadosChecklist("encarregados"),
      API.buscarDadosChecklist("justAusencia")
    ]);
    dadosEmCache = {
      aprs: resultados[0].registros,
      encarregados: resultados[1],
      justAusencia: resultados[2]
    };
    cacheAtualizadoEm = Date.now();
    return dadosEmCache;
  }

  function definirPeriodoInicial() {
    const agora = new Date();
    document.getElementById("filtro-inicio").value =
      formatarISO(new Date(agora.getFullYear(), agora.getMonth(), 1));
    document.getElementById("filtro-fim").value =
      formatarISO(new Date(agora.getFullYear(), agora.getMonth() + 1, 0));
  }

  function exibirMensagem(texto, erro) {
    const mensagem = document.getElementById("apr-mensagem");
    mensagem.textContent = texto;
    mensagem.classList.toggle("visivel", Boolean(texto));
    mensagem.classList.toggle("erro", Boolean(erro));
  }

  function atualizarKpis(registros) {
    const totais = registros.reduce(function (acumulado, registro) {
      acumulado.previsto += registro.previsto;
      acumulado.realizados += registro.realizados;
      acumulado.faltando += registro.faltando;
      acumulado.justificados += registro.justificados;
      return acumulado;
    }, { previsto: 0, realizados: 0, faltando: 0, justificados: 0 });
    document.getElementById("kpi-apr-previstas").textContent = FORMATO_INTEIRO.format(totais.previsto);
    document.getElementById("kpi-apr-realizadas").textContent = FORMATO_INTEIRO.format(totais.realizados);
    document.getElementById("kpi-apr-faltando").textContent = FORMATO_INTEIRO.format(totais.faltando);
    document.getElementById("kpi-apr-justificadas").textContent = FORMATO_INTEIRO.format(totais.justificados);
  }

  function atualizarGrafico(registros, inicio, fim) {
    const porDia = new Map();
    registros.forEach(function (registro) {
      registro.diarias.forEach(function (dia) {
        if (!porDia.has(dia.data)) porDia.set(dia.data, { previsto: 0, realizados: 0, justificados: 0, motivos: new Set() });
        const total = porDia.get(dia.data);
        total.previsto += dia.prevista;
        total.realizados += dia.realizado;
        total.justificados += dia.justificada;
        if (dia.justificada && dia.motivo) total.motivos.add(dia.motivo);
      });
    });
    const datas = datasEntre(inicio, fim).filter(ehDiaUtil);
    const valores = datas.map(function (dia) {
      return porDia.get(dia) || { previsto: 0, realizados: 0, justificados: 0, motivos: new Set() };
    });
    if (grafico) grafico.destroy();
    const canvas = document.getElementById("grafico-apr");
    if (typeof Chart === "undefined") {
      canvas.hidden = true;
      return;
    }
    canvas.hidden = false;
    grafico = new Chart(canvas, {
      type: "bar",
      data: {
        labels: datas.map(formatarData),
        datasets: [
          {
            type: "bar",
            label: "Realizadas",
            data: valores.map(function (valor) { return valor.realizados; }),
            backgroundColor: "#2563eb",
            stack: "realizadas-justificadas"
          },
          {
            type: "bar",
            label: "Justificadas",
            data: valores.map(function (valor) { return valor.justificados; }),
            backgroundColor: "#fbbf24",
            stack: "realizadas-justificadas"
          },
          {
            type: "line",
            label: "Previstas",
            data: valores.map(function (valor) { return valor.previsto; }),
            borderColor: "#6366f1",
            backgroundColor: "#6366f1",
            pointBackgroundColor: "#6366f1",
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.25,
            stack: "previstas"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterBody: function (itens) {
                if (!itens.length) return [];
                const motivos = Array.from(valores[itens[0].dataIndex].motivos);
                return motivos.length ? ["Justificativa(s): " + motivos.join("; ")] : [];
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { autoSkip: true, maxTicksLimit: 20, maxRotation: 0 }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { precision: 0 },
            title: { display: true, text: "Quantidade de APRs" }
          }
        }
      }
    });
  }

  function adicionarCelula(linha, texto) {
    const celula = linha.insertCell();
    celula.textContent = texto;
    return celula;
  }

  function montarDetalhe(registro) {
    const linha = document.createElement("tr");
    linha.className = "checklist-detalhe";
    const celula = linha.insertCell();
    celula.colSpan = 8;
    const secao = document.createElement("section");
    secao.className = "checklist-detalhe-bloco";
    const titulo = document.createElement("h3");
    titulo.textContent = "APRs por dia (meta: 2)";
    secao.appendChild(titulo);
    const tabela = document.createElement("table");
    tabela.className = "checklist-detalhe-lista";
    const cabecalho = tabela.createTHead().insertRow();
    ["Data", "Status", "APR(s) realizadas", "APR(s) justificadas", "Motivo"].forEach(function (texto) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = texto;
      cabecalho.appendChild(th);
    });
    const corpo = tabela.createTBody();
    registro.diarias.forEach(function (dia) {
      const linhaDia = corpo.insertRow();
      adicionarCelula(linhaDia, formatarData(dia.data));
      adicionarCelula(linhaDia, dia.status);
      adicionarCelula(linhaDia, FORMATO_INTEIRO.format(dia.quantidade) + " / " + META_DIARIA);
      adicionarCelula(linhaDia, FORMATO_INTEIRO.format(dia.justificada));
      adicionarCelula(linhaDia, dia.justificada ? (dia.motivo || "Ausência justificada") : "—");
    });
    if (!registro.diarias.length) {
      const linhaVazia = corpo.insertRow();
      const celulaVazia = linhaVazia.insertCell();
      celulaVazia.colSpan = 5;
      celulaVazia.textContent = "Sem dias úteis previstos no período.";
    }
    secao.appendChild(tabela);
    celula.appendChild(secao);
    return linha;
  }

  function alternarDetalhe(chave, linhaResumo, registro) {
    if (linhaResumo.nextElementSibling && linhaResumo.nextElementSibling.classList.contains("checklist-detalhe")) {
      linhaResumo.nextElementSibling.remove();
      linhaResumo.setAttribute("aria-expanded", "false");
      detalheAtual = "";
      return;
    }
    if (detalheAtual) {
      const anterior = document.querySelector('[data-detalhe-id="' + CSS.escape(detalheAtual) + '"]');
      if (anterior && anterior.nextElementSibling) anterior.nextElementSibling.remove();
      if (anterior) anterior.setAttribute("aria-expanded", "false");
    }
    const detalhe = montarDetalhe(registro);
    detalhe.dataset.detalheId = chave;
    linhaResumo.after(detalhe);
    linhaResumo.setAttribute("aria-expanded", "true");
    detalheAtual = chave;
  }

  function renderizarTabela(registros) {
    const corpo = document.getElementById("corpo-apr");
    corpo.replaceChildren();
    if (!registros.length) {
      const linha = corpo.insertRow();
      const celula = linha.insertCell();
      celula.colSpan = 8;
      celula.textContent = "Nenhum encarregado encontrado para os filtros selecionados.";
      return;
    }
    registros.forEach(function (registro) {
      const linha = corpo.insertRow();
      linha.className = "checklist-linha-resumo";
      linha.tabIndex = 0;
      linha.setAttribute("role", "button");
      linha.setAttribute("aria-expanded", "false");
      linha.setAttribute("aria-label", "Exibir APRs por dia de " + registro.nome);
      adicionarCelula(linha, registro.nome);
      adicionarCelula(linha, registro.id);
      adicionarCelula(linha, formatarData(registro.inicioContrato) + " a " + formatarData(registro.fimContrato));
      adicionarCelula(linha, FORMATO_INTEIRO.format(registro.previsto));
      adicionarCelula(linha, FORMATO_INTEIRO.format(registro.realizados));
      adicionarCelula(linha, FORMATO_INTEIRO.format(registro.faltando));
      adicionarCelula(linha, FORMATO_INTEIRO.format(registro.justificados));
      adicionarCelula(linha, registro.conformidade.toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }) + "%");
      const chave = "apr-" + registro.id;
      linha.addEventListener("click", function () { alternarDetalhe(chave, linha, registro); });
      linha.addEventListener("keydown", function (evento) {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          alternarDetalhe(chave, linha, registro);
        }
      });
    });
  }

  function validarPeriodo(inicio, fim) {
    if (!inicio || !fim) throw new Error("Informe as duas datas do período.");
    if (inicio > fim) throw new Error("A data inicial não pode ser posterior à data final.");
  }

  function renderizar() {
    if (!dados) return;
    const inicio = document.getElementById("filtro-inicio").value;
    const fim = document.getElementById("filtro-fim").value;
    validarPeriodo(inicio, fim);
    const busca = document.getElementById("filtro-busca").value;
    const registros = obterResumo(inicio, fim, busca);
    atualizarKpis(registros);
    renderizarTabela(registros);
    atualizarGrafico(registros, inicio, fim);
    document.getElementById("apr-atualizacao").textContent =
      registros.length + (registros.length === 1 ? " encarregado" : " encarregados") +
      " · " + formatarData(inicio) + " a " + formatarData(fim) + " · meta de 2 APRs por dia útil";
    const ignoradas = dados.aprsNaoAssociadas || 0;
    exibirMensagem(
      ignoradas
        ? ignoradas + " registro(s) da aba APR não foram associados a um encarregado e data e ficaram fora do cálculo."
        : "",
      false
    );
  }

  async function inicializar(forcarAtualizacao) {
    const botaoAtualizar = document.getElementById("btn-atualizar");
    const botaoAplicar = document.getElementById("btn-aplicar");
    botaoAtualizar.disabled = true;
    botaoAplicar.disabled = true;
    exibirMensagem("Carregando APRs, encarregados e justificativas...", false);
    try {
      dados = await carregarDados(forcarAtualizacao);
      renderizar();
      return true;
    } catch (erro) {
      console.error("[apr.js] Falha ao carregar os dados de APR:", erro);
      exibirMensagem(
        "Não foi possível carregar os dados. Verifique a aba APR e se o Apps Script publicado contém essa ação. Detalhe: " +
          erro.message,
        true
      );
      const corpo = document.getElementById("corpo-apr");
      corpo.replaceChildren();
      const linha = corpo.insertRow();
      const celula = linha.insertCell();
      celula.colSpan = 8;
      celula.textContent = "Os dados não foram carregados.";
      return false;
    } finally {
      botaoAtualizar.disabled = false;
      botaoAplicar.disabled = false;
    }
  }

  function inicializarFormularioJustificativa() {
    const dialogo = document.getElementById("dialogo-justificativa");
    const formulario = document.getElementById("form-justificativa");
    const dataInicio = document.getElementById("justificativa-data-inicio");
    const dataFim = document.getElementById("justificativa-data-fim");
    const escopo = document.getElementById("justificativa-escopo");
    const aplicacao = document.getElementById("justificativa-aplicacao");
    const quantidadeAprControles = document.getElementById("quantidade-apr-controles");
    const quantidadeApr = document.getElementById("justificativa-quantidade-apr");
    const selecao = document.getElementById("selecao-colaboradores");
    const listaColaboradores = document.getElementById("lista-colaboradores");
    const motivo = document.getElementById("justificativa-motivo");
    const novoMotivoControles = document.getElementById("novo-motivo-controles");
    const novoMotivo = document.getElementById("novo-motivo");
    const mensagem = document.getElementById("justificativa-mensagem");
    const listaJustificativas = document.getElementById("lista-justificativas");
    const salvar = document.getElementById("btn-salvar-justificativa");
    const selecionados = function () {
      return Array.from(listaColaboradores.querySelectorAll("input:checked"))
        .map(function (checkbox) { return checkbox.value; });
    };

    function sincronizarSalvar() {
      salvar.disabled = motivo.disabled || !motivo.value ||
        (escopo.value !== "TODOS" && selecionados().length === 0);
    }

    function preencherMotivos(motivos, selecionado) {
      motivo.replaceChildren(new Option("Selecione o motivo", ""));
      motivos.forEach(function (item) { motivo.add(new Option(item, item)); });
      motivo.disabled = motivos.length === 0;
      if (selecionado && motivos.includes(selecionado)) motivo.value = selecionado;
      sincronizarSalvar();
    }

    function renderizarColaboradores() {
      listaColaboradores.replaceChildren();
      funcionariosEncarregados((dados && dados.encarregados) || [])
        .sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); })
        .forEach(function (colaborador) {
          const opcao = document.createElement("label");
          opcao.className = "checklist-colaborador-opcao";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = colaborador.id;
          checkbox.addEventListener("change", function () {
            if (escopo.value === "UM" && checkbox.checked) {
              listaColaboradores.querySelectorAll("input:checked").forEach(function (selecionado) {
                if (selecionado !== checkbox) selecionado.checked = false;
              });
            }
            sincronizarSalvar();
          });
          const texto = document.createElement("span");
          texto.textContent = colaborador.nome + " (" + colaborador.id + ")";
          opcao.append(checkbox, texto);
          listaColaboradores.appendChild(opcao);
        });
    }

    async function carregarJustificativas() {
      listaJustificativas.replaceChildren();
      const carregando = document.createElement("p");
      carregando.textContent = "Carregando justificativas...";
      listaJustificativas.appendChild(carregando);
      try {
        const justificativas = await API.listarJustificativasChecklist();
        listaJustificativas.replaceChildren();
        const nomes = new Map(funcionariosEncarregados((dados && dados.encarregados) || [])
          .map(function (colaborador) { return [colaborador.id, colaborador.nome]; }));
        const apenasApr = justificativas.filter(function (item) {
          const destino = normalizar(item.aplicacao || "CHECKLIST");
          return destino === "APR" || destino === "AMBOS";
        });
        if (!apenasApr.length) {
          const vazio = document.createElement("p");
          vazio.textContent = "Nenhuma justificativa aplicável à APR cadastrada.";
          listaJustificativas.appendChild(vazio);
          return;
        }
        apenasApr.forEach(function (item) {
          const cartao = document.createElement("article");
          cartao.className = "checklist-justificativa-item";
          const informacoes = document.createElement("div");
          informacoes.className = "checklist-justificativa-info";
          const titulo = document.createElement("strong");
          titulo.textContent = item.motivo || "Justificativa";
          const periodo = document.createElement("span");
          periodo.textContent = formatarData(item.dataInicio) +
            (item.dataFim && item.dataFim !== item.dataInicio ? " a " + formatarData(item.dataFim) : "");
          const colaborador = normalizarId(item.colaborador) === "TODOS"
            ? "Todos os colaboradores"
            : (nomes.get(normalizarId(item.colaborador)) || item.colaborador);
          const destino = document.createElement("span");
          destino.textContent = colaborador + " · " +
            (normalizar(item.aplicacao) === "AMBOS" ? "Check-list e APR" : "Somente APR") +
            " · " + (Number(item.quantidadeApr) === 1 ? "1 APR justificada/dia" : "2 APRs justificadas/dia");
          informacoes.append(titulo, periodo, destino);
          const excluir = document.createElement("button");
          excluir.type = "button";
          excluir.className = "checklist-btn-excluir-justificativa";
          excluir.textContent = "Excluir";
          excluir.addEventListener("click", async function () {
            if (!window.confirm("Deseja excluir esta justificativa?")) return;
            excluir.disabled = true;
            try {
              await API.excluirJustificativaChecklist(item.id);
              await carregarJustificativas();
              await inicializar(true);
            } catch (erro) {
              console.error("[apr.js] Falha ao excluir justificativa:", erro);
              mensagem.textContent = "Não foi possível excluir a justificativa. " + erro.message;
              excluir.disabled = false;
            }
          });
          cartao.append(informacoes, excluir);
          listaJustificativas.appendChild(cartao);
        });
      } catch (erro) {
        console.error("[apr.js] Falha ao listar justificativas:", erro);
        listaJustificativas.replaceChildren();
        const falha = document.createElement("p");
        falha.textContent = "Não foi possível carregar as justificativas. " + erro.message;
        listaJustificativas.appendChild(falha);
      }
    }

    escopo.addEventListener("change", function () {
      selecao.hidden = escopo.value === "TODOS";
      if (escopo.value === "UM") {
        Array.from(listaColaboradores.querySelectorAll("input:checked")).slice(1)
          .forEach(function (checkbox) { checkbox.checked = false; });
      }
      sincronizarSalvar();
    });
    aplicacao.addEventListener("change", function () {
      const aplicaAPR = aplicacao.value === "APR" || aplicacao.value === "AMBOS";
      quantidadeAprControles.hidden = !aplicaAPR;
      quantidadeApr.required = aplicaAPR;
    });
    motivo.addEventListener("change", sincronizarSalvar);
    document.getElementById("btn-abrir-justificativa").addEventListener("click", async function () {
      mensagem.textContent = "";
      novoMotivoControles.hidden = true;
      novoMotivo.value = "";
      escopo.value = "TODOS";
      aplicacao.value = "APR";
      quantidadeApr.value = "2";
      quantidadeAprControles.hidden = false;
      quantidadeApr.required = true;
      selecao.hidden = true;
      listaColaboradores.replaceChildren();
      motivo.replaceChildren(new Option("Carregando motivos...", ""));
      motivo.disabled = true;
      salvar.disabled = true;
      dialogo.showModal();
      try {
        const [motivos, dadosCarregados] = await Promise.all([
          API.buscarMotivosAusenciaChecklist(),
          carregarDados(false)
        ]);
        dados = dadosCarregados;
        renderizarColaboradores();
        await carregarJustificativas();
        preencherMotivos(motivos);
        if (!motivos.length) mensagem.textContent = "Nenhum motivo cadastrado na aba CONFIG_AUSENCIA.";
      } catch (erro) {
        console.error("[apr.js] Falha ao preparar cadastro de justificativa:", erro);
        motivo.replaceChildren(new Option("Não foi possível carregar os motivos", ""));
        mensagem.textContent = "Não foi possível carregar os dados do cadastro. " + erro.message;
      }
    });
    document.getElementById("btn-adicionar-motivo").addEventListener("click", function () {
      novoMotivoControles.hidden = !novoMotivoControles.hidden;
      if (!novoMotivoControles.hidden) novoMotivo.focus();
    });
    document.getElementById("btn-salvar-novo-motivo").addEventListener("click", async function () {
      const texto = novoMotivo.value.trim();
      if (!texto) {
        mensagem.textContent = "Digite o novo motivo.";
        novoMotivo.focus();
        return;
      }
      const botao = document.getElementById("btn-salvar-novo-motivo");
      botao.disabled = true;
      mensagem.textContent = "";
      try {
        await API.cadastrarMotivoAusenciaChecklist(texto);
        const motivos = await API.buscarMotivosAusenciaChecklist();
        preencherMotivos(motivos, texto);
        novoMotivo.value = "";
        novoMotivoControles.hidden = true;
      } catch (erro) {
        console.error("[apr.js] Falha ao cadastrar motivo:", erro);
        mensagem.textContent = "Não foi possível cadastrar o motivo. " + erro.message;
      } finally {
        botao.disabled = false;
      }
    });
    document.getElementById("btn-cancelar-justificativa").addEventListener("click", function () {
      dialogo.close();
    });
    dataInicio.addEventListener("change", function () { dataFim.min = dataInicio.value; });
    dataFim.addEventListener("change", function () {
      mensagem.textContent = dataFim.value && dataFim.value < dataInicio.value
        ? "A data final não pode ser anterior à data inicial."
        : "";
    });
    formulario.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      salvar.disabled = true;
      mensagem.textContent = "";
      try {
        const aplicacaoSelecionada = aplicacao.value;
        const quantidadeAprSelecionada = Number(quantidadeApr.value);
        const colaboradores = escopo.value === "TODOS" ? [] : selecionados();
        if (escopo.value !== "TODOS" && !colaboradores.length) {
          throw new Error("Selecione pelo menos um colaborador.");
        }
        if (escopo.value === "UM" && colaboradores.length !== 1) {
          throw new Error("Selecione somente um colaborador.");
        }
        if (dataFim.value && dataFim.value < dataInicio.value) {
          throw new Error("A data final não pode ser anterior à data inicial.");
        }
        await API.cadastrarJustificativaChecklist({
          dataInicio: dataInicio.value,
          dataFim: dataFim.value,
          motivo: motivo.value,
          escopo: escopo.value,
          colaboradores: colaboradores,
          aplicacao: aplicacao.value,
          quantidadeApr: quantidadeAprSelecionada
        });
        formulario.reset();
        dataFim.min = "";
        aplicacao.value = "APR";
        quantidadeApr.value = "2";
        quantidadeAprControles.hidden = false;
        quantidadeApr.required = true;
        dialogo.close();
        const atualizou = await inicializar(true);
        const mensagemSucesso = aplicacaoSelecionada === "CHECKLIST"
          ? "Justificativa cadastrada para o check-list; a meta da APR não foi alterada."
          : "Justificativa cadastrada e aplicada à APR.";
        exibirMensagem(
          atualizou ? mensagemSucesso :
            "Justificativa cadastrada, mas não foi possível atualizar a APR. Use “Atualizar dados”.",
          !atualizou
        );
      } catch (erro) {
        console.error("[apr.js] Falha ao cadastrar justificativa:", erro);
        mensagem.textContent = "Não foi possível cadastrar a justificativa. " + erro.message;
      } finally {
        sincronizarSalvar();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    definirPeriodoInicial();
    document.getElementById("btn-aplicar").addEventListener("click", function () {
      try { renderizar(); } catch (erro) { exibirMensagem(erro.message, true); }
    });
    document.getElementById("filtro-busca").addEventListener("input", function () {
      try { renderizar(); } catch (erro) { exibirMensagem(erro.message, true); }
    });
    document.getElementById("btn-atualizar").addEventListener("click", function () { inicializar(true); });
    inicializarFormularioJustificativa();
    inicializar(false);
  });
})();
