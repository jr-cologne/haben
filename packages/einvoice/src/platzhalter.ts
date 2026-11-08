import { fillTextPlaceholders, invoiceTextValues, quoteTextValues, type TextPlaceholderValues } from "@haben/core";
import { texts, type Texts } from "./i18n.ts";
import type { QuoteDocument } from "./quote.ts";
import type { InvoiceDocument } from "./types.ts";

/**
 * Platzhalter wie {faellig} oder {datum+7d} in Einleitung und Hinweis durch die Daten des Belegs ersetzen, Datum und
 * Betrag in der Sprache des Belegs (packages/core/src/text-placeholders.ts). Für Entwürfe vor jeder Anzeige und
 * beim Festschreiben, danach steht der fertige Text im Beleg.
 */
function fillTexts<T extends { intro?: string; note?: string }>(doc: T, values: TextPlaceholderValues, t: Texts): T {
  const fill = (text: string) => fillTextPlaceholders(text, values, t.date);
  return {
    ...doc,
    ...(doc.intro !== undefined ? { intro: fill(doc.intro) } : {}),
    ...(doc.note !== undefined ? { note: fill(doc.note) } : {}),
  };
}

export function fillInvoiceTexts<T extends InvoiceDocument>(doc: T): T {
  const t = texts(doc.language, doc.currency);
  const values = invoiceTextValues({
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    paymentTermDays: doc.paymentTermDays,
    serviceFrom: doc.serviceFrom ?? null,
    serviceTo: doc.serviceTo ?? null,
    number: doc.number,
    amount: t.money(doc.totals.gross),
    customer: doc.buyer.name,
    customerNumber: doc.buyer.kundennummer ?? "",
    company: doc.seller.name,
  });
  return fillTexts(doc, values, t);
}

export function fillQuoteTexts<T extends QuoteDocument>(doc: T): T {
  const t = texts(doc.language);
  const values = quoteTextValues({
    issueDate: doc.issueDate,
    validUntil: doc.validUntil,
    serviceFrom: doc.serviceFrom ?? null,
    serviceTo: doc.serviceTo ?? null,
    number: doc.number,
    amount: t.money(doc.totals.gross),
    customer: doc.buyer.name,
    customerNumber: doc.buyer.kundennummer ?? "",
    company: doc.seller.name,
  });
  return fillTexts(doc, values, t);
}
