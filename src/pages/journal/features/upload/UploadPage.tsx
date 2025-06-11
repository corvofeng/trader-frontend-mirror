import React, { useState, useRef } from 'react';
import { Upload, FileText, Check, Copy, ExternalLink, AlertCircle, User, CreditCard, TrendingUp, DollarSign, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Theme, themes } from '../../../../lib/theme';
import { formatCurrency } from '../../../../lib/types';
import { useCurrency } from '../../../../lib/context/CurrencyContext';
import { uploadService } from '../../../../lib/services';
import type { UploadResponse } from '../../../../lib/services/types';
import toast from 'react-hot-toast';

interface UploadPageProps {
  theme: Theme;
}

export function UploadPage({ theme }: UploadPageProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currencyConfig } = useCurrency();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    // Validate file type
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.json'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      toast.error('Please upload a CSV, Excel, or JSON file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);
    
    try {
      const result = await uploadService.uploadPortfolioFile(file);
      setUploadResult(result);
      toast.success('File uploaded and parsed successfully!');
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const getPortfolioUrl = () => {
    if (!uploadResult) return '';
    return `${window.location.origin}/journal?tab=portfolio&uuid=${uploadResult.uuid}`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(getPortfolioUrl());
      setCopiedUrl(true);
      toast.success('URL copied to clipboard!');
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (error) {
      toast.error('Failed to copy URL');
    }
  };

  const openPortfolio = () => {
    if (uploadResult) {
      window.open(`/journal?tab=portfolio&uuid=${uploadResult.uuid}`, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>
            Upload Portfolio File
          </h2>
          <p className={`text-sm ${themes[theme].text} opacity-75 mt-2`}>
            Upload your holdings file to generate a shareable portfolio view
          </p>
        </div>

        <div className="p-6">
          {!uploadResult ? (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : `border-gray-300 dark:border-gray-600 ${themes[theme].cardHover}`
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isUploading}
              />
              
              {isUploading ? (
                <div className="space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                  <p className={`text-lg font-medium ${themes[theme].text}`}>
                    Uploading and parsing file...
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className={`w-12 h-12 mx-auto ${themes[theme].text} opacity-50`} />
                  <div>
                    <p className={`text-lg font-medium ${themes[theme].text}`}>
                      Drop your portfolio file here
                    </p>
                    <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                      or{' '}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-blue-500 hover:text-blue-600 underline"
                      >
                        browse to upload
                      </button>
                    </p>
                  </div>
                  <div className={`text-xs ${themes[theme].text} opacity-60`}>
                    Supported formats: CSV, Excel (.xlsx, .xls), JSON
                    <br />
                    Maximum file size: 10MB
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className={`${themes[theme].background} rounded-lg p-6`}>
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                      <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-lg font-medium ${themes[theme].text}`}>
                      Upload Successful!
                    </h3>
                    <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                      Your portfolio file has been processed and parsed successfully
                    </p>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-gray-500" />
                        <span className={`text-sm ${themes[theme].text}`}>
                          {uploadResult.filename}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs ${themes[theme].text} opacity-60`}>
                          Uploaded: {new Date(uploadResult.uploadTime).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Information */}
              <div className={`${themes[theme].card} rounded-lg p-6 border ${themes[theme].border}`}>
                <div className="flex items-center space-x-3 mb-4">
                  <User className="w-5 h-5 text-blue-500" />
                  <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                    Account Information
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
                      Broker
                    </label>
                    <p className={`text-sm ${themes[theme].text}`}>
                      {uploadResult.account.broker}
                    </p>
                  </div>
                  <div>
                    <label className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
                      Account No.
                    </label>
                    <p className={`text-sm ${themes[theme].text} font-mono`}>
                      {uploadResult.account.account_no}
                    </p>
                  </div>
                  <div>
                    <label className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
                      Username
                    </label>
                    <p className={`text-sm ${themes[theme].text}`}>
                      {uploadResult.account.username}
                    </p>
                  </div>
                  <div>
                    <label className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
                      Branch
                    </label>
                    <p className={`text-sm ${themes[theme].text}`}>
                      {uploadResult.account.branch || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Balance Information */}
              <div className={`${themes[theme].card} rounded-lg p-6 border ${themes[theme].border}`}>
                <div className="flex items-center space-x-3 mb-4">
                  <CreditCard className="w-5 h-5 text-green-500" />
                  <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                    Balance Information
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className={`${themes[theme].background} rounded-lg p-4`}>
                    <label className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
                      Total Assets
                    </label>
                    <p className={`text-lg font-bold ${themes[theme].text}`}>
                      ¥{uploadResult.balance.total_asset.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className={`${themes[theme].background} rounded-lg p-4`}>
                    <label className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
                      Market Value
                    </label>
                    <p className={`text-lg font-bold ${themes[theme].text}`}>
                      ¥{uploadResult.balance.market_value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className={`${themes[theme].background} rounded-lg p-4`}>
                    <label className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
                      Available
                    </label>
                    <p className={`text-lg font-bold ${themes[theme].text}`}>
                      ¥{uploadResult.balance.available.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className={`${themes[theme].background} rounded-lg p-4`}>
                    <label className={`text-sm font-medium ${themes[theme].text} opacity-75`}>
                      Withdrawable
                    </label>
                    <p className={`text-lg font-bold ${themes[theme].text}`}>
                      ¥{uploadResult.balance.withdrawable.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Holdings Details */}
              <div className={`${themes[theme].card} rounded-lg p-6 border ${themes[theme].border}`}>
                <div className="flex items-center space-x-3 mb-4">
                  <TrendingUp className="w-5 h-5 text-purple-500" />
                  <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                    Portfolio Holdings ({uploadResult.holdings.length} stocks)
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className={`${themes[theme].background}`}>
                      <tr>
                        <th className={`px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Stock</th>
                        <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Quantity</th>
                        <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Cost</th>
                        <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Price</th>
                        <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>Market Value</th>
                        <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>P/L</th>
                        <th className={`px-4 py-3 text-right text-xs font-medium ${themes[theme].text} opacity-75 uppercase tracking-wider`}>P/L %</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${themes[theme].border}`}>
                      {uploadResult.holdings.map((holding) => (
                        <tr key={holding.stock_code} className={themes[theme].cardHover}>
                          <td className="px-4 py-4">
                            <div>
                              <div className={`text-sm font-medium ${themes[theme].text}`}>{holding.stock_code}</div>
                              <div className={`text-sm ${themes[theme].text} opacity-75`}>{holding.stock_name}</div>
                            </div>
                          </td>
                          <td className={`px-4 py-4 text-right text-sm ${themes[theme].text}`}>
                            {holding.quantity.toLocaleString()}
                          </td>
                          <td className={`px-4 py-4 text-right text-sm ${themes[theme].text}`}>
                            ¥{holding.cost.toFixed(3)}
                          </td>
                          <td className={`px-4 py-4 text-right text-sm ${themes[theme].text}`}>
                            ¥{holding.price.toFixed(3)}
                          </td>
                          <td className={`px-4 py-4 text-right text-sm ${themes[theme].text}`}>
                            ¥{holding.market_value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`px-4 py-4 text-right text-sm font-medium ${
                            holding.profit >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {holding.profit >= 0 ? '+' : ''}¥{holding.profit.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`px-4 py-4 text-right text-sm font-medium ${
                            holding.profit_ratio >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            <div className="flex items-center justify-end space-x-1">
                              {holding.profit_ratio >= 0 ? (
                                <ArrowUpCircle className="w-4 h-4" />
                              ) : (
                                <ArrowDownCircle className="w-4 h-4" />
                              )}
                              <span>{holding.profit_ratio >= 0 ? '+' : ''}{holding.profit_ratio.toFixed(2)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium ${themes[theme].text} mb-2`}>
                    Shareable Portfolio URL
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={getPortfolioUrl()}
                      readOnly
                      className={`flex-1 px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text} font-mono text-sm`}
                    />
                    <button
                      onClick={copyToClipboard}
                      className={`px-3 py-2 rounded-md ${themes[theme].secondary} flex items-center space-x-2`}
                    >
                      {copiedUrl ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline">
                        {copiedUrl ? 'Copied!' : 'Copy'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={openPortfolio}
                    className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary}`}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Portfolio
                  </button>
                  <button
                    onClick={() => setUploadResult(null)}
                    className={`inline-flex items-center px-4 py-2 rounded-md ${themes[theme].secondary}`}
                  >
                    Upload Another File
                  </button>
                </div>
              </div>

              <div className={`${themes[theme].background} rounded-lg p-4`}>
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className={`font-medium ${themes[theme].text}`}>
                      Important Notes:
                    </p>
                    <ul className={`mt-2 space-y-1 ${themes[theme].text} opacity-75`}>
                      <li>• This URL provides read-only access to your portfolio data</li>
                      <li>• The file has been parsed and account information extracted</li>
                      <li>• Share this URL with anyone you want to view your portfolio</li>
                      <li>• The data will be available for 30 days from upload</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6">
          <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
            File Format Requirements
          </h3>
          <div className="space-y-4">
            <div>
              <h4 className={`text-sm font-medium ${themes[theme].text} mb-2`}>
                CSV Format Example:
              </h4>
              <div className={`${themes[theme].background} rounded-lg p-4 font-mono text-sm`}>
                <div className={themes[theme].text}>
                  stock_code,stock_name,quantity,price,cost,market_value,profit,profit_ratio
                  <br />
                  513100,纳指ETF,5000,1.556,1.3628,7780.0,966.0,14.18
                  <br />
                  000001,平安银行,1000,12.45,11.80,12450.0,650.0,5.51
                </div>
              </div>
            </div>
            <div>
              <h4 className={`text-sm font-medium ${themes[theme].text} mb-2`}>
                Required Columns:
              </h4>
              <ul className={`text-sm ${themes[theme].text} opacity-75 space-y-1`}>
                <li>• <strong>stock_code</strong>: Stock symbol (e.g., 513100, 000001)</li>
                <li>• <strong>stock_name</strong>: Stock name (e.g., 纳指ETF, 平安银行)</li>
                <li>• <strong>quantity</strong>: Number of shares</li>
                <li>• <strong>price</strong>: Current market price</li>
                <li>• <strong>cost</strong>: Average purchase price</li>
                <li>• <strong>market_value</strong>: Current market value</li>
                <li>• <strong>profit</strong>: Profit/Loss amount</li>
                <li>• <strong>profit_ratio</strong>: Profit/Loss percentage</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}