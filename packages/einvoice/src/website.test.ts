import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { footerColumns, renderInvoicePdf } from "./pdf.ts";
import { sampleDocument, sampleSeller } from "./samples.ts";
import { buildEInvoice } from "./xml.ts";

/** Website aus den Firmendaten in der Kontaktspalte des Fußes, wie E-Mail und Telefon */

const seller = { ...sampleSeller, website: "https://mustermann.example" };

/** Text eines PDFs mit pdftotext (poppler-utils); ohne das Werkzeug null */
function pdfText(pdf: Uint8Array): string | null {
  const dir = mkdtempSync(join(tmpdir(), "haben-website-"));
  try {
    const file = join(dir, "beleg.pdf");
    writeFileSync(file, pdf);
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Website im Fuß", () => {
  it("steht als letzte Zeile der Kontaktspalte, nach E-Mail und Telefon", () => {
    const contact = footerColumns(seller)[0]!;
    expect(contact.at(-1)).toBe("https://mustermann.example");
    expect(contact.indexOf(seller.email)).toBeLessThan(contact.indexOf("Tel. +49 30 1234567"));
    expect(contact.indexOf("Tel. +49 30 1234567")).toBeLessThan(contact.indexOf("https://mustermann.example"));
  });

  it("fehlt ohne Angabe, auch bei nur Leerzeichen", () => {
    expect(footerColumns(sampleSeller)[0]).toEqual(footerColumns({ ...sampleSeller, website: "  " })[0]);
    expect(footerColumns(sampleSeller)[0]!.join(" ")).not.toContain("http");
  });

  it("steht im Rechnungs-PDF", () => {
    const text = pdfText(renderInvoicePdf({ ...sampleDocument(), seller }));
    // Ohne pdftotext (poppler-utils) bleibt es bei der Prüfung der Daten oben
    if (text === null) return;
    expect(text).toContain("https://mustermann.example");
  });

  it("ändert das E-Rechnungs-XML nicht: EN 16931 kennt keine Website des Verkäufers", async () => {
    const mit = await buildEInvoice({ ...sampleDocument(), seller, format: "xrechnung-cii" });
    const ohne = await buildEInvoice({ ...sampleDocument(), format: "xrechnung-cii" });
    expect(mit.xml).toBe(ohne.xml);
  });
});
