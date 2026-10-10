// gerar-contexto.js — consolida o projeto em um único arquivo de contexto
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const ARQUIVO_SAIDA = path.join(RAIZ, 'CONTEXTO-PROJETO.txt');

// Extensões que fazem sentido para leitura do projeto
const EXTENSOES = ['.html', '.css', '.js', '.json', '.md', '.gs'];

// Pastas/pasta-arquivos a ignorar (ajuste conforme seu projeto)
const IGNORAR = ['node_modules', '.git', 'dist', 'build', 'assets', 'fonts', 'img', 'imagens', '.vscode'];

function percorrer(dir, lista = []) {
  for (const item of fs.readdirSync(dir)) {
    if (IGNORAR.includes(item)) continue;
    const caminho = path.join(dir, item);
    const stat = fs.statSync(caminho);
    if (stat.isDirectory()) {
      percorrer(caminho, lista);
    } else if (EXTENSOES.includes(path.extname(item))) {
      lista.push(caminho);
    }
  }
  return lista;
}

const arquivos = percorrer(RAIZ).filter(a => a !== ARQUIVO_SAIDA);

let conteudo = `# CONTEXTO DO PROJETO — Dashboard Gestão de Obras\n\n`;
conteudo += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n\n`;
conteudo += `## ESTRUTURA DE PASTAS\n\`\`\`\n`;

// Árvore simplificada de pastas/arquivos
function arvore(dir, prefixo = '') {
  const itens = fs.readdirSync(dir).filter(i => !IGNORAR.includes(i));
  itens.forEach((item, i) => {
    const ehUltimo = i === itens.length - 1;
    const caminho = path.join(dir, item);
    const ehPasta = fs.statSync(caminho).isDirectory();
    conteudo += `${prefixo}${ehUltimo ? '└── ' : '├── '}${item}${ehPasta ? '/' : ''}\n`;
    if (ehPasta) arvore(caminho, prefixo + (ehUltimo ? '    ' : '│   '));
  });
}
arvore(RAIZ);
conteudo += `\`\`\`\n\n## CONTEÚDO DOS ARQUIVOS\n`;

for (const arquivo of arquivos) {
  const relativo = path.relative(RAIZ, arquivo);
  const ext = path.extname(arquivo).slice(1);
  conteudo += `\n---\n### 📄 ${relativo}\n\`\`\`${ext}\n`;
  conteudo += fs.readFileSync(arquivo, 'utf8');
  conteudo += `\n\`\`\`\n`;
}

fs.writeFileSync(ARQUIVO_SAIDA, conteudo, 'utf8');
console.log(`✅ Contexto gerado: CONTEXTO-PROJETO.txt (${arquivos.length} arquivos)`);