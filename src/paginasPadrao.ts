import type { PaginaBloco } from "./types";

// Conteúdo padrão das páginas institucionais editáveis.
// As views (Grupo Fênix / Tecnologias / Elite Milionária) usam estes valores
// enquanto o admin não salvar conteúdo próprio (configs `paginaBiografia`,
// `paginaTecnologias` e `paginaElite` no Supabase). Todas as 3 páginas são
// editáveis na aba "Páginas" da área administrativa (PaginaEditor).

export const PAGINA_TECNOLOGIAS_PADRAO: PaginaBloco[] = [
  {
    id: "tec-banner",
    tipo: "banner",
    ativo: true,
    ordem: 0,
    campos: {
      badge: "Ciência & Exclusividade Nipponflex",
      titulo: "Tecnologias Nipponflex — ",
      tituloDestaque: "A ciência do bem-estar em cada detalhe",
      textos: [
        "O sono reparador e o equilíbrio corporal são pilares fundamentais para uma vida longa e repleta de bem-estar. Nossos sistemas científicos integram o ápice da engenharia biomédica e da tecnologia bioenergética, desenvolvidas em parceria exclusiva com o renomado cientista japonês Dr. Toshio Komuro. Descubra como cada elemento foi minuciosamente desenvolvido para transformar suas noites e elevar o seu bem-estar diário.",
        "Patenteado em mais de 40 países",
        "Estudos científicos publicados mundialmente",
        "Rigor biomédico e ergonomia avançada"
      ]
    }
  },
  {
    id: "tec-hero",
    tipo: "hero_header",
    ativo: true,
    ordem: 1,
    campos: {
      icone: "atom",
      cor: "rosa",
      eyebrow: "Energia & Vitalidade Celular",
      titulo: "Tecnologias Bioenergéticas",
      textos: [
        "Combinações exclusivas de física quântica e minerais nobres que estimulam a oxigenação, a renovação celular e o equilíbrio do organismo."
      ]
    }
  },
  {
    id: "tec-fir",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 2,
    campos: {
      icone: "flame",
      cor: "amber",
      eyebrow: "Ondas de 4 a 16 Mícrons",
      titulo: "FIR Power®",
      imagem: "/uploads/tec_bio_vitality.jpg",
      imagemAlt: "Infravermelho longo e ondas de energia",
      badge: "Patente em 27 Países",
      textos: [
        "A poderosa tecnologia FIR Power tem a capacidade de absorver e armazenar os elétrons provenientes de ondas eletromagnéticas irradiadas pela luz ou o calor do seu corpo, emitindo então frequência de ondas de 4 a 16 mícrons e trilhões de vibrações por segundo.",
        "Essa ação quebra as macromoléculas de água corporal, liberando as vitaminas, proteínas e sais minerais para uma melhor e mais rápida absorção celular."
      ],
      destaqueTitulo: "Ciência Mundialmente Reconhecida:",
      destaqueTexto: "Exclusivamente fornecida à Nipponflex pelo cientista japonês Dr. Toshio Komuro, que possui patentes e estudos publicados em 27 países. As tecnologias FIR Bioceramic® e FIR NG® estão presentes no baixo relevo dos aparelhos e travesseiros."
    }
  },
  {
    id: "tec-ions",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 3,
    campos: {
      icone: "sparkles",
      cor: "cyan",
      eyebrow: "Desenvolvimento Dr. Toshio Komuro",
      titulo: "Íon Balls®",
      imagem: "/uploads/tec_far_infrared.jpg",
      imagemAlt: "Minerais raros e íons da natureza",
      badge: "Íons Negativos Puros",
      textos: [
        "Tecnologia desenvolvida pelo cientista japonês Dr. Toshio Komuro e fornecida com exclusividade para a Nipponflex. As esferas de Íon Balls são compostas por minerais raríssimos e de altíssima pureza encontrados em meteoritos ou na crosta profunda de áreas vulcânicas.",
        "Os Íons Balls são esferas minerais que liberam íons negativos — pequenas moléculas carregadas de elétrons presentes em abundância na natureza pura."
      ],
      destaqueTitulo: "Benefício de Oxigenação:",
      destaqueTexto: "Os íons negativos ajudam na troca do oxigênio pelo gás carbônico no nosso organismo, melhorando a oxigenação sanguínea e promovendo tranquilidade e sensação de bem-estar."
    }
  },
  {
    id: "tec-mfp",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 4,
    campos: {
      icone: "zap",
      cor: "rose",
      eyebrow: "Fusão Inédita Patenteada",
      titulo: "MFP – Magnetic FIR Power®",
      imagem: "/uploads/tec_scientific_study.jpg",
      imagemAlt: "Fusão Magnética e FIR Power",
      badge: "Patente em +40 Países",
      textos: [
        "MFP® é uma tecnologia inédita desenvolvida pela Nipponflex junto com o Dr. Toshio Komuro, resultado da fusão do FIR Power e magnetos em uma única pastilha exclusiva."
      ],
      destaqueTitulo: "Sinergia Perfeita:",
      destaqueTexto: "Nesta pastilha, o FIR Power potencializa a eficiência do campo magnético ideal para o organismo, enquanto a energia magnética potencializa o FIR Power, gerando ondas de 4 a 16 mícrons e trilhões de vibrações por segundo.",
      notaTexto: "Tecnologia patenteada em mais de 40 países."
    }
  },
  {
    id: "tec-magnetos",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 5,
    campos: {
      icone: "activity",
      cor: "indigo",
      eyebrow: "Magnetoterapia Natural",
      titulo: "Magnetos",
      imagem: "/uploads/tec_fir_power.jpg",
      imagemAlt: "Energia Magnética Ferrite de Bário",
      badge: "~800 Gauss",
      textos: [
        "Ímãs de Ferrite de Bário aplicados em pastilhas que emitem energia magnética com intensidade constante de aproximadamente 800 Gauss.",
        "Estes magnetos são minuciosamente posicionados em pontos específicos do baixo relevo do Rabatan®, auxiliando na criação de um campo magnético equilibrado que simula as forças benéficas da Terra."
      ]
    }
  },
  {
    id: "tec-rabatan",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 6,
    campos: {
      icone: "waves",
      cor: "rosa",
      eyebrow: "Perfilado Vulcanizado Hi-Tech",
      titulo: "Rabatan®",
      imagem: "/uploads/tec_ion_balls.jpg",
      imagemAlt: "Superfície perfilada Rabatan",
      badge: "Automassagem & Acupressão",
      textos: [
        "O Rabatan® que compõe a superfície superior dos aparelhos Nipponflex é um perfilado Hi Tech de poliuretano, tratado com produtos especiais e vulcanizado a uma temperatura de aproximadamente 180° C. Possui milhares de pontos de acupressão enrijecidos que imitam a ponta dos dedos de um massagista, proporcionando uma automassagem relaxante."
      ],
      destaqueTitulo: "Suporte Bioenergético:",
      destaqueTexto: "No baixo relevo do Rabatan® estão aplicadas as pastilhas com as energias FIR Power Bioceramic, FIR Power NG, Magnetos, MFP - Magnetic FIR Power e Íon Balls, garantindo que o corpo receba os estímulos bioenergéticos durante o sono."
    }
  },
  {
    id: "tec-cta",
    tipo: "cta",
    ativo: true,
    ordem: 7,
    campos: {
      badge: "Faça Parte do Grupo Fênix",
      titulo: "Pronto para transformar sua vida e vivenciar essa tecnologia de perto?",
      textos: [
        "Junte-se ao Grupo Fênix e venha fazer parte de uma comunidade exclusiva focada em saúde, alta performance, bem-estar e crescimento extraordinário."
      ],
      botaoTexto: "Quero fazer parte!"
    }
  }
];

export const PAGINA_ELITE_PADRAO: PaginaBloco[] = [
  {
    id: "elite-hero-banner",
    tipo: "hero_banner",
    ativo: true,
    ordem: 0,
    campos: {
      badge: "Elite Milionária • Grupo Fênix",
      titulo: "CONSTRUA O SEU",
      tituloDestaque: "IMPÉRIO!",
      imagem: "/uploads/elite_milionaria_hero_1786195042546.jpg",
      imagemAlt: "Elite Milionária Banner"
    }
  },
  {
    id: "elite-intro",
    tipo: "hero_header",
    ativo: true,
    ordem: 1,
    campos: {
      icone: "sparkles",
      cor: "amber",
      eyebrow: "A Verdade Sobre o Sucesso",
      titulo: "Você não vai ficar rico economizando.",
      textos: [
        "O que realmente te separa de um faturamento de R$ 1.000.000,00 por ano não é a crise, não é o mercado e muito menos a sorte. É a sua insistência em permanecer na zona de conforto."
      ]
    }
  },
  {
    id: "elite-metodo",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 2,
    campos: {
      icone: "zap",
      cor: "amber",
      titulo: "Método Testado e Aprovado!",
      textos: [
        "Todo mundo sonha em ser milionário, mas quase ninguém tem a coragem de fazer o que é necessário para chegar lá. Nós não vendemos ilusões e não acreditamos em fórmulas mágicas."
      ]
    }
  },
  {
    id: "elite-estrutura",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 3,
    campos: {
      icone: "activity",
      cor: "amber",
      titulo: "Estrutura, método e cobrança implacável",
      textos: [
        "Nós entregamos a estrutura, o método e a cobrança implacável necessária para transformar empreendedores comuns em feras de mercado. A nossa meta é fria e calculada: fazer você faturar sete dígitos por ano."
      ]
    }
  },
  {
    id: "elite-img-1",
    tipo: "imagem",
    ativo: true,
    ordem: 4,
    campos: {
      imagem: "/uploads/elite_mindset_growth_1786195055764.jpg",
      imagemAlt: "Estratégia e Alta Performance Elite Milionária",
      legenda: "Ambiente de alta performance, estratégia de negócios e acompanhamento contínuo."
    }
  },
  {
    id: "elite-clube",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 5,
    campos: {
      icone: "award",
      cor: "amber",
      titulo: "Não é um clube de sortudos",
      textos: [
        "A Elite Milionária do Grupo Fênix não é um clube de sortudos. É o salão daqueles que decidiram que a mediocridade não era uma opção. São pessoas que estavam exatamente no seu lugar, com as mesmas dúvidas e os mesmos medos, mas que cruzaram a linha e construíram um império.",
        "Eles não tinham superpoderes, apenas a determinação de não aceitar um destino ordinário."
      ]
    }
  },
  {
    id: "elite-ambicao",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 6,
    campos: {
      icone: "flame",
      cor: "amber",
      titulo: "Sua ambição grita mais alto?",
      textos: [
        "Você ainda acha que ser milionário não é para você? Ótimo. Continue acreditando nisso e continue ganhando o mesmo salário até o fim da vida.",
        "Mas, se a sua ambição grita mais alto que o seu medo e a leitura disso deu um nó no seu estômago, é porque você sabe que veio ao mundo para algo maior."
      ]
    }
  },
  {
    id: "elite-destaque-1",
    tipo: "destaque",
    ativo: true,
    ordem: 7,
    campos: {
      destaqueTitulo: "É possível. É real.",
      destaqueTexto: "E está acontecendo todos os dias com gente igual a você."
    }
  },
  {
    id: "elite-img-2",
    tipo: "imagem",
    ativo: true,
    ordem: 8,
    campos: {
      imagem: "/uploads/elite_empire_building_1786195067603.jpg",
      imagemAlt: "Construção de Império Elite Milionária",
      legenda: "O destino é construído por decisões corajosas tomadas no presente."
    }
  },
  {
    id: "elite-valores",
    tipo: "lista",
    ativo: true,
    ordem: 9,
    campos: {
      eyebrow: "Caminho",
      titulo: "Para quem está disposto a mudar",
      itens: [
        "O Grupo Fênix não está atrás de curiosos. Estamos caçando quem está disposto a sacrificar o que é hoje para se tornar quem precisa ser amanhã.",
        "A próxima vaga na Elite Milionária tem o seu nome escrito, mas ela não será entregue de bandeja. Ela será conquistada por quem der o primeiro passo agora."
      ]
    }
  },
  {
    id: "elite-destaque-final",
    tipo: "destaque",
    ativo: true,
    ordem: 10,
    campos: {
      destaqueTitulo: "Pare de adiar a vida que você merece.",
      destaqueTexto: "O amanhã é a desculpa favorita dos fracassados. Dê o sinal de partida, entre em contato com a nossa equipe e venha provar do que você realmente é capaz. A Elite está de portas abertas, mas apenas para quem tiver a ousadia de entrar."
    }
  },
  {
    id: "elite-cta",
    tipo: "cta",
    ativo: true,
    ordem: 11,
    campos: {
      badge: "Elite Milionária",
      titulo: "A próxima vaga na Elite Milionária tem o seu nome escrito.",
      textos: [
        "Estamos caçando quem está disposto a sacrificar o que é hoje para se tornar quem precisa ser amanhã.",
        "Clique para preencher o formulário e enviar sua mensagem para nossa equipe."
      ],
      botaoTexto: "FAZER PARTE DA ELITE MILIONÁRIA"
    }
  }
];

export const PAGINA_BIOGRAFIA_PADRAO: PaginaBloco[] = [
  {
    id: "bio-hero-banner",
    tipo: "hero_banner",
    ativo: true,
    ordem: 0,
    campos: {
      badge: "Grupo Fênix",
      imagem: "/uploads/grupo_fenix_lider_bio.jpg",
      imagemAlt: "Banner Grupo Fênix"
    }
  },
  {
    id: "bio-intro",
    tipo: "hero_header",
    ativo: true,
    ordem: 1,
    campos: {
      icone: "flame",
      cor: "rosa",
      eyebrow: "Oportunidade de Negócio",
      titulo: "Empreenda com o Grupo Fenix",
      textos: [
        "Liberdade financeira com tecnologia de ponta"
      ]
    }
  },
  {
    id: "bio-narrativa-1",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 2,
    campos: {
      icone: "rocket",
      cor: "rosa",
      titulo: "O modelo dos seus sonhos",
      textos: [
        "Imagine construir um negócio próprio sem os custos e riscos de uma operação tradicional. Sem aluguel, sem estoque parado, sem equipe fixa. Apenas você, produtos de tecnologia comprovada e um sistema de suporte que te acompanha em cada etapa.",
        "É isso que o Grupo Fenix oferece: um caminho real de empreendedorismo no mercado de biohacking e bem-estar integrativo, um dos segmentos que mais cresce no mundo."
      ]
    }
  },
  {
    id: "bio-narrativa-2",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 3,
    campos: {
      icone: "shield",
      cor: "amber",
      titulo: "Um modelo que funciona e já está validado",
      textos: [
        "Há mais de 30 anos, milhares de pessoas transformaram suas vidas com esse sistema. Hoje, somos uma rede presente em mais de 10 países, com um ecossistema completo de treinamento e capacitação que entrega resultados concretos.",
        "Nosso DNA é o empreendedorismo de propósito: gerar renda enquanto impactamos positivamente a vida das pessoas. Mais do que vender, formamos líderes."
      ]
    }
  },
  {
    id: "bio-apoio",
    tipo: "lista",
    ativo: true,
    ordem: 4,
    campos: {
      eyebrow: "Suporte Completo",
      titulo: "O que você tem ao seu lado",
      itens: [
        "Produtos exclusivos com tecnologia bioenergética de altíssima performance",
        "Plano de carreira claro, cada meta alcançada abre novas graduações e ganhos",
        "Eventos presenciais para imersão e networking",
        "Comunidade engajada que cresce junto"
      ]
    }
  },
  {
    id: "bio-diferenciais-head",
    tipo: "hero_header",
    ativo: true,
    ordem: 5,
    campos: {
      icone: "activity",
      cor: "amber",
      eyebrow: "Diferenciais",
      titulo: "Por que esse modelo é diferente?",
      textos: [
        "Elegemos trabalhar com um sistema que une três elementos difíceis de encontrar juntos:"
      ]
    }
  },
  {
    id: "bio-diferenciais",
    tipo: "lista",
    ativo: true,
    ordem: 6,
    campos: {
      itens: [
        "Baixo Risco — Investimento inicial acessível, sem os altos custos fixos de negócios tradicionais.",
        "Alta Rentabilidade — Margens atrativas e múltiplas fontes de renda escaláveis.",
        "Liberdade Total — Você decide onde, quando e como trabalhar, com total flexibilidade."
      ]
    }
  },
  {
    id: "bio-sem-franquia",
    tipo: "destaque",
    ativo: true,
    ordem: 7,
    campos: {
      destaqueTitulo: "",
      destaqueTexto: "Não há franquia para pagar, nem metas impossíveis. O crescimento é sustentável e o reconhecimento vem do seu esforço real."
    }
  },
  {
    id: "bio-produtos-head",
    tipo: "hero_header",
    ativo: true,
    ordem: 8,
    campos: {
      icone: "atom",
      cor: "rosa",
      eyebrow: "Tecnologia Aplicada",
      titulo: "Produtos que transformam",
      textos: [
        "Dispomos de duas frentes de soluções que atendem diferentes momentos do dia:"
      ]
    }
  },
  {
    id: "bio-produto-dia",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 9,
    campos: {
      icone: "zap",
      cor: "amber",
      eyebrow: "Dia",
      titulo: "Para o movimento e a energia do dia",
      textos: [
        "Braceletes, faixas, patches e squeeze alcalinizado. Tecnologia que acompanha sua rotina, trazendo equilíbrio, performance e hidratação terapêutica onde você estiver."
      ]
    }
  },
  {
    id: "bio-produto-noite",
    tipo: "card_tecnologia",
    ativo: true,
    ordem: 10,
    campos: {
      icone: "moon",
      cor: "indigo",
      eyebrow: "Noite",
      titulo: "Para o descanso e a regeneração",
      textos: [
        "Palmilhas bioenergéticas, travesseiros com tecnologia FIR e aparelho reparador do sono. Soluções que cuidam do seu corpo enquanto você dorme, respeitando o ritmo natural da sua biologia."
      ]
    }
  },
  {
    id: "bio-tecnologia-global",
    tipo: "destaque",
    ativo: true,
    ordem: 11,
    campos: {
      destaqueTitulo: "Tecnologia Global Exclusiva",
      destaqueTexto: "Tudo com a tecnologia Nipponflex, referência mundial desenvolvida pelo Dr. Toshio Komuro, com patentes registradas em mais de 40 países."
    }
  },
  {
    id: "bio-faq",
    tipo: "faq",
    ativo: true,
    ordem: 12,
    campos: {
      eyebrow: "FAQ",
      titulo: "Dúvidas frequentes",
      faq: [
        { q: "Preciso de experiência prévia?", a: "Não. Nossa estrutura de mentoria e a plataforma EAD entregam toda a formação necessária, do básico ao avançado." },
        { q: "Preciso de CNPJ para começar?", a: "Não. Você inicia como Consultor Pessoa Física. O CNPJ só é necessário se quiser evoluir para o modelo de Distribuidor com loja virtual." },
        { q: "E se eu quiser formar equipe?", a: "Pode. Nosso modelo recompensa quem desenvolve líderes. Quanto mais você apoia e capacita sua rede, maiores são suas bonificações." },
        { q: "Qual o investimento inicial?", a: "Acessível. Com poucos pontos de venda você já tem acesso a descontos, produtos e começa a evoluir no plano de carreira." },
        { q: "Meu cadastro tem validade?", a: "É vitalício. Para manter comissionamentos e benefícios ativos, basta cumprir a movimentação mínima mensal do plano de carreira." },
        { q: "Posso trabalhar de qualquer lugar?", a: "Sim. Sem loja física e com logística integrada, você opera de onde estiver. Flexibilidade geográfica e de horários é um dos pilares do modelo." }
      ]
    }
  },
  {
    id: "bio-cta",
    tipo: "cta",
    ativo: true,
    ordem: 13,
    campos: {
      badge: "Grupo Fênix",
      titulo: "Sua jornada começa agora",
      textos: [
        "Não existe momento perfeito. Existe o momento em que você decide agir.",
        "Se você busca liberdade, propósito e um negócio com impacto real, o Grupo Fenix é o lugar certo para começar."
      ],
      botaoTexto: "Quero fazer parte!"
    }
  }
];