/**
 * Website in den Firmendaten: steht so, wie sie eingegeben wurde, im Fuß von Rechnung, Angebot und Mahnung, etwa
 * „colognifornia.com“ oder „https://colognifornia.com“. Nur http(s) und ein Hostname mit Punkt, damit nichts anderes als
 * eine Webadresse (javascript:, mailto:, Freitext) auf dem Beleg landet.
 */
export const MAX_WEBSITE_LENGTH = 200;

const WEBSITE = /^(https?:\/\/)?([\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+\p{L}{2,}(:\d{1,5})?([/?#]\S*)?$/iu;

/** Fehlertext für Formular und Server, null = in Ordnung; leer ist erlaubt */
export function websiteProblem(value: string): string | null {
  const website = value.trim();
  if (!website) return null;
  if (website.length > MAX_WEBSITE_LENGTH) return `Website: höchstens ${MAX_WEBSITE_LENGTH} Zeichen`;
  if (!WEBSITE.test(website)) return "Website: keine gültige Webadresse, etwa „example.com“ oder „https://example.com“";
  return null;
}
