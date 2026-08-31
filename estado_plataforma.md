# Relatório de Estado Atual - Plataforma Grupo Fênix & Escola Fênix

**Data de Geração:** 26 de Julho de 2026  
**Versão:** 2.4.0  
**Ambiente:** Production / AI Studio Cloud Sandbox  

---

## 1. Visão Geral do Sistema

A **Plataforma Grupo Fênix** é um ecossistema digital integrado desenvolvido para suporte, capacitação, treinamento e mentoria de distribuidores e líderes da rede Nipponflex. O sistema combina uma interface moderna, responsiva e otimizada (Dark Theme Metálico) com uma infraestrutura robusta e segura.

---

## 2. Módulos e Funcionalidades Principais

### 2.1. Início / Dashboard
* **Hero Banner Dinâmico:** Destaques e avisos urgentes com contadores estatísticos e atalhos rápidos.
* **Seção de Novidades & Comunicados:** Feed interativo com suporte a categorias, anexos e links de direcionamento.
* **Acesso Rápido:** Atalhos diretos para Tecnologias, Escola Fênix e Biblioteca de Materiais.

### 2.2. Grupo Fênix (Lideranças)
* **Galeria de Líderes:** Exibição das lideranças com graduação, foto, bio completa e redes sociais.
* **Modal de Detalhes:** Visualização expandida da trajetória e visão dos líderes.
* **Gestão de Perfil:** Atualização contínua via Painel Administrativo.

### 2.3. Tecnologias Científicas Nipponflex
* **Módulo Educacional de Tecnologias:** Apresentação das biotecnologias (FIR Power, Magnetoterapia, Íons Negativos, etc.).
* **Aprimoramento Visual:** Ícone de representação neurológica/tecnológica (Brain/Cérebro) na navegação lateral.
* **Cartões Explicativos:** Guias para leigos, argumentos de vendas e comprovações científicas.

### 2.4. Escola Fênix (Academia de Cursos)
* **Catálogo de Cursos Integrado:** Filtros por categoria (Biohacking, Vendas, Liderança, Produto).
* **Estrutura por Módulos e Aulas:** Leitor de vídeo aulas responsivo com controle de progresso individual por usuário.
* **Cards com Instrutores/Professores:**
  * Foto de perfil do professor (suporte a upload direto de arquivo).
  * Nome do professor e especialidade.
  * Bio do instrutor no cabeçalho do curso.

### 2.5. Biblioteca de Conteúdos & Materiais
* **Repositório de Arquivos:** PDFs, lâminas de apresentação, áudios e vídeos de treinamento.
* **Downloads Seguros:** Download direto e categorização inteligente por tipo de arquivo.

### 2.6. Painel Administrativo (`/admin`)
* **Gestão do Perfil do Professor:** Formulário com campo exclusivo para upload da foto do professor (sem dependência de URLs manuais).
* **Gerenciamento de Cursos & Módulos:** Criação, edição e exclusão com atualização em tempo real na Escola Fênix.
* **Gestão de Novidades e Materiais:** Publicação instantânea de comunicados e documentos para a rede.
* **Gerenciamento de Lideranças:** Controle dos perfis dos líderes exibidos no Grupo Fênix.

---

## 3. Arquitetura Técnica e Segurança

* **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Motion (Framer Motion).
* **Backend:** Express.js (Node.js) em TypeScript com suporte a Vite Middleware em desenvolvimento e bundler CJS em produção.
* **Banco de Dados:** Supabase (PostgreSQL) com sincronização em memória/JSON fallback resiliente.
* **Autenticação:** Sistema JWT com cookies HTTP-Only, rotação de Refresh Tokens e proteção de rotas restritas.
* **Serviço de Arquivos:** Direct Uploads para o diretório de arquivos da aplicação.

---

## 4. Histórico Recente de Atualizações

1. **Remoção do campo de URL manual e padronização do Upload de Foto do Professor:**
   - O cadastro de professores agora aceita exclusivamente upload direto de arquivos de imagem (PNG, JPEG, WebP).
2. **Ícone de Navegação Atualizado:**
   - O item de navegação "Tecnologias" na barra lateral utiliza agora o ícone de Cérebro (`Brain`), representando neurociência e bioenergética.
3. **Consolidação de Dados & Sincronização:**
   - Tratamento de duplicação e merge dos dados do professor no banco de dados e sincronização no estado global da aplicação.

---

*Documento gerado automaticamente pelo sistema Grupo Fênix.*
