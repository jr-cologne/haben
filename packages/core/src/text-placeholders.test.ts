import { describe, expect, it } from "vitest";
import {
  INVOICE_TEXT_PLACEHOLDERS,
  QUOTE_TEXT_PLACEHOLDERS,
  fillTextPlaceholders,
  invoiceTextValues,
  placeholderIssues,
  quoteTextValues,
  shiftDate,
  unknownTextPlaceholders,
} from "./text-placeholders.ts";

const german = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const invoice = invoiceTextValues({
  issueDate: "2026-11-08",
  dueDate: "2026-12-06",
  paymentTermDays: 28,
  serviceFrom: "2026-10-01",
  serviceTo: "2026-10-31",
  number: "RE-2026-001",
  amount: "1.190,00 €",
  customer: "Nordwerk Software GmbH",
  customerNumber: "K-0001",
  company: "Colognifornia",
});

const fill = (text: string) => fillTextPlaceholders(text, invoice, german);

describe("fillTextPlaceholders", () => {
  it("ersetzt Daten und Texte der Rechnung", () => {
    expect(fill("Die Rechnung ist bis zum {faellig} ({zahlungsziel} Tage) zu begleichen.")).toBe(
      "Die Rechnung ist bis zum 06.12.2026 (28 Tage) zu begleichen.",
    );
    expect(fill("{nummer} vom {datum} über {betrag} an {kunde} ({kundennummer}), {firma}")).toBe(
      "RE-2026-001 vom 08.11.2026 über 1.190,00 € an Nordwerk Software GmbH (K-0001), Colognifornia",
    );
    expect(fill("Leistung {leistungsbeginn} bis {leistungsende}")).toBe("Leistung 01.10.2026 bis 31.10.2026");
  });

  it("rechnet mit Tagen, Wochen und Monaten ab einem Datum", () => {
    expect(fill("bis zum {datum+7d}")).toBe("bis zum 15.11.2026");
    expect(fill("bis zum {datum+7}")).toBe("bis zum 15.11.2026");
    expect(fill("bis zum {datum+7t}")).toBe("bis zum 15.11.2026");
    expect(fill("bis zum {faellig-3d}")).toBe("bis zum 03.12.2026");
    expect(fill("ab {datum+2w}")).toBe("ab 22.11.2026");
    expect(fill("ab {datum+1m}")).toBe("ab 08.12.2026");
    expect(fill("über den Jahreswechsel {faellig+30d}")).toBe("über den Jahreswechsel 05.01.2027");
  });

  it("schreibt Namen und Einheit auch groß", () => {
    expect(fill("{Faellig} {DATUM+1W}")).toBe("06.12.2026 15.11.2026");
  });

  it("lässt Unbekanntes und Versatz an Texten stehen", () => {
    expect(fill("{unbekannt} {nummer+1d} {gueltig} { datum } {}")).toBe("{unbekannt} {nummer+1d} {gueltig} { datum } {}");
  });

  it("nimmt ohne Leistungszeitraum das Rechnungsdatum, mit nur einem Tag diesen für beide", () => {
    const values = invoiceTextValues({ ...baseInput(), serviceFrom: null, serviceTo: null });
    expect(fillTextPlaceholders("{leistungsbeginn}–{leistungsende}", values, german)).toBe("08.11.2026–08.11.2026");
    const day = invoiceTextValues({ ...baseInput(), serviceFrom: null, serviceTo: "2026-10-15" });
    expect(fillTextPlaceholders("{leistungsbeginn}–{leistungsende}", day, german)).toBe("15.10.2026–15.10.2026");
  });

  it("formatiert Daten mit der übergebenen Funktion, etwa auf Englisch", () => {
    const english = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
    expect(fillTextPlaceholders("by {faellig}", invoice, english)).toBe("by 6 Dec 2026");
  });

  it("kennt im Angebot das Gültigkeitsdatum, aber keine Fälligkeit", () => {
    const quote = quoteTextValues({ ...baseInput(), validUntil: "2026-12-08" });
    expect(fillTextPlaceholders("gültig bis {gueltig}, Antwort bis {datum+14d}", quote, german)).toBe("gültig bis 08.12.2026, Antwort bis 22.11.2026");
    expect(fillTextPlaceholders("{faellig}", quote, german)).toBe("{faellig}");
  });
});

function baseInput() {
  return {
    issueDate: "2026-11-08",
    dueDate: "2026-12-06",
    paymentTermDays: 28,
    serviceFrom: null as string | null,
    serviceTo: null as string | null,
    number: "RE-2026-001",
    amount: "1.190,00 €",
    customer: "Nordwerk Software GmbH",
    customerNumber: "",
    company: "Colognifornia",
  };
}

describe("unknownTextPlaceholders", () => {
  it("nennt jeden unbekannten Platzhalter einmal, in der Reihenfolge im Text", () => {
    expect(unknownTextPlaceholders("{fälig} {faelig} {datum} {faelig} {nummer+3d}", INVOICE_TEXT_PLACEHOLDERS)).toEqual(["{fälig}", "{faelig}", "{nummer+3d}"]);
  });

  it("findet nichts in normalem Text und in bekannten Platzhaltern", () => {
    expect(unknownTextPlaceholders("Danke! {datum+7d} {faellig} {zahlungsziel} {}", INVOICE_TEXT_PLACEHOLDERS)).toEqual([]);
  });

  it("prüft gegen die Platzhalter der Belegart", () => {
    expect(unknownTextPlaceholders("{faellig} {gueltig}", QUOTE_TEXT_PLACEHOLDERS)).toEqual(["{faellig}"]);
    expect(unknownTextPlaceholders("{faellig} {gueltig}", INVOICE_TEXT_PLACEHOLDERS)).toEqual(["{gueltig}"]);
  });
});

describe("shiftDate", () => {
  it("hält das Monatsende ein", () => {
    expect(shiftDate("2026-01-31", 1, "m")).toBe("2026-02-28");
    expect(shiftDate("2028-01-31", 1, "m")).toBe("2028-02-29");
    expect(shiftDate("2026-03-31", -1, "m")).toBe("2026-02-28");
    expect(shiftDate("2026-03-01", -1, "d")).toBe("2026-02-28");
  });
});

describe("placeholderIssues", () => {
  it("nennt je Feld die unbekannten Platzhalter", () => {
    expect(placeholderIssues({ Einleitung: "{kunde}", Hinweis: "{fälig} {gueltig} {faellig}" }, INVOICE_TEXT_PLACEHOLDERS)).toEqual([
      "Hinweis: unbekannter Platzhalter {fälig}, {gueltig}",
    ]);
  });
});
