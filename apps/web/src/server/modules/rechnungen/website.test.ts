import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, testDatabaseUrl } from "../../test-db.ts";

describe.skipIf(!testDatabaseUrl)("Website in den Firmendaten (Postgres)", () => {
  let sql: postgres.Sql;
  let invoices: typeof import("./invoices.ts");
  let contacts: typeof import("../stammdaten/contacts.ts");
  let company: typeof import("../stammdaten/company.ts");
  let guard: typeof import("../stammdaten/settings-guard.ts");
  const actor = "test-user";
  const today = "2026-03-02";
  let contactId: string;

  const invoiceDraft = () =>
    invoices.createDraft(actor, {
      contactId,
      issueDate: "2026-03-02",
      serviceFrom: null,
      serviceTo: null,
      paymentTermDays: 14,
      format: "zugferd",
      note: "",
      lines: [{ description: "Beratung", quantity: 1000, unit: "Std.", unitPrice: 10_000, taxRate: 1900 }],
    });

  beforeAll(async () => {
    sql = await setupTestDb();
    invoices = await import("./invoices.ts");
    contacts = await import("../stammdaten/contacts.ts");
    company = await import("../stammdaten/company.ts");
    guard = await import("../stammdaten/settings-guard.ts");
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
  });

  beforeEach(async () => {
    await sql`truncate journal_lines, journal_entries, invoice_lines, invoices,
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

  it("speichert die Website mit den Firmendaten und protokolliert sie", async () => {
    const current = company.companySchema.parse(await company.loadCompany());
    expect(current.website).toBe("");
    await guard.saveCompany(actor, company.companySchema.parse({ ...current, website: "  https://testfirma.example  " }), today);
    expect((await company.loadCompany()).website).toBe("https://testfirma.example");
    const [log] = await sql`select new_value from audit_log where table_name = 'company' and action = 'UPDATE' order by seq desc limit 1`;
    expect(log!.new_value).toMatchObject({ website: "https://testfirma.example" });
  });

  it("lehnt ab, was keine Webadresse ist, und lässt das Feld beim Speichern ohne Angabe leer", async () => {
    const { website: _none, ...current } = company.companySchema.parse(await company.loadCompany());
    expect(company.companySchema.safeParse({ ...current, website: "javascript:alert(1)" }).error?.issues[0]?.message).toMatch(/Website/);
    expect(company.companySchema.parse(current).website).toBe("");
  });

  it("steht im Verkäufer der festgeschriebenen Rechnung", async () => {
    await sql`update company set website = 'testfirma.example' where id = 1`;
    const final = await invoices.finalizeInvoice(actor, (await invoiceDraft()).id);
    expect(final.seller).toMatchObject({ name: "Testfirma", website: "testfirma.example" });
  });

  it("lässt die Website ohne Angabe weg", async () => {
    const final = await invoices.finalizeInvoice(actor, (await invoiceDraft()).id);
    expect(final.seller).not.toHaveProperty("website");
  });

  it("gibt Telefon und Website an die Vorschau im Editor", async () => {
    await sql`update company set telefon = '+49 941 123', website = 'https://testfirma.example' where id = 1`;
    expect((await company.editorContext("rechnung")).company).toMatchObject({ telefon: "+49 941 123", website: "https://testfirma.example" });
  });
});
