import React, { useState, useRef } from 'react';
import { Upload, FileText, Check, Copy, ExternalLink, AlertCircle } from 'lucide-react';
import { Theme, themes } from '../../../../lib/theme';
import toast from 'react-hot-toast';

interface UploadPageProps {
  theme: Theme;
}

interface UploadResponse {
  uuid: string;
  filename: string;
  uploadTime: string;
}

export function UploadPage({ theme }: UploadPageProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/portfolio/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result: UploadResponse = await response.json();
      setUploadResult(result);
      toast.success('File uploaded successfully!');
      
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
                    Uploading file...
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
                      Your portfolio file has been processed and is ready to view
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
                      <li>• The file will be stored securely and can be accessed via the UUID</li>
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
                  stock_code,stock_name,quantity,average_price,current_price
                  <br />
                  AAPL,Apple Inc.,100,150.00,175.50
                  <br />
                  MSFT,Microsoft Corporation,50,300.00,338.20
                </div>
              </div>
            </div>
            <div>
              <h4 className={`text-sm font-medium ${themes[theme].text} mb-2`}>
                Required Columns:
              </h4>
              <ul className={`text-sm ${themes[theme].text} opacity-75 space-y-1`}>
                <li>• <strong>stock_code</strong>: Stock symbol (e.g., AAPL, MSFT)</li>
                <li>• <strong>stock_name</strong>: Company name</li>
                <li>• <strong>quantity</strong>: Number of shares</li>
                <li>• <strong>average_price</strong>: Average purchase price</li>
                <li>• <strong>current_price</strong>: Current market price</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}