import React from 'react';
import { X, Download, Share2 } from 'lucide-react';
import { Theme, themes } from '../../../shared/constants/theme';

interface ScreenshotPreviewProps {
  imageUrl: string | null;
  theme: Theme;
  onClose: () => void;
  onSave: () => void;
}

export function ScreenshotPreview({ imageUrl, theme, onClose, onSave }: ScreenshotPreviewProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className={`${themes[theme].card} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col`}>
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className={`text-lg font-semibold ${themes[theme].text}`}>
            持仓数据预览
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
        
        <div className="p-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
          >
            取消
          </button>
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