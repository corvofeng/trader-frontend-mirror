import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Activity, RefreshCw, CheckCircle, XCircle, Calendar, Filter, Eye, EyeOff } from 'lucide-react';
import { Theme, themes } from '../../../../lib/theme';
import { operationService } from '../../../../lib/services';
import type { Operation } from '../../../../lib/services/types';
import { OperationsChart } from './OperationsChart';

interface OperationsViewProps {
  theme: Theme;
}

export function OperationsView({ theme }: OperationsViewProps) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [showDetails, setShowDetails] = useState(false);

  const fetchOperations = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const { data, error } = await operationService.getOperations(
        dateRange.startDate,
        dateRange.endDate
      );

      if (error) throw error;
      if (data) setOperations(data);
    } catch (error) {
      console.error('Error fetching operations:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOperations();
  }, [dateRange]);

  const filteredOperations = operations.filter(op => 
    filter === 'all' || op.result === filter
  );

  const successCount = operations.filter(op => op.result === 'success').length;
  const failedCount = operations.filter(op => op.result === 'failed').length;
  const successRate = operations.length > 0 ? (successCount / operations.length) * 100 : 0;

  const getStatusIcon = (result: string) => {
    return result === 'success' ? (
      <CheckCircle className="w-5 h-5 text-green-500" />
    ) : (
      <XCircle className="w-5 h-5 text-red-500" />
    );
  };

  const getStatusColor = (result: string) => {
    return result === 'success'
      ? theme === 'dark' 
        ? 'bg-green-900 text-green-100' 
        : 'bg-green-100 text-green-800'
      : theme === 'dark'
        ? 'bg-red-900 text-red-100'
        : 'bg-red-100 text-red-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="flex items-center gap-3">
              <Activity className="w-6 h-6 text-blue-500" />
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                System Operations
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => fetchOperations(true)}
                disabled={isRefreshing}
                className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].secondary} ${
                  isRefreshing ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>Total Operations</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {operations.length}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>Successful</h3>
              <p className={`text-2xl font-bold text-green-600 mt-1`}>
                {successCount}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>Failed</h3>
              <p className={`text-2xl font-bold text-red-600 mt-1`}>
                {failedCount}
              </p>
            </div>
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h3 className={`text-sm font-medium ${themes[theme].text} opacity-75`}>Success Rate</h3>
              <p className={`text-2xl font-bold ${themes[theme].text} mt-1`}>
                {successRate.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <Calendar className={`w-4 h-4 ${themes[theme].text}`} />
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
              />
              <span className={`text-sm ${themes[theme].text}`}>to</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className={`w-4 h-4 ${themes[theme].text}`} />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value="all">All Operations</option>
                <option value="success">Successful Only</option>
                <option value="failed">Failed Only</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDetails(prev => !prev)}
                className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].secondary}`}
              >
                {showDetails ? (
                  <EyeOff className="w-4 h-4 mr-2" />
                ) : (
                  <Eye className="w-4 h-4 mr-2" />
                )}
                {showDetails ? '隐藏详细日志' : '显示详细日志'}
              </button>
            </div>
          </div>
        </div>

        {/* Operations List */}
        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading operations...</p>
            </div>
          ) : filteredOperations.length === 0 ? (
            <div className="text-center py-12">
              <Activity className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>No operations found</p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                {filter === 'all' 
                  ? 'No operations recorded in the selected date range'
                  : `No ${filter} operations found`
                }
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Chart: Daily counts grouped by operation */}
              <div className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}>
                <OperationsChart theme={theme} operations={filteredOperations} dateRange={dateRange} />
              </div>

              {/* Raw list */}
              {showDetails && (
                <div className="space-y-3">
                  {filteredOperations.map((operation, index) => (
                    <div
                      key={`${operation.func_name}-${operation.call_time}-${index}`}
                      className={`${themes[theme].background} rounded-lg p-4 border ${themes[theme].border}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(operation.result)}
                          <div>
                            <h3 className={`text-sm font-medium ${themes[theme].text}`}>
                              {operation.func_name}
                            </h3>
                            <p className={`text-xs ${themes[theme].text} opacity-75`}>
                              {format(new Date(operation.call_time), 'MMM d, yyyy HH:mm:ss')}
                            </p>
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(operation.result)}`}>
                          {operation.result.charAt(0).toUpperCase() + operation.result.slice(1)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}