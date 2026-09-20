import { useStore } from "./store";
import type { ViewType } from "./types";

const paths: Partial<Record<ViewType, string>> = {
  inicio: "/",
  "grupo-fenix": "/grupo-fenix",
  "fenix-social": "/fenix-social",
  tecnologias: "/tecnologias",
  "elite-milionario": "/elite-milionaria",
  "escola-fenix": "/escola-fenix",
  conteudos: "/materiais",
  suporte: "/suporte",
  "moderacao-fenix": "/moderacao-fenix",
};

// Sincroniza as telas existentes sem interferir na autenticação ou nos subdomínios.
export function startPageNavigation() {
  let readingHistory = false;
  let initialNavigation = true;
  const readLocation = () => {
    const url = new URL(window.location.href);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    let view = (Object.keys(paths) as ViewType[]).find(key => paths[key] === pathname);
    if (pathname === "/moderacao-fenix-x9k2") view = "moderacao-fenix";
    if (pathname === "/conteudos") view = "conteudos";
    if (pathname === "/elite-milionario") view = "elite-milionario";
    // Compatibilidade com links já compartilhados pelo site.
    if (pathname === "/" && url.searchParams.get("view") === "conteudos") view = "conteudos";
    if (pathname === "/" && url.searchParams.has("post")) view = "fenix-social";
    if (initialNavigation && useStore.getState().moderationToken) view = "moderacao-fenix";
    initialNavigation = false;
    view ??= "inicio";
    url.pathname = paths[view]!;
    url.searchParams.delete("view");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    readingHistory = true;
    try {
      useStore.getState().setPendingCourse(null);
      useStore.getState().setActiveView(view);
    } finally {
      readingHistory = false;
    }
  };

  readLocation();
  const unsubscribe = useStore.subscribe((state, previous) => {
    if (readingHistory || state.activeView === previous.activeView) return;
    const path = paths[state.activeView];
    if (path) window.history.pushState(null, "", path);
  });
  window.addEventListener("popstate", readLocation);
  return () => {
    unsubscribe();
    window.removeEventListener("popstate", readLocation);
  };
}
