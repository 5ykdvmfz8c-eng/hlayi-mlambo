import { COMPANY, addressLines, statementAmount } from "./company";
import { fmtDate, fmtDateTime } from "./format";

export type StatementData = {
  id: string;
  statement_number: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number;
  total_debits: number;
  total_credits: number;
  scope: string;
  customer: { name: string; account_number: string; phone: string; email: string | null; address: string | null };
  loans: { loan_reference: string; principal: number; interest_amount: number; fees: number; total_repayable: number; amount_paid: number; outstanding_balance: number; issue_date: string; status: string }[];
  rows: { txn_date: string; created_at: string; description: string; debit: number; credit: number; balance: number }[];
  generatedBy: string;
};

const INK: [number, number, number] = [20, 20, 20];
const NAVY: [number, number, number] = [11, 31, 75];
const BLUE: [number, number, number] = [31, 92, 255];
const GREY: [number, number, number] = [95, 95, 95];

export function footerText(d: Pick<StatementData, "id" | "statement_number" | "generated_at">) {
  const provider = COMPANY.ncrNumber
    ? `${COMPANY.name} is a registered credit provider (NCR Reg. No. ${COMPANY.ncrNumber}).`
    : `${COMPANY.name}.`;
  const reg = COMPANY.registrationNumber ? ` CIPC Reg. No.: ${COMPANY.registrationNumber}.` : "";
  return {
    line1: `${provider}${reg} Confidential - contains personal information protected under POPIA.`,
    line2: `Unique Document No.: ${d.id} / ${d.statement_number} / ${fmtDateTime(d.generated_at)}`,
  };
}

export async function buildStatementPdf(d: StatementData) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const L = 40;
  const R = W - 40;

  // Tagline + title (top left)
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(COMPANY.tagline, L, 52);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Loan Account Statement", L, 76);

  // Logo (top right)
  doc.setFontSize(28);
  const logoW = doc.getTextWidth("H&M");
  let x = R - logoW;
  doc.setTextColor(...NAVY); doc.text("H", x, 66); x += doc.getTextWidth("H");
  doc.setTextColor(...BLUE); doc.text("&", x, 66); x += doc.getTextWidth("&");
  doc.setTextColor(...NAVY); doc.text("M", x, 66);
  doc.setFontSize(7);
  doc.setTextColor(...GREY);
  const tag = "CONSULTING & TECH";
  doc.text(tag, R - doc.getTextWidth(tag) - 1.2 * (tag.length - 1), 78, { charSpace: 1.2 });

  // Centre box
  const bx = 215, by = 100, bw = 150, bh = 82;
  doc.setDrawColor(...INK);
  doc.setLineWidth(1.2);
  doc.rect(bx, by, bw, bh);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const cx = bx + bw / 2;
  doc.text("H&M Consulting & Tech", cx, by + 20, { align: "center" });
  doc.setFontSize(12);
  doc.text(fmtDate(d.generated_at), cx, by + 38, { align: "center" });
  doc.text(`Ref: ${d.statement_number}`, cx, by + 54, { align: "center", maxWidth: bw - 10 });
  doc.text(d.scope, cx, by + 70, { align: "center", maxWidth: bw - 10 });

  // Right: summary heading + dates
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Account Summary", 395, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Outstanding balance", 395, 136);
  doc.text(`R ${statementAmount(d.closing_balance)}`, 395, 148);
  const dates: [string, string][] = [
    ["From Date:", fmtDate(d.period_start)],
    ["To Date:", fmtDate(d.period_end)],
    ["Print Date:", fmtDate(new Date())],
  ];
  doc.setFontSize(9.5);
  dates.forEach(([k, v], i) => {
    doc.setFont("helvetica", "bold");
    doc.text(k, 470, 176 + i * 15, { align: "right" });
    doc.text(v, 480, 176 + i * 15);
  });

  // Left: company address
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const companyLines = [COMPANY.name, ...COMPANY.addressLines, ...(COMPANY.phone ? [`Tel: ${COMPANY.phone}`] : [])];
  companyLines.forEach((line, i) => doc.text(line, L, 172 + i * 13));

  // Personal details
  let y = 240;
  doc.setFontSize(11);
  doc.text("Personal Details", L, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const personal = [d.customer.name, ...addressLines(d.customer.address), d.customer.phone].filter(Boolean);
  personal.forEach((line, i) => doc.text(line, L, y + 13 + i * 11.5));
  doc.text("Account Number", 395, y + 13);
  doc.text(d.customer.account_number, 485, y + 13);
  y += 13 + personal.length * 11.5 + 16;

  const plain = {
    theme: "plain" as const,
    styles: { fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, textColor: INK, font: "helvetica" },
    headStyles: { fontStyle: "bold" as const, textColor: INK, valign: "bottom" as const },
    margin: { left: L, right: 40, bottom: 70 },
  };
  // Right-align header and footer cells over money columns.
  const alignMoney = (from: number) => (data: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
    if (data.section !== "body" && data.column.index >= from) data.cell.styles.halign = "right";
  };

  // Loan details
  if (d.loans.length) {
    autoTable(doc, {
      ...plain,
      startY: y,
      head: [["Loan Reference", "Issue Date", "Borrowed (R)", "Interest (R)", "Fees (R)", "Total Repayable (R)", "Paid (R)", "Outstanding (R)"]],
      body: d.loans.map((l) => [l.loan_reference, fmtDate(l.issue_date), statementAmount(l.principal), statementAmount(l.interest_amount), statementAmount(l.fees), statementAmount(l.total_repayable), statementAmount(l.amount_paid), statementAmount(l.outstanding_balance)]),
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
      didParseCell: alignMoney(2),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  // Transactions
  autoTable(doc, {
    ...plain,
    startY: y,
    head: [["Posting Date", "Transaction\nDate", "Description", "Money In (R)", "Money Out (R)", "Balance (R)"]],
    body: [
      [fmtDate(d.period_start), fmtDate(d.period_start), "Opening Balance", "", "", statementAmount(d.opening_balance)],
      ...d.rows.map((r) => [fmtDate(r.created_at), fmtDate(r.txn_date), r.description, r.credit ? statementAmount(r.credit) : "", r.debit ? statementAmount(r.debit) : "", statementAmount(r.balance)]),
    ],
    foot: [["", "", "Totals / Closing Balance", statementAmount(d.total_credits), statementAmount(d.total_debits), statementAmount(d.closing_balance)]],
    footStyles: { fontStyle: "bold", textColor: INK, lineWidth: { top: 0.8 }, lineColor: INK },
    showFoot: "lastPage",
    didParseCell: alignMoney(3),
    columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 62 }, 2: { cellWidth: "auto" }, 3: { halign: "right", cellWidth: 70 }, 4: { halign: "right", cellWidth: 72 }, 5: { halign: "right", cellWidth: 70 } },
  });

  const { line1, line2 } = footerText(d);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(line1, W / 2, H - 46, { align: "center", maxWidth: W - 80 });
    doc.text(line2, W / 2, H - 36, { align: "center", maxWidth: W - 80 });
    doc.text(`Page ${i} of ${pages}`, R, H - 20, { align: "right" });
  }
  return doc;
}
