import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";

/**
 * Yalnızca kullanılan grafik parçaları kaydedilir. Tüm echarts paketini almak
 * yerine bu yol paket boyutunu ~1 MB küçültür, uygulama daha hızlı açılır.
 */
echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);

export function Chart({ option, height }: { option: unknown; height: number }) {
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height }}
      opts={{ renderer: "svg" }}
      notMerge
    />
  );
}
