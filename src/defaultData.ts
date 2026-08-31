import { DBData, Tecnologia } from "./types";

export const defaultTecnologias: Tecnologia[] = [];

export const defaultData: DBData = {
  leaderBio: {
    nome: "",
    cargo: "",
    bio: "",
    foto: "",
    localizacao: "",
    experiencia: "",
    impacto: "",
    citacao: "",
    historia: [],
    valores: [],
    timeline: []
  },
  novidades: [],
  cursos: [],
  materiais: [],
  tecnologias: [],
  auditLogs: [],
  banners: [],
  fenixPosts: [],
  moderatorLinks: [],
  ouvidoriaMessages: [],
  categoriasMateriais: ["Geral"],
  logoUrl: "",
  hiddenHomeCardIds: [],
  deletedCursoIds: [],
  deletedNovidadeIds: [],
  deletedMaterialIds: [],
  deletedBannerIds: [],
  paginaTecnologias: [],
  paginaElite: [],
  paginaBiografia: []
};
