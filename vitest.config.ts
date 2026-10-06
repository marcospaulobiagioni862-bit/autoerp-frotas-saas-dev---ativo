import { defineConfig } from 'vitest/config';

// Configuracao separada do vite.config.ts de proposito: aquele arquivo troca
// componentes por alias quando command === 'build' (substitui 15 centros
// corporativos e troca o Sidebar pelo ProductionSidebar). Teste nao deve
// herdar essas substituicoes, senao exercitaria o grafo de producao em vez do
// codigo que esta sendo editado.
export default defineConfig({
  test: {
    environment: 'node',

    // CONVENCAO: suite de verdade se chama *.spec.ts(x).
    //
    // O projeto tem ~240 arquivos sob __tests__, e NENHUM deles e suite: sao
    // scripts artesanais com assert no topo, executados por tsx atraves dos
    // scripts do package.json e do workflow. Quatro deles ja se chamam
    // *.test.ts, o que engana - foram verificados e nao tem describe nem it, e
    // alem disso sao orfaos (nem o package.json nem o workflow os chamam).
    // Por isso a convencao nova usa outro sufixo: as suites crescem sem
    // colidir com o corpo legado, e nada que funciona hoje quebra.
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],

    // Ate a primeira suite existir, o comando nao pode falhar e travar o CI.
    passWithNoTests: true,

    // Teste de servidor e de dominio toca estado de modulo; execucao
    // previsivel evita falha intermitente, que custa mais a diagnosticar do
    // que a paralelizacao economiza nesta base.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
