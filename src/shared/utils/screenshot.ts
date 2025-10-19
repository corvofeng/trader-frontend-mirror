import html2canvas from 'html2canvas';

export interface ScreenshotOptions {
  filename?: string;
  quality?: number;
  backgroundColor?: string;
}

export async function captureElement(
  element: HTMLElement,
  options: ScreenshotOptions = {}
): Promise<string> {
  const {
    quality = 0.92,
    backgroundColor = '#ffffff'
  } = options;

  try {
    const canvas = await html2canvas(element, {
      backgroundColor,
      useCORS: true,
      allowTaint: true,
      scale: 2, // 高清截图
      logging: false,
      width: element.scrollWidth,
      height: element.scrollHeight,
      ignoreElements: (element) => {
        // 忽略截图按钮本身
        return element.classList.contains('screenshot-ignore');
      }
    });

    return canvas.toDataURL('image/png', quality);
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