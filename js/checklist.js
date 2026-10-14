/**
 * Prevê e confere check-lists diários e semanais por encarregado.
 */
(function () {
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR");
  const FORMATO_INTEIRO = new Intl.NumberFormat("pt-BR");
  const NOMES_ACAO = ["encarregados", "checkDiario", "checkSemanal", "justAusencia"];
  const ESTADOS = {
    REALIZADO: "✅ Realizado",
    FALTANDO: "❌ Faltando",
    JUSTIFICADO: "🟡 Justificado",
    DISPENSADO: "🔵 Dispensado (semanal realizado)"
  };

  let dados = null;
  let dadosEmCache = null;
  let cacheAtualizadoEm = 0;
  let grafico = null;
  let expansaoAtual = "";

  function normalizarTexto(valor) {
    return String(valor === null || valor === undefined ? "" : valor)
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }

  function normalizarMatricula(valor) {
    const texto = String(valor === null || valor === undefined ? "" : valor).trim();
    return /^\d+$/.test(texto) ? texto.replace(/^0+(?=\d)/, "") : normalizarTexto(texto);
  }

  function cabecalhoEncaixa(cabecalho, alias) {
    const chave = normalizarTexto(cabecalho);
    const procurado = normalizarTexto(alias);
    return chave === procurado || chave.includes(procurado);
  }

  function valorCampo(registro, aliases) {
    const chaves = Object.keys(registro || {});
    for (let i = 0; i < aliases.length; i++) {
      const chave = chaves.find(function (nome) {
        return normalizarTexto(nome) === normalizarTexto(aliases[i]);
      });
      if (chave !== undefined && String(registro[chave] || "").trim() !== "") {
        return registro[chave];
      }
    }
    for (let i = 0; i < aliases.length; i++) {
      const chave = chaves.find(function (nome) {
        return cabecalhoEncaixa(nome, aliases[i]) && String(registro[nome] || "").trim() !== "";
      });
      if (chave !== undefined) return registro[chave];
    }
    return "";
  }

  function criarData(ano, mes, dia) {
    const data = new Date(ano, mes - 1, dia);
    if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
    return data;
  }

  function dataISO(valor) {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
      return [valor.getFullYear(), String(valor.getMonth() + 1).padStart(2, "0"),
        String(valor.getDate()).padStart(2, "0")].join("-");
    }
    const texto = String(valor === null || valor === undefined ? "" : valor).trim();
    if (!texto) return "";

    let partes = texto.match(/(?:^|\D)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/);
    if (partes) {
      const data = criarData(Number(partes[1]), Number(partes[2]), Number(partes[3]));
      if (data) return formatarISO(data);
    }

    partes = texto.match(/(?:^|\D)(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\D|$)/);
    if (partes) {
      let ano = Number(partes[3]);
      if (ano < 100) ano += ano >= 70 ? 1900 : 2000;
      const data = criarData(ano, Number(partes[2]), Number(partes[1]));
      if (data) return formatarISO(data);
    }

    const timestamp = Date.parse(texto);
    return Number.isNaN(timestamp) ? "" : formatarISO(new Date(timestamp));
  }

  function formatarISO(data) {
    return [data.getFullYear(), String(data.getMonth() + 1).padStart(2, "0"),
      String(data.getDate()).padStart(2, "0")].join("-");
  }

  function dataDeISO(iso) {
    const partes = iso.split("-").map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2]);
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

  function primeiroDiaUtilDaSemana(iso) {
    let dia = iso;
    while (dataDeISO(dia).getDay() !== 1) dia = somarDias(dia, -1);
    return dia;
  }

  function ehDataValida(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(iso);
  }

  function datasEntre(inicio, fim) {
    const datas = [];
    if (!inicio || !fim || inicio > fim) return datas;
    for (let atual = inicio; atual <= fim; atual = somarDias(atual, 1)) datas.push(atual);
    return datas;
  }

  function extrairDatas(valor) {
    const texto = String(valor === null || valor === undefined ? "" : valor).trim();
    if (!texto) return [];
    const achados = texto.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/g) || [];
    const datas = achados.map(dataISO).filter(Boolean);
    if (datas.length) return Array.from(new Set(datas)).sort();
    const unica = dataISO(texto);
    return unica ? [unica] : [];
  }

  function dataInicioContrato(encarregado) {
    return dataISO(valorCampo(encarregado, [
      "DATA INICIO CONTRATO", "DATA DE INICIO CONTRATO", "DATA DE ADIMICAO",
      "DATA DE ADMISSAO", "DATA ADMISSAO", "INICIO CONTRATO",
      "DATA INICIO", "INICIO"
    ]));
  }

  function dataFimContrato(encarregado) {
    return dataISO(valorCampo(encarregado, [
      "DATA FIM CONTRATO", "DATA DE FIM CONTRATO", "FIM CONTRATO",
      "DATA ENCERRAMENTO CONTRATO", "DATA DEMISSAO", "DATA FIM", "FIM"
    ]));
  }

  function matricula(registro) {
    return normalizarMatricula(valorCampo(registro, [
      "MATRICULA CODIGO", "MATRICULA/CODIGO", "MATRICULA", "CODIGO", "COD",
      "ENCARREGADO", "ID ENCARREGADO", "CODIGO ENCARREGADO"
    ]));
  }

  function nome(registro) {
    return String(valorCampo(registro, ["NOME", "COLABORADOR", "FUNCIONARIO", "NOME COMPLETO"]) || "")
      .trim();
  }

  function normalizarIdSemana(valor) {
    const texto = String(valor === null || valor === undefined ? "" : valor).trim();
    const datas = extrairDatas(texto);
    if (datas.length) return primeiroDiaUtilDaSemana(datas[0]);
    const isoWeek = texto.match(/(\d{4})\s*[- ]?W(\d{1,2})/i);
    const semanaAno = texto.match(/(?:SEMANA|SEM\.?)\s*(\d{1,2})\s*[/ -]\s*(\d{4})/i);
    const numeroAno = texto.match(/(?:^|\D)(\d{1,2})\s*[/ -]\s*(\d{4})(?:\D|$)/);
    if (isoWeek || semanaAno || numeroAno) {
      const ano = Number(isoWeek ? isoWeek[1] : (semanaAno ? semanaAno[2] : numeroAno[2]));
      const semana = Number(isoWeek ? isoWeek[2] : (semanaAno ? semanaAno[1] : numeroAno[1]));
      if (semana < 1 || semana > 53) return "";
      const quatroJaneiro = new Date(ano, 0, 4);
      const segunda = new Date(ano, 0, 4 - (quatroJaneiro.getDay() || 7) + 1);
      segunda.setDate(segunda.getDate() + (semana - 1) * 7);
      return formatarISO(segunda);
    }
    return "";
  }

  function mapaChecks(registros, semanal) {
    const mapa = new Map();
    registros.forEach(function (registro) {
      const id = matricula(registro);
      if (!id) return;
      const data = dataISO(valorCampo(registro, semanal
        ? ["DATA", "DATA DO CHECK LIST", "DATA CHECKLIST", "DATA DE PREENCHIMENTO", "TIMESTAMP", "CARIMBO DE DATA", "SEMANA"]
        : ["DATA", "DATA DO CHECK LIST", "DATA CHECKLIST", "DATA DE PREENCHIMENTO", "TIMESTAMP", "CARIMBO DE DATA"]));
      const semana = semanal
        ? normalizarIdSemana(valorCampo(registro, ["DATA", "DATA DO CHECK LIST", "DATA CHECKLIST", "DATA DE PREENCHIMENTO", "TIMESTAMP", "CARIMBO DE DATA", "SEMANA", "SEMANA DO CHECK LIST"]))
          || (data ? primeiroDiaUtilDaSemana(data) : "")
        : "";
      const chaveData = semanal ? semana : data;
      if (!chaveData) return;
      if (!mapa.has(id)) mapa.set(id, new Map());
      const revisao = normalizarTexto(valorCampo(registro, ["STATUS", "SITUACAO", "SITUACAO DO CHECK LIST", "ANALISE"])) || "SEM STATUS";
      const existente = mapa.get(id).get(chaveData);
      if (!existente || prioridadeRevisao(revisao) > prioridadeRevisao(existente)) {
        mapa.get(id).set(chaveData, revisao);
      }
    });
    return mapa;
  }

  function prioridadeRevisao(status) {
    if (status.includes("APROV")) return 3;
    if (status.includes("PEND")) return 2;
    if (status.includes("REPROV")) return 1;
    return 0;
  }

  function mapaAusencias(registros) {
    const mapa = new Map();
    registros.forEach(function (registro) {
      const aplicacao = normalizarTexto(valorCampo(registro, ["APLICACAO", "APLICA EM", "TIPO DE DISPENSA"]));
      if (aplicacao && aplicacao !== "CHECKLIST" && aplicacao !== "AMBOS") return;
      const id = matricula(registro);
      if (!id) return;
      const inicioRaw = valorCampo(registro, [
        "DATA INICIO", "DATA INICIAL", "PER INICIO", "INICIO", "DATA", "PERIODO", "PERIODO AUSENCIA"
      ]);
      const fimRaw = valorCampo(registro, ["DATA FIM", "DATA FINAL", "PER FIM", "FIM", "ATE"]);
      let datas = extrairDatas(inicioRaw);
      const fimDatas = extrairDatas(fimRaw);
      let inicio = datas[0] || "";
      let fim = fimDatas[fimDatas.length - 1] || datas[datas.length - 1] || inicio;
      if (!inicio) return;
      if (inicio > fim) {
        const temporario = inicio;
        inicio = fim;
        fim = temporario;
      }
      const motivo = String(valorCampo(registro, ["MOTIVO", "JUSTIFICATIVA", "DESCRICAO", "OBSERVACAO"]) || "")
        .trim() || "Ausência justificada";
      datasEntre(inicio, fim).forEach(function (dia) {
        if (!mapa.has(id)) mapa.set(id, new Map());
        if (!mapa.get(id).has(dia)) mapa.get(id).set(dia, motivo);
      });
    });
    return mapa;
  }

  function buscarId(registro) {
    return matricula(registro);
  }

  function funcionariosEncarregados(registros) {
    return registros.filter(function (registro) {
      return normalizarTexto(valorCampo(registro, ["FUNCAO", "CARGO", "FUNCAO/CARGO"]))
        .includes("ENCARREGADO");
    }).map(function (registro) {
      return {
        id: buscarId(registro),
        nome: nome(registro),
        inicioContrato: dataInicioContrato(registro),
        fimContrato: dataFimContrato(registro)
      };
    }).filter(function (registro) {
      return registro.id && registro.nome;
    });
  }

  function statusLinha(status, motivo, revisao) {
    return {
      status: status,
      motivo: motivo || "",
      revisao: revisao || ""
    };
  }

  function calcularEncarregado(funcionario, inicioPeriodo, fimPeriodo, checksDiarios, checksSemanais, ausencias) {
    const inicioContrato = funcionario.inicioContrato || inicioPeriodo;
    const fimContrato = funcionario.fimContrato || fimPeriodo;
    const inicio = inicioContrato > inicioPeriodo ? inicioContrato : inicioPeriodo;
    const fim = fimContrato < fimPeriodo ? fimContrato : fimPeriodo;
    const diariasFeitas = checksDiarios.get(funcionario.id) || new Map();
    const semanaisFeitos = checksSemanais.get(funcionario.id) || new Map();
    const justificativas = new Map(ausencias.get("TODOS") || []);
    (ausencias.get(funcionario.id) || new Map()).forEach(function (motivo, dia) {
      justificativas.set(dia, motivo);
    });
    const diasDetalhe = [];
    const semanasDetalhe = [];
    let previstoBruto = 0;
    let realizados = 0;
    let justificados = 0;

    if (inicio <= fim) {
      datasEntre(inicio, fim).filter(ehDiaUtil).forEach(function (dia) {
        const semana = primeiroDiaUtilDaSemana(dia);
        const primeiroDia = dia === semana;
        const revisaoDiario = diariasFeitas.get(dia) || "";
        const revisaoSemanal = semanaisFeitos.get(semana) || "";
        const semanalFeito = Boolean(revisaoSemanal);
        const motivo = justificativas.get(dia) || "";
        const diarioFeito = Boolean(revisaoDiario);
        let statusDiario;

        // O primeiro dia útil tem uma única obrigação: o semanal substitui o diário.
        // Se não houver semanal, o diário normal continua valendo para esse dia.
        previstoBruto++;
        if (primeiroDia && semanalFeito) {
          realizados++;
          statusDiario = statusLinha(ESTADOS.DISPENSADO);
          semanasDetalhe.push({
            semana: semana,
            status: statusLinha(ESTADOS.REALIZADO, "", revisaoSemanal)
          });
        } else if (diarioFeito) {
          realizados++;
          statusDiario = statusLinha(ESTADOS.REALIZADO, "", revisaoDiario);
          if (primeiroDia) {
            semanasDetalhe.push({
              semana: semana,
              status: statusLinha(ESTADOS.DISPENSADO + " (diário realizado)")
            });
          }
        } else if (motivo) {
          justificados++;
          statusDiario = statusLinha(ESTADOS.JUSTIFICADO, motivo);
          if (primeiroDia) {
            semanasDetalhe.push({ semana: semana, status: statusLinha(ESTADOS.JUSTIFICADO, motivo) });
          }
        } else {
          statusDiario = statusLinha(ESTADOS.FALTANDO);
          if (primeiroDia) {
            semanasDetalhe.push({ semana: semana, status: statusLinha(ESTADOS.FALTANDO) });
          }
        }
        diasDetalhe.push({
          data: dia,
          status: statusDiario,
          primeiroDiaSemana: primeiroDia
        });
      });
    }

    const previsto = Math.max(0, previstoBruto - justificados);
    const faltando = Math.max(0, previsto - realizados);
    return {
      id: funcionario.id,
      nome: funcionario.nome,
      inicioContrato: funcionario.inicioContrato,
      fimContrato: funcionario.fimContrato,
      inicioIntersecao: inicio,
      fimIntersecao: fim,
      previsto: previsto,
      realizados: realizados,
      faltando: faltando,
      justificados: justificados,
      conformidade: previsto > 0 ? Math.min(100, realizados / previsto * 100) : 100,
      diarias: diasDetalhe,
      semanais: semanasDetalhe
    };
  }

  function obterResumo(inicio, fim, busca) {
    const checksDiarios = mapaChecks(dados.checkDiario, false);
    const checksSemanais = mapaChecks(dados.checkSemanal, true);
    const ausencias = mapaAusencias(dados.justAusencia);
    const chaveBusca = normalizarTexto(busca);

    const encarregados = funcionariosEncarregados(dados.encarregados)
      .map(function (funcionario) {
        return calcularEncarregado(funcionario, inicio, fim, checksDiarios, checksSemanais, ausencias);
      })
      .filter(function (registro) {
        return !chaveBusca ||
          normalizarTexto(registro.nome).includes(chaveBusca) ||
          normalizarTexto(registro.id).includes(chaveBusca);
      })
      .sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });

    return encarregados;
  }

  async function carregarDados(forcarAtualizacao) {
    if (!forcarAtualizacao && dadosEmCache && Date.now() - cacheAtualizadoEm < CACHE_TTL_MS) {
      return dadosEmCache;
    }

    const resultados = await Promise.all(NOMES_ACAO.map(function (acao) {
      return API.buscarDadosChecklist(acao);
    }));
    const novosDados = {
      encarregados: resultados[0],
      checkDiario: resultados[1],
      checkSemanal: resultados[2],
      justAusencia: resultados[3]
    };
    dadosEmCache = novosDados;
    cacheAtualizadoEm = Date.now();
    return novosDados;
  }

  function formatarData(iso) {
    if (!ehDataValida(iso)) return "—";
    return FORMATO_DATA.format(dataDeISO(iso));
  }

  function textoContrato(registro) {
    return formatarData(registro.inicioContrato) + " a " + formatarData(registro.fimContrato);
  }

  function adicionarCelula(linha, conteudo, classe) {
    const celula = linha.insertCell();
    if (classe) celula.className = classe;
    celula.textContent = conteudo;
    return celula;
  }

  function montarTabelaDetalhe(registros, titulo, tipo) {
    const secao = document.createElement("section");
    secao.className = "checklist-detalhe-bloco";
    const cabecalho = document.createElement("h3");
    cabecalho.textContent = titulo;
    secao.appendChild(cabecalho);
    const tabela = document.createElement("table");
    tabela.className = "checklist-detalhe-lista";
    const thead = tabela.createTHead();
    const cabLinha = thead.insertRow();
    [tipo === "diario" ? "Data" : "Semana iniciada em", "Status", "Motivo"].forEach(function (texto) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = texto;
      cabLinha.appendChild(th);
    });
    const tbody = tabela.createTBody();
    registros.forEach(function (registro) {
      const linha = tbody.insertRow();
      adicionarCelula(linha, formatarData(registro.data || registro.semana));
      const revisao = registro.status.revisao
        ? " · " + registro.status.revisao.toLocaleLowerCase("pt-BR")
        : "";
      adicionarCelula(linha, registro.status.status + revisao);
      adicionarCelula(linha, registro.status.motivo || "—");
    });
    if (!registros.length) {
      const linha = tbody.insertRow();
      const celula = linha.insertCell();
      celula.colSpan = 3;
      celula.textContent = "Sem dias úteis previstos no período.";
    }
    secao.appendChild(tabela);
    return secao;
  }

  function alternarDetalhe(chave, linhaResumo, registro) {
    const linhaExistente = linhaResumo.nextElementSibling;
    if (linhaExistente && linhaExistente.classList.contains("checklist-detalhe")) {
      linhaExistente.remove();
      expansaoAtual = "";
      linhaResumo.setAttribute("aria-expanded", "false");
      return;
    }
    if (expansaoAtual) {
      const anterior = document.querySelector('[data-detalhe-id="' + CSS.escape(expansaoAtual) + '"]');
      if (anterior) {
        const linhaAnterior = anterior.nextElementSibling;
        if (linhaAnterior && linhaAnterior.classList.contains("checklist-detalhe")) linhaAnterior.remove();
        anterior.setAttribute("aria-expanded", "false");
      }
    }

    const detalhe = document.createElement("tr");
    detalhe.className = "checklist-detalhe";
    detalhe.dataset.detalheId = chave;
    const celula = detalhe.insertCell();
    celula.colSpan = 8;
    const conteudo = document.createElement("div");
    conteudo.className = "checklist-detalhe-conteudo";
    conteudo.appendChild(montarTabelaDetalhe(registro.diarias, "Check-lists diários", "diario"));
    conteudo.appendChild(montarTabelaDetalhe(registro.semanais, "Check-lists semanais", "semanal"));
    celula.appendChild(conteudo);
    linhaResumo.after(detalhe);
    linhaResumo.setAttribute("aria-expanded", "true");
    expansaoAtual = chave;
  }

  function renderizarTabela(registros) {
    const corpo = document.getElementById("corpo-checklist");
    corpo.replaceChildren();
    if (!registros.length) {
      const linha = corpo.insertRow();
      const celula = linha.insertCell();
      celula.colSpan = 8;
      celula.textContent = "Nenhum encarregado encontrado no período.";
      return;
    }

    registros.forEach(function (registro) {
      const linha = corpo.insertRow();
      linha.className = "checklist-linha-resumo";
      linha.tabIndex = 0;
      linha.setAttribute("role", "button");
      linha.setAttribute("aria-expanded", "false");
      const chave = registro.id;
      adicionarCelula(linha, registro.nome);
      adicionarCelula(linha, registro.id);
      adicionarCelula(linha, textoContrato(registro));
      adicionarCelula(linha, FORMATO_INTEIRO.format(registro.previsto), "checklist-numero");
      adicionarCelula(linha, FORMATO_INTEIRO.format(registro.realizados), "checklist-numero");
      adicionarCelula(
        linha,
        FORMATO_INTEIRO.format(registro.faltando),
        "checklist-numero" + (registro.faltando > 0 ? " checklist-faltando-positivo" : "")
      );
      adicionarCelula(linha, FORMATO_INTEIRO.format(registro.justificados), "checklist-numero");

      const progressoCelula = linha.insertCell();
      const progresso = document.createElement("div");
      progresso.className = "checklist-progresso" + (registro.faltando > 0 ? " baixa" : "");
      const barra = document.createElement("span");
      barra.className = "checklist-progresso-barra";
      const preenchimento = document.createElement("span");
      preenchimento.style.width = registro.conformidade + "%";
      barra.appendChild(preenchimento);
      const porcentagem = document.createElement("strong");
      porcentagem.textContent = registro.conformidade.toLocaleString("pt-BR", {
        maximumFractionDigits: 1
      }) + "%";
      progresso.append(barra, porcentagem);
      progressoCelula.appendChild(progresso);

      linha.addEventListener("click", function () {
        alternarDetalhe(chave, linha, registro);
      });
      linha.addEventListener("keydown", function (evento) {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          alternarDetalhe(chave, linha, registro);
        }
      });
    });
  }

  function atualizarKpis(registros) {
    const totais = registros.reduce(function (acc, registro) {
      acc.previsto += registro.previsto;
      acc.realizados += registro.realizados;
      acc.faltando += registro.faltando;
      acc.justificados += registro.justificados;
      return acc;
    }, { previsto: 0, realizados: 0, faltando: 0, justificados: 0 });
    document.getElementById("kpi-previsto").textContent = FORMATO_INTEIRO.format(totais.previsto);
    document.getElementById("kpi-realizados").textContent = FORMATO_INTEIRO.format(totais.realizados);
    document.getElementById("kpi-faltando").textContent = FORMATO_INTEIRO.format(totais.faltando);
    document.getElementById("kpi-justificados").textContent = FORMATO_INTEIRO.format(totais.justificados);
  }

  function atualizarGrafico(registros, inicio, fim) {
    const porDia = new Map();
    registros.forEach(function (registro) {
      registro.diarias.forEach(function (dia) {
        if (!porDia.has(dia.data)) {
          porDia.set(dia.data, { previsto: 0, realizados: 0, justificados: 0, motivos: new Set() });
        }
        const totais = porDia.get(dia.data);
        if (dia.status.status !== ESTADOS.JUSTIFICADO) totais.previsto++;
        if (dia.status.status === ESTADOS.REALIZADO ||
            dia.status.status === ESTADOS.DISPENSADO) totais.realizados++;
        if (dia.status.status === ESTADOS.JUSTIFICADO) {
          totais.justificados++;
          if (dia.status.motivo) totais.motivos.add(dia.status.motivo);
        }
      });
    });

    const datas = datasEntre(inicio, fim).filter(ehDiaUtil);
    const labels = datas.map(function (dia) { return formatarData(dia); });
    const valores = datas.map(function (dia) {
      return porDia.get(dia) || { previsto: 0, realizados: 0, justificados: 0, motivos: new Set() };
    });
    if (grafico) grafico.destroy();
    const canvas = document.getElementById("grafico-checklist");
    if (typeof Chart === "undefined") {
      canvas.hidden = true;
      return;
    }
    canvas.hidden = false;
    grafico = new Chart(canvas, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            type: "bar",
            label: "Realizados",
            data: valores.map(function (valor) { return valor.realizados; }),
            backgroundColor: "#2563eb",
            stack: "realizados-justificados"
          },
          {
            type: "bar",
            label: "Justificados",
            data: valores.map(function (valor) { return valor.justificados; }),
            backgroundColor: "#fbbf24",
            stack: "realizados-justificados"
          },
          {
            type: "line",
            label: "Previsto",
            data: valores.map(function (valor) { return valor.previsto; }),
            borderColor: "#6366f1",
            backgroundColor: "#6366f1",
            pointBackgroundColor: "#6366f1",
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.25,
            stack: "previstos"
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
            enabled: true,
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
            title: { display: true, text: "Quantidade de check-lists" }
          }
        }
      }
    });
  }

  function definirPeriodoInicial() {
    const agora = new Date();
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
    document.getElementById("filtro-inicio").value = formatarISO(inicio);
    document.getElementById("filtro-fim").value = formatarISO(fim);
  }

  function exibirMensagem(texto, erro) {
    const mensagem = document.getElementById("checklist-mensagem");
    mensagem.textContent = texto;
    mensagem.classList.toggle("visivel", Boolean(texto));
    mensagem.classList.toggle("erro", Boolean(erro));
  }

  function validarPeriodo(inicio, fim) {
    if (!ehDataValida(inicio) || !ehDataValida(fim)) {
      throw new Error("Informe as duas datas do período.");
    }
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
    document.getElementById("checklist-atualizacao").textContent =
      registros.length + (registros.length === 1 ? " encarregado" : " encarregados") +
      " · " + formatarData(inicio) + " a " + formatarData(fim);
    exibirMensagem("", false);
  }

  async function inicializar(forcarAtualizacao) {
    const botaoAtualizar = document.getElementById("btn-atualizar");
    const botaoAplicar = document.getElementById("btn-aplicar");
    botaoAtualizar.disabled = true;
    botaoAplicar.disabled = true;
    exibirMensagem("Carregando dados das abas de check-list...", false);
    try {
      dados = await carregarDados(forcarAtualizacao);
      renderizar();
      return true;
    } catch (erro) {
      console.error("[checklist.js] Falha ao inicializar a tela:", erro);
      exibirMensagem(
        "Não foi possível carregar os dados. Verifique sua conexão e se a versão implantada do Apps Script inclui as ações de check-list. Detalhe: " +
          erro.message,
        true
      );
      const corpo = document.getElementById("corpo-checklist");
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

  document.addEventListener("DOMContentLoaded", function () {
    definirPeriodoInicial();
    document.getElementById("btn-aplicar").addEventListener("click", function () {
      try {
        renderizar();
      } catch (erro) {
        exibirMensagem(erro.message, true);
      }
    });
    document.getElementById("filtro-busca").addEventListener("input", function () {
      try {
        renderizar();
      } catch (erro) {
        exibirMensagem(erro.message, true);
      }
    });
    document.getElementById("btn-atualizar").addEventListener("click", function () {
      inicializar(true);
    });
    const dialogoJustificativa = document.getElementById("dialogo-justificativa");
    const formularioJustificativa = document.getElementById("form-justificativa");
    const motivoJustificativa = document.getElementById("justificativa-motivo");
    const novoMotivoControles = document.getElementById("novo-motivo-controles");
    const novoMotivoCampo = document.getElementById("novo-motivo");
    const dataInicioJustificativa = document.getElementById("justificativa-data-inicio");
    const dataFimJustificativa = document.getElementById("justificativa-data-fim");
    const escopoJustificativa = document.getElementById("justificativa-escopo");
    const aplicacaoJustificativa = document.getElementById("justificativa-aplicacao");
    const selecaoColaboradores = document.getElementById("selecao-colaboradores");
    const listaColaboradores = document.getElementById("lista-colaboradores");
    const botaoSalvarJustificativa = document.getElementById("btn-salvar-justificativa");
    const mensagemJustificativa = document.getElementById("justificativa-mensagem");
    const listaJustificativas = document.getElementById("lista-justificativas");
    const selecionadosColaboradores = function () {
      return Array.from(listaColaboradores.querySelectorAll("input:checked")).map(function (checkbox) {
        return checkbox.value;
      });
    };
    const renderizarColaboradores = function (encarregados) {
      listaColaboradores.replaceChildren();
      encarregados.slice().sort(function (a, b) {
        return a.nome.localeCompare(b.nome, "pt-BR");
      }).forEach(function (colaborador) {
        const opcao = document.createElement("label");
        opcao.className = "checklist-colaborador-opcao";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = colaborador.id;
        checkbox.addEventListener("change", function () {
          if (escopoJustificativa.value === "UM" && checkbox.checked) {
            listaColaboradores.querySelectorAll("input:checked").forEach(function (selecionado) {
              if (selecionado !== checkbox) selecionado.checked = false;
            });
          }
        });
        const nomeColaborador = document.createElement("span");
        nomeColaborador.textContent = colaborador.nome + " (" + colaborador.id + ")";
        opcao.append(checkbox, nomeColaborador);
        listaColaboradores.appendChild(opcao);
      });
    };
    const sincronizarBotaoSalvar = function () {
      const escopo = escopoJustificativa.value;
      const temColaboradores = escopo === "TODOS" || selecionadosColaboradores().length > 0;
      botaoSalvarJustificativa.disabled =
        motivoJustificativa.disabled || !motivoJustificativa.value || !temColaboradores;
    };
    const carregarJustificativas = async function () {
      listaJustificativas.replaceChildren();
      const carregando = document.createElement("p");
      carregando.textContent = "Carregando justificativas...";
      listaJustificativas.appendChild(carregando);
      try {
        const justificativas = await API.listarJustificativasChecklist();
        listaJustificativas.replaceChildren();
        if (!justificativas.length) {
          const vazio = document.createElement("p");
          vazio.textContent = "Nenhuma justificativa cadastrada.";
          listaJustificativas.appendChild(vazio);
          return;
        }

        const colaboradores = new Map(
          funcionariosEncarregados((dados && dados.encarregados) || []).map(function (colaborador) {
            return [colaborador.id, colaborador.nome];
          })
        );
        justificativas.forEach(function (justificativa) {
          const item = document.createElement("article");
          item.className = "checklist-justificativa-item";
          const informacoes = document.createElement("div");
          informacoes.className = "checklist-justificativa-info";
          const titulo = document.createElement("strong");
          titulo.textContent = justificativa.motivo || "Justificativa";
          const periodo = document.createElement("span");
          periodo.textContent = formatarData(justificativa.dataInicio) +
            (justificativa.dataFim && justificativa.dataFim !== justificativa.dataInicio
              ? " a " + formatarData(justificativa.dataFim)
              : "");
          const nomeColaborador = justificativa.colaborador === "TODOS"
            ? "Todos os colaboradores"
            : (colaboradores.get(justificativa.colaborador) || justificativa.colaborador);
          const aplicacao = String(justificativa.aplicacao || "CHECKLIST").toUpperCase();
          const destino = document.createElement("span");
          destino.textContent = nomeColaborador + " · " +
            (aplicacao === "AMBOS" ? "Check-list e APR" :
              (aplicacao === "APR" ? "Somente APR" : "Somente check-list"));
          informacoes.append(titulo, periodo, destino);

          const botaoExcluir = document.createElement("button");
          botaoExcluir.type = "button";
          botaoExcluir.className = "checklist-btn-excluir-justificativa";
          botaoExcluir.textContent = "Excluir";
          botaoExcluir.addEventListener("click", async function () {
            if (!window.confirm("Deseja excluir esta justificativa?")) return;
            botaoExcluir.disabled = true;
            try {
              await API.excluirJustificativaChecklist(justificativa.id);
              await carregarJustificativas();
              await inicializar(true);
            } catch (erro) {
              console.error("[checklist.js] Falha ao excluir justificativa:", erro);
              mensagemJustificativa.textContent = "Não foi possível excluir a justificativa. " + erro.message;
              botaoExcluir.disabled = false;
            }
          });
          item.append(informacoes, botaoExcluir);
          listaJustificativas.appendChild(item);
        });
      } catch (erro) {
        console.error("[checklist.js] Falha ao carregar justificativas:", erro);
        listaJustificativas.replaceChildren();
        const falha = document.createElement("p");
        falha.textContent = "Não foi possível carregar as justificativas. " + erro.message;
        listaJustificativas.appendChild(falha);
      }
    };
    escopoJustificativa.addEventListener("change", function () {
      selecaoColaboradores.hidden = escopoJustificativa.value === "TODOS";
      if (escopoJustificativa.value === "UM") {
        const selecionados = listaColaboradores.querySelectorAll("input:checked");
        Array.from(selecionados).slice(1).forEach(function (checkbox) {
          checkbox.checked = false;
        });
      }
      sincronizarBotaoSalvar();
    });
    listaColaboradores.addEventListener("change", sincronizarBotaoSalvar);
    motivoJustificativa.addEventListener("change", sincronizarBotaoSalvar);
    document.getElementById("btn-abrir-justificativa").addEventListener("click", async function () {
      mensagemJustificativa.textContent = "";
      novoMotivoControles.hidden = true;
      novoMotivoCampo.value = "";
      escopoJustificativa.value = "TODOS";
      selecaoColaboradores.hidden = true;
      listaColaboradores.replaceChildren();
      motivoJustificativa.replaceChildren(new Option("Carregando motivos...", ""));
      motivoJustificativa.disabled = true;
      botaoSalvarJustificativa.disabled = true;
      dialogoJustificativa.showModal();
      try {
        const [motivos, dadosCarregados] = await Promise.all([
          API.buscarMotivosAusenciaChecklist(),
          carregarDados(false)
        ]);
        dados = dadosCarregados;
        renderizarColaboradores(funcionariosEncarregados(dados.encarregados));
        await carregarJustificativas();
        motivoJustificativa.replaceChildren(new Option("Selecione o motivo", ""));
        motivos.forEach(function (motivo) {
          motivoJustificativa.add(new Option(motivo, motivo));
        });
        motivoJustificativa.disabled = motivos.length === 0;
        sincronizarBotaoSalvar();
        if (!motivos.length) {
          mensagemJustificativa.textContent = "Nenhum motivo cadastrado na aba CONFIG_AUSENCIA.";
        }
      } catch (erro) {
        console.error("[checklist.js] Falha ao carregar motivos:", erro);
        motivoJustificativa.replaceChildren(new Option("Não foi possível carregar os motivos", ""));
        mensagemJustificativa.textContent = "Não foi possível carregar os motivos da aba CONFIG_AUSENCIA. " + erro.message;
      }
    });
    document.getElementById("btn-adicionar-motivo").addEventListener("click", function () {
      novoMotivoControles.hidden = !novoMotivoControles.hidden;
      if (!novoMotivoControles.hidden) novoMotivoCampo.focus();
    });
    document.getElementById("btn-salvar-novo-motivo").addEventListener("click", async function () {
      const novoMotivo = novoMotivoCampo.value.trim();
      if (!novoMotivo) {
        mensagemJustificativa.textContent = "Digite o novo motivo.";
        novoMotivoCampo.focus();
        return;
      }

      const botaoAdicionarMotivo = document.getElementById("btn-salvar-novo-motivo");
      botaoAdicionarMotivo.disabled = true;
      mensagemJustificativa.textContent = "";
      try {
        await API.cadastrarMotivoAusenciaChecklist(novoMotivo);
        const motivos = await API.buscarMotivosAusenciaChecklist();
        motivoJustificativa.replaceChildren(new Option("Selecione o motivo", ""));
        motivos.forEach(function (motivo) {
          motivoJustificativa.add(new Option(motivo, motivo));
        });
        motivoJustificativa.value = novoMotivo;
        motivoJustificativa.disabled = false;
        sincronizarBotaoSalvar();
        novoMotivoCampo.value = "";
        novoMotivoControles.hidden = true;
        exibirMensagem("Novo motivo cadastrado na CONFIG_AUSENCIA.", false);
      } catch (erro) {
        console.error("[checklist.js] Falha ao cadastrar motivo:", erro);
        mensagemJustificativa.textContent = "Não foi possível cadastrar o motivo. " + erro.message;
      } finally {
        botaoAdicionarMotivo.disabled = false;
      }
    });
    document.getElementById("btn-cancelar-justificativa").addEventListener("click", function () {
      dialogoJustificativa.close();
    });
    dataInicioJustificativa.addEventListener("change", function () {
      dataFimJustificativa.min = dataInicioJustificativa.value;
    });
    dataFimJustificativa.addEventListener("change", function () {
      if (dataFimJustificativa.value && dataFimJustificativa.value < dataInicioJustificativa.value) {
        mensagemJustificativa.textContent = "A data final não pode ser anterior à data inicial.";
      } else {
        mensagemJustificativa.textContent = "";
      }
    });
    formularioJustificativa.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      botaoSalvarJustificativa.disabled = true;
      mensagemJustificativa.textContent = "";
      try {
        const escopo = escopoJustificativa.value;
        const colaboradores = escopo === "TODOS" ? [] : selecionadosColaboradores();
        if (escopo !== "TODOS" && !colaboradores.length) {
          throw new Error("Selecione pelo menos um colaborador.");
        }
        if (escopo === "UM" && colaboradores.length !== 1) {
          throw new Error("Selecione somente um colaborador.");
        }
        await API.cadastrarJustificativaChecklist({
          dataInicio: dataInicioJustificativa.value,
          dataFim: dataFimJustificativa.value,
          motivo: motivoJustificativa.value,
          escopo: escopo,
          colaboradores: colaboradores,
          aplicacao: aplicacaoJustificativa.value
        });
        formularioJustificativa.reset();
        dialogoJustificativa.close();
        const atualizou = await inicializar(true);
        exibirMensagem(
          atualizou
            ? "Justificativa cadastrada e aplicada ao check-list."
            : "Justificativa cadastrada, mas não foi possível atualizar o check-list. Use “Atualizar dados”.",
          !atualizou
        );
      } catch (erro) {
        console.error("[checklist.js] Falha ao cadastrar justificativa:", erro);
        mensagemJustificativa.textContent = "Não foi possível cadastrar a justificativa. " + erro.message;
      } finally {
        sincronizarBotaoSalvar();
      }
    });
    inicializar(false);
  });
})();
