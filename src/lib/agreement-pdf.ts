import { COMPANY, addressLines, statementAmount } from "./company";
import { fmtDate, fmtDateTime } from "./format";
import { footerText } from "./statement-pdf";
import {
  AGREEMENT_FIELDS,
  DECLARATIONS,
  FREQUENCY_LABEL,
  agreementSchedule,
  agreementTerms,
  type AgreementDoc,
  type SignatureRecord,
} from "./agreement";

const INK: [number, number, number] = [20, 20, 20];
const NAVY: [number, number, number] = [11, 31, 75];
const BLUE: [number, number, number] = [31, 92, 255];
const GREY: [number, number, number] = [95, 95, 95];
const RULE: [number, number, number] = [150, 150, 150];
const TINT: [number, number, number] = [240, 243, 250];

const R_ = (v: number) => `R ${statementAmount(v)}`;

export function agreementFileName(d: AgreementDoc) {
  return `${d.account_number}-${d.agreement_number}${d.customer ? "-signed" : ""}.pdf`;
}

export async function buildAgreementPdf(d: AgreementDoc) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = 40;
  const R = W - 40;
  const BOTTOM = H - 78;
  const TOP = 64;
  const t = d.terms;
  const det = d.details;
  let y = 0;

  const ink = (c: [number, number, number] = INK) => doc.setTextColor(...c);
  const font = (style: "normal" | "bold", size: number) => { doc.setFont("helvetica", style); doc.setFontSize(size); };
  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = TOP; } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastY = () => (doc as any).lastAutoTable.finalY as number;

  const section = (letter: string, title: string) => {
    ensure(60);
    y += 10;
    font("bold", 10.5);
    ink(NAVY);
    doc.text(`PART ${letter}  —  ${title.toUpperCase()}`, L, y);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.9);
    doc.line(L, y + 5, R, y + 5);
    y += 20;
    ink();
  };
  const sub = (title: string) => {
    ensure(40);
    font("bold", 8.5);
    ink(GREY);
    doc.text(title.toUpperCase(), L, y, { charSpace: 0.4 });
    ink();
    y += 13;
  };
  /** Labelled field: small label, value written on a ruled line (blank line when empty). */
  const field = (label: string, value: string | undefined | null, x: number, w: number, at = y) => {
    font("normal", 7);
    ink(GREY);
    doc.text(label, x, at);
    font("normal", 9.5);
    ink();
    if (value) doc.text(doc.splitTextToSize(value, w - 4)[0] as string, x + 1, at + 13);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(x, at + 16, x + w, at + 16);
  };
  const GAP = 18;
  const COL = (R - L - GAP) / 2;
  const fieldGrid = (keys: readonly { key: string; label: string; wide?: boolean }[]) => {
    let col = 0;
    for (const f of keys) {
      const value = det[f.key as keyof typeof det];
      if (f.wide) {
        if (col === 1) { y += 28; col = 0; }
        ensure(30);
        field(f.label, value, L, R - L);
        y += 28;
      } else {
        if (col === 0) ensure(30);
        field(f.label, value, col === 0 ? L : L + COL + GAP, COL);
        if (col === 1) { y += 28; col = 0; } else col = 1;
      }
    }
    if (col === 1) y += 28;
    y += 4;
  };

  // ── Page 1 header (matches the account statement) ──
  ink();
  font("normal", 9.5);
  doc.text(COMPANY.tagline, L, 52);
  font("bold", 17);
  doc.text("Loan Agreement", L, 76);
  font("normal", 8.5);
  ink(GREY);
  doc.text("Credit agreement in terms of the National Credit Act 34 of 2005", L, 90);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  let x = R - doc.getTextWidth("H&M");
  ink(NAVY); doc.text("H", x, 66); x += doc.getTextWidth("H");
  ink(BLUE); doc.text("&", x, 66); x += doc.getTextWidth("&");
  ink(NAVY); doc.text("M", x, 66);
  doc.setFontSize(7);
  ink(GREY);
  const tag = "CONSULTING & TECH";
  doc.text(tag, R - doc.getTextWidth(tag) - 1.2 * (tag.length - 1), 78, { charSpace: 1.2 });

  const bx = 215, by = 104, bw = 150, bh = 82;
  doc.setDrawColor(...INK);
  doc.setLineWidth(1.2);
  doc.rect(bx, by, bw, bh);
  ink();
  font("normal", 10.5);
  const cx = bx + bw / 2;
  doc.text("H&M Consulting & Tech", cx, by + 20, { align: "center" });
  doc.setFontSize(12);
  doc.text(fmtDate(d.created_at), cx, by + 38, { align: "center" });
  doc.text(`Ref: ${d.agreement_number}`, cx, by + 54, { align: "center", maxWidth: bw - 10 });
  doc.text(`Loan ${t.loan_reference}`, cx, by + 70, { align: "center", maxWidth: bw - 10 });

  font("bold", 13);
  doc.text("Agreement Summary", 395, 122);
  font("normal", 8.5);
  doc.text("Total amount repayable", 395, 138);
  doc.text(R_(t.total_repayable), 395, 150);
  const dates: [string, string][] = [
    ["Agreement Date:", fmtDate(d.created_at)],
    ["First Payment:", fmtDate(t.first_payment_date)],
    ["Final Payment:", fmtDate(t.maturity_date)],
  ];
  font("bold", 9.5);
  dates.forEach(([k, v], i) => {
    doc.text(k, 478, 178 + i * 15, { align: "right" });
    doc.text(v, 486, 178 + i * 15);
  });

  font("bold", 9.5);
  const companyLines = [COMPANY.name, ...COMPANY.addressLines, ...(COMPANY.phone ? [`Tel: ${COMPANY.phone}`] : [])];
  companyLines.forEach((line, i) => doc.text(line, L, 176 + i * 13));

  y = 232;

  // ── Part A: parties ──
  section("A", "Parties to the agreement");
  const top = y;
  sub("Credit provider");
  field("Registered name", COMPANY.name, L, COL);
  y += 28;
  field("Company registration number", COMPANY.registrationNumber, L, COL);
  y += 28;
  field("NCR registration number", COMPANY.ncrNumber, L, COL);
  y += 28;
  field("Physical address", COMPANY.addressLines.join(", "), L, COL);
  const leftEnd = y + 28;
  y = top;
  font("bold", 8.5); ink(GREY);
  doc.text("CUSTOMER (THE BORROWER)", L + COL + GAP, y, { charSpace: 0.4 });
  ink();
  y += 13;
  const rx = L + COL + GAP;
  field("Full names and surname", det.full_name, rx, COL); y += 28;
  field("SA ID / passport number", det.id_number, rx, COL); y += 28;
  field("Customer account number", d.account_number, rx, COL); y += 28;
  field("Loan reference", t.loan_reference, rx, COL);
  y = Math.max(leftEnd, y + 28) + 2;

  // ── Part B: customer information ──
  section("B", "Customer personal information");
  const groups: [string, string][] = [["personal", "Personal details"], ["employment", "Employment and income"], ["bank", "Bank details"], ["kin", "Next of kin"]];
  for (const [id, title] of groups) {
    sub(title);
    fieldGrid(AGREEMENT_FIELDS.filter((f) => f.section === id && f.key !== "full_name"));
  }

  // ── Part C: loan details ──
  section("C", "Loan details and cost of credit");
  const grid = {
    theme: "grid" as const,
    styles: { font: "helvetica", fontSize: 8.5, textColor: INK, lineColor: RULE, lineWidth: 0.5, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 } },
    margin: { left: L, right: 40, top: TOP, bottom: 80 },
  };
  const lbl = (s: string) => ({ content: s, styles: { fillColor: TINT, fontStyle: "bold" as const } });
  const val = (s: string, bold = false) => ({ content: s, styles: { halign: "right" as const, ...(bold ? { fontStyle: "bold" as const } : {}) } });
  autoTable(doc, {
    ...grid,
    startY: y,
    columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 127.5 }, 2: { cellWidth: 130 }, 3: { cellWidth: 127.5 } },
    body: [
      [lbl("Principal amount (loan)"), val(R_(t.principal)), lbl("Interest rate (flat)"), val(`${t.interest_rate}%`)],
      [lbl("Interest amount"), val(R_(t.interest_amount)), lbl("Fees"), val(R_(t.fees))],
      [lbl("Total amount repayable"), val(R_(t.total_repayable), true), lbl("Repayment frequency"), val(FREQUENCY_LABEL[t.repayment_frequency] ?? t.repayment_frequency)],
      [lbl("Number of instalments"), val(String(t.number_of_instalments)), lbl("Instalment amount"), val(R_(t.instalment_amount), true)],
      [lbl("Repayment period"), val(`${fmtDate(t.first_payment_date)} – ${fmtDate(t.maturity_date)}`), lbl("Loan issue date"), val(fmtDate(t.issue_date))],
      [lbl("Purpose of loan"), { content: t.purpose || " ", colSpan: 3 }],
    ],
  });
  y = lastY() + 8;
  font("normal", 7.5);
  ink(GREY);
  doc.text(doc.splitTextToSize("The total amount repayable is the principal plus interest and fees. No other charges are payable if all instalments are paid on time.", R - L), L, y + 6);
  ink();
  y += 18;

  // ── Part D: repayment schedule ──
  section("D", "Repayment schedule");
  const schedule = agreementSchedule(t);
  autoTable(doc, {
    ...grid,
    startY: y,
    head: [["No.", "Due Date", "Instalment (R)", "Balance After Payment (R)"]],
    body: schedule.map((s) => [String(s.number), fmtDate(s.dueDate), statementAmount(s.amount), statementAmount(s.remaining)]),
    foot: [["", "Total", statementAmount(t.total_repayable), ""]],
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: TINT, textColor: INK, fontStyle: "bold" },
    showFoot: "lastPage",
    showHead: "everyPage",
    columnStyles: { 0: { cellWidth: 50, halign: "center" }, 1: { cellWidth: 140 }, 2: { halign: "right" }, 3: { halign: "right" } },
    didParseCell: (c) => {
      if (c.section !== "body" && c.column.index >= 2) c.cell.styles.halign = "right";
      if (c.section !== "body" && c.column.index === 0) c.cell.styles.halign = "center";
    },
  });
  y = lastY() + 10;

  // ── Part E: terms ──
  section("E", "Terms and conditions");
  const clauses = agreementTerms();
  if (det.special_conditions) clauses.push({ title: "Special conditions", text: det.special_conditions });
  clauses.forEach((c, i) => {
    font("normal", 8.5);
    const lines = doc.splitTextToSize(c.text, R - L - 20) as string[];
    ensure(14 + lines.length * 10.5);
    font("bold", 8.8);
    doc.text(`${i + 1}.`, L, y);
    doc.text(c.title, L + 20, y);
    font("normal", 8.5);
    doc.text(lines, L + 20, y + 11.5, { lineHeightFactor: 1.2 });
    y += 11.5 + lines.length * 10.2 + 7;
  });

  // ── Part F: declaration ──
  section("F", "Customer declaration and acceptance");
  font("normal", 9);
  ensure(40);
  const nameText = det.full_name || "";
  const idText = det.id_number || "";
  doc.text("I,", L, y);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(L + 12, y + 2, L + 280, y + 2);
  if (nameText) doc.text(nameText, L + 16, y - 1);
  doc.text("ID number", L + 290, y);
  doc.line(L + 336, y + 2, R, y + 2);
  if (idText) doc.text(idText, L + 340, y - 1);
  y += 16;
  doc.text("declare that:", L, y);
  y += 14;
  const ticked = !!d.customer && d.customer.method !== "paper";
  DECLARATIONS.forEach((item, i) => {
    const lines = doc.splitTextToSize(item, R - L - 40) as string[];
    ensure(lines.length * 11 + 6);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.7);
    doc.rect(L + 2, y - 7.5, 8, 8);
    if (ticked) {
      doc.setLineWidth(1.1);
      doc.line(L + 3.5, y - 3.5, L + 5.5, y - 1);
      doc.line(L + 5.5, y - 1, L + 9, y - 6.5);
    }
    font("normal", 8.8);
    doc.text(`(${String.fromCharCode(97 + i)})`, L + 16, y);
    doc.text(lines, L + 32, y, { lineHeightFactor: 1.2 });
    y += lines.length * 10.6 + 5;
  });

  // ── Part G: signatures (kept together) ──
  const blockH = 132;
  if (y + 40 + blockH * 3 > BOTTOM) { doc.addPage(); y = TOP; }
  section("G", "Signatures");
  font("normal", 8.5);
  ink(GREY);
  doc.text("Thus done and signed by the parties on the dates and at the places written below.", L, y);
  ink();
  y += 18;

  const SIGW = 320;
  const RX = L + SIGW + 30;
  const RW = R - RX;
  const block = (title: string, s: SignatureRecord | null, extra: [string, string | null | undefined], fallbackName: string | undefined, placeDefault: string | undefined) => {
    ensure(blockH);
    doc.setFillColor(...TINT);
    doc.rect(L, y - 10, R - L, 15, "F");
    font("bold", 8.8);
    ink(NAVY);
    doc.text(title, L + 5, y);
    ink();
    y += 18;
    const lineY = y + 34;
    if (s?.image) {
      try { doc.addImage(s.image, "PNG", L + 6, lineY - 40, 150, 38); } catch { /* unreadable image: leave line blank */ }
    }
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.7);
    doc.line(L, lineY, L + SIGW, lineY);
    doc.line(RX, lineY, R, lineY);
    font("normal", 7);
    ink(GREY);
    doc.text("Signature", L, lineY + 9);
    doc.text("Date", RX, lineY + 9);
    ink();
    font("normal", 9.5);
    if (s?.at) doc.text(s.image ? fmtDateTime(s.at) : fmtDate(s.at), RX + 1, lineY - 3);
    if (s && !s.image) {
      font("normal", 7.5); ink(GREY);
      doc.text("Signed by hand on the original paper copy", L + 2, lineY - 3);
      ink();
    }
    y = lineY + 18;
    field("Full names and surname", s?.name || fallbackName, L, SIGW);
    field("Signed at (place)", s?.place || placeDefault, RX, RW);
    y += 28;
    if (extra[0]) {
      field(extra[0], extra[1], L, SIGW);
      y += 28;
    }
    y += 6;
  };
  block("CUSTOMER (BORROWER)", d.customer, ["ID / passport number", det.id_number], det.full_name, undefined);
  block("FOR AND ON BEHALF OF H&M CONSULTING & TECH (WHO WARRANTS THAT THEY ARE DULY AUTHORISED)", d.rep, ["Position", d.rep?.title ?? det.rep_title], det.rep_name, undefined);
  block("WITNESS", d.witness, ["", ""], det.witness_name, undefined);

  // Electronic signature record
  if (d.customer) {
    const rows: string[] = [];
    if (d.customer.method === "paper") rows.push(`Customer signature: signed by hand on paper on ${fmtDate(d.customer.at)}${d.customer.place ? ` at ${d.customer.place}` : ""}; recorded by H&M.`);
    else rows.push(`Customer signature: signed electronically ${d.customer.method === "remote" ? "via a secure personal link" : "in person on an H&M device"} on ${fmtDateTime(d.customer.at)} (South African time)${d.customer.ip ? ` from IP address ${d.customer.ip}` : ""}.`);
    if (d.rep) rows.push(`H&M representative: ${d.rep.name}${d.rep.title ? `, ${d.rep.title}` : ""}, ${d.rep.image ? `signed electronically on ${fmtDateTime(d.rep.at)}` : `signed by hand on ${fmtDate(d.rep.at)}`}.`);
    if (d.witness) rows.push(`Witness: ${d.witness.name}, ${d.witness.image ? `signed electronically on ${fmtDateTime(d.witness.at)}` : `signed by hand on ${fmtDate(d.witness.at)}`}.`);
    if (d.hash) rows.push(`Document fingerprint (SHA-256): ${d.hash}`);
    font("normal", 7.5);
    const wrapped = rows.flatMap((r) => doc.splitTextToSize(r, R - L - 16) as string[]);
    ensure(wrapped.length * 9.5 + 26);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.rect(L, y - 4, R - L, wrapped.length * 9.5 + 22);
    font("bold", 8);
    doc.text("Signature record", L + 8, y + 8);
    font("normal", 7.5);
    doc.text(wrapped, L + 8, y + 19, { lineHeightFactor: 1.25 });
    y += wrapped.length * 9.5 + 26;
  }

  // ── Running header, footer, initials and page numbers ──
  const { line1, line2 } = footerText({ id: d.id, statement_number: d.agreement_number, generated_at: d.created_at });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (i > 1) {
      font("bold", 8.5);
      ink(NAVY);
      doc.text("H", L, 38); let hx = L + doc.getTextWidth("H");
      ink(BLUE); doc.text("&", hx, 38); hx += doc.getTextWidth("&");
      ink(NAVY); doc.text("M", hx, 38);
      font("normal", 8);
      ink(GREY);
      doc.text(`Loan Agreement ${d.agreement_number}  ·  ${det.full_name || d.account_number}`, R, 38, { align: "right" });
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.5);
      doc.line(L, 44, R, 44);
    }
    font("normal", 7.5);
    ink();
    doc.text(line1, W / 2, H - 46, { align: "center", maxWidth: W - 80 });
    doc.text(line2, W / 2, H - 36, { align: "center", maxWidth: W - 80 });
    doc.text("Customer initials:", L, H - 20);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    doc.line(L + 64, H - 19, L + 130, H - 19);
    doc.text("H&M initials:", L + 145, H - 20);
    doc.line(L + 193, H - 19, L + 259, H - 19);
    doc.text(`Page ${i} of ${pages}`, R, H - 20, { align: "right" });
  }
  return doc;
}

/** Print a PDF without the browser adding its own page headers. */
export function printPdf(blobUrl: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = blobUrl;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(blobUrl, "_blank");
    }
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

export { addressLines };
