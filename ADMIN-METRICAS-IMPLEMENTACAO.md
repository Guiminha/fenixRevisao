# Atualização administrativa — métricas reais

## Situação da ativação

SQL aplicado pelo usuário e confirmado por consulta autenticada com retorno HTTP 200.
Frontend e backend compilados e versão atualizada iniciada localmente na porta 3001.
A porta 3000 está ocupada por outro projeto (AQUA), que foi preservado. Nenhuma página foi aberta.
O script cria somente tabela, índices e função para os novos relatórios, com acesso restrito ao servidor.
Não remove cadastros, conteúdos, contas, chamados ou arquivos.

## Alterações

- Cada sincronização inicia uma nova lista de logs; a lista anterior é substituída no banco.
- A comparação dos D.I.s percorre todas as páginas do banco. Uma consulta única poderia ser limitada e classificar registros existentes como novos.
- O resumo apresenta apenas novos cadastros, mudanças de situação e data/hora. Resumos antigos, produzidos antes desta correção, deixam de ser exibidos. O primeiro resumo confiável aparece após a próxima sincronização.
- Nova Visão Geral com períodos de 7, 30 e 90 dias, gráficos e exportações CSV: acessos de D.I.s, situação atual, transições, novos cadastros, downloads, cursos e treinamentos.
- Registro de Auditoria removido da interface. Registros internos de segurança não foram apagados.
- Backup e Restauração removidos do menu, páginas, rotas e rotinas automáticas. Arquivos de backup existentes permanecem privados; não foram apagados. Utilitários compartilhados de manutenção e limpeza de mídia continuam necessários ao funcionamento.
- Conexões verificadas em paralelo, com prazo máximo de 8 segundos no servidor e 12 segundos na tela. Banco, bucket, Vimeo e disponibilidade HTTPS da Nipponflex são apresentados separadamente.
- Erros da API, sincronização, verificações externas e erros não tratados de navegadores autenticados aparecem no fim da Visão Geral. Exceções enviadas pelo navegador contêm somente tipo e área, sem dados digitados ou credenciais.

## Significado dos números

- Acesso de D.I.: login concluído com sucesso. Renovar a sessão, login de admin e login de suporte não contam.
- Download: resposta de arquivo concluída pelo servidor, com status 200. Não comprova que o usuário salvou ou abriu o arquivo.
- Curso/treinamento: abertura do conteúdo na interface por D.I. autenticado. Não representa visualização completa do vídeo.
- Mudanças de situação: diferenças verificadas na sincronização, gravadas depois do lote correspondente ser atualizado.
- Situação atual: todos os D.I.s presentes no banco, inclusive códigos de situação fora de A/I/P/S/D.
- Totais são agregados no PostgreSQL, sem limitação de 1.000 eventos. Detalhes exibidos: 200 mudanças e 100 erros mais recentes do período; a interface informa esse limite.
- Os gráficos não reaproveitam números fictícios nem contadores legados. Começam com os eventos coletados a partir da ativação.
- Falhas de coleta não impedem o uso do site e geram aviso de possível incompletude no painel. O contador dessas falhas vale para o processo atual e reinicia junto com o servidor. Eventos não gravados durante indisponibilidade não são reconstruídos automaticamente.
- Erros iguais são registrados no máximo uma vez por minuto. A verificação das integrações ocorre ao abrir a página ou clicar em atualizar; não é monitoramento contínuo. A consulta da Nipponflex testa disponibilidade HTTPS; autenticação e obtenção dos cadastros são verificadas pela sincronização.

## Limpeza

Dados fictícios foram retirados do código e dos relatórios. Não foi feita exclusão ampla do banco: o alcance de “limpar dados pré-existentes” ainda precisa ser confirmado. Cadastros e conteúdo real foram preservados.

## Validação isolada

- `node tests/admin-metrics.mjs`: migração repetida, totais com mais de 1.000 eventos, períodos, situações não convencionais e bloqueio para anon/authenticated.
- `node --import tsx tests/admin-sync.mts`: duas sincronizações com 1.505 cadastros iniciais; somente uma inclusão e uma transição na primeira, nenhuma alteração na segunda; logs substituídos.
- `node --import tsx tests/admin-flow.mts`: autorização, login, cursos, treinamentos, download, falhas, remoção das rotas de backup, integrações, aviso de coleta, painel e CSV em navegador.
- `FENIX_TEST_DIST=.admin-preview` e `node --import tsx tests/support-flow.mts`: envio e resposta do suporte pelo curso, cancelamento, protocolo, erro preservando texto e bloqueio de outro D.I.
- TypeScript e compilação de produção em `.admin-preview`.

Os testes usam dados sintéticos e interceptam as integrações; não criam registros de teste no Supabase real. Após o SQL, ainda é necessário publicar a compilação e verificar as integrações reais.
