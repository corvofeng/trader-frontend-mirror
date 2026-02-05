import React, { useState, useEffect } from 'react';
import { Trash2, Plus, RefreshCw, Shield, AlertCircle, CheckCircle, Edit2, X, Save } from 'lucide-react';
import { optionsService } from '../../../lib/services';
import type { OptionWhitelist } from '../../../lib/services/types';
import { Theme, themes } from '../../../lib/theme';

interface OptionWhitelistManagerProps {
  theme: string; // Changed to string to match parent component
  userId: string;
  accountId?: string | null;
}

export function OptionWhitelistManager({ theme, userId, accountId }: OptionWhitelistManagerProps) {
  const [effectiveAccountId, setEffectiveAccountId] = useState<string | null>(() => {
    const cookie = typeof document !== 'undefined'
      ? (document.cookie
          ? (() => {
              const parts = document.cookie.split(';').map(s => s.trim());
              const current = parts.find(s => s.startsWith('optionsSelectedAccountId='))?.split('=')[1];
              if (current) return current;
              const legacy = parts.find(s => s.startsWith('selectedAccountId='))?.split('=')[1];
              return legacy ?? null;
            })()
          : null)
      : null;
    let ls: string | null = null;
    try {
      ls =
        localStorage.getItem('optionsSelectedAccountAlias') ||
        localStorage.getItem('optionsSelectedAccountId') ||
        localStorage.getItem('selectedAccountAlias') ||
        localStorage.getItem('selectedAccountId');
    } catch {
      ls = null;
    }
    return accountId ?? cookie ?? ls ?? null;
  });

  useEffect(() => {
    if (accountId) {
      setEffectiveAccountId(accountId);
    }
  }, [accountId]);

  const [whitelists, setWhitelists] = useState<OptionWhitelist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<Partial<OptionWhitelist>>({});

  // Form state
  const [newItem, setNewItem] = useState<Partial<OptionWhitelist>>({
    contract_code: '',
    contract_code_full: '',
    expiry_month: new Date().toISOString().slice(0, 7).replace('-', ''),
    option_type: 'call',
    strike_price: 0,
    hold_type: 'obligation',
    quantity: 1,
    reason: 'exercise',
    notes: '',
    is_active: true
  });

  const fetchWhitelists = async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await optionsService.getWhitelists(userId, effectiveAccountId);
      if (error) throw error;
      setWhitelists(data || []);
    } catch (err) {
      console.error('Error fetching whitelists:', err);
      setError('Failed to fetch whitelist');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWhitelists();
  }, [userId, effectiveAccountId]);

  const [isFetchingDetail, setIsFetchingDetail] = useState(false);

  const handleContractCodeBlur = async () => {
    if (!newItem.contract_code) return;
    setIsFetchingDetail(true);
    try {
      const { data, error } = await optionsService.getOptionContractDetail(newItem.contract_code);
      if (error) throw error;
      if (data) {
        setNewItem(prev => ({
          ...prev,
          contract_name: data.contract_name,
          expiry_month: data.raw_data.ExpireDate ? String(data.raw_data.ExpireDate).slice(0, 6) : prev.expiry_month,
          option_type: data.raw_data.optType ? data.raw_data.optType.toLowerCase() : prev.option_type,
          strike_price: data.strike_price || prev.strike_price,
        }));
      }
    } catch (err) {
      console.error('Error fetching contract detail:', err);
      // We don't block the user if fetching fails, just log it
    } finally {
      setIsFetchingDetail(false);
    }
  };

  const startEdit = (item: OptionWhitelist) => {
    setEditingId(item.id);
    setEditItem({
      ...item,
      option_type: item.option_detail?.option_type || item.option_type,
      strike_price: item.option_detail?.strike_price || item.strike_price,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditItem({});
  };

  const saveEdit = async () => {
    if (!editingId || !editItem) return;
    try {
      const { error } = await optionsService.updateWhitelist(editingId, editItem, userId, effectiveAccountId);
      if (error) throw error;
      setEditingId(null);
      setEditItem({});
      await fetchWhitelists();
    } catch (err) {
      console.error('Error updating whitelist item:', err);
      setError('Failed to update item');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to remove this item from whitelist?')) return;
    
    try {
      const { error } = await optionsService.deleteWhitelist(id, userId, effectiveAccountId);
      if (error) throw error;
      await fetchWhitelists();
    } catch (err) {
      console.error('Error deleting whitelist item:', err);
      setError('Failed to delete item');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await optionsService.addWhitelist(newItem as any, userId, effectiveAccountId);
      if (error) throw error;
      setShowAddForm(false);
      setNewItem({
        contract_code: '',
        contract_code_full: '',
        expiry_month: new Date().toISOString().slice(0, 7).replace('-', ''),
        option_type: 'call',
        strike_price: 0,
        hold_type: 'short',
        quantity: 1,
        reason: 'exercise',
        notes: '',
        is_active: true
      });
      await fetchWhitelists();
    } catch (err) {
      console.error('Error adding whitelist item:', err);
      setError('Failed to add item');
    }
  };

  // Determine theme styles
  const isDark = theme === 'dark';
  const cardClass = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = isDark ? 'text-gray-100' : 'text-gray-900';
  const subTextClass = isDark ? 'text-gray-400' : 'text-gray-500';
  const labelClass = isDark ? 'text-gray-300' : 'text-gray-700';
  const inputClass = isDark 
    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500' 
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500';

  // Group whitelists by expiry_month
  const groupedWhitelists = whitelists.reduce((acc, item) => {
    const month = item.expiry_month || 'Unknown';
    if (!acc[month]) {
      acc[month] = [];
    }
    acc[month].push(item);
    return acc;
  }, {} as Record<string, OptionWhitelist[]>);

  // Sort months
  const sortedMonths = Object.keys(groupedWhitelists).sort();

  return (
    <div className="space-y-6">
      <div className={`p-6 rounded-lg border ${cardClass}`}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-500" />
            <h2 className={`text-xl font-semibold ${textClass}`}>Option Whitelist</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchWhitelists()}
              className={`p-2 rounded-md hover:bg-opacity-80 transition-colors ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${subTextClass}`} />
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-md bg-red-50 text-red-700 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {showAddForm && (
          <form onSubmit={handleAdd} className={`mb-6 p-4 rounded-md border ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
            <h3 className={`text-lg font-medium mb-4 ${textClass}`}>Add New Whitelist Item</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={`block text-sm font-medium ${labelClass}`}>Contract Code</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={newItem.contract_code}
                    onChange={e => setNewItem({...newItem, contract_code: e.target.value})}
                    onBlur={handleContractCodeBlur}
                    className={`w-full rounded-md shadow-sm sm:text-sm ${inputClass} ${isFetchingDetail ? 'opacity-50' : ''}`}
                    placeholder="e.g. AAPL_20250101_C_150"
                  />
                  {isFetchingDetail && (
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin h-4 w-4 border-2 border-indigo-500 rounded-full border-t-transparent"></div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium ${labelClass}`}>Full Contract Code</label>
                <input
                  type="text"
                  value={newItem.contract_code_full}
                  onChange={e => setNewItem({...newItem, contract_code_full: e.target.value})}
                  className={`w-full rounded-md shadow-sm sm:text-sm ${inputClass}`}
                  placeholder="e.g. US.AAPL..."
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>Expiry Month</label>
                <input
                  type="text"
                  required
                  value={newItem.expiry_month}
                  onChange={e => setNewItem({...newItem, expiry_month: e.target.value})}
                  className={`w-full rounded-md shadow-sm sm:text-sm ${inputClass}`}
                  placeholder="YYYYMM"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>Type</label>
                <select
                  value={newItem.option_type}
                  onChange={e => setNewItem({...newItem, option_type: e.target.value})}
                  className={`w-full rounded-md shadow-sm sm:text-sm ${inputClass}`}
                >
                  <option value="call">Call</option>
                  <option value="put">Put</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>Strike</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newItem.strike_price}
                  onChange={e => setNewItem({...newItem, strike_price: parseFloat(e.target.value)})}
                  className={`w-full rounded-md shadow-sm sm:text-sm ${inputClass}`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>Hold Type</label>
                <select
                  value={newItem.hold_type}
                  onChange={e => setNewItem({...newItem, hold_type: e.target.value})}
                  className={`w-full rounded-md shadow-sm sm:text-sm ${inputClass}`}
                >
                  <option value="long">Long (Right)</option>
                  <option value="short">Short (Obligation)</option>
                  <option value="covered">Covered</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>Quantity</label>
                <input
                  type="number"
                  step="1"
                  required
                  value={newItem.quantity}
                  onChange={e => setNewItem({...newItem, quantity: parseInt(e.target.value)})}
                  className={`w-full rounded-md shadow-sm sm:text-sm ${inputClass}`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>Reason</label>
                <select
                  value={newItem.reason}
                  onChange={e => setNewItem({...newItem, reason: e.target.value})}
                  className={`w-full rounded-md shadow-sm sm:text-sm ${inputClass}`}
                >
                  <option value="exercise">Exercise</option>
                  <option value="assigned">Assigned</option>
                  <option value="hedge">Hedge</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>Notes</label>
                <input
                  type="text"
                  value={newItem.notes}
                  onChange={e => setNewItem({...newItem, notes: e.target.value})}
                  className={`w-full rounded-md shadow-sm sm:text-sm ${inputClass}`}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className={`px-4 py-2 rounded-md ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white border border-gray-300 hover:bg-gray-50'} ${textClass}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className={`min-w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
            <thead className={isDark ? 'bg-gray-900/50' : 'bg-gray-50'}>
              <tr>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${subTextClass}`}>Contract</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${subTextClass}`}>Month</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${subTextClass}`}>Type</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${subTextClass}`}>Hold Type</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${subTextClass}`}>Strike</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${subTextClass}`}>Qty</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${subTextClass}`}>Reason</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${subTextClass}`}>Notes</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${subTextClass}`}>Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
              {whitelists.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`px-6 py-4 text-center text-sm ${subTextClass}`}>
                    No whitelist items found.
                  </td>
                </tr>
              ) : (
                sortedMonths.map(month => (
                  <React.Fragment key={month}>
                    <tr className={isDark ? 'bg-gray-800' : 'bg-gray-100'}>
                      <td colSpan={8} className={`px-6 py-2 text-sm font-bold ${textClass}`}>
                        Expiry Month: {month}
                      </td>
                    </tr>
                    {groupedWhitelists[month].map((item) => (
                      <tr key={item.id}>
                        {editingId === item.id ? (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <input 
                                type="text" 
                                value={editItem.contract_code || ''} 
                                onChange={e => setEditItem({...editItem, contract_code: e.target.value})}
                                className={`w-32 rounded-md shadow-sm sm:text-sm ${inputClass}`}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <input 
                                type="text" 
                                value={editItem.expiry_month || ''} 
                                onChange={e => setEditItem({...editItem, expiry_month: e.target.value})}
                                className={`w-24 rounded-md shadow-sm sm:text-sm ${inputClass}`}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <select
                                value={editItem.option_type || 'call'}
                                onChange={e => setEditItem({...editItem, option_type: e.target.value})}
                                className={`rounded-md shadow-sm sm:text-sm ${inputClass}`}
                              >
                                <option value="call">Call</option>
                                <option value="put">Put</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <select
                                value={editItem.hold_type || 'obligation'}
                                onChange={e => setEditItem({...editItem, hold_type: e.target.value})}
                                className={`rounded-md shadow-sm sm:text-sm ${inputClass}`}
                              >
                                <option value="long">Long</option>
                                <option value="short">Short</option>
                                <option value="covered">Covered</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                               <input 
                                type="number" 
                                step="0.01"
                                value={editItem.strike_price || 0} 
                                onChange={e => setEditItem({...editItem, strike_price: parseFloat(e.target.value)})}
                                className={`w-20 rounded-md shadow-sm sm:text-sm ${inputClass}`}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                               <input 
                                type="number" 
                                step="1"
                                value={editItem.quantity || 0} 
                                onChange={e => setEditItem({...editItem, quantity: parseInt(e.target.value)})}
                                className={`w-20 rounded-md shadow-sm sm:text-sm ${inputClass}`}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <select
                                value={editItem.reason || 'exercise'}
                                onChange={e => setEditItem({...editItem, reason: e.target.value})}
                                className={`rounded-md shadow-sm sm:text-sm ${inputClass}`}
                              >
                                <option value="exercise">Exercise</option>
                                <option value="assigned">Assigned</option>
                                <option value="hedge">Hedge</option>
                                <option value="other">Other</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <input 
                                type="text" 
                                value={editItem.notes || ''} 
                                onChange={e => setEditItem({...editItem, notes: e.target.value})}
                                className={`w-full rounded-md shadow-sm sm:text-sm ${inputClass}`}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-2">
                              <button onClick={saveEdit} className="text-green-600 hover:text-green-900">
                                <Save className="w-4 h-4" />
                              </button>
                              <button onClick={cancelEdit} className="text-gray-600 hover:text-gray-900">
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${textClass}`}>
                              {item.contract_code}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${subTextClass}`}>
                              {item.expiry_month}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${subTextClass}`}>
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                (item.option_detail?.option_type || item.option_type) === 'call' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {(item.option_detail?.option_type || item.option_type).toUpperCase()}
                              </span>
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${subTextClass}`}>
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800`}>
                                {(item.hold_type || 'short').toUpperCase()}
                              </span>
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${subTextClass}`}>
                              {item.option_detail?.strike_price || item.strike_price}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${subTextClass}`}>
                              {item.quantity || '-'}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${subTextClass}`}>
                              {item.reason}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${subTextClass}`}>
                              {item.notes}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-2">
                              <button onClick={() => startEdit(item)} className="text-blue-600 hover:text-blue-900">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-900">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
