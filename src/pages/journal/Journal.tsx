@@ .. @@
 import { TradeForm, TradeList, StockSearch } from './features/trading';
 import { Portfolio } from './features/portfolio';
 import { OperationsView } from './features/operations/OperationsView';
 import { UploadPage } from './features/upload';
+import { RelatedLinks } from '../../components/common/RelatedLinks';
 import { Settings, LayoutGrid, History, BookOpen, Briefcase, Activity, Upload } from 'lucide-react';
@@ .. @@
       {activeTab === 'trades' && !portfolioUuid && (
         <div className="flex flex-col gap-6">
           <TradeForm selectedStock={selectedStock} theme={theme} />
           <TradeList selectedStockCode={selectedStock?.stock_code} theme={theme} />
+          <RelatedLinks 
+            theme={theme} 
+            currentPath="/journal?tab=trades" 
+            maxItems={3}
+          />
         </div>
       )}

       {activeTab === 'history' && !portfolioUuid && (
         <div className="space-y-6">
           {selectedStock?.stock_code && (
             <StockChart stockCode={selectedStock.stock_code} theme={theme} />
           )}
           <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6`}>
             <h2 className={`text-xl sm:text-2xl font-bold mb-4 ${themes[theme].text}`}>Completed Trades</h2>
             <TradeList selectedStockCode={selectedStock?.stock_code} theme={theme} showCompleted={true} />
           </div>
+          <RelatedLinks 
+            theme={theme} 
+            currentPath="/journal?tab=history" 
+            maxItems={3}
+          />
         </div>
       )}

       {activeTab === 'upload' && !portfolioUuid && (
-        <UploadPage theme={theme} />
+        <div className="space-y-6">
+          <UploadPage theme={theme} />
+          <RelatedLinks 
+            theme={theme} 
+            currentPath="/journal?tab=upload" 
+            maxItems={3}
+          />
+        </div>
       )}

       {activeTab === 'operations' && !portfolioUuid && (
-        <OperationsView theme={theme} />
+        <div className="space-y-6">
+          <OperationsView theme={theme} />
+          <RelatedLinks 
+            theme={theme} 
+            currentPath="/journal?tab=operations" 
+            maxItems={3}
+          />
+        </div>
       )}
@@ .. @@
       {activeTab === 'analysis' && (
         <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6`}>
           <h2 className={`text-xl sm:text-2xl font-bold mb-4 ${themes[theme].text}`}>Performance Analysis</h2>
           <p className={`${themes[theme].text} opacity-70`}>
             Trading performance analysis features coming soon...
           </p>
+          <div className="mt-6">
+            <RelatedLinks 
+              theme={theme} 
+              currentPath="/journal?tab=analysis" 
+              maxItems={3}
+            />
+          </div>
         </div>
       )}

       {activeTab === 'settings' && !portfolioUuid && (
         <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6`}>
           <h2 className={`text-xl sm:text-2xl font-bold mb-4 ${themes[theme].text}`}>Account Settings</h2>
           <p className={`${themes[theme].text} opacity-70`}>
             Account and preferences settings coming soon...
           </p>
+          <div className="mt-6">
+            <RelatedLinks 
+              theme={theme} 
+              currentPath="/journal?tab=settings" 
+              maxItems={3}
+            />
+          </div>
         </div>
       )}
@@ .. @@
 }