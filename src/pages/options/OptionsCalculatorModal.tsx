import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { X, Calculator, Plus, Minus, Save, FolderOpen, Trash2, Camera, Download, Eye } from 'lucide-react';
import { Theme, themes } from '../../lib/theme';
import { useCurrency } from '../../lib/context/CurrencyContext';
import { formatCurrency } from '../../lib/types';
import type { OptionsData, OptionQuote } from '../../lib/services/types';

interface OptionsCalculatorModalProps {
  theme: Theme;
  optionsData: OptionsData | null;
  selectedSymbol: string;
  onClose: () => void;
}

interface OptionPosition {
  id: string;
  type: 'call' | 'put';
  action: 'buy' | 'sell';
  strike: number;
  premium: number;
  quantity: number;
  expiry: string;
}

interface StockPosition {
  id: string;
  action: 'buy' | 'sell';
  price: number;
  quantity: number;
}

interface CashPosition {
  id: string;
  type: 'margin';
  amount: number;
  interestRate: number;
}

interface Strategy {
  name: string;
  optionPositions: OptionPosition[];
  stockPositions: StockPosition[];
  cashPositions: CashPosition[];
  currentStockPrice: number;
  timestamp: string;
}

export function OptionsCalculatorModal({ theme, optionsData, selectedSymbol, onClose }: OptionsCalculatorModalProps) {
  const profitChartRef = useRef<HTMLDivElement>(null);
  const profitChartInstance = useRef<echarts.ECharts | null>(null);
  const isMountedRef = useRef(true);
  const { getThemedColors, currencyConfig } = useCurrency();
  
  const [optionPositions, setOptionPositions] = useState<OptionPosition[]>([]);
  const [stockPositions, setStockPositions] = useState<StockPosition[]>([]);
  const [cashPositions, setCashPositions] = useState<CashPosition[]>([]);
  const [currentStockPrice, setCurrentStockPrice] = useState<number>(450);
  const [showOptionSelector, setShowOptionSelector] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [strategyName, setStrategyName] = useState('');
  const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);
  const [showScreenshotPreview, setShowScreenshotPreview] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string>('');

  // 截图功能
  const captureChart = () => {
    if (!profitChartInstance.current) return;
    
    try {
      // 创建包含完整策略信息的高质量截图
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // 设置画布尺寸
      canvas.width = 1200;
      canvas.height = 800;
      
      // 设置背景色
      ctx.fillStyle = theme === 'dark' ? '#1f2937' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 添加标题
      ctx.fillStyle = theme === 'dark' ? '#e5e7eb' : '#111827';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${selectedSymbol} 期权策略分析`, canvas.width / 2, 40);
      
      // 添加时间戳
      ctx.font = '14px Arial';
      ctx.fillText(`生成时间: ${new Date().toLocaleString()}`, canvas.width / 2, 65);
      
      // 添加策略信息
      let yPosition = 100;
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('策略组成:', 50, yPosition);
      
      yPosition += 25;
      ctx.font = '14px Arial';
      
      // 期权仓位信息
      if (optionPositions.length > 0) {
        ctx.fillText('期权仓位:', 70, yPosition);
        yPosition += 20;
        optionPositions.forEach((pos, index) => {
          const positionText = `${index + 1}. ${pos.action === 'buy' ? '买入' : '卖出'} ${pos.type.toUpperCase()} ${formatCurrency(pos.strike, currencyConfig)} @ ${formatCurrency(pos.premium, currencyConfig)} x${pos.quantity}`;
          ctx.fillText(positionText, 90, yPosition);
          yPosition += 18;
        });
      }
      
      // 股票仓位信息
      if (stockPositions.length > 0) {
        yPosition += 10;
        ctx.fillText('股票仓位:', 70, yPosition);
        yPosition += 20;
        stockPositions.forEach((pos, index) => {
          const positionText = `${index + 1}. ${pos.action === 'buy' ? '持有' : '做空'} ${pos.quantity}股 @ ${formatCurrency(pos.price, currencyConfig)}`;
          ctx.fillText(positionText, 90, yPosition);
          yPosition += 18;
        });
      }
      
      // 添加当前股价
      yPosition += 10;
      ctx.fillText(`当前股价: ${formatCurrency(currentStockPrice, currencyConfig)}`, 70, yPosition);
      
      // 获取图表的base64数据
      const chartDataUrl = profitChartInstance.current.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff'
      });
      
      // 将图表添加到画布
      const chartImg = new Image();
      chartImg.onload = () => {
        // 在画布下方绘制图表
        const chartY = yPosition + 30;
        const chartHeight = canvas.height - chartY - 20;
        const chartWidth = canvas.width - 100;
        
        ctx.drawImage(chartImg, 50, chartY, chartWidth, chartHeight);
        
        // 生成最终的截图数据
        const finalDataUrl = canvas.toDataURL('image/png');
        setScreenshotDataUrl(finalDataUrl);
        setShowScreenshotPreview(true);
      };
      chartImg.src = chartDataUrl;
      
    } catch (error) {
      console.error('截图失败:', error);
      alert('截图失败，请重试');
    }
  };
  
  // 下载截图
  const downloadScreenshot = () => {
    if (!screenshotDataUrl) return;
    
    const link = document.createElement('a');
    link.download = `options-strategy-${selectedSymbol}-${new Date().toISOString().split('T')[0]}.png`;
    link.href = screenshotDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setShowScreenshotPreview(false);
    alert('策略分析图已保存到下载文件夹');
  };

  // 记录期权选择时间
  const [lastOptionSelectionTime, setLastOptionSelectionTime] = useState<string>('');

  // 计算当前股价（基于期权内在价值）
  const calculateCurrentStockPrice = (): number => {
    if (!optionsData || optionsData.quotes.length === 0) return 450;
    
    // 找到有内在价值的期权来推算当前股价
    let bestEstimate = 450; // 默认值
    
    // 优先使用Call期权的内在价值推算
    for (const quote of optionsData.quotes) {
      const callIntrinsicValue = quote.callIntrinsicValue || 0;
      if (callIntrinsicValue > 0) {
        // 当前股价 = 行权价 + Call内在价值/100
        bestEstimate = quote.strike + (callIntrinsicValue / 100);
        break;
      }
    }
    
    // 如果没有Call内在价值，尝试使用Put期权
    if (bestEstimate === 450) {
      for (const quote of optionsData.quotes) {
        const putIntrinsicValue = quote.putIntrinsicValue || 0;
        if (putIntrinsicValue > 0) {
          // 当前股价 = 行权价 - Put内在价值/100
          bestEstimate = quote.strike - (putIntrinsicValue / 100);
          break;
        }
      }
    }
    
    // 如果都没有内在价值，找到时间价值最大的合约作为平值
    if (bestEstimate === 450) {
      let maxTimeValue = 0;
      let atmStrike = 450;
      
      optionsData.quotes.forEach(quote => {
        const callTimeValue = quote.callTimeValue || 0;
        const putTimeValue = quote.putTimeValue || 0;
        const totalTimeValue = callTimeValue + putTimeValue;
        
        if (totalTimeValue > maxTimeValue) {
          maxTimeValue = totalTimeValue;
          atmStrike = quote.strike;
        }
      });
      
      bestEstimate = atmStrike;
    }
    
    return bestEstimate;
  };

  // 从cookie加载上次选择的到期日
  useEffect(() => {
    const savedTime = document.cookie
      .split('; ')
      .find(row => row.startsWith('lastOptionSelectionTime='))
      ?.split('=')[1];
    
    if (savedTime) {
      setLastOptionSelectionTime(decodeURIComponent(savedTime));
    }
  }, []);

  // 保存期权选择时间到cookie
  const saveOptionSelectionTime = (expiry: string) => {
    setLastOptionSelectionTime(expiry);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    document.cookie = `lastOptionSelectionTime=${encodeURIComponent(expiry)}; expires=${expiryDate.toUTCString()}; path=/`;
  };

  // ESC键关闭期权选择器
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showOptionSelector) {
          setShowOptionSelector(false);
          setSelectedPositionId('');
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showOptionSelector]);

  // 从期权链选择期权
  const selectOptionFromChain = (quote: OptionQuote, type: 'call' | 'put', action: 'buy' | 'sell') => {
    // 保存选择时间
    saveOptionSelectionTime(quote.expiry);
    
    if (!selectedPositionId) {
      // 创建新仓位
      const newPosition: OptionPosition = {
        id: Date.now().toString(),
        type,
        action,
        strike: quote.strike,
        premium: type === 'call' ? quote.callPrice : quote.putPrice,
        quantity: 1,
        expiry: quote.expiry
      };
      setOptionPositions([...optionPositions, newPosition]);
    } else {
      // 更新现有仓位
      updateOptionPosition(selectedPositionId, 'type', type);
      updateOptionPosition(selectedPositionId, 'strike', quote.strike);
      updateOptionPosition(selectedPositionId, 'premium', type === 'call' ? quote.callPrice : quote.putPrice);
      updateOptionPosition(selectedPositionId, 'expiry', quote.expiry);
    }
    setShowOptionSelector(false);
    setSelectedPositionId('');
  };

  // 初始化当前股价
  useEffect(() => {
    if (optionsData) {
      const calculatedPrice = calculateCurrentStockPrice();
      setCurrentStockPrice(calculatedPrice);
    }
  }, [optionsData]);

  // 从cookie加载保存的策略
  useEffect(() => {
    const savedStrategiesData = document.cookie
      .split('; ')
      .find(row => row.startsWith('optionsStrategies='))
      ?.split('=')[1];
    
    if (savedStrategiesData) {
      try {
        const strategies = JSON.parse(decodeURIComponent(savedStrategiesData));
        setSavedStrategies(strategies);
      } catch (error) {
        console.error('Error loading saved strategies:', error);
      }
    }
  }, []);

  // 保存策略到cookie
  const saveStrategy = () => {
    if (!strategyName.trim()) {
      alert('请输入策略名称');
      return;
    }

    const strategy: Strategy = {
      name: strategyName,
      optionPositions,
      stockPositions,
      cashPositions,
      currentStockPrice,
      timestamp: new Date().toISOString()
    };

    const updatedStrategies = [...savedStrategies, strategy];
    setSavedStrategies(updatedStrategies);
    
    // 保存到cookie (有效期30天)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    document.cookie = `optionsStrategies=${encodeURIComponent(JSON.stringify(updatedStrategies))}; expires=${expiryDate.toUTCString()}; path=/`;
    
    setStrategyName('');
    alert('策略已保存');
  };

  // 加载策略
  const loadStrategy = (strategy: Strategy) => {
    setOptionPositions(strategy.optionPositions);
    setStockPositions(strategy.stockPositions);
    setCashPositions(strategy.cashPositions);
    setCurrentStockPrice(strategy.currentStockPrice);
  };

  // 删除策略
  const deleteStrategy = (index: number) => {
    const updatedStrategies = savedStrategies.filter((_, i) => i !== index);
    setSavedStrategies(updatedStrategies);
    
    // 更新cookie
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    document.cookie = `optionsStrategies=${encodeURIComponent(JSON.stringify(updatedStrategies))}; expires=${expiryDate.toUTCString()}; path=/`;
  };

  const uniqueExpiryDates = optionsData 
    ? Array.from(new Set(optionsData.quotes.map(q => q.expiry)))
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    : [];

  const addOptionPosition = () => {
    const newPosition: OptionPosition = {
      id: Date.now().toString(),
      type: 'call',
      action: 'buy',
      strike: currentStockPrice || 450,
      premium: 10,
      quantity: 1,
      expiry: uniqueExpiryDates[0] || ''
    };
    setOptionPositions([...optionPositions, newPosition]);
  };

  const addStockPosition = () => {
    const newPosition: StockPosition = {
      id: Date.now().toString(),
      action: 'buy',
      price: currentStockPrice || 450,
      quantity: 100
    };
    setStockPositions([...stockPositions, newPosition]);
  };

  const addCashPosition = () => {
    const newPosition: CashPosition = {
      id: Date.now().toString(),
      type: 'margin',
      amount: 10000,
      interestRate: 5.0
    };
    setCashPositions([...cashPositions, newPosition]);
  };

  const removeOptionPosition = (id: string) => {
    setOptionPositions(optionPositions.filter(p => p.id !== id));
  };

  const removeStockPosition = (id: string) => {
    setStockPositions(stockPositions.filter(p => p.id !== id));
  };

  const removeCashPosition = (id: string) => {
    setCashPositions(cashPositions.filter(p => p.id !== id));
  };

  const updateOptionPosition = (id: string, field: keyof OptionPosition, value: any) => {
    setOptionPositions(optionPositions.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const updateStockPosition = (id: string, field: keyof StockPosition, value: any) => {
    setStockPositions(stockPositions.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const updateCashPosition = (id: string, field: keyof CashPosition, value: any) => {
    setCashPositions(cashPositions.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  // 从期权链选择期权
  // 计算期权到期时的盈亏
  const calculateOptionProfit = (position: OptionPosition, stockPrice: number): number => {
    const { type, action, strike, premium, quantity } = position;
    
    // 验证输入参数
    if (!strike || !premium || !quantity || isNaN(strike) || isNaN(premium) || isNaN(quantity)) {
      return 0;
    }
    
    let optionValue = 0;
    
    if (type === 'call') {
      optionValue = Math.max(0, stockPrice - strike);
    } else {
      optionValue = Math.max(0, strike - stockPrice);
    }
    
    const multiplier = action === 'buy' ? 1 : -1;
    const premiumCost = action === 'buy' ? -premium : premium;
    
    return (optionValue * multiplier + premiumCost) * quantity;
  };

  // 计算股票盈亏
  const calculateStockProfit = (position: StockPosition, stockPrice: number): number => {
    const { action, price, quantity } = position;
    
    // 验证输入参数
    if (!price || !quantity || isNaN(price) || isNaN(quantity)) {
      return 0;
    }
    
    const multiplier = action === 'buy' ? 1 : -1;
    return (stockPrice - price) * multiplier * quantity;
  };

  // 计算现金/保证金收益
  const calculateCashProfit = (position: CashPosition): number => {
    // 验证输入参数
    if (!position.amount || !position.interestRate || isNaN(position.amount) || isNaN(position.interestRate)) {
      return 0;
    }
    
    // 简化计算，假设年化利率
    return position.amount * (position.interestRate / 100) * (30 / 365); // 假设30天
  };

  // 计算总盈亏
  const calculateTotalProfit = (stockPrice: number): number => {
    // 验证股价输入
    if (!stockPrice || isNaN(stockPrice) || stockPrice <= 0) {
      return 0;
    }
    
    let total = 0;
    
    optionPositions.forEach(pos => {
      total += calculateOptionProfit(pos, stockPrice);
    });
    
    stockPositions.forEach(pos => {
      total += calculateStockProfit(pos, stockPrice);
    });
    
    cashPositions.forEach(pos => {
      total += calculateCashProfit(pos);
    });
    
    return total;
  };

  // 更新盈亏图表
  useEffect(() => {
    if (!profitChartRef.current) return;
    
    if (profitChartInstance.current) {
      profitChartInstance.current.dispose();
    }
    
    const chart = echarts.init(profitChartRef.current);
    profitChartInstance.current = chart;
    
    const isDark = theme === 'dark';
    const themedColors = getThemedColors(theme);
    
    // 验证当前股价
    if (!currentStockPrice || isNaN(currentStockPrice) || currentStockPrice <= 0) {
      return;
    }
    
    // 生成股价范围数据 - 扩大范围以便更好地观察策略
    const minPrice = currentStockPrice * 0.5;
    const maxPrice = currentStockPrice * 1.5;
    const priceStep = (maxPrice - minPrice) / 100;
    
    const priceRange: number[] = [];
    const profitData: number[] = [];
    
    for (let price = minPrice; price <= maxPrice; price += priceStep) {
      priceRange.push(price);
      const profit = calculateTotalProfit(price);
      profitData.push(isNaN(profit) ? 0 : profit);
    }
    
    // 找到盈亏平衡点
    const breakEvenPoints: number[] = [];
    for (let i = 1; i < profitData.length; i++) {
      if ((profitData[i-1] <= 0 && profitData[i] >= 0) || 
          (profitData[i-1] >= 0 && profitData[i] <= 0)) {
        breakEvenPoints.push(priceRange[i]);
      }
    }
    
    // 计算关键点位的盈亏
    const currentProfit = calculateTotalProfit(currentStockPrice);
    const keyPoints = [
      {
        price: currentStockPrice,
        profit: currentProfit,
        label: '当前股价',
        color: themedColors.chart.downColor
      }
    ];
    
    // 添加期权行权价关键点
    const uniqueStrikes = Array.from(new Set(optionPositions.map(p => p.strike)))
      .filter(strike => strike && !isNaN(strike) && strike > 0)
      .sort((a, b) => a - b);
    
    uniqueStrikes.forEach(strike => {
      const profit = calculateTotalProfit(strike);
      keyPoints.push({
        price: strike,
        profit,
        label: `行权价 ${formatCurrency(strike, currencyConfig)}`,
        color: '#9333ea'
      });
    });
    
    // 添加盈亏平衡点
    breakEvenPoints.forEach((price, index) => {
      keyPoints.push({
        price,
        profit: 0,
        label: `盈亏平衡点 ${index + 1}`,
        color: '#f59e0b'
      });
    });
    
    // 添加最大盈利和最大亏损点
    const maxProfitIndex = profitData.indexOf(Math.max(...profitData));
    const minProfitIndex = profitData.indexOf(Math.min(...profitData));
    
    if (maxProfitIndex >= 0 && profitData[maxProfitIndex] > 0) {
      keyPoints.push({
        price: priceRange[maxProfitIndex],
        profit: profitData[maxProfitIndex],
        label: '最大盈利',
        color: themedColors.chart.upColor
      });
    }
    
    if (minProfitIndex >= 0 && profitData[minProfitIndex] < 0) {
      keyPoints.push({
        price: priceRange[minProfitIndex],
        profit: profitData[minProfitIndex],
        label: '最大亏损',
        color: themedColors.chart.downColor
      });
    }
    
    const option = {
      title: {
        text: `${selectedSymbol} 期权策略盈亏图`,
        left: 'center',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#374151' : '#ffffff',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        textStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        formatter: (params: any) => {
          const price = params[0].axisValue;
          const profit = params[0].value;
          return `股价: ${formatCurrency(price, currencyConfig)}<br/>
                  盈亏: ${profit >= 0 ? '+' : ''}${formatCurrency(profit, currencyConfig)}`;
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '15%',
        containLabel: true
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          start: 20,
          end: 80,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: true
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          start: 20,
          end: 80,
          height: 20,
          bottom: 40,
          handleStyle: {
            color: themedColors.chart.upColor
          },
          textStyle: {
            color: isDark ? '#e5e7eb' : '#111827'
          },
          borderColor: isDark ? '#4b5563' : '#e5e7eb',
          fillerColor: themedColors.chart.upColor + '40'
        }
      ],
      brush: {
        toolbox: ['rect', 'polygon', 'lineX', 'lineY', 'keep', 'clear'],
        xAxisIndex: 0
      },
      xAxis: {
        type: 'value',
        name: '股价',
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827',
          formatter: (value: number) => formatCurrency(value, currencyConfig)
        },
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db'
          }
        },
        splitLine: {
          lineStyle: {
            color: isDark ? '#374151' : '#f3f4f6'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: '盈亏',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          color: isDark ? '#e5e7eb' : '#111827',
          formatter: (value: number) => formatCurrency(value, currencyConfig)
        },
        nameTextStyle: {
          color: isDark ? '#e5e7eb' : '#111827'
        },
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db'
          }
        },
        splitLine: {
          lineStyle: {
            color: isDark ? '#374151' : '#f3f4f6'
          }
        }
      },
      series: [
        {
          name: '盈亏',
          type: 'line',
          data: priceRange.map((price, index) => [price, profitData[index]]),
          lineStyle: {
            color: themedColors.chart.upColor,
            width: 3
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                {
                  offset: 0,
                  color: themedColors.chart.upColor + '40'
                },
                {
                  offset: 1,
                  color: themedColors.chart.upColor + '10'
                }
              ]
            }
          },
          emphasis: {
            focus: 'series'
          },
          markLine: {
            data: [
              {
                yAxis: 0,
                lineStyle: {
                  color: '#f59e0b',
                  type: 'dashed',
                  width: 2
                },
                label: {
                  formatter: '盈亏平衡线',
                  color: isDark ? '#e5e7eb' : '#111827'
                }
              }
            ]
          },
          markPoint: {
            data: keyPoints.map(point => ({
              coord: [point.price, point.profit],
              name: point.label,
              itemStyle: {
                color: point.color
              },
              label: {
                formatter: `{b}\n${formatCurrency(point.price, currencyConfig)}\n${formatCurrency(point.profit, currencyConfig)}`,
                color: isDark ? '#e5e7eb' : '#111827',
                fontSize: 10
              }
            }))
          }
        }
      ]
    };
    
    chart.setOption(option);
    
    // 设置初始视图居中显示当前股价
    setTimeout(() => {
      if (chart && isMountedRef.current) {
        try {
          // 计算当前股价在数据中的位置百分比
          const currentPriceIndex = priceRange.findIndex(price => price >= currentStockPrice);
          const centerPercentage = currentPriceIndex > 0 ? (currentPriceIndex / priceRange.length) * 100 : 50;
          
          // 设置缩放范围，以当前股价为中心
          const zoomRange = 30; // 显示范围的一半
          const startPercent = Math.max(0, centerPercentage - zoomRange);
          const endPercent = Math.min(100, centerPercentage + zoomRange);
          
          chart.dispatchAction({
            type: 'dataZoom',
            start: startPercent,
            end: endPercent
          });
        } catch (e) {
          console.error('Error setting initial zoom:', e);
        }
      }
    }, 100);
    
    const handleResize = () => {
      if (profitChartInstance.current) {
        profitChartInstance.current.resize();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (profitChartInstance.current) {
        profitChartInstance.current.dispose();
      }
    };
  }, [optionPositions, stockPositions, cashPositions, currentStockPrice, theme, selectedSymbol]);

  // 期权选择器
  const OptionSelector = () => {
    if (!optionsData) return null;

    // 使用上次选择的时间，如果没有则使用第一个
    const [selectedExpiry, setSelectedExpiry] = useState(() => {
      if (lastOptionSelectionTime && uniqueExpiryDates.includes(lastOptionSelectionTime)) {
        return lastOptionSelectionTime;
      }
      return uniqueExpiryDates[0] || '';
    });
    
    const quotesByExpiry = optionsData.quotes
      .filter(q => q.expiry === selectedExpiry)
      .sort((a, b) => a.strike - b.strike);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className={`${themes[theme].card} rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto`}>
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className={`text-xl font-bold ${themes[theme].text}`}>
                选择期权合约 - {selectedSymbol}
              </h3>
              <button
                onClick={() => setShowOptionSelector(false)}
                className={`p-2 rounded-md ${themes[theme].secondary}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4">
              <select
                value={selectedExpiry}
                onChange={(e) => {
                  setSelectedExpiry(e.target.value);
                  saveOptionSelectionTime(e.target.value);
                }}
                className={`px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
              >
                {uniqueExpiryDates.map(date => (
                  <option key={date} value={date}>
                    {new Date(date).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${themes[theme].background}`}>
                  <tr>
                    <th colSpan={2} className={`text-center px-4 py-2 border-b border-r ${themes[theme].border} ${themes[theme].text}`}>
                      Calls
                    </th>
                    <th className={`px-4 py-2 border-b ${themes[theme].border} ${themes[theme].text} text-center font-bold`}>
                      行权价
                    </th>
                    <th colSpan={2} className={`text-center px-4 py-2 border-b border-l ${themes[theme].border} ${themes[theme].text}`}>
                      Puts
                    </th>
                  </tr>
                  <tr>
                    <th className={`px-3 py-2 ${themes[theme].text} text-center text-sm`}>买入</th>
                    <th className={`px-3 py-2 ${themes[theme].text} text-center text-sm border-r ${themes[theme].border}`}>卖出</th>
                    <th className={`px-4 py-2 ${themes[theme].text} text-center font-bold`}>Strike</th>
                    <th className={`px-3 py-2 ${themes[theme].text} text-center text-sm border-l ${themes[theme].border}`}>买入</th>
                    <th className={`px-3 py-2 ${themes[theme].text} text-center text-sm`}>卖出</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${themes[theme].border}`}>
                  {quotesByExpiry.map((quote: OptionQuote) => (
                    <tr key={quote.strike} className={themes[theme].cardHover}>
                      {/* Call Options */}
                      <td className={`px-3 py-3 text-center ${themes[theme].text}`}>
                        <button
                          onClick={() => selectOptionFromChain(quote, 'call', 'buy')}
                          className={`px-6 py-4 rounded-xl text-lg font-bold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-110 ${
                            theme === 'dark' 
                              ? 'bg-green-800 text-green-50 hover:bg-green-700 border-3 border-green-400 hover:border-green-300' 
                              : 'bg-green-100 text-green-900 hover:bg-green-200 border-3 border-green-400 hover:border-green-500'
                          }`}
                        >
                          {formatCurrency(quote.callPrice, currencyConfig)}
                        </button>
                      </td>
                      <td className={`px-3 py-3 text-center ${themes[theme].text} border-r ${themes[theme].border}`}>
                        <button
                          onClick={() => selectOptionFromChain(quote, 'call', 'sell')}
                          className={`px-6 py-4 rounded-xl text-lg font-bold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-110 ${
                            theme === 'dark' 
                              ? 'bg-red-800 text-red-50 hover:bg-red-700 border-3 border-red-400 hover:border-red-300' 
                              : 'bg-red-100 text-red-900 hover:bg-red-200 border-3 border-red-400 hover:border-red-500'
                          }`}
                        >
                          {formatCurrency(quote.callPrice, currencyConfig)}
                        </button>
                      </td>
                      
                      {/* Strike Price */}
                      <td className={`px-4 py-3 text-center font-bold ${themes[theme].text} bg-opacity-50 ${themes[theme].background}`}>
                        {formatCurrency(quote.strike, currencyConfig)}
                      </td>
                      
                      {/* Put Options */}
                      <td className={`px-3 py-3 text-center ${themes[theme].text} border-l ${themes[theme].border}`}>
                        <button
                          onClick={() => selectOptionFromChain(quote, 'put', 'buy')}
                          className={`px-6 py-4 rounded-xl text-lg font-bold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-110 ${
                            theme === 'dark' 
                              ? 'bg-green-800 text-green-50 hover:bg-green-700 border-3 border-green-400 hover:border-green-300' 
                              : 'bg-green-100 text-green-900 hover:bg-green-200 border-3 border-green-400 hover:border-green-500'
                          }`}
                        >
                          {formatCurrency(quote.putPrice, currencyConfig)}
                        </button>
                      </td>
                      <td className={`px-3 py-3 text-center ${themes[theme].text}`}>
                        <button
                          onClick={() => selectOptionFromChain(quote, 'put', 'sell')}
                          className={`px-6 py-4 rounded-xl text-lg font-bold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-110 ${
                            theme === 'dark' 
                              ? 'bg-red-800 text-red-50 hover:bg-red-700 border-3 border-red-400 hover:border-red-300' 
                              : 'bg-red-100 text-red-900 hover:bg-red-200 border-3 border-red-400 hover:border-red-500'
                          }`}
                        >
                          {formatCurrency(quote.putPrice, currencyConfig)}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
      <div className={`${themes[theme].card} rounded-lg max-w-7xl w-full max-h-[95vh] overflow-y-auto`}>
        <div className="sticky top-0 bg-inherit border-b border-gray-200 p-6 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Calculator className="w-6 h-6 text-purple-500" />
            <h2 className={`text-2xl font-bold ${themes[theme].text}`}>
              期权收益计算器 - {selectedSymbol}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-md ${themes[theme].secondary}`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 策略管理 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>策略管理</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={strategyName}
                    onChange={(e) => setStrategyName(e.target.value)}
                    placeholder="输入策略名称"
                    className={`flex-1 px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                  />
                  <button
                    onClick={saveStrategy}
                    className={`px-4 py-2 rounded-md ${themes[theme].primary}`}
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <select
                  onChange={(e) => {
                    const index = parseInt(e.target.value);
                    if (!isNaN(index) && savedStrategies[index]) {
                      loadStrategy(savedStrategies[index]);
                    }
                  }}
                  className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value="">选择已保存的策略</option>
                  {savedStrategies.map((strategy, index) => (
                    <option key={index} value={index}>
                      {strategy.name} ({new Date(strategy.timestamp).toLocaleDateString()})
                    </option>
                  ))}
                </select>
                {savedStrategies.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (confirm('确定要清空所有保存的策略吗？')) {
                          setSavedStrategies([]);
                          document.cookie = 'optionsStrategies=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                        }
                      }}
                      className={`px-3 py-1 rounded text-sm ${themes[theme].secondary}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 当前股价设置 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>基础设置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                  当前股价
                </label>
                <input
                  type="number"
                  value={currentStockPrice}
                  onChange={(e) => setCurrentStockPrice(Number(e.target.value))}
                  className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* 期权仓位 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>期权仓位</h3>
              <div className="flex gap-2">
                <button
                  onClick={addOptionPosition}
                  className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].secondary}`}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  添加期权
                </button>
                <button
                  onClick={() => setShowOptionSelector(true)}
                  className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].primary}`}
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  从期权链选择
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {optionPositions.map((position) => (
                <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border ${themes[theme].border}`}>
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-center">
                    <select
                      value={position.type}
                      onChange={(e) => updateOptionPosition(position.id, 'type', e.target.value)}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                    >
                      <option value="call">Call</option>
                      <option value="put">Put</option>
                    </select>
                    <select
                      value={position.action}
                      onChange={(e) => updateOptionPosition(position.id, 'action', e.target.value)}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                    >
                      <option value="buy">买入</option>
                      <option value="sell">卖出</option>
                    </select>
                    <input
                      type="number"
                      placeholder="行权价"
                      value={position.strike || ''}
                      onChange={(e) => updateOptionPosition(position.id, 'strike', Number(e.target.value))}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                      step="0.01"
                    />
                    <input
                      type="number"
                      placeholder="权利金"
                      value={position.premium || ''}
                      onChange={(e) => updateOptionPosition(position.id, 'premium', Number(e.target.value))}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                      step="0.01"
                    />
                    <input
                      type="number"
                      placeholder="数量"
                      value={position.quantity || ''}
                      onChange={(e) => updateOptionPosition(position.id, 'quantity', Number(e.target.value))}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                    />
                    <select
                      value={position.expiry}
                      onChange={(e) => updateOptionPosition(position.id, 'expiry', e.target.value)}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                    >
                      {uniqueExpiryDates.map(date => (
                        <option key={date} value={date}>
                          {new Date(date).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setSelectedPositionId(position.id);
                          setShowOptionSelector(true);
                        }}
                        className={`p-1 rounded ${themes[theme].primary}`}
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeOptionPosition(position.id)}
                        className={`p-1 rounded ${themes[theme].secondary}`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 股票仓位 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>股票仓位 (Covered Call / Cash Secured Put)</h3>
              <button
                onClick={addStockPosition}
                className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].secondary}`}
              >
                <Plus className="w-4 h-4 mr-2" />
                添加股票
              </button>
            </div>
            <div className="space-y-3">
              {stockPositions.map((position) => (
                <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border ${themes[theme].border}`}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-center">
                    <select
                      value={position.action}
                      onChange={(e) => updateStockPosition(position.id, 'action', e.target.value)}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                    >
                      <option value="buy">持有</option>
                      <option value="sell">做空</option>
                    </select>
                    <input
                      type="number"
                      placeholder="成本价"
                      value={position.price || ''}
                      onChange={(e) => updateStockPosition(position.id, 'price', Number(e.target.value))}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                      step="0.01"
                    />
                    <input
                      type="number"
                      placeholder="数量"
                      value={position.quantity || ''}
                      onChange={(e) => updateStockPosition(position.id, 'quantity', Number(e.target.value))}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                    />
                    <button
                      onClick={() => removeStockPosition(position.id)}
                      className={`p-1 rounded ${themes[theme].secondary}`}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 现金/保证金仓位 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>现金/保证金</h3>
              <button
                onClick={addCashPosition}
                className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].secondary}`}
              >
                <Plus className="w-4 h-4 mr-2" />
                添加现金
              </button>
            </div>
            <div className="space-y-3">
              {cashPositions.map((position) => (
                <div key={position.id} className={`${themes[theme].card} rounded-lg p-4 border ${themes[theme].border}`}>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-center">
                    <input
                      type="number"
                      placeholder="金额"
                      value={position.amount || ''}
                      onChange={(e) => updateCashPosition(position.id, 'amount', Number(e.target.value))}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                    />
                    <input
                      type="number"
                      placeholder="年化利率(%)"
                      value={position.interestRate || ''}
                      onChange={(e) => updateCashPosition(position.id, 'interestRate', Number(e.target.value))}
                      className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}
                      step="0.1"
                    />
                    <button
                      onClick={() => removeCashPosition(position.id)}
                      className={`p-1 rounded ${themes[theme].secondary}`}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 盈亏图表 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>到期盈亏图</h3>
              <div className="flex gap-2">
                <button
                  onClick={captureChart}
                  className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].secondary}`}
                  title="生成策略分析截图"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  生成截图
                </button>
              </div>
            </div>
            <div ref={profitChartRef} style={{ height: '500px' }} />
          </div>

          {/* 策略摘要 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>策略摘要</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {formatCurrency(calculateTotalProfit(currentStockPrice || 450), currencyConfig)}
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>当前盈亏</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {formatCurrency(calculateTotalProfit((currentStockPrice || 450) * 1.1), currencyConfig)}
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>股价上涨10%</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {formatCurrency(calculateTotalProfit((currentStockPrice || 450) * 0.9), currencyConfig)}
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>股价下跌10%</p>
              </div>
            </div>
          </div>
        </div>

        {/* 期权选择器弹窗 */}
        {showOptionSelector && <OptionSelector />}
        
        {/* 截图预览弹窗 */}
        {showScreenshotPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-60 p-4">
            <div className={`${themes[theme].card} rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto`}>
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className={`text-xl font-bold ${themes[theme].text}`}>
                    策略分析截图预览
                  </h3>
                  <button
                    onClick={() => setShowScreenshotPreview(false)}
                    className={`p-2 rounded-md ${themes[theme].secondary}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                <div className="text-center mb-4">
                  <img 
                    src={screenshotDataUrl} 
                    alt="策略分析截图" 
                    className="max-w-full h-auto border rounded-lg shadow-lg"
                  />
                </div>
                
                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => setShowScreenshotPreview(false)}
                    className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
                  >
                    取消
                  </button>
                  <button
                    onClick={downloadScreenshot}
                    className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary}`}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    保存截图
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}