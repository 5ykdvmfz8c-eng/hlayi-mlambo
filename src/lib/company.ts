/** Company details printed on customer statements. Leave a field empty to hide it. */
export const COMPANY = {
  name: "H&M Consulting & Tech",
  tagline: "Credit and loan management by H&M Consulting & Tech",
  addressLines: ["1st Avenue Street", "Gunhill", "Kroonstad", "9499"] as string[],
  phone: "",
  email: "",
  registrationNumber: "K20119550003",
  ncrNumber: "2006008265",
};

/** Statement amount format: "1 000.00" (the column header carries the R). */
export function statementAmount(n: number): string {
  const [int = "0", dec = "00"] = Math.abs(n).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "-" : ""}${grouped}.${dec}`;
}

/** Split a free-text address into printable lines. */
export function addressLines(address: string | null | undefined): string[] {
  if (!address) return [];
  return address.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
}
