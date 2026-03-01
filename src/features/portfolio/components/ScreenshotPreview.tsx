import React, { useState } from 'react';
import { X, Download, Share2, AlertCircle, FileText, Image as ImageIcon } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Theme, themes } from '../../../lib/theme';

interface ScreenshotPreviewProps {
  imageUrl: string | null;
  theme: Theme;
  onClose: () => void;
  onSave: () => void;
  contentRef?: React.RefObject<HTMLElement>;
}

export function ScreenshotPreview({ imageUrl, theme, onClose, onSave, contentRef }: ScreenshotPreviewProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleShare = async () => {
    if (!imageUrl) return;

    try {
      setIsSharing(true);
      
      // Convert Data URL to Blob
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], `trading-journal-${new Date().toISOString().split('T')[0]}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Trading Journal Screenshot',
        });
      } else {
        // Fallback or notification if sharing is not supported
        console.warn('Web Share API not supported or file sharing not allowed');
        alert('您的浏览器不支持直接分享图片，请使用保存功能。');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      if ((error as Error).name !== 'AbortError') {
        // Ignore user cancellation
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleSavePdf = async () => {
    if (!imageUrl) return;

    try {
      setIsGeneratingPdf(true);

      const img = new Image();
      img.src = imageUrl;
      await new Promise((resolve) => { img.onload = resolve; });

      // Calculate PDF dimensions based on image aspect ratio
      // 使用 A4 宽度 (210mm) 作为基准，高度自适应，确保填满页面
      const pdfWidth = 210;
      const pdfHeight = (img.height / img.width) * pdfWidth;
      
      const pdf = new jsPDF({
        orientation: pdfWidth > pdfHeight ? 'l' : 'p',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      });

      // 优化：将 PNG 转换为 JPEG 以减小体积
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // 填充白色背景（防止 PNG 透明区域变黑）
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        // 使用 JPEG 格式，0.75 质量压缩，显著减小体积
        const jpegUrl = canvas.toDataURL('image/jpeg', 0.75);
        pdf.addImage(jpegUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      } else {
        // 降级处理
        pdf.addImage(imageUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      }

      const filename = `trading-journal-${new Date().toISOString().split('T')[0]}.pdf`;
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Trading Journal PDF',
            text: 'Here is my trading journal screenshot in PDF.',
          });
        } catch (shareError) {
          if ((shareError as Error).name !== 'AbortError') {
            console.warn('Share failed, falling back to download', shareError);
            pdf.save(filename);
          }
        }
      } else {
        pdf.save(filename);
      }

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('PDF生成失败，请重试');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className={`${themes[theme].card} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col`}>
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className={`text-lg font-semibold ${themes[theme].text}`}>
            持仓预览
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-md ${themes[theme].secondary}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-auto">
          {imageUrl ? (
            <div className={`${themes[theme].background} rounded-lg p-2 flex justify-center`}>
              <img 
                src={imageUrl} 
                alt="持仓数据截图" 
                className="max-w-full h-auto rounded shadow-lg"
              />
            </div>
          ) : (
            <div className={`flex justify-center items-center h-64 ${themes[theme].text} opacity-70`}>
              生成截图中...
            </div>
          )}
        </div>
        
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-800">
          <div className="flex gap-2 text-sm text-yellow-800 dark:text-yellow-200">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>
              提示：微信发送图片时会自动压缩。为确保清晰度，请在微信发送时勾选<strong>【原图】</strong>，或先保存到<strong>【文件】</strong>再发送。
              <br />
              您也可以直接<strong>下载 PDF</strong>，PDF 文件在微信发送时通常不会被压缩。
            </p>
          </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-3 flex-wrap">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
          >
            取消
          </button>
          
          <button
            onClick={handleSavePdf}
            disabled={!imageUrl || isGeneratingPdf}
            className={`px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2 disabled:opacity-50`}
          >
            <FileText className="w-4 h-4" />
            {isGeneratingPdf ? '处理中...' : (canShare ? '分享 PDF' : '下载 PDF')}
          </button>

          {canShare && (
            <button
              onClick={handleShare}
              disabled={!imageUrl || isSharing}
              className={`px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 disabled:opacity-50`}
            >
              <Share2 className="w-4 h-4" />
              {isSharing ? '分享中...' : '分享 / AirDrop'}
            </button>
          )}

          <button
            onClick={onSave}
            className={`px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2`}
            disabled={!imageUrl}
          >
            <Download className="w-4 h-4" />
            保存图片
          </button>
        </div>
      </div>
    </div>
  );
}
