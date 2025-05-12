import React, { useEffect, useRef, useState } from 'react';
import { format, startOfDay, endOfDay, subDays, parseISO, isSameDay, differenceInDays } from 'date-fns';
import { formatInTimeZone, utcToZonedTime } from 'date-fns-tz';
import * as echarts from 'echarts';
import { Calendar, ListFilter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Theme, themes } from '../../../../lib/theme';
import { operationService } from '../../../../lib/services';
// import { generateMockOperations } from '../../../../lib/services/mock';
import type { Operation } from '../../../../lib/services/types';

interface OperationsViewProps {
  theme: Theme;
}

export function OperationsView({ theme }: OperationsViewProps) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [dateRange, setDateRange] = useState({
    startDate: format(startOfDay(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfDay(new Date()), 'yyyy-MM-dd')
  });
  
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const fetchOperations = async () => {
    setIsLoading(true);
    try {
      // Use generateMockOperations if operationService.getOperations fails
      try {
        const { data } = await operationService.getOperations(dateRange.startDate, dateRange.endDate);
        if (data) {
          setOperations(data);
          setCurrentPage(1);
        }
      } catch (error) {
        console.error("Failed to get operations", error)
        // Fallback to mock data
        const mockData = generateMockOperations(dateRange.startDate, dateRange.endDate);
        setOperations(mockData);
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Failed to fetch operations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOperations();
  }, [dateRange]);

  useEffect(() => {
    if (!chartRef.current || operations.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const startDate = parseISO(dateRange.startDate);
    const endDate = parseISO(dateRange.endDate);
    const daysDifference = differenceInDays(endDate, startDate);
    const showHourly = daysDifference <= 2;

    // Generate time slots based on date range
    const timeSlots: string[] = [];
    let current = new Date(startDate);
    
    if (showHourly) {
      // For 2 days or less, generate hourly slots for each day
      while (current <= endDate) {
        for (let hour = 0; hour < 24; hour++) {
          timeSlots.push(format(new Date(current.getFullYear(), current.getMonth(), current.getDate(), hour), 'yyyy-MM-dd HH:00'));
        }
        current.setDate(current.getDate() + 1);
      }
    } else {
      // For more than 2 days, generate daily slots
      while (current <= endDate) {
        timeSlots.push(format(current, 'yyyy-MM-dd'));
        current.setDate(current.getDate() + 1);
      }
    }

    // Initialize data structure
    const timeMap = new Map<string, Map<string, number>>();
    const functionNames = new Set<string>();

    // Initialize all time slots with zero counts
    timeSlots.forEach(slot => {
      timeMap.set(slot, new Map());
    });

    // Process operations data
    operations.forEach(op => {
      const localDate = utcToZonedTime(op.call_time, timezone);
      const timeKey = showHourly
        ? format(localDate, 'yyyy-MM-dd HH:00')
        : format(localDate, 'yyyy-MM-dd');

      if (!timeMap.has(timeKey)) {
        timeMap.set(timeKey, new Map());
      }
      const funcCount = timeMap.get(timeKey)!;
      funcCount.set(op.func_name, (funcCount.get(op.func_name) || 0) + 1);
      functionNames.add(op.func_name);
    });

    const times = Array.from(timeMap.keys()).sort();
    const funcArray = Array.from(functionNames);

    // Generate series data
    const series = funcArray.map(funcName => ({
      name: funcName,
      type: 'bar',
      stack: 'total',
      emphasis: {
        focus: 'series'
      },
      data: times.map(time => timeMap.get(time)?.get(funcName) || 0)
    }));

    const colors = [
      '#5470c6',
      '#91cc75',
      '#fac858',
      '#ee6666',
      '#73c0de',
      '#3ba272',
      '#fc8452',
      '#9a60b4'
    ];

    const option = {
      title: {
        text: 'System Operations',
        subtext: showHourly ? 'Hourly View' : 'Daily View',
        left: 'center',
        textStyle: {
          color: theme === 'dark' ? '#e5e7eb' : '#111827'
        },
        subtextStyle: {
          color: theme === 'dark' ? '#9ca3af' : '#6b7280'
        }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: (params: any) => {
          const time = params[0].axisValue;
          let header = showHourly
            ? format(parseISO(time), 'MMM d, yyyy HH:00')
            : format(parseISO(time), 'MMM d, yyyy');
          
          let content = params
            .filter((p: any) => p.value > 0)
            .map((p: any) => {
              return `${p.seriesName}: ${p.value}`;
            })
            .join('<br/>');
          
          return `${header}<br/>${content}`;
        }
      },
      legend: {
        data: funcArray,
        top: '50px',
        textStyle: {
          color: theme === 'dark' ? '#e5e7eb' : '#111827'
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
        top: '100px'
      },
      xAxis: {
        type: 'category',
        data: times,
        axisLabel: {
          color: theme === 'dark' ? '#e5e7eb' : '#111827',
          rotate: 45,
          formatter: (value: string) => {
            if (showHourly) {
              return format(parseISO(value), 'MM-dd HH:00');
            }
            return format(parseISO(value), 'MM-dd');
          }
        }
      },
      yAxis: {
        type: 'value',
        name: 'Number of Calls',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          color: theme === 'dark' ? '#e5e7eb' : '#111827'
        },
        nameTextStyle: {
          color: theme === 'dark' ? '#e5e7eb' : '#111827'
        }
      },
      series: series.map((s, i) => ({
        ...s,
        itemStyle: {
          color: colors[i % colors.length]
        }
      }))
    };

    chart.setOption(option);

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [operations, theme, dateRange]);

  const handleQuickDateSelect = (days: number) => {
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(new Date(), days));
    setDateRange({
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd')
    });
  };

  // Pagination calculations
  const totalPages = Math.ceil(operations.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOperations = operations.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <h2 className={`text-lg sm:text-xl font-semibold ${themes[theme].text}`}>
              System Operations
            </h2>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex gap-2">
                <button
                  onClick={() => handleQuickDateSelect(0)}
                  className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                >
                  Today
                </button>
                <button
                  onClick={() => handleQuickDateSelect(1)}
                  className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                >
                  2 Days
                </button>
                <button
                  onClick={() => handleQuickDateSelect(7)}
                  className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                >
                  1 Week
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({
                    ...prev,
                    startDate: e.target.value
                  }))}
                  className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                />
                <span className={`text-sm ${themes[theme].text}`}>to</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({
                    ...prev,
                    endDate: e.target.value
                  }))}
                  className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="h-[400px] flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <div ref={chartRef} className="h-[400px]" />
          )}
        </div>
      </div>

      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
              Operation Details
            </h3>
            <div className="flex items-center gap-4">
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
              <span className={`text-sm ${themes[theme].text}`}>
                {startIndex + 1}-{Math.min(endIndex, operations.length)} of {operations.length}
              </span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {paginatedOperations.map((operation, index) => {
            const localDate = utcToZonedTime(operation.call_time, timezone);
            return (
              <div
                key={`${operation.func_name}-${operation.call_time}-${index}`}
                className={`p-4 ${themes[theme].cardHover}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${themes[theme].text}`}>
                        {operation.func_name.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        operation.result === 'success'
                          ? theme === 'dark' ? 'bg-green-900 text-green-100' : 'bg-green-100 text-green-800'
                          : theme === 'dark' ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-800'
                      }`}>
                        {operation.result}
                      </span>
                    </div>
                  </div>
                  <div className={`text-sm ${themes[theme].text} opacity-75`}>
                    {formatInTimeZone(localDate, timezone, 'MMM d, yyyy HH:mm:ss')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <button
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className={`p-2 rounded-md ${themes[theme].secondary} ${
                currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNumber;
                if (totalPages <= 5) {
                  pageNumber = i + 1;
                } else if (currentPage <= 3) {
                  pageNumber = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNumber = totalPages - 4 + i;
                } else {
                  pageNumber = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNumber}
                    onClick={() => setCurrentPage(pageNumber)}
                    className={`px-3 py-1 rounded-md text-sm ${
                      currentPage === pageNumber
                        ? themes[theme].primary
                        : themes[theme].secondary
                    }`}
                  >
                    {pageNumber}
                  </button>
                );
              })}
              {totalPages > 5 && currentPage < totalPages - 2 && (
                <>
                  <span className={`text-sm ${themes[theme].text}`}>...</span>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    className={`px-3 py-1 rounded-md text-sm ${themes[theme].secondary}`}
                  >
                    {totalPages}
                  </button>
                </>
              )}
            </div>
            <button
              onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              className={`p-2 rounded-md ${themes[theme].secondary} ${
                currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}