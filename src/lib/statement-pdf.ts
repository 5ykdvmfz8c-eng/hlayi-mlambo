import { fmtDate, fmtDateTime, money } from "./format";

export type StatementData = {
  statement_number: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number;
  total_debits: number;
  total_credits: number;
  customer: { name: string; account_number: string; phone: string; email: string | null; address: string | null };
  loans: { loan_reference: string; principal: number; interest_amount: number; fees: number; total_repayable: number; amount_paid: number; outstanding_balance: number; issue_date: string; status: string }[];
  rows: { txn_date: string; description: string; debit: number; credit: number; balance: number }[];
  generatedBy: string;
};

const NAVY: [number, number, number] = [11, 31, 75];
const BLUE: [number, number, number] = [31, 92, 255];
const GREY: [number, number, number] = [100, 110, 130];

export async function buildStatementPdf(d: StatementData) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 92, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(255, 255, 255);
  doc.text("H", 40, 52);
  doc.setTextColor(...BLUE);
  doc.text("&", 40 + doc.getTextWidth("H"), 52);
  doc.setTextColor(255, 255, 255);
  doc.text("M", 40 + doc.getTextWidth("H&"), 52);
  doc.setFontSize(7.5);
  doc.setTextColor(180, 190, 215);
  doc.text("CONSULTING & TECH", 40, 66, { charSpace: 1.5 });
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("Customer Statement", W - 40, 50, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Statement ${d.statement_number}`, W - 40, 66, { align: "right" });

  doc.setTextColor(...NAVY);
  doc.setFontSize(9);
  let y = 122;
  const left = [
    ["Customer", d.customer.name],
    ["Account no.", d.customer.account_number],
    ["Contact", d.customer.phone],
    ["Email", d.customer.email ?? "—"],
    ["Address", d.customer.address ?? "—"],
  ];
  const right = [
    ["Statement date", fmtDate(d.generated_at)],
    ["Period", `${fmtDate(d.period_start)} – ${fmtDate(d.period_end)}`],
    ["Opening balance", money(d.opening_balance)],
    ["Closing balance", money(d.closing_balance)],
  ];
  left.forEach(([k, v], i) => {
    doc.setTextColor(...GREY); doc.text(k, 40, y + i * 15);
    doc.setTextColor(...NAVY); doc.text(String(v).slice(0, 60), 120, y + i * 15);
  });
  right.forEach(([k, v], i) => {
    doc.setTextColor(...GREY); doc.text(k, 330, y + i * 15);
    doc.setTextColor(...NAVY); doc.setFont("helvetica", i === 3 ? "bold" : "normal"); doc.text(v, W - 40, y + i * 15, { align: "right" }); doc.setFont("helvetica", "normal");
  });
  y += 88;

  autoTable(doc, {
    startY: y,
    head: [["Loan ref", "Issued", "Borrowed", "Interest", "Fees", "Total repayable", "Paid", "Outstanding"]],
    body: d.loans.map((l) => [l.loan_reference, fmtDate(l.issue_date), money(l.principal), money(l.interest_amount), money(l.fees), money(l.total_repayable), money(l.amount_paid), money(l.outstanding_balance)]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [236, 241, 255], textColor: NAVY, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
    margin: { left: 40, right: 40 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Transactions", 40, y);
  autoTable(doc, {
    startY: y + 8,
    head: [["Date", "Description", "Debit", "Credit", "Balance"]],
    body: [
      [fmtDate(d.period_start), "Opening balance", "", "", money(d.opening_balance)],
      ...d.rows.map((r) => [fmtDate(r.txn_date), r.description, r.debit ? money(r.debit) : "-", r.credit ? money(r.credit) : "-", money(r.balance)]),
    ],
    foot: [["", "Totals / closing balance", money(d.total_debits), money(d.total_credits), money(d.closing_balance)]],
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    footStyles: { fillColor: [236, 241, 255], textColor: NAVY, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    margin: { left: 40, right: 40 },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text(`Generated ${fmtDateTime(d.generated_at)} by ${d.generatedBy}. Balances reconcile to recorded transactions. Confidential — contains personal information protected under POPIA.`, 40, H - 28, { maxWidth: W - 120 });
    doc.text(`Page ${i} of ${pages}`, W - 40, H - 28, { align: "right" });
  }
  return doc;
}
