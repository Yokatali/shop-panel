import { useMemo } from "react";
import { useShop } from "../data/store";

export type ChartTheme = {
  cyan: string;
  cyanFade: string;
  violet: string;
  red: string;
  muted: string;
  text: string;
  grid: string;
  border: string;
  tooltipBg: string;
};

/** Grafik renkleri tema ile birlikte değişir; açık temada okunur kalır. */
export function useChartTheme(): ChartTheme {
  const { settings } = useShop();
  return useMemo<ChartTheme>(() => {
    if (settings.theme === "dark") {
      return {
        cyan: "#38d9f0",
        cyanFade: "rgba(56, 217, 240, 0.22)",
        violet: "#a78bfa",
        red: "#fb7185",
        muted: "#98a1b3",
        text: "#f2f5fa",
        grid: "rgba(148, 158, 176, 0.14)",
        border: "rgba(255, 255, 255, 0.10)",
        tooltipBg: "rgba(20, 25, 34, 0.97)",
      };
    }
    return {
      cyan: "#0e7f9b",
      cyanFade: "rgba(14, 127, 155, 0.20)",
      violet: "#6d51cf",
      red: "#d33f59",
      muted: "#5d6577",
      text: "#12151c",
      grid: "rgba(24, 31, 45, 0.10)",
      border: "rgba(24, 31, 45, 0.12)",
      tooltipBg: "rgba(255, 255, 255, 0.98)",
    };
  }, [settings.theme]);
}
