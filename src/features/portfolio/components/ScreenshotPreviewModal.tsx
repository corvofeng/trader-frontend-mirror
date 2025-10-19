import React, { useState } from 'react';
import { X, Download, Share2 } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';

interface ScreenshotPreviewModalProps {
  theme: Theme;
  isOpen: boolean;
  onClose: () => void;
  screenshotDataUrl: string | null;
  onSave: () => void;
}

export function ScreenshotPreviewModal({
  theme,
  isOpen,
  onClose,
  screenshotDataUrl,
  onSave
}: ScreenshotPreviewModalProps) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !screenshotDataUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div className={`relative max-w-4xl max-h-[90vh] w-full ${themes[theme].card} rounded-lg shadow-xl overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${themes[theme].border}`}>
          <div className="flex items-center space-x-2">
            <Share2 className="w-5 h-5 text-blue-500" />
            <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
              预览分享截图
            </h3>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview */}
        <div className="p-4 max-h-[60vh] overflow-auto">
          <div className={`border ${themes[theme].border} rounded-lg overflow-hidden`}>
            <img
              src={screenshotDataUrl}
              alt="Portfolio Screenshot Preview"
              className="w-full h-auto"
            />
          </div>
        </div>

        {/* Actions */}
        <div className={`flex items-center justify-between p-4 border-t ${themes[theme].border}`}>
          <div className={`text-sm ${themes[theme].text} opacity-60`}>
            点击保存将下载截图到本地
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-md ${themes[theme].secondary} transition-colors`}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-4 py-2 rounded-md ${themes[theme].primary} transition-colors flex items-center space-x-2 disabled:opacity-50`}
            >
              <Download className="w-4 h-4" />
              <span>{saving ? '保存中...' : '保存截图'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}