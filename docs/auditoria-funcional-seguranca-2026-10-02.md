# Auditoria funcional e de segurança — 02/10/2026

## Resultado

Os cenários executados passaram após as correções abaixo. Isso não certifica ausência de vulnerabilidades. A auditoria foi realizada no ambiente local; produção, infraestrutura de hospedagem e resistência a DDoS distribuído não foram testadas.

## Falhas reproduzidas e corrigidas

1. **Acesso indevido a arquivos internos da Nipponflex — alto impacto.** Um D.I. autenticado, conhecendo a chave do arquivo, recebia HTTP 200 nas rotas de mídia para arquivos em `nipponflex/`, incluindo backups da base anterior. A família inteira agora é bloqueada nas rotas comuns de preview, stream e download. Reprodução com arquivo sintético antes da correção: 200; depois: 404. Nenhum arquivo real foi baixado para explorar a falha. Não há evidência nesta auditoria de exploração anterior.
2. **Presença administrativa e de suporte bloqueada pelo isolamento de hosts.** `/api/auth/presence` recebia 403 nesses subdomínios. A rota entrou na lista permitida, mantendo a validação da sessão. Agora retorna 204 para sessão válida nos dois hosts. Isso explica uma falha concreta na manutenção de presença, mas não prova a causa exata de cada logout anteriormente relatado.
3. **Dependências vulneráveis.** Atualizados Nodemailer para 10.0.13 e DOMPurify para a versão corrigida resolvida pelo lockfile. `npm audit` passou de dois pacotes afetados (um alto e um baixo) para zero alertas conhecidos. SMTP externo não foi exercitado; o sistema mantém essa integração inativa.
4. **Nome de download com acentos.** O PDF “Folder público.pdf” chegava como “Folder_”. O cabeçalho agora informa o nome UTF-8 e um nome alternativo ASCII. O teste confirmou nome completo e conteúdo recebido.

## Testes de ataque e autorização

- 54 rotas administrativas testadas sem sessão e com sessão de D.I.: acesso recusado em ambas as condições (108 verificações).
- JWT com algoritmo `none` e papel administrativo forjado: recusado.
- Reutilização de cookie após logout: recusada.
- Requisição com origem externa (CSRF): recusada.
- Entradas SQL e objetos no campo D.I.: rejeitados antes da consulta de identidade.
- Força bruta D.I.: bloqueio após os erros e 60 tentativas subsequentes recusadas, inclusive trocando `X-Forwarded-For`.
- Força bruta administrativa: bloqueio temporário confirmado.
- Teste do SQL real em PostgreSQL isolado: 5 erros/30 minutos, insistência/24 horas, honeypot/24 horas, expiração e execução restrita aos papéis autorizados.
- Pedidos paralelos: reservas impedem ultrapassar o limite de validações D.I.; compartilhamento de consultas simultâneas de metadados de mídia verificado.
- Arquivos internos, vídeos de curso sem sessão, caminhos com travessia, codificação dupla e bytes nulos: recusados.
- Upload SVG executável: recusado.
- HTML malicioso no título de material: exibido como texto, sem executar código no navegador.
- Cookies de produção: Secure, HttpOnly e SameSite=Strict; política CSP verificada.
- 29 arquivos do frontend compilado examinados: nenhum valor das credenciais de servidor verificadas encontrado.

Os ataques ocorreram em instância isolada do servidor com contas e arquivos fictícios. Não foi feito ataque de volume contra Supabase ou Nipponflex nem foram bloqueados IPs reais na base.

## Verificações no Supabase real, somente leitura

- Bucket `armazenamento`: privado.
- Visitante tentando ler `dis_fenix`, `fenix_di_login_blocks`, `audit_logs` e `fenix_support_tickets`: HTTP 401, nenhum registro acessível.
- Consulta anônima das configurações privadas selecionadas: nenhuma linha retornada.
- Nenhuma política, permissão ou cadastro real foi alterado nesta auditoria.

## Funcionalidade

Passaram os testes de navegação, links diretos, atualização, voltar/avançar, subdomínios, login, cursos, materiais e download, painel administrativo, suporte com envio/resposta e proteção contra leitura por outro D.I., sincronização incremental com falhas simuladas, sessões em múltiplas abas, logout e recuperação de resposta antiga.

Seis páginas públicas foram abertas em 390px e 1440px, sem transbordamento horizontal ou erro JavaScript. Também passaram os testes de imagens, capas Vimeo com respostas controladas, compressão, diagnóstico, TypeScript e compilação. Reprodução de todos os vídeos reais, cada arquivo do acervo, SMTP externo e todos os estados possíveis não foram verificados individualmente.

## Pendências e limites

- **HTTPS Nipponflex:** a validação estrita do certificado falhou com `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. O conector existente usa `rejectUnauthorized: false`. Isso deixa de verificar a autenticidade do servidor remoto e continua sendo um risco. É necessário obter da Nipponflex uma cadeia de certificados válida/completa (ou a cadeia de confiança oficial necessária para Node), validar novamente e então reativar a verificação. Nenhuma credencial foi enviada no teste TLS e a exceção existente não foi ampliada.
- **Código D.I. como única credencial:** os bloqueios funcionam, mas um código curto e numérico não oferece a mesma proteção de senha e segundo fator. Ataques distribuídos entre muitos IPs não são eliminados pelo limite por IP. Uma autenticação adicional exige definição de fluxo com os usuários.
- **Implantação:** as correções estão no ambiente local e o servidor foi reiniciado na porta 3001. Ainda precisam ser publicadas no ambiente de produção. Não há novo SQL para executar.
- **DDoS:** limites da aplicação foram testados de forma controlada. Não foi realizado teste de saturação da rede/hospedagem, nem foi adicionada Cloudflare.

## Reprodução

Testes principais adicionados: `tests/security-audit.mts`, `tests/di-login-database.mjs` e `tests/public-security-browser.mjs`. Os demais testes existentes foram executados conforme seu escopo. Testes de navegador usam Chromium do Playwright; os testes que acessam o site local esperam a porta 3001.
