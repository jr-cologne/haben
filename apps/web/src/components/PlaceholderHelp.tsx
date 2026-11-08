import { INVOICE_TEXT_PLACEHOLDERS, QUOTE_TEXT_PLACEHOLDERS, placeholderIssues, type PlaceholderInfo } from "@haben/core";

type Kind = "rechnung" | "angebot";

const SETS: Record<Kind, Record<string, PlaceholderInfo>> = { rechnung: INVOICE_TEXT_PLACEHOLDERS, angebot: QUOTE_TEXT_PLACEHOLDERS };

/** Platzhalter beider Belegarten in fester Reihenfolge, mit der Art, in der es sie nur gibt */
function entries(kinds: Kind[]): { name: string; info: PlaceholderInfo; only: Kind | null }[] {
  const names = [...new Set(kinds.flatMap((kind) => Object.keys(SETS[kind])))];
  return names.map((name) => {
    const inKinds = kinds.filter((kind) => Object.hasOwn(SETS[kind], name));
    const info = SETS[inKinds[0]!][name]!;
    return { name, info, only: kinds.length > 1 && inKinds.length === 1 ? inKinds[0]! : null };
  });
}

/**
 * Aufklappbare Liste der Platzhalter für Einleitung und Hinweis (packages/core/src/text-placeholders.ts). Mit `texts`
 * nennt sie darunter unbekannte Platzhalter, wie sie das Festschreiben ablehnen würde.
 */
export function PlaceholderHelp({ kinds, texts }: { kinds: Kind[]; texts?: Record<string, string> }) {
  const issues = texts && kinds.length === 1 ? placeholderIssues(texts, SETS[kinds[0]!]) : [];
  return (
    <div className="stack" style={{ gap: 4 }}>
      <details className="small muted">
        <summary>
          Platzhalter wie {"{faellig}"} oder {"{datum+7d}"}
        </summary>
        <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
          {entries(kinds).map(({ name, info, only }) => (
            <li key={name}>
              <code>{`{${name}}`}</code> {info.label}
              {only && ` (nur ${only === "rechnung" ? "Rechnung" : "Angebot"})`}
            </li>
          ))}
        </ul>
        <p style={{ margin: 0 }}>
          An Daten lässt sich rechnen: {"{datum+7d}"} ist das Datum plus 7 Tage, {"{faellig-3d}"} drei Tage vor der Fälligkeit, dazu w für Wochen und m für
          Monate. Im Entwurf zeigt die Vorschau den fertigen Text; beim Festschreiben wird er fest in den Beleg übernommen.
        </p>
      </details>
      {issues.map((issue) => (
        <p key={issue} className="small" role="status" style={{ margin: 0, color: "var(--danger-ink)" }}>
          {issue}
        </p>
      ))}
    </div>
  );
}
