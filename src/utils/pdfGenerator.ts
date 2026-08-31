import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface DIMetricItem {
  codigo: string;
  loginsCount: number;
  lastLogin: string;
  status: string;
  detalhes?: string;
}

export interface AdminReportData {
  totalAcessos: number;
  totalDownloads: number;
  totalUsuarios: number;
  totalLoginsDI: number;
  diList: DIMetricItem[];
  generatedAt?: string;
}

export function generateMetricsPDF(data: AdminReportData) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const nowStr = data.generatedAt || new Date().toLocaleString("pt-BR");

  // Header Banner Background
  doc.setFillColor(15, 19, 26); // Dark metallic navy
  doc.rect(0, 0, 210, 38, "F");

  // Red accent line
  doc.setFillColor(209, 42, 98); // #d12a62
  doc.rect(0, 38, 210, 2, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("GRUPO FÊNIX - RELATÓRIO DE ACESSOS E D.I.", 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(180, 190, 205);
  doc.text("Painel Administrativo - Métricas Globais e Registro por Código D.I.", 14, 23);
  doc.text(`Emitido em: ${nowStr}`, 14, 30);

  // Summary Metrics Section Title
  doc.setTextColor(15, 19, 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("1. Resumo Executivo de Indicadores (KPIs)", 14, 48);

  // KPI Metric Cards inside PDF
  const startY = 53;
  const kpiBoxWidth = 43;
  const kpiBoxHeight = 22;

  const kpis = [
    { title: "Total de Acessos", value: String(data.totalAcessos), col: 0 },
    { title: "Downloads de Arquivos", value: String(data.totalDownloads), col: 1 },
    { title: "Usuários / Pessoas", value: String(data.totalUsuarios), col: 2 },
    { title: "Logins por Cód. D.I.", value: String(data.totalLoginsDI), col: 3 },
  ];

  kpis.forEach((kpi) => {
    const x = 14 + kpi.col * 46;
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(220, 225, 232);
    doc.roundedRect(x, startY, kpiBoxWidth, kpiBoxHeight, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 110, 125);
    doc.text(kpi.title.toUpperCase(), x + 4, startY + 7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(209, 42, 98);
    doc.text(kpi.value, x + 4, startY + 17);
  });

  // Section Title: D.I Login Table
  doc.setTextColor(15, 19, 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("2. Detalhamento de Logins por Código D.I. na Área Restrita", 14, startY + kpiBoxHeight + 12);

  // Table rows
  const tableRows = data.diList.map((item) => [
    item.codigo,
    `${item.loginsCount} acesso(s)`,
    item.lastLogin,
    item.status
  ]);

  autoTable(doc, {
    startY: startY + kpiBoxHeight + 16,
    head: [["CÓDIGO D.I.", "QUANTIDADE DE LOGINS", "ÚLTIMO ACESSO REGISTRADO", "STATUS"]],
    body: tableRows,
    theme: "striped",
    headStyles: {
      fillColor: [15, 19, 26],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 40, 50],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 45 },
      1: { cellWidth: 45 },
      2: { cellWidth: 60 },
      3: { cellWidth: 32 }
    },
    margin: { left: 14, right: 14 }
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 140, 150);
    doc.text(`Grupo Fênix - Relatório Oficial de Acessos e D.I. | Página ${i} de ${pageCount}`, 14, 287);
  }

  // Save File
  doc.save(`Relatorio_Acessos_DI_Grupo_Fenix_${Date.now()}.pdf`);
}
