import { describe, expect, it } from "vitest";
import { MAX_WEBSITE_LENGTH, websiteProblem } from "./website.ts";

describe("websiteProblem", () => {
  it("lässt leer und Adressen mit oder ohne https:// zu", () => {
    for (const ok of [
      "",
      "  ",
      "colognifornia.com",
      "https://colognifornia.com",
      "http://www.example.de/kontakt",
      "https://münchen.example:8443/a?b=c",
      "sub.domain.example.co.uk/",
    ])
      expect(websiteProblem(ok), ok).toBeNull();
  });

  it("lehnt ab, was keine Webadresse ist", () => {
    for (const bad of [
      "keine adresse",
      "localhost",
      "javascript:alert(1)",
      "ftp://example.com",
      "https://",
      "example",
      "mailto:a@example.com",
      "https://exa mple.com",
    ])
      expect(websiteProblem(bad), bad).toMatch(/Website/);
  });

  it("begrenzt die Länge", () => {
    expect(websiteProblem(`https://example.com/${"a".repeat(MAX_WEBSITE_LENGTH)}`)).toMatch(/höchstens/);
  });
});
