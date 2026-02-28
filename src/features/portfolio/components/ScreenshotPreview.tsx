import React, { useState } from 'react';
import { X, Download, Share2, AlertCircle } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';

interface ScreenshotPreviewProps {
  imageUrl: string | null;
  theme: Theme;
  onClose: () => void;
  onSave: () => void;
}

export function ScreenshotPreview({ imageUrl, theme, onClose, onSave }: ScreenshotPreviewProps) {
  const [isSharing, setIsSharing] = useState(false);

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
            </p>
          </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
          >
            取消
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
