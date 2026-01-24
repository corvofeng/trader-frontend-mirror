import type {
  AuthService,
  TradeService,
  StockService,
  PortfolioService,
  CurrencyService,
  OperationService,
  StockConfigService,
  StockConfig,
  UploadService,
  UploadResponse,
  AnalysisService,
  AccountService,
  ServiceResponse,
  User,
  AccountPromptService,
  AccountPrompt
} from '../types';
import type { Trade } from '../types';

let cachedUser: User | null = null;
let pendingUserPromise: Promise<ServiceResponse<{ user: User | null }>> | null = null;

export const authService: AuthService = {
  getUser: async () => {
    if (cachedUser !== null) {
      return { data: { user: cachedUser }, error: null };
    }
    if (pendingUserPromise) {
      const result = await pendingUserPromise;
      return result;
    }
    pendingUserPromise = (async () => {
      const checker = await (await fetch('/api/check')).json();
      if (checker['status']) {
        const user = await (await fetch('/api/user')).json() as User;
        cachedUser = user;
        return { data: { user }, error: null };
      }
      return { data: { user: null }, error: null };
    })();
    try {
      const res = await pendingUserPromise;
      return res;
    } finally {
      pendingUserPromise = null;
    }
  },

  signIn: async () => {
    window.location.href = '/api/user';
  },

  signOut: async () => {
    cachedUser = null;
    pendingUserPromise = null;
    window.location.href = '/api/logout';
  }
};

const getCurrentAccountAlias = () => {
  try {
    const fromLocalStorage =
      (typeof localStorage !== 'undefined' && localStorage.getItem('journalSelectedAccountAlias')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('journalAccountId')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('selectedAccountAlias'));
    return fromLocalStorage || undefined;
  } catch {
    return undefined;
  }
};

export const tradeService: TradeService = {
  getTrades: async (userId: string, stock_code?: string, status?: string) => {
    const accountAlias = getCurrentAccountAlias();
    const params = new URLSearchParams();
    if (accountAlias) {
      params.set('account_alias', accountAlias);
    }
    const url = params.toString() ? `/api/actions?${params.toString()}` : '/api/actions';
    let filteredTrades = await (await fetch(url)).json();
    console.log(userId, stock_code, status, filteredTrades);

    if (stock_code) {
      filteredTrades = filteredTrades.filter(trade => trade.stock_code === stock_code);
    }

    if (status && status !== 'all') {
      filteredTrades = filteredTrades.filter(trade => trade.status === status);
    }

    return { data: filteredTrades, error: null };
  },

  createTrade: async (trade: Omit<Trade, 'id' | 'created_at' | 'updated_at'>) => {
    const accountAlias = getCurrentAccountAlias();
    const payload = {
      ...trade,
      account_alias: trade.account_alias || accountAlias
    };

    const response = await fetch('/api/actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return { data: null, error: 'Failed to create trade' };
    }

    const newTrade = await response.json();
    return { data: newTrade, error: null };
  },

  updateTrade: async (trade: Trade) => {
    const accountAlias = getCurrentAccountAlias();
    const payload = {
      ...trade,
      account_alias: trade.account_alias || accountAlias
    };

    const response = await fetch('/api/actions', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return { data: null, error: 'Failed to update trade' };
    }

    return { data: trade, error: null };
  }
};

export const stockService: StockService = {
  getStockName: (stockCode: string) => {
    throw new Error(`Not implemented: ${stockCode}`);
  },
  
  getStocks: async () => {
    try {
      const response = await fetch(`/api/stocks`);
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching stocks:', error);
      return { data: null, error: error as Error };
    }
  },
  
  searchStocks: async (query: string) => {
    try {
      const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error('Failed to search stocks');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error searching stocks:', error);
      return { data: null, error: error as Error };
    }
  },

  getStockData: async (symbol: string) => {
    try {
      const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/history`);
      if (!response.ok) {
        throw new Error('Failed to fetch stock data');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching stock data:', error);
      return { data: null, error: error as Error };
    }
  },

  getCurrentPrice: async (symbol: string) => {
    try {
      const response = await fetch(`/api/stocks/${symbol}/price`);
      if (!response.ok) {
        throw new Error('Failed to fetch current price');
      }
      const data = await response.json();
      return { 
        data: {
          stock_code: symbol,
          stock_name: data.stock_name || symbol,
          price: data.latest_value.lastPrice
        }, 
        error: null 
      };
    } catch (error) {
      console.error('Error fetching current price:', error);
      return { data: null, error: error as Error };
    }
  }
};

export const stockConfigService: StockConfigService = {
  getStockConfigs: async () => {
    try {
      const response = await fetch('/api/stock-configs');
      if (!response.ok) {
        throw new Error('Failed to fetch stock configs');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching stock configs:', error);
      return { data: null, error: error as Error };
    }
  },

  updateStockConfig: async (config: StockConfig) => {
    try {
      const response = await fetch('/api/stock-configs', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      if (!response.ok) {
        throw new Error('Failed to update stock config');
      }
      
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error updating stock config:', error);
      return { data: null, error: error as Error };
    }
  },

  deleteStockConfig: async (stockCode: string) => {
    try {
      const response = await fetch(`/api/stock-configs/${stockCode}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete stock config');
      }
      
      return { error: null };
    } catch (error) {
      console.error('Error deleting stock config:', error);
      return { error: error as Error };
    }
  }
};

export const portfolioService: PortfolioService = {
  getHoldings: async (userId: string, accountId?: string) => {
    try {
      const url = accountId
        ? `/api/portfolio/${accountId}`
        : `/api/portfolio/${userId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio data');
      }
      const data = await response.json();
      // Adapt to new API response structure which returns an object with positions
      // or fall back to array if legacy API is still in use
      if (Array.isArray(data)) {
        return { data, error: null, isSnapshot: false };
      } else {
        return { data: data.positions || [], error: null, isSnapshot: data.is_snapshot || false };
      }
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      return { data: null, error: error as Error };
    }
  },

  getRecentTrades: async (userId: string, startDate: string, endDate: string, accountId?: string, stockCode?: string) => {
    try {
      if (!accountId) return { data: [], error: null };

      let url = `/api/portfolio/${accountId}/recent-trades?startDate=${startDate}&endDate=${endDate}&userId=${userId}`;
      if (stockCode) {
        url += `&stockCode=${encodeURIComponent(stockCode)}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch recent trades');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching recent trades:', error);
      return { data: null, error: error as Error };
    }
  },

  getTrendData: async (userId: string, startDate: string, endDate: string, accountId: string) => {
    try {
      // 使用默认账户ID或用户ID作为路径参数
      if (!accountId) return { data: null, error: new Error('Account ID is required') };

      const url = `/api/portfolio/${accountId}/trend?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&userId=${userId}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch trend data');
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching trend data:', error);
      return { data: null, error: error as Error };
    }
  },

  getAccounts: async (userId: string) => {
    try {
      const response = await fetch(`/api/portfolio/${userId}/accounts`);
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching accounts:', error);
      return { data: null, error: error as Error };
    }
  },

  // UUID-based methods for shared portfolios
  getHoldingsByUuid: async (uuid: string) => {
    try {
      const response = await fetch(`/api/portfolio/shared/${uuid}`);
      if (!response.ok) {
        throw new Error('Failed to fetch shared portfolio data');
      }
      const data = await response.json();
      // Adapt to new API response structure which returns an object with positions
      // or fall back to array if legacy API is still in use
      if (Array.isArray(data)) {
        return { data, error: null, isSnapshot: false };
      } else {
        return { data: data.positions || [], error: null, isSnapshot: data.is_snapshot || false };
      }
    } catch (error) {
      console.error('Error fetching shared portfolio:', error);
      return { data: null, error: error as Error };
    }
  },

  getRecentTradesByUuid: async (uuid: string, startDate: string, endDate: string) => {
    try {
      const response = await fetch(
        `/api/portfolio/shared/${uuid}/recent-trades?startDate=${startDate}&endDate=${endDate}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch shared portfolio trades');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching shared portfolio trades:', error);
      return { data: null, error: error as Error };
    }
  },

  getTrendDataByUuid: async (uuid: string, startDate: string, endDate: string) => {
    try {
      const response = await fetch(
        `/api/portfolio/shared/${uuid}/trend?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch shared portfolio trend data');
      }
      
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching shared portfolio trend data:', error);
      return { data: null, error: error as Error };
    }
  }
};

export const currencyService: CurrencyService = {
  getCurrency: async () => {
    try {
      const response = await fetch('/api/settings/currency');
      if (!response.ok) {
        throw new Error('Failed to fetch currency');
      }
      const data = await response.json();
      return { data: data.currency, error: null };
    } catch (error) {
      console.error('Error fetching currency:', error);
      return { data: null, error: error as Error };
    }
  },
  setCurrency: async (currency: string) => {
    try {
      const response = await fetch('/api/settings/currency', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currency })
      });
      if (!response.ok) {
        throw new Error('Failed to update currency');
      }
      return { error: null };
    } catch (error) {
      console.error('Error updating currency:', error);
      return { error: error as Error };
    }
  }
};

export const operationService: OperationService = {
  getOperations: async (startDate: string, endDate: string) => {
    try {
      const response = await fetch(
        `/api/operations?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch operations');
      }
      
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching operations:', error);
      return { data: null, error: error as Error };
    }
  }
};

export const uploadService: UploadService = {
  uploadPortfolioFile: async (file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/portfolio/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const result = await response.json();
    return result;
  }
};

export const analysisService: AnalysisService = {
  getStockAnalysis: async (stockCode: string) => {
    try {
      const response = await fetch(`/api/analysis/stock/${stockCode}`);
      if (!response.ok) {
        throw new Error('Failed to fetch stock analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching stock analysis:', error);
      return { data: null, error: error as Error };
    }
  },

  getPortfolioAnalysis: async (userId: string, accountId?: string) => {
    try {
      const defaultAccountId = 'default-account';
      const url = `/api/analysis/portfolio/${accountId || defaultAccountId}?userId=${userId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching portfolio analysis:', error);
      return { data: null, error: error as Error };
    }
  },

  getPortfolioAnalysisByUuid: async (uuid: string) => {
    try {
      const response = await fetch(`/api/analysis/portfolio/shared/${uuid}`);
      if (!response.ok) {
        throw new Error('Failed to fetch shared portfolio analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching shared portfolio analysis:', error);
      return { data: null, error: error as Error };
    }
  },
  refreshStockAnalysis: async (stockCode: string) => {
    try {
      const response = await fetch(`/api/analysis/stock/${stockCode}/refresh`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to refresh stock analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error refreshing stock analysis:', error);
      return { data: null, error: error as Error };
    }
  },

  refreshPortfolioAnalysis: async (userId: string, accountId?: string) => {
    try {
      const defaultAccountId = 'default-account';
      const url = `/api/analysis/portfolio/${accountId || defaultAccountId}/refresh?userId=${userId}`;
      const response = await fetch(url, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to refresh portfolio analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error refreshing portfolio analysis:', error);
      return { data: null, error: error as Error };
    }
  },

  refreshPortfolioAnalysisByUuid: async (uuid: string) => {
    try {
      const response = await fetch(`/api/analysis/portfolio/shared/${uuid}/refresh`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to refresh shared portfolio analysis');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error refreshing shared portfolio analysis:', error);
      return { data: null, error: error as Error };
    }
  }
};

export const accountService: AccountService = {
  getAccounts: async (userId: string) => {
    try {
      const response = await fetch(`/api/accounts?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching accounts:', error);
      return { data: null, error: error as Error };
    }
  },
  getOptionsAccounts: async (userId: string) => {
    try {
      const response = await fetch(`/api/options/accounts?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch options accounts');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching options accounts:', error);
      return { data: null, error: error as Error };
    }
  },

  createAccount: async (account) => {
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(account)
      });
      if (!response.ok) {
        throw new Error('Failed to create account');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error creating account:', error);
      return { data: null, error: error as Error };
    }
  },

  updateAccount: async (account) => {
    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(account)
      });
      if (!response.ok) {
        throw new Error('Failed to update account');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error('Error updating account:', error);
      return { data: null, error: error as Error };
    }
  },

  deleteAccount: async (accountId) => {
    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to delete account');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error deleting account:', error);
      return { data: null, error: error as Error };
    }
  },

  setDefaultAccount: async (userId, accountId) => {
    try {
      const response = await fetch(`/api/accounts/${accountId}/set-default`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      });
      if (!response.ok) {
        throw new Error('Failed to set default account');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error setting default account:', error);
      return { data: null, error: error as Error };
    }
  }
};

export const accountPromptService: AccountPromptService = {
  listPrompts: async (accountAlias, promptType) => {
    try {
      const params = new URLSearchParams({ account_alias: accountAlias });
      if (promptType) {
        params.set('prompt_type', promptType);
      }
      const response = await fetch(`/api/llm/prompts?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch prompts');
      }
      const json = await response.json();
      const prompts: AccountPrompt[] = json.prompts || [];
      return { data: prompts, error: null };
    } catch (error) {
      console.error('Error fetching prompts:', error);
      return { data: null, error: error as Error };
    }
  },
  getPrompt: async (id) => {
    try {
      const response = await fetch(`/api/llm/prompts/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error fetching prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  createPrompt: async (payload) => {
    try {
      const response = await fetch('/api/llm/prompts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Failed to create prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error creating prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  updatePrompt: async (id, payload) => {
    try {
      const response = await fetch(`/api/llm/prompts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Failed to update prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error updating prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  deletePrompt: async (id) => {
    try {
      const response = await fetch(`/api/llm/prompts/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error('Failed to delete prompt');
      }
      return { data: null, error: null };
    } catch (error) {
      console.error('Error deleting prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  activatePrompt: async (id) => {
    try {
      const response = await fetch(`/api/llm/prompts/${id}/activate`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to activate prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error activating prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  deactivatePrompt: async (id) => {
    try {
      const response = await fetch(`/api/llm/prompts/${id}/deactivate`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to deactivate prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error deactivating prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  getActivePrompt: async (accountAlias, promptType) => {
    try {
      const params = new URLSearchParams({
        account_alias: accountAlias,
        prompt_type: promptType
      });
      const response = await fetch(`/api/llm/prompts/active?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch active prompt');
      }
      const json = await response.json();
      const prompt: AccountPrompt = json.prompt;
      return { data: prompt, error: null };
    } catch (error) {
      console.error('Error fetching active prompt:', error);
      return { data: null, error: error as Error };
    }
  },
  previewPrompt: async (accountAlias, promptType) => {
    try {
      const params = new URLSearchParams({
        account_alias: accountAlias,
        prompt_type: promptType
      });
      const response = await fetch(`/api/llm/prompts/preview?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to preview prompt');
      }
      const json = await response.json();
      const preview = {
        has_custom_prompt: !!json.has_custom_prompt,
        prompt: json.prompt as string
      };
      return { data: preview, error: null };
    } catch (error) {
      console.error('Error previewing prompt:', error);
      return { data: null, error: error as Error };
    }
  }
};
