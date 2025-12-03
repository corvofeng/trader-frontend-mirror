import * as htmlToImage from 'html-to-image';

export interface ScreenshotOptions {
  filename?: string;
  quality?: number;
  backgroundColor?: string;
}

export async function captureElement(
  element: HTMLElement,
  options: ScreenshotOptions = {}
): Promise<string> {
  const { backgroundColor = '#ffffff' } = options;

  try {
    const dataUrl = await htmlToImage.toPng(element, {
      canvasWidth: element.scrollWidth,
      canvasHeight: element.scrollHeight,
      backgroundColor,
      pixelRatio: 2,
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains('screenshot-ignore'))
    });
    return dataUrl;
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    throw new Error('截图失败，请重试');
  }
}

export function downloadImage(dataUrl: string, filename: string = 'portfolio-screenshot.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function generateFilename(prefix: string = 'portfolio'): string {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
  return `${prefix}-${timestamp}.png`;
}
