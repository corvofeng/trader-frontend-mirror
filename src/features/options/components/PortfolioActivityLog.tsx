import React from 'react';
import { Theme, themes } from '../../../lib/theme';
import { X, ArrowRight, Activity, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  type: 'new' | 'closed' | 'update';
  symbol: string;
  contract_code_full?: string;
  description: string;
  details?: {
    oldQty?: number;
    newQty?: number;
    price?: number;
  };
}

interface PortfolioActivityLogProps {
  isOpen: boolean;
  onClose: () => void;
  logs: ActivityLogEntry[];
  onClear: () => void;
  theme: Theme;
}

export function PortfolioActivityLog({ isOpen, onClose, logs, onClear, theme }: PortfolioActivityLogProps) {
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-y-0 right-0 w-80 ${themes[theme].card} shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col border-l ${themes[theme].border}`}>
      <div className={`p-4 border-b ${themes[theme].border} flex justify-between items-center`}>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" />
          <h3 className={`font-semibold ${themes[theme].text}`}>持仓变动日志</h3>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onClear}
            className={`p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500`}
            title="清空日志"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button 
            onClick={onClose}
            className={`p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ${themes[theme].text}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {logs.length === 0 ? (
          <div className={`text-center py-8 ${themes[theme].text} opacity-50 text-sm`}>
            暂无变动记录
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`p-3 rounded-lg border ${themes[theme].border} ${themes[theme].background} shadow-sm`}>
              <div className="flex justify-between items-start mb-1">
                <span className={`text-xs font-mono opacity-70 ${themes[theme].text}`}>
                  {format(log.timestamp, 'HH:mm:ss')}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  log.type === 'new' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  log.type === 'closed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}>
                  {log.type === 'new' ? '建仓' : log.type === 'closed' ? '平仓' : '变更'}
                </span>
              </div>
              <div className={`font-medium text-sm mb-1 ${themes[theme].text}`}>
                {log.contract_code_full || log.symbol}
              </div>
              <div className={`text-sm ${themes[theme].text} opacity-90`}>
                {log.description}
              </div>
              {log.type === 'update' && log.details && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                    {log.details.oldQty}
                  </span>
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                  <span className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-300 font-medium">
                    {log.details.newQty}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
