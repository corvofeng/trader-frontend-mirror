import React, { useState, useEffect } from 'react';
import { Save, X, Plus, Tag, FolderOpen } from 'lucide-react';
import { Theme, themes } from '../../../shared/constants/theme';
import { stockConfigService } from '../../../lib/services';
import type { StockConfig } from '../../../../../lib/services/types';
import { STOCK_CATEGORIES } from '../../../lib/services/mock/mockData';
import toast from 'react-hot-toast';

interface StockConfigEditorProps {
  stockCode: string;
  theme: Theme;
  onClose: () => void;
}

export function StockConfigEditor({ stockCode, theme, onClose }: StockConfigEditorProps) {
  const [config, setConfig] = useState<StockConfig>({ stock_code: stockCode });
  const [newTag, setNewTag] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data } = await stockConfigService.getStockConfigs();
        if (data) {
          const existingConfig = data.find(c => c.stock_code === stockCode);
          if (existingConfig) {
            setConfig(existingConfig);
          }
        }
      } catch (error) {
        console.error('Failed to fetch stock config:', error);
        toast.error('Failed to load stock configuration');
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [stockCode]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await stockConfigService.updateStockConfig(config);
      if (error) throw error;
      toast.success('Stock configuration saved successfully');
      onClose();
    } catch (error) {
      console.error('Failed to save stock config:', error);
      toast.error('Failed to save stock configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    
    const tags = config.tags || [];
    if (!tags.includes(newTag.trim())) {
      setConfig(prev => ({
        ...prev,
        tags: [...tags, newTag.trim()]
      }));
    }
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setConfig(prev => ({
      ...prev,
      tags: prev.tags?.filter(tag => tag !== tagToRemove) || []
    }));
  };

  if (isLoading) {
    return (
      <div className={`${themes[theme].card} p-6 rounded-lg shadow-md`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-1/3"></div>
          <div className="h-10 bg-gray-300 dark:bg-gray-600 rounded"></div>
          <div className="h-24 bg-gray-300 dark:bg-gray-600 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${themes[theme].card} p-6 rounded-lg shadow-md`}>
      <div className="flex justify-between items-center mb-6">
        <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
          Configure {stockCode}
        </h3>
        <button
          onClick={onClose}
          className={`p-2 rounded-full ${themes[theme].secondary}`}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
            <FolderOpen className="w-4 h-4 inline-block mr-2" />
            Category
          </label>
          <select
            value={config.category || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, category: e.target.value }))}
            className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
          >
            <option value="">Select Category</option>
            {Object.entries(STOCK_CATEGORIES).map(([key, value]) => (
              <option key={key} value={value}>{value}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
            <Tag className="w-4 h-4 inline-block mr-2" />
            Tags
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {config.tags?.map(tag => (
              <span
                key={tag}
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                  theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-2 focus:outline-none"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add new tag"
              className={`flex-1 px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
            />
            <button
              onClick={handleAddTag}
              className={`px-3 py-2 rounded-md ${themes[theme].secondary}`}
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary}`}
          >
            {isSaving ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Save Configuration
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}