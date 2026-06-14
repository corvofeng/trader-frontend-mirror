export type OptionsChartEngine = 'tradingview' | 'plotly' | 'echarts';

export interface PlotlyLike {
  newPlot: (
    root: HTMLElement,
    data: unknown[],
    layout?: Record<string, unknown>,
    config?: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
  purge: (root: HTMLElement) => void;
  Plots?: {
    resize: (root: HTMLElement) => void;
  };
}

export interface PlotlyPointEvent {
  pointIndex?: number;
  pointNumber?: number;
  x?: string | number;
  y?: string | number;
}

export interface PlotlyHoverEvent {
  points?: PlotlyPointEvent[];
}

export interface PlotlyHTMLElement extends HTMLDivElement {
  on?: (event: 'plotly_hover' | 'plotly_unhover', handler: (event: PlotlyHoverEvent) => void) => void;
  removeAllListeners?: (event?: 'plotly_hover' | 'plotly_unhover') => void;
}

declare global {
  interface Window {
    Plotly?: PlotlyLike;
  }
}

const PLOTLY_SCRIPT_ID = 'plotly-cdn-script';
const PLOTLY_CDN_URL = 'https://cdn.plot.ly/plotly-2.35.2.min.js';

let plotlyLoaderPromise: Promise<PlotlyLike> | null = null;

export const loadPlotly = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Plotly can only be loaded in the browser.'));
  }

  if (window.Plotly) {
    return Promise.resolve(window.Plotly);
  }

  if (plotlyLoaderPromise) {
    return plotlyLoaderPromise;
  }

  plotlyLoaderPromise = new Promise<PlotlyLike>((resolve, reject) => {
    const existingScript = document.getElementById(PLOTLY_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement('script');

    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };

    const handleLoad = () => {
      cleanup();
      if (window.Plotly) {
        resolve(window.Plotly);
        return;
      }
      plotlyLoaderPromise = null;
      reject(new Error('Plotly loaded but window.Plotly is unavailable.'));
    };

    const handleError = () => {
      cleanup();
      plotlyLoaderPromise = null;
      reject(new Error('Failed to load Plotly from CDN.'));
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);

    if (!existingScript) {
      script.id = PLOTLY_SCRIPT_ID;
      script.src = PLOTLY_CDN_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return plotlyLoaderPromise;
};
