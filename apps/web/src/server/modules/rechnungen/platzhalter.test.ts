import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, testDatabaseUrl } from "../../test-db.ts";

/** Platzhalter wie {faellig} oder {datum+7d} in Einleitung und Hinweis (packages/core/src/text-placeholders.ts) */
describe.skipIf(!testDatabaseUrl)("Platzhalter in Einleitung und Hinweis (Postgres)", () => {
  let sql: postgres.Sql;
  let invoices: typeof import("./invoices.ts");
  let quotes: typeof import("./quotes.ts");
  let contacts: typeof import("../stammdaten/contacts.ts");
  const actor = "test-user";
  let contactId: string;

  const lines = [{ description: "Beratung", quantity: 1000, unit: "Std." as const, unitPrice: 10_000, taxRate: 1900 as const }];

  const invoiceDraft = (intro: string, note: string) =>
    invoices.createDraft(actor, {
      contactId,
      issueDate: "2026-11-08",
      serviceFrom: "2026-10-01",
      serviceTo: "2026-10-31",
      paymentTermDays: 28,
      format: "zugferd",
      intro,
      note,
      lines,
    });

  const quoteDraft = (intro: string, note: string) =>
    quotes.createQuoteDraft(actor, {
      contactId,
      issueDate: "2026-11-08",
      validUntil: "2026-12-08",
      serviceFrom: null,
      serviceTo: null,
      intro,
      note,
      lines,
    });

  beforeAll(async () => {
    sql = await setupTestDb();
    invoices = await import("./invoices.ts");
    quotes = await import("./quotes.ts");
    contacts = await import("../stammdaten/contacts.ts");
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
  });

  beforeEach(async () => {
    await sql`truncate quote_lines, quotes, quote_number_counters, journal_lines, journal_entries, invoice_lines, invoices,
      invoice_number_counters, contact_versions, contacts, company cascade`;
    await sql`insert into company (id, name, strasse, plz, ort, email, steuernummer, ust_id, bundesland, iban, bic, bank)
      values (1, 'Testfirma', 'Musterstraße 1', '93047', 'Regensburg', 'rechnung@example.com', '198/113/10010', 'DE123456789', 'BY',
              'DE89370400440532013000', 'COBADEFFXXX', 'Commerzbank')`;
    contactId = (
      await contacts.createContact(actor, {
        kundennummer: "10001",
        name: "Nordwerk Software GmbH",
        strasse: "Hafenstraße 5",
        plz: "20457",
        ort: "Hamburg",
        land: "DE",
        email: "buchhaltung@nordwerk.example",
        ustId: "",
        iban: "",
        leitwegId: "",
        defaultFormat: null,
      })
    ).id;
  });

  it("der Entwurf behält die Platzhalter, damit sie späteren Änderungen an Datum und Zahlungsziel folgen", async () => {
    const draft = await invoiceDraft("", "Zahlbar bis {faellig}.");
    expect((await invoices.getInvoice(draft.id))?.invoice.note).toBe("Zahlbar bis {faellig}.");
  });

  it("schreibt beim Festschreiben den fertigen Text in Rechnung, PDF und XML", async () => {
    const draft = await invoiceDraft(
      "Rechnung {nummer} für Kundennummer {kundennummer}, Leistung {leistungsbeginn} bis {leistungsende}.",
      "Die Rechnung ist innerhalb von {zahlungsziel} Tagen zu begleichen, bis zum {faellig}. Vereinbarung bitte bis zum {datum+7d} zurück.",
    );
    const final = await invoices.finalizeInvoice(actor, draft.id);
    expect(final.intro).toBe(`Rechnung ${final.number} für Kundennummer 10001, Leistung 01.10.2026 bis 31.10.2026.`);
    expect(final.note).toBe("Die Rechnung ist innerhalb von 28 Tagen zu begleichen, bis zum 07.12.2026. Vereinbarung bitte bis zum 15.11.2026 zurück.");
    expect(final.xml).toContain("bis zum 07.12.2026");
    expect(final.xml).not.toContain("{");
  });

  it("lehnt unbekannte Platzhalter beim Festschreiben ab und nennt das Feld", async () => {
    const draft = await invoiceDraft("Hallo {kunde}", "Bis zum {fälig} oder {gueltig}.");
    expect(await invoices.finalizeIssues(draft.id)).toContain("Hinweis: unbekannter Platzhalter {fälig}, {gueltig}");
    await expect(invoices.finalizeInvoice(actor, draft.id)).rejects.toThrow(/unbekannter Platzhalter \{fälig\}/);
    expect((await invoices.getInvoice(draft.id))?.invoice.status).toBe("draft");
  });

  it("ersetzt im Angebot das Gültigkeitsdatum und lehnt die Fälligkeit ab", async () => {
    const draft = await quoteDraft("Angebot {nummer}", "Gültig bis {gueltig}, Rückmeldung bis {gueltig-7d}.");
    const final = await quotes.finalizeQuote(actor, draft.id);
    expect(final.intro).toBe(`Angebot ${final.number}`);
    expect(final.note).toBe("Gültig bis 08.12.2026, Rückmeldung bis 01.12.2026.");

    const wrong = await quoteDraft("Zahlbar bis {faellig}", "");
    expect(await quotes.quoteIssues(wrong.id)).toContain("Einleitung: unbekannter Platzhalter {faellig}");
  });
});
