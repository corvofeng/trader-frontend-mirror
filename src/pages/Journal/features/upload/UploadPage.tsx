import React, { useState } from 'react';
import { logger } from '../../../../shared/utils/logger';
import { Upload, FileText, CheckCircle, AlertCircle, ExternalLink, Copy } from 'lucide-react';
import { Theme, themes } from '../../../../lib/theme';
import { uploadService } from '../../../../lib/services';
import type { UploadResponse } from '../../../../lib/services/types';
import { formatCurrency } from '../../../../shared/utils/format';
import { useCurrency } from '../../../../lib/context/CurrencyContext';
import toast from 'react-hot-toast';

interface UploadPageProps {
  theme: Theme;
}

export function UploadPage({ theme }: UploadPageProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
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
    if (!file) {
      logger.debug('[UploadPage] Guard: file missing');
      return;
    }

    // Validate file type
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.txt'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      toast.error('Please upload a CSV, Excel, or text file');
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const result = await uploadService.uploadPortfolioFile(file);
      setUploadResult(result);
      toast.success('Portfolio uploaded successfully!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload portfolio file');
    } finally {
      setIsUploading(false);
    }
  };

  const copyShareLink = () => {
    if (!uploadResult) {
      logger.debug('[UploadPage] Guard: uploadResult missing on copy');
      return;
    }
    
    const shareUrl = `${window.location.origin}/journal?tab=portfolio&uuid=${uploadResult.uuid}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Share link copied to clipboard!');
  };

  const openShareLink = () => {
    if (!uploadResult) {
      logger.debug('[UploadPage] Guard: uploadResult missing on open');
      return;
    }
    
    const shareUrl = `${window.location.origin}/journal?tab=portfolio&uuid=${uploadResult.uuid}`;
    window.open(shareUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Upload className="w-6 h-6 text-blue-500" />
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              Portfolio Upload
            </h2>
          </div>
          <p className={`text-sm ${themes[theme].text} opacity-75 mt-2`}>
            Upload your portfolio file to generate a shareable link and import your holdings
          </p>
        </div>

        <div className="p-6">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : `${themes[theme].border} ${themes[theme].background}`
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isUploading ? (
              <div className="space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                <p className={`text-lg font-medium ${themes[theme].text}`}>
                  Uploading and processing your portfolio...
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>
                  This may take a few moments
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className={`w-16 h-16 mx-auto ${themes[theme].text} opacity-40`} />
                <div>
                  <p className={`text-lg font-medium ${themes[theme].text}`}>
                    Drop your portfolio file here
                  </p>
                  <p className={`text-sm ${themes[theme].text} opacity-75`}>
                    or click to browse files
                  </p>
                </div>
                <div className="flex justify-center">
                  <label className={`cursor-pointer inline-flex items-center px-4 py-2 rounded-md ${themes[theme].primary}`}>
                    <FileText className="w-5 h-5 mr-2" />
                    Choose File
                    <input
                      type="file"
                      className="hidden"
                      accept=".csv,.xlsx,.xls,.txt"
                      onChange={handleFileSelect}
                    />
                  </label>
                </div>
                <p className={`text-xs ${themes[theme].text} opacity-60`}>
                  Supported formats: CSV, Excel (.xlsx, .xls), Text files
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <h3 className={`text-lg font-bold ${themes[theme].text}`}>
                Upload Successful
              </h3>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Account Info */}
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h4 className={`text-sm font-medium ${themes[theme].text} mb-3`}>Account Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className={`${themes[theme].text} opacity-75`}>Broker: </span>
                  <span className={`font-medium ${themes[theme].text}`}>{uploadResult.account.broker}</span>
                </div>
                <div>
                  <span className={`${themes[theme].text} opacity-75`}>Branch: </span>
                  <span className={`font-medium ${themes[theme].text}`}>{uploadResult.account.branch}</span>
                </div>
                <div>
                  <span className={`${themes[theme].text} opacity-75`}>Username: </span>
                  <span className={`font-medium ${themes[theme].text}`}>{uploadResult.account.username}</span>
                </div>
                <div>
                  <span className={`${themes[theme].text} opacity-75`}>Account No: </span>
                  <span className={`font-medium ${themes[theme].text}`}>{uploadResult.account.account_no}</span>
                </div>
              </div>
            </div>

            {/* Balance Info */}
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h4 className={`text-sm font-medium ${themes[theme].text} mb-3`}>Balance Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className={`text-lg font-bold ${themes[theme].text}`}>
                    {formatCurrency(uploadResult.balance.total_asset, currencyConfig)}
                  </p>
                  <p className={`text-xs ${themes[theme].text} opacity-75`}>Total Assets</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold ${themes[theme].text}`}>
                    {formatCurrency(uploadResult.balance.market_value, currencyConfig)}
                  </p>
                  <p className={`text-xs ${themes[theme].text} opacity-75`}>Market Value</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold ${themes[theme].text}`}>
                    {formatCurrency(uploadResult.balance.available, currencyConfig)}
                  </p>
                  <p className={`text-xs ${themes[theme].text} opacity-75`}>Available</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold ${themes[theme].text}`}>
                    {formatCurrency(uploadResult.balance.withdrawable, currencyConfig)}
                  </p>
                  <p className={`text-xs ${themes[theme].text} opacity-75`}>Withdrawable</p>
                </div>
              </div>
            </div>

            {/* Share Link */}
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h4 className={`text-sm font-medium ${themes[theme].text} mb-3`}>Share Portfolio</h4>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className={`flex-1 px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text} text-sm font-mono break-all`}>
                  {window.location.origin}/journal?tab=portfolio&uuid={uploadResult.uuid}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={copyShareLink}
                    className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].secondary}`}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </button>
                  <button
                    onClick={openShareLink}
                    className={`inline-flex items-center px-3 py-2 rounded-md ${themes[theme].primary}`}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open
                  </button>
                </div>
              </div>
              <p className={`text-xs ${themes[theme].text} opacity-60 mt-2`}>
                Share this link to let others view your portfolio (read-only access)
              </p>
            </div>

            {/* Holdings Preview */}
            <div className={`${themes[theme].background} rounded-lg p-4`}>
              <h4 className={`text-sm font-medium ${themes[theme].text} mb-3`}>
                Holdings Preview ({uploadResult.holdings.length} stocks)
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {uploadResult.holdings.slice(0, 10).map((holding, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <div>
                      <span className={`font-medium ${themes[theme].text}`}>{holding.stock_code}</span>
                      <span className={`ml-2 ${themes[theme].text} opacity-75`}>{holding.stock_name}</span>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${themes[theme].text}`}>
                        {formatCurrency(holding.market_value, currencyConfig)}
                      </div>
                      <div className={`text-xs ${
                        holding.profit_ratio >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {holding.profit_ratio >= 0 ? '+' : ''}{holding.profit_ratio.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
                {uploadResult.holdings.length > 10 && (
                  <p className={`text-xs ${themes[theme].text} opacity-60 text-center pt-2`}>
                    ... and {uploadResult.holdings.length - 10} more holdings
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}