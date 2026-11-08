import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pdfData, renderInvoiceDraftPdf } from "./pdf.ts";
import { fillInvoiceTexts, fillQuoteTexts } from "./platzhalter.ts";
import { quotePdfData, type QuoteDocument } from "./quote.ts";
import { sampleBuyer, sampleDocument, sampleSeller } from "./samples.ts";
import { buildEInvoice } from "./xml.ts";

/** Platzhalter in Einleitung und Hinweis (packages/core/src/text-placeholders.ts) mit den Daten des Belegs */

/** Text eines PDFs mit pdftotext (poppler-utils); ohne das Werkzeug null */
function pdfText(pdf: Uint8Array): string | null {
  const dir = mkdtempSync(join(tmpdir(), "haben-platzhalter-"));
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

const doc = () => ({
  ...sampleDocument(),
  buyer: { ...sampleBuyer, kundennummer: "K-0007" },
  intro: "Rechnung {nummer} für {kunde} ({kundennummer}), Leistung {leistungsbeginn} bis {leistungsende}.",
  note: "Die Rechnung ist innerhalb von {zahlungsziel} Tagen bis zum {faellig} über {betrag} zu begleichen. Ratenzahlung: Vereinbarung bis {datum+7d} zurück an {firma}.",
});

describe("fillInvoiceTexts", () => {
  it("setzt Nummer, Daten, Betrag und Namen der Rechnung ein", () => {
    const filled = fillInvoiceTexts(doc());
    expect(filled.intro).toBe(`Rechnung 2026-034 für ${sampleBuyer.name} (K-0007), Leistung 01.09.2026 bis 30.09.2026.`);
    const gross = pdfData(doc()).totals.gross.value;
    expect(filled.note).toBe(
      `Die Rechnung ist innerhalb von 14 Tagen bis zum 16.10.2026 über ${gross} zu begleichen. Ratenzahlung: Vereinbarung bis 09.10.2026 zurück an ${sampleSeller.name}.`,
    );
  });

  it("schreibt auf englischen Rechnungen Datum und Betrag englisch", () => {
    const filled = fillInvoiceTexts({ ...doc(), language: "en", note: "Payable by {faellig} ({betrag})." });
    expect(filled.note).toMatch(/^Payable by 16 Oct 2026 \(€[\d,.]+\)\.$/);
  });

  it("lässt Belege ohne Einleitung und Hinweis unverändert", () => {
    const { intro: _i, note: _n, ...plain } = doc();
    expect(fillInvoiceTexts(plain)).toEqual(plain);
  });

  it("zeigt sie im Entwurfs-PDF ersetzt, die Nummer als ENTWURF", () => {
    const { number: _none, ...draft } = { ...doc(), note: "Rechnung {nummer}, zahlbar bis {faellig}." };
    const text = pdfText(renderInvoiceDraftPdf(draft).pdf);
    // Ohne pdftotext (poppler-utils) bleibt es bei den Prüfungen der Daten
    if (text === null) return;
    expect(text.replace(/\s+/g, " ")).toContain("Rechnung ENTWURF, zahlbar bis 16.10.2026.");
  });

  it("geht so ins XML (BT-22)", async () => {
    const { xml } = await buildEInvoice({ ...fillInvoiceTexts(doc()), format: "xrechnung-cii" });
    expect(xml).toContain("bis zum 16.10.2026");
    expect(xml).not.toContain("{faellig}");
  });
});

describe("fillQuoteTexts", () => {
  it("kennt im Angebot das Gültigkeitsdatum", () => {
    const quote: QuoteDocument = {
      number: "AN-2026-003",
      issueDate: "2026-10-02",
      validUntil: "2026-11-01",
      seller: sampleSeller,
      buyer: sampleBuyer,
      lines: sampleDocument().lines,
      totals: sampleDocument().totals,
      intro: "Angebot {nummer} vom {datum}, gültig bis {gueltig}.",
      note: "Bitte antworten Sie bis {gueltig-7d}.",
    };
    const filled = fillQuoteTexts(quote);
    expect(filled.intro).toBe("Angebot AN-2026-003 vom 02.10.2026, gültig bis 01.11.2026.");
    expect(quotePdfData(filled).note).toBe("Bitte antworten Sie bis 25.10.2026.");
  });
});
