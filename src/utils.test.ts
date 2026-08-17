import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatPhone,
  isValidPhone,
  monthGrid,
  moneyToInput,
  normalizePhone,
  parseInteger,
  parseMoney,
  sanitizeIntegerText,
  sanitizeMoneyText,
  toIso,
} from "./utils";

describe("para alanları", () => {
  it("Türkçe ve İngilizce yazımı kuruşa çevirir", () => {
    expect(parseMoney("1299,90")).toBe(129_990);
    expect(parseMoney("1299.90")).toBe(129_990);
    expect(parseMoney("1.500")).toBe(150_000);
    expect(parseMoney("1.234.567")).toBe(123_456_700);
    expect(parseMoney("0,05")).toBe(5);
    expect(parseMoney("")).toBe(0);
  });

  it("sıfırı boş gösterir, böylece alanda takılı '0' kalmaz", () => {
    expect(moneyToInput(0)).toBe("");
    expect(moneyToInput(50_000)).toBe("500");
    expect(moneyToInput(129_990)).toBe("1299,90");
  });

  it("yazarken ikinci bir ondalık ayraca izin vermez", () => {
    expect(sanitizeMoneyText("15,0,0")).toBe("15,00");
    expect(sanitizeMoneyText("1500")).toBe("1500");
    expect(sanitizeMoneyText("15.5")).toBe("15,5");
    expect(sanitizeMoneyText("12a3")).toBe("123");
  });

  it("gidiş dönüş değeri korur", () => {
    for (const kurus of [0, 5, 150_000, 129_990, 1_975_000]) {
      expect(parseMoney(moneyToInput(kurus))).toBe(kurus);
    }
  });

  it("Türk lirası biçimlendirir", () => {
    expect(formatMoney(129_990)).toContain("1.299,90");
  });
});

describe("adet alanları", () => {
  it("baştaki sıfırları atar", () => {
    expect(sanitizeIntegerText("050")).toBe("50");
    expect(sanitizeIntegerText("0")).toBe("0");
    expect(sanitizeIntegerText("007")).toBe("7");
    expect(parseInteger("050")).toBe(50);
    expect(parseInteger("")).toBe(0);
  });
});

describe("telefon numarası", () => {
  it("ülke kodunu ve baştaki sıfırı temizler", () => {
    expect(normalizePhone("+90 532 123 45 67")).toBe("5321234567");
    expect(normalizePhone("0532 123 45 67")).toBe("5321234567");
    expect(normalizePhone("5321234567")).toBe("5321234567");
  });

  it("eksik veya fazla haneli numarayı kabul etmez", () => {
    expect(isValidPhone("5321234567")).toBe(true);
    expect(isValidPhone("0212 555 44 33")).toBe(true);
    expect(isValidPhone("532123456")).toBe(false);
    expect(isValidPhone("23423423342343")).toBe(false);
    expect(isValidPhone("1234567890")).toBe(false);
  });

  it("okunur biçimde gösterir", () => {
    expect(formatPhone("5321234567")).toBe("0(532) 123 45 67");
  });
});

describe("takvim", () => {
  it("yerel saatte gün kaydırmaz", () => {
    expect(toIso(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toIso(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("pazartesi ile başlayan 42 hücrelik ızgara üretir", () => {
    const grid = monthGrid(2026, 7);
    expect(grid).toHaveLength(42);
    expect(grid[0].date.getDay()).toBe(1);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
  });
});
