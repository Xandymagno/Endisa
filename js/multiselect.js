/**
 * ============================================
 *  MULTISELECT — FILTROS COM MÚLTIPLA SELEÇÃO
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
   * Monta todos os multiselects da página.
   * @param {Object}   config    - { os: [...], encarregado: [...], polo: [...] }
   * @param {Function} aoAlterar - callback disparado a cada mudança
   */
  inicializar: function (config, aoAlterar) {
    this.aoAlterar = aoAlterar;

    document.querySelectorAll(".multiselect").forEach(function (ms) {
      const chave = ms.dataset.filtro;
      const valores = config[chave] || [];

      // Começa sem nada marcado = "Todos"
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

      // Botão "Limpar": zera a seleção do filtro
      const btnLimpar = document.createElement("button");
      btnLimpar.type = "button";
      btnLimpar.className = "ms-limpar";
      btnLimpar.textContent = "✕ Limpar";
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

      // Clique dentro do menu não fecha o dropdown
      menu.addEventListener("click", function (e) {
        e.stopPropagation();
      });

      // Mudança em qualquer checkbox do menu
      menu.addEventListener("change", function (e) {
        const cb = e.target;
        if (cb.type !== "checkbox") return;

        const ehTodos = cb.parentElement.classList.contains("ms-todos");

       if (ehTodos) {
          // Comportamento original: marcado = sem filtro (todos),
          // desmarcado = limpa a seleção
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
   * Atualiza o texto do botão conforme a seleção
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
   * Atualiza as opções de um filtro (filtros em cascata),
   * mantendo apenas as seleções que ainda existem na lista.
   */
    /**
   * 🔒 Trava um filtro em um único valor (ex.: polo do usuário).
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

    // Descarta seleções que sumiram da lista (ex.: OS sem serviço no período)
    Multiselect.selecoes[chave] =
      (Multiselect.selecoes[chave] || []).filter(function (v) {
        return valores.includes(v);
      });
    const marcados = Multiselect.selecoes[chave];

    // Reconstrói os checkboxes (o item "Todos" fica)
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

    // "Todos" volta a ficar marcado quando nada está selecionado
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
   * Limpa todas as seleções (botão "Limpar filtros")
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