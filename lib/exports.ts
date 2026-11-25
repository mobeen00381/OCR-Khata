"use client";

import type { Business, Party, Product, ReportData } from "./types";
import { formatDate, formatNumber, formatPKR, daysAgo } from "./utils";

function typeLabel(type: string) {
  if (type === "sale") return "Sale";
  if (type === "purchase") return "Purchase";
  if (type === "sale_return") return "Return";
  return type;
}

function modeLabel(mode: string) {
  if (mode === "cash") return "Cash";
  if (mode === "udhaar") return "Udhaar";
  if (mode === "bank") return "Bank";
  return mode;
}

export async function downloadReportPdf(
  report: ReportData,
  business: Business,
  products: Product[],
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 104, "F");
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 104, pageWidth, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("SteelKhata AI", margin, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("SCAN · KHATA · CONTROL", margin, 50);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(business.business_name, margin, 74);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `${business.city}  ·  ${business.phone}  ·  ${business.niche.replace(/_/g, " ")}`,
    margin,
    87,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("BUSINESS REPORT", pageWidth - margin, 68, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `${formatDate(report.range.from)}  to  ${formatDate(report.range.to)}`,
    pageWidth - margin,
    83,
    { align: "right" },
  );
  doc.text(`Generated ${formatDate(new Date())}`, pageWidth - margin, 94, {
    align: "right",
  });

  const cards = [
    { label: "TOTAL SALES", value: report.totalSales, tone: [15, 23, 42] as const },
    { label: "PURCHASES", value: report.totalPurchases, tone: [30, 64, 175] as const },
    { label: "RETURNS", value: report.totalReturns, tone: [220, 38, 38] as const },
    { label: "NET CASH", value: report.netCash, tone: [5, 150, 105] as const },
  ];
  const cardGap = 8;
  const cardWidth = (pageWidth - margin * 2 - cardGap * 3) / 4;
  const cardTop = 126;
  cards.forEach((card, index) => {
    const x = margin + index * (cardWidth + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, cardTop, cardWidth, 58, 6, 6, "FD");
    doc.setFillColor(card.tone[0], card.tone[1], card.tone[2]);
    doc.rect(x, cardTop, 3, 58, "F");
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(card.label, x + 12, cardTop + 18);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.text(formatPKR(card.value), x + 12, cardTop + 38);
  });

  let cursorY = cardTop + 82;

  const sectionTitle = (title: string, y: number) => {
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), margin, y);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 5, pageWidth - margin, y + 5);
  };

  sectionTitle("Sales, cash & Khata summary", cursorY);
  autoTable(doc, {
    startY: cursorY + 14,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: 4, textColor: [51, 65, 85] },
    headStyles: { fontStyle: "bold", textColor: [100, 116, 139], fontSize: 7 },
    head: [["Line item", "Amount", "Notes"]],
    body: [
      ["Cash sales", formatPKR(report.cashSales), "Naqad / counter receipts"],
      ["Udhaar sales", formatPKR(report.udhaarSales), "Customer khata credit"],
      ["Total gross sales", formatPKR(report.totalSales), `${report.salesCount} bills`],
      ["Sales returns / wapsi", formatPKR(report.totalReturns), "Stock added back"],
      ["Purchases / aaya hua maal", formatPKR(report.totalPurchases), "Stock received"],
      ["Customer wasooli (all modes)", formatPKR(report.totalWasooli), "Cash + bank"],
      ["Shop expenses", formatPKR(report.totalExpenses), "Roznamcha kharcha"],
    ],
    columnStyles: {
      0: { cellWidth: 190 },
      1: { cellWidth: 130, halign: "right", fontStyle: "bold", textColor: [15, 23, 42] },
      2: { cellWidth: "auto", textColor: [100, 116, 139], fontSize: 7.5 },
    },
  });

  let finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY;
  cursorY = finalY + 26;
  if (cursorY > pageHeight - 210) {
    doc.addPage();
    cursorY = 55;
  }

  sectionTitle("Galla reconciliation", cursorY);
  autoTable(doc, {
    startY: cursorY + 14,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 4.5, textColor: [51, 65, 85] },
    body: [
      ["Opening cash in galla", formatPKR(report.openingCash)],
      ["+ Cash sales", formatPKR(report.cashSales)],
      ["+ Cash wasooli", formatPKR(report.cashWasooli)],
      ["- Cash shop expenses", formatPKR(report.cashExpenses)],
      ["= Closing cash in hand", formatPKR(report.netCash)],
    ],
    columnStyles: {
      0: { cellWidth: 300 },
      1: { cellWidth: 120, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.row.index === 4) {
        data.cell.styles.textColor = [5, 150, 105];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 11;
      }
    },
  });

  finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY;
  cursorY = finalY + 26;
  if (cursorY > pageHeight - 190) {
    doc.addPage();
    cursorY = 55;
  }

  sectionTitle("Top selling pipe sizes", cursorY);
  autoTable(doc, {
    startY: cursorY + 14,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7.5 },
    head: [["Size", "Quantity sold", "Sales value"]],
    body: report.topSizes.length
      ? report.topSizes.map((row) => [row.size, formatNumber(row.qty, 2), formatPKR(row.amount)])
      : [["—", "No sales in this period", "—"]],
    columnStyles: {
      0: { cellWidth: 170 },
      1: { cellWidth: 150, halign: "right" },
      2: { halign: "right", fontStyle: "bold" },
    },
  });

  finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY;
  cursorY = finalY + 26;

  const lowStock = products.filter((product) => product.current_stock <= product.low_stock_alert);
  if (cursorY > pageHeight - 180 && (lowStock.length || report.deadStock.length)) {
    doc.addPage();
    cursorY = 55;
  }
  if (lowStock.length || report.deadStock.length) {
    sectionTitle("Stock alerts", cursorY);
    autoTable(doc, {
      startY: cursorY + 14,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 7.5 },
      head: [["Alert", "Product", "Stock", "Minimum", "Last sold"]],
      body: [
        ...lowStock.map((product) => [
          "LOW",
          `${product.attributes.size} · ${product.attributes.gauge} · ${product.attributes.grade}`,
          formatNumber(product.current_stock, 2),
          formatNumber(product.low_stock_alert, 2),
          product.last_sold_at ? `${daysAgo(product.last_sold_at)}d ago` : "Never",
        ]),
        ...report.deadStock
          .filter((product) => !lowStock.some((entry) => entry.id === product.id))
          .map((product) => [
            "DEAD",
            `${product.attributes.size} · ${product.attributes.gauge} · ${product.attributes.grade}`,
            formatNumber(product.current_stock, 2),
            formatNumber(product.low_stock_alert, 2),
            product.last_sold_at ? `${daysAgo(product.last_sold_at)}d ago` : "Never",
          ]),
      ],
      columnStyles: {
        0: { cellWidth: 52, fontStyle: "bold" },
        1: { cellWidth: 220 },
        2: { cellWidth: 70, halign: "right" },
        3: { cellWidth: 70, halign: "right" },
        4: { cellWidth: 70, halign: "right" },
      },
    });
    finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY;
    cursorY = finalY + 26;
  }

  if (cursorY > pageHeight - 150) {
    doc.addPage();
    cursorY = 55;
  }
  sectionTitle("Transactions in this period", cursorY);
  autoTable(doc, {
    startY: cursorY + 14,
    margin: { left: margin, right: margin, top: 48, bottom: 42 },
    theme: "striped",
    styles: { fontSize: 7.3, cellPadding: 3.5, textColor: [51, 65, 85] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    head: [["Date", "Parchi", "Party", "Type", "Mode", "Amount"]],
    body: report.transactions.length
      ? report.transactions.map((transaction) => [
          formatDate(transaction.created_at),
          transaction.parchi_number || "—",
          transaction.party?.name || "Walk-in",
          typeLabel(transaction.type),
          modeLabel(transaction.payment_mode),
          formatPKR(transaction.total_amount),
        ])
      : [["—", "—", "No transactions", "—", "—", "—"]],
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 55 },
      2: { cellWidth: 145 },
      3: { cellWidth: 60 },
      4: { cellWidth: 52 },
      5: { cellWidth: 80, halign: "right", fontStyle: "bold" },
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("SteelKhata AI · Business Report", margin, 17);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(203, 213, 225);
      doc.text(
        `${formatDate(report.range.from)} to ${formatDate(report.range.to)}`,
        pageWidth - margin,
        17,
        { align: "right" },
      );
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${business.business_name} · Manually generated report · ${business.phone}`,
      margin,
      pageHeight - 18,
    );
    doc.text(`Page ${page} / ${totalPages}`, pageWidth - margin, pageHeight - 18, {
      align: "right",
    });
  }

  doc.save(`SteelKhata_Report_${report.range.from}_to_${report.range.to}.pdf`);
}

export async function downloadReportExcel(
  report: ReportData,
  business: Business,
  products: Product[],
  parties: Party[],
) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    ["STEELKHATA AI — BUSINESS REPORT"],
    [business.business_name],
    [`${business.city} · ${business.phone}`],
    [],
    ["Period", `${formatDate(report.range.from)} to ${formatDate(report.range.to)}`],
    ["Generated", formatDate(new Date())],
    [],
    ["SALES & CASH SUMMARY", "Amount (PKR)"],
    ["Cash sales", report.cashSales],
    ["Udhaar sales", report.udhaarSales],
    ["Total gross sales", report.totalSales],
    ["Sales returns", report.totalReturns],
    ["Purchases", report.totalPurchases],
    ["Customer wasooli", report.totalWasooli],
    ["Shop expenses", report.totalExpenses],
    [],
    ["GALLA RECONCILIATION", "Amount (PKR)"],
    ["Opening cash", report.openingCash],
    ["+ Cash sales", report.cashSales],
    ["+ Cash wasooli", report.cashWasooli],
    ["- Cash expenses", report.cashExpenses],
    ["= Closing cash in hand", report.netCash],
    [],
    ["TOP SELLING SIZES", "Quantity", "Sales value (PKR)"],
    ...(report.topSizes.length
      ? report.topSizes.map((row) => [row.size, row.qty, row.amount])
      : [["No sales", 0, 0]]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 34 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const transactionRows = [
    [
      "Date",
      "Parchi",
      "Party",
      "Area",
      "Type",
      "Routing",
      "Payment mode",
      "Subtotal",
      "Extra charges",
      "Total",
      "Paid",
      "Items",
    ],
    ...report.transactions.map((transaction) => [
      formatDate(transaction.created_at),
      transaction.parchi_number || "",
      transaction.party?.name || "Walk-in",
      transaction.party?.area_or_shop || "",
      typeLabel(transaction.type),
      transaction.routing_mode === "cash_sale" ? "Cash sale" : "Customer khata",
      modeLabel(transaction.payment_mode),
      transaction.subtotal,
      transaction.extra_charges,
      transaction.total_amount,
      transaction.paid_amount,
      transaction.items
        .map(
          (item) =>
            `${item.raw_scanned_name} (${formatNumber(item.quantity, 2)} x ${formatNumber(item.rate, 2)})`,
        )
        .join("; "),
    ]),
  ];
  const transactionSheet = XLSX.utils.aoa_to_sheet(transactionRows);
  transactionSheet["!cols"] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 24 },
    { wch: 20 },
    { wch: 11 },
    { wch: 15 },
    { wch: 13 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 52 },
  ];
  XLSX.utils.book_append_sheet(workbook, transactionSheet, "Transactions");

  const paymentRows = [
    ["Date", "Type", "Party", "Description", "Mode", "Amount"],
    ...report.payments.map((payment) => [
      formatDate(payment.created_at),
      payment.entry_type === "customer_wasooli"
        ? "Customer wasooli"
        : payment.entry_type === "supplier_payment"
          ? "Supplier payment"
          : "Shop expense",
      parties.find((party) => party.id === payment.party_id)?.name || "",
      payment.description,
      modeLabel(payment.payment_mode),
      payment.amount,
    ]),
  ];
  const paymentSheet = XLSX.utils.aoa_to_sheet(paymentRows);
  paymentSheet["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 24 }, { wch: 36 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, paymentSheet, "Payments & Expenses");

  const stockRows = [
    [
      "SKU",
      "Product",
      "Size",
      "Gauge",
      "Grade",
      "Shape",
      "Unit",
      "Current stock",
      "Low alert",
      "Purchase rate",
      "Sale rate",
      "Stock cost value",
      "Status",
      "Last sold",
    ],
    ...products.map((product) => {
      const low = product.current_stock <= product.low_stock_alert;
      const dead = Boolean(product.last_sold_at && daysAgo(product.last_sold_at) >= 30);
      return [
        product.sku_code,
        product.name,
        product.attributes.size || "",
        product.attributes.gauge || "",
        product.attributes.grade || "",
        product.attributes.shape || "",
        product.unit,
        product.current_stock,
        product.low_stock_alert,
        product.purchase_rate,
        product.sale_rate,
        product.current_stock * product.purchase_rate,
        low && dead ? "LOW + DEAD" : low ? "LOW" : dead ? "DEAD" : "Healthy",
        product.last_sold_at ? `${daysAgo(product.last_sold_at)} days ago` : "Never",
      ];
    }),
  ];
  const stockSheet = XLSX.utils.aoa_to_sheet(stockRows);
  stockSheet["!cols"] = [
    { wch: 20 },
    { wch: 38 },
    { wch: 9 },
    { wch: 8 },
    { wch: 8 },
    { wch: 11 },
    { wch: 8 },
    { wch: 12 },
    { wch: 9 },
    { wch: 12 },
    { wch: 11 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, stockSheet, "Stock");

  const khatayRows = [
    ["Party", "Type", "Area / Shop", "Phone", "Balance (PKR)", "Balance meaning"],
    ...parties
      .filter((party) => party.type !== "walk_in_cash")
      .map((party) => [
        party.name,
        party.type,
        party.area_or_shop,
        party.phone,
        party.current_balance,
        party.type === "supplier"
          ? party.current_balance < 0
            ? "Payable"
            : "Advance to supplier"
          : party.current_balance > 0
            ? "Customer udhaar"
            : party.current_balance < 0
              ? "Customer advance"
              : "Clear",
      ]),
  ];
  const khataySheet = XLSX.utils.aoa_to_sheet(khatayRows);
  khataySheet["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 22 }, { wch: 16 }, { wch: 15 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, khataySheet, "Khatay");

  XLSX.writeFile(workbook, `SteelKhata_Report_${report.range.from}_to_${report.range.to}.xlsx`);
}
