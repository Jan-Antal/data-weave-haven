import { describe, it, expect } from "vitest";
import { fuzzyMatch, fuzzyMatchAny, normalize } from "@/lib/fuzzySearch";

describe("normalize", () => {
  it("strips diacritics and lowercases", () => {
    expect(normalize("Šantovka")).toBe("santovka");
    expect(normalize("Pícha")).toBe("picha");
    expect(normalize("Žlutý")).toBe("zluty");
  });
  it("handles null/undefined", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
  });
});

describe("fuzzyMatch — diacritics", () => {
  it("matches without diacritics", () => {
    expect(fuzzyMatch("Šantovka", "santovka")).toBe(true);
    expect(fuzzyMatch("Pícha s.r.o.", "picha")).toBe(true);
    expect(fuzzyMatch("Žlutý kůň", "zluty")).toBe(true);
  });
});

describe("fuzzyMatch — typos", () => {
  it("tolerates 1-char insertions/deletions", () => {
    expect(fuzzyMatch("Allianz", "alianz")).toBe(true);
    expect(fuzzyMatch("Allianz pojišťovna", "alianz")).toBe(true);
  });
  it("tolerates substitutions (y↔i via diacritic + typo)", () => {
    expect(fuzzyMatch("Pícha", "pycha")).toBe(true);
  });
  it("tolerates transpositions", () => {
    expect(fuzzyMatch("Šantovka", "satnovka")).toBe(true);
  });
});

describe("fuzzyMatch — non-matches", () => {
  it("rejects unrelated tokens", () => {
    expect(fuzzyMatch("Šantovka", "xyz")).toBe(false);
    expect(fuzzyMatch("Allianz", "siemens")).toBe(false);
  });
  it("rejects very short non-exact tokens (no false positives)", () => {
    expect(fuzzyMatch("abcdef", "xyz")).toBe(false);
  });
});

describe("fuzzyMatch — multi-token AND", () => {
  it("requires every token to match", () => {
    expect(fuzzyMatch("Z-2501 Šantovka Praha", "santovka praha")).toBe(true);
    expect(fuzzyMatch("Z-2501 Šantovka Praha", "santovka brno")).toBe(false);
    expect(fuzzyMatch("Z-2501 Šantovka", "san z-25")).toBe(true);
  });
});

describe("fuzzyMatch — empty input", () => {
  it("empty needle matches anything", () => {
    expect(fuzzyMatch("anything", "")).toBe(true);
    expect(fuzzyMatch("anything", "   ")).toBe(true);
  });
  it("empty haystack matches nothing (with non-empty needle)", () => {
    expect(fuzzyMatch("", "x")).toBe(false);
    expect(fuzzyMatch(null, "x")).toBe(false);
  });
});

describe("fuzzyMatchAny", () => {
  it("matches if any field matches", () => {
    expect(fuzzyMatchAny(["Z-2501", "Šantovka", null], "santovka")).toBe(true);
    expect(fuzzyMatchAny(["Z-2501", "Šantovka"], "xyz")).toBe(false);
  });
});
