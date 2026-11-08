import { addDays } from "./holidays.ts";
import { addMonthsAnchored } from "./recurring.ts";

/*
 * Platzhalter in Einleitung (Kopftext) und Hinweis (Fußtext) von Rechnung und Angebot, etwa aus einem Textbaustein:
 * „Die Rechnung ist bis zum {faellig} zu begleichen.“ Die Namen folgen den E-Mail-Vorlagen ({nummer}, {datum},
 * {faellig}, {betrag}, {kunde}, {firma}, {gueltig}). An Daten lässt sich rechnen: {datum+7d} ist das Rechnungsdatum
 * plus sieben Tage, {faellig-3d} drei Tage vor der Fälligkeit; Einheiten d oder t (Tage, auch ohne Einheit), w (Wochen)
 * und m (Monate, am Monatsende gekappt).
 *
 * Im Entwurf ersetzt Haben die Platzhalter bei jeder Anzeige (Vorschau, Entwurfs-PDF), beim Festschreiben steht der
 * fertige Text im Beleg, wie er im PDF und im XML (BT-22) steht. Unbekannte Platzhalter bleiben stehen; das
 * Festschreiben lehnt sie ab, damit kein Tippfehler auf einem gesperrten Beleg landet.
 */

export type PlaceholderKind = "date" | "text";

export interface PlaceholderInfo {
  kind: PlaceholderKind;
  /** Für Hilfe und Doku */
  label: string;
}

const COMMON = {
  datum: { kind: "date", label: "Rechnungs- bzw. Angebotsdatum" },
  leistungsbeginn: { kind: "date", label: "Beginn des Leistungszeitraums; ohne Zeitraum das Leistungs- bzw. Belegdatum" },
  leistungsende: { kind: "date", label: "Ende des Leistungszeitraums; ohne Zeitraum das Leistungs- bzw. Belegdatum" },
  nummer: { kind: "text", label: "Nummer des Belegs; im Entwurf „ENTWURF“" },
  betrag: { kind: "text", label: "Gesamtbetrag (brutto)" },
  kunde: { kind: "text", label: "Name des Kunden" },
  kundennummer: { kind: "text", label: "Kundennummer, leer ohne" },
  firma: { kind: "text", label: "Name deiner Firma" },
} as const satisfies Record<string, PlaceholderInfo>;

export const INVOICE_TEXT_PLACEHOLDERS = {
  ...COMMON,
  faellig: { kind: "date", label: "Fälligkeitsdatum (Rechnungsdatum plus Zahlungsziel)" },
  zahlungsziel: { kind: "text", label: "Zahlungsziel in Tagen, z. B. 28" },
} as const satisfies Record<string, PlaceholderInfo>;

export const QUOTE_TEXT_PLACEHOLDERS = {
  ...COMMON,
  gueltig: { kind: "date", label: "Gültig bis" },
} as const satisfies Record<string, PlaceholderInfo>;

export type PlaceholderSet = Record<string, PlaceholderInfo>;

/** Werte je Platzhalter: Daten als ISO-Datum (formatiert wird beim Einsetzen), Texte fertig formatiert */
export interface TextPlaceholderValues {
  dates: Record<string, string>;
  texts: Record<string, string>;
}

export type DateUnit = "d" | "w" | "m";

/** Datum plus bzw. minus Tage, Wochen oder Monate; Monate wie bei wiederkehrenden Rechnungen am Monatsende gekappt */
export function shiftDate(isoDate: string, amount: number, unit: DateUnit): string {
  if (unit === "m") return addMonthsAnchored(isoDate, amount, Number(isoDate.slice(8, 10)));
  return addDays(isoDate, unit === "w" ? amount * 7 : amount);
}

/** {name}, {name+7}, {name-3d}, {name+2w}, {name+1m}; Groß- und Kleinschreibung egal */
const PLACEHOLDER = /\{([\p{L}_]+)(?:([+-])(\d{1,4})([dtwm])?)?\}/giu;

interface Match {
  name: string;
  offset: { amount: number; unit: DateUnit } | null;
}

function parse(name: string, sign: string | undefined, amount: string | undefined, unit: string | undefined): Match {
  if (!sign || amount === undefined) return { name: name.toLowerCase(), offset: null };
  const u = (unit ?? "d").toLowerCase();
  return { name: name.toLowerCase(), offset: { amount: Number(amount) * (sign === "-" ? -1 : 1), unit: u === "w" || u === "m" ? u : "d" } };
}

/** Ersetzt die Platzhalter, deren Wert bekannt ist; alles andere bleibt, wie es ist */
export function fillTextPlaceholders(text: string, values: TextPlaceholderValues, formatDate: (iso: string) => string): string {
  return text.replace(PLACEHOLDER, (match, name: string, sign?: string, amount?: string, unit?: string) => {
    const { name: key, offset } = parse(name, sign, amount, unit);
    const date = values.dates[key];
    if (date !== undefined) return formatDate(offset ? shiftDate(date, offset.amount, offset.unit) : date);
    const value = values.texts[key];
    return value !== undefined && !offset ? value : match;
  });
}

/** Platzhalter, die die Belegart nicht kennt oder mit Versatz an einem Text; jeder einmal, in der Reihenfolge im Text */
export function unknownTextPlaceholders(text: string, known: PlaceholderSet): string[] {
  const unknown = new Set<string>();
  for (const [match, name, sign, amount, unit] of text.matchAll(PLACEHOLDER)) {
    const { name: key, offset } = parse(name!, sign, amount, unit);
    const info = Object.hasOwn(known, key) ? known[key] : undefined;
    if (!info || (offset && info.kind !== "date")) unknown.add(match);
  }
  return [...unknown];
}

/** Was Rechnung und Angebot gemeinsam haben; Beträge und Daten so, wie sie im Beleg stehen */
export interface TextPlaceholderInput {
  issueDate: string;
  serviceFrom: string | null;
  serviceTo: string | null;
  number: string;
  /** Gesamtbetrag, fertig formatiert in Sprache und Währung des Belegs */
  amount: string;
  customer: string;
  customerNumber: string;
  company: string;
}

function commonValues(input: TextPlaceholderInput): TextPlaceholderValues {
  return {
    dates: {
      datum: input.issueDate,
      // Wie im Kopf des PDFs: ein einzelner Tag gilt als Beginn und Ende, ohne Angabe das Belegdatum
      leistungsbeginn: input.serviceFrom ?? input.serviceTo ?? input.issueDate,
      leistungsende: input.serviceTo ?? input.serviceFrom ?? input.issueDate,
    },
    texts: {
      nummer: input.number,
      betrag: input.amount,
      kunde: input.customer,
      kundennummer: input.customerNumber,
      firma: input.company,
    },
  };
}

export function invoiceTextValues(input: TextPlaceholderInput & { dueDate: string; paymentTermDays: number }): TextPlaceholderValues {
  const common = commonValues(input);
  return {
    dates: { ...common.dates, faellig: input.dueDate },
    texts: { ...common.texts, zahlungsziel: String(input.paymentTermDays) },
  };
}

export function quoteTextValues(input: TextPlaceholderInput & { validUntil: string }): TextPlaceholderValues {
  const common = commonValues(input);
  return { dates: { ...common.dates, gueltig: input.validUntil }, texts: common.texts };
}

/** Hinweise vor dem Festschreiben je Feld, etwa „Hinweis: unbekannter Platzhalter {fälig}“; leer = in Ordnung */
export function placeholderIssues(fields: Record<string, string>, known: PlaceholderSet): string[] {
  return Object.entries(fields).flatMap(([label, text]) => {
    const unknown = unknownTextPlaceholders(text, known);
    return unknown.length > 0 ? [`${label}: unbekannter Platzhalter ${unknown.join(", ")}`] : [];
  });
}
