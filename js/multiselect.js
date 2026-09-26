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
          // "Todos" marca/desmarca a lista inteira
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