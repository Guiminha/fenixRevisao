# Suporte dos cursos — implementação de 19/09/2026

## Alterações

- O bloco abaixo da playlist abre um modal com Assunto, Mensagem, Enviar e Cancelar.
- Identidade do remetente vem da sessão D.I.; não há campo de e-mail ou anexos no modal.
- Assunto e mensagem obrigatórios, limites de 200 e 5.000 caracteres.
- Envio impede cliques duplicados. Erros preservam o texto; sucesso informa protocolo.
- Cada chamado é uma linha de `fenix_support_tickets`, com protocolo gerado por sequência.
- Cada mensagem é uma linha de `fenix_support_messages`, vinculada ao chamado.
- Os campos da conversa e os anexos são preservados. Os metadados usam JSON por
  registro; a coleção inteira de chamados não é mais regravada.
- Transações tornam atômica a criação do chamado com sua primeira mensagem.
- Mensagens e alterações de situação bloqueiam somente a linha do respectivo
  chamado durante a transação. A inclusão de mensagem é independente das demais.
- As rotas existentes mantêm autenticação, propriedade, caixa de suporte e eventos
  de atualização. As tabelas/funções só são acessíveis pelo servidor (`service_role`).
- Backups usam a conversa atual das tabelas, no campo de snapshot compatível
  `supportTickets`; restauração direciona esse snapshot às tabelas novas, em transação.
  Restaurar em modo mesclado preserva chamados já existentes e suas mensagens novas.

## Ativação no Supabase

Atualização: o usuário confirmou o SQL por captura com chamados=0, mensagens=0 e
migracao_aplicada=1. Backend atualizado reiniciado. Leitura real de
fenix_support_action(list) aprovada, com zero chamados/mensagens. Home HTTP 200,
API pública retornando 74 cursos e 5 banners. Não foi criado chamado fictício no
banco real; envio e resposta foram validados anteriormente no ambiente isolado.
As instruções abaixo registram a sequência da implantação.

1. Fazer backup do banco e pausar atendimentos durante a troca.
2. Executar `supabase-suporte-registros.sql` no SQL Editor, manualmente.
3. Verificar `migracao_aplicada = 1` e os totais de chamados e mensagens.
4. Reiniciar o backend compilado e verificar a conexão às funções novas.
5. Confirmar no ambiente real a abertura, resposta e leitura pelo próprio D.I.

O código foi compilado e o SQL remoto foi executado pelo usuário. As operações
novas de suporte dependem das tabelas e funções. O processo antigo foi encerrado
e substituído pelo backend novo após a confirmação da migração.

A migração é transacional e reexecutável. Conserva o JSON antigo em `config` como
cópia de recuperação, sem voltar a utilizá-lo para leitura ou escrita do suporte.
Um gatilho recusa gravações legadas para evitar que processos antigos confirmem
mensagens que a versão nova não enxergaria. Conflitos de IDs/protocolos ou estrutura
legada inválida abortam a transação, sem descartar silenciosamente registros.
Não reverter apenas o código após migrar: isso requer uma migração de retorno
planejada que preserve as mensagens criadas nas tabelas novas.

## Validação realizada

- Compilação completa do frontend/backend e TypeScript: aprovados.
- PostgreSQL local (PGlite): SQL integral aplicado e reaplicado, preservação do
  histórico/anexos, 25 chamados com protocolos únicos, 30 mensagens adicionais,
  controle de propriedade, encerramento, reabertura, resposta do suporte,
  rollback da criação parcial, backup/restauração e bloqueio de anon/authenticated.
- Os pedidos foram submetidos em paralelo ao banco local. PGlite serializa o
  processamento na instância; não foi um teste de múltiplas conexões contra o
  Supabase real. A proteção entre conexões utiliza transações e FOR UPDATE no SQL.
- Edge automatizado + Express real + banco local: cancelar, validação, falha de
  gravação com texto preservado, envio com protocolo, chegada ao suporte, resposta
  e recusa de leitura por outro D.I. Sem erros de JavaScript na página.
- Não houve envio de chamados de teste, alteração de RLS ou gravação no Supabase real.

## Arquivos de teste e recuperação

- `tests/support-records.mjs`: valida o SQL em PostgreSQL local.
- `tests/support-flow.mts`: valida modal, API e integração com banco local.
- `.support-test-runtime/`: dependência isolada de teste, não usada pelo site.
- `backup-suporte-registros-20260919.zip`: cópia dos arquivos principais antes da alteração.

Para reproduzir:

```powershell
node tests/support-records.mjs
node --import tsx tests/support-flow.mts
```

Os testes pressupõem o build atualizado, Edge instalado e a dependência PGlite
em `.support-test-runtime`. A pasta temporária de dependências pode ser removida
sem afetar o site; será necessária novamente para repetir os testes de banco.
