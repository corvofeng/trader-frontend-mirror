import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  ArrowLeftRight,
  ExternalLink,
  EyeOff,
  Sliders,
  Sun,
  Moon,
  Palette,
  ArrowDownCircle,
  Pin,
  Smartphone,
  Monitor,
  Check,
  Zap,
} from 'lucide-react';
import type { Theme } from '../../../lib/theme';
import { themes } from '../../../lib/theme';
import type { User } from '../../../lib/services/types';
import { AccountSelector } from '../../../shared/components/AccountSelector';
import toast from 'react-hot-toast';

export type TopBarMode = 'scroll' | 'hidden' | 'sticky';

interface TerminalSettingsViewProps {
  theme: Theme;
  onThemeChange?: (theme: Theme) => void;
  selectedAccountId: string | null;
  onAccountChange: (accountId: string) => void;
  user?: User | null;
  topBarMode: TopBarMode;
  onTopBarModeChange: (mode: TopBarMode) => void;
  onRefreshAll: () => void;
}

export const TerminalSettingsView: React.FC<TerminalSettingsViewProps> = ({
  theme,
  onThemeChange,
  selectedAccountId,
  onAccountChange,
  user,
  topBarMode,
  onTopBarModeChange,
  onRefreshAll,
}) => {
  const navigate = useNavigate();

  // 偏好风格设置：classic（旧版经典风格）或 terminal（新版交易终端）
  const [preferredMode, setPreferredMode] = useState<'classic' | 'terminal'>(() => {
    try {
      return localStorage.getItem('preferred_trade_mode') === 'classic' ? 'classic' : 'terminal';
    } catch {
      return 'terminal';
    }
  });

  // 是否在终端内隐藏主站全局导航栏（避免双层顶栏）
  const [hideGlobalNav, setHideGlobalNav] = useState(() => {
    try {
      return localStorage.getItem('terminal_hide_global_nav') === '1';
    } catch {
      return false;
    }
  });

  // 切换首选风格
  const handlePreferredModeToggle = (mode: 'classic' | 'terminal') => {
    setPreferredMode(mode);
    try {
      localStorage.setItem('preferred_trade_mode', mode);
      toast.success(
        mode === 'classic'
          ? '已将旧版经典风格设为默认偏好'
          : '已将交易终端设为默认偏好'
      );
    } catch {}
  };

  // 立即切换回旧版风格（前往经典期权与资产页面）
  const handleSwitchToClassicOptions = () => {
    try {
      localStorage.setItem('preferred_trade_mode', 'classic');
    } catch {}
    toast.success('正在切换至旧版经典风格...');
    const params = new URLSearchParams();
    params.set('tab', 'portfolio');
    if (selectedAccountId) params.set('account_alias', selectedAccountId);
    navigate(`/options?${params.toString()}`);
  };

  // 切换至旧版交易日志
  const handleSwitchToClassicJournal = () => {
    try {
      localStorage.setItem('preferred_trade_mode', 'classic');
    } catch {}
    toast.success('正在前往经典交易日志...');
    const params = new URLSearchParams();
    params.set('tab', 'portfolio');
    if (selectedAccountId) params.set('account_alias', selectedAccountId);
    navigate(`/journal?${params.toString()}`);
  };

  // 全局主站顶栏显示切换
  const handleToggleGlobalNav = () => {
    const nextVal = !hideGlobalNav;
    setHideGlobalNav(nextVal);
    try {
      localStorage.setItem('terminal_hide_global_nav', nextVal ? '1' : '0');
      window.dispatchEvent(new Event('terminal_nav_change'));
      toast.success(nextVal ? '已在终端内隐藏主站顶栏' : '已显示主站顶栏');
    } catch {}
  };

  // 清除本地缓存
  const handleClearCache = () => {
    try {
      const keysToRemove = [
        'journal:stockConfigs',
        'terminal_options_symbol',
      ];
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      toast.success('本地终端缓存已清除');
      onRefreshAll();
    } catch {
      toast.error('清除缓存失败');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto pb-20 md:pb-8">
      {/* 标头卡片 */}
      <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-6 border ${themes[theme].border} shadow-xs`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>终端偏好与界面设置</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-bold">
                Preferences
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              自定义交易终端显示模式、顶栏布局及界面风格，自由切换经典与终端视图
            </p>
          </div>
        </div>
      </div>

      {/* 核心卡片 1：界面风格模式选择（解决切换回旧风格的需求） */}
      <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-6 border ${themes[theme].border} shadow-xs space-y-4`}>
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              界面风格模式
            </h3>
          </div>
          <span className="text-xs text-slate-500 dark:text-zinc-400">
            可随时无缝切换
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {/* 旧版经典风格卡片 */}
          <div
            className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col justify-between ${
              preferredMode === 'classic'
                ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-950/20'
                : 'border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 hover:border-slate-300 dark:hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    旧版经典风格
                  </span>
                </div>
                {preferredMode === 'classic' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                    <Check className="w-3 h-3" />
                    默认偏好
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed mb-4">
                标准网页视图，包含完整的期权全景、组合面板、收益计算器与到期风控等分析工具，无固定底栏与双层顶栏占用空间。
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleSwitchToClassicOptions}
                className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs sm:text-sm font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <span>立即切换回旧版风格 (Options)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSwitchToClassicJournal}
                  className="flex-1 py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-medium transition-colors text-center"
                >
                  经典交易日志
                </button>
                <button
                  type="button"
                  onClick={() => handlePreferredModeToggle('classic')}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                    preferredMode === 'classic'
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                >
                  设为默认
                </button>
              </div>
            </div>
          </div>

          {/* 新版交易终端卡片 */}
          <div
            className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col justify-between ${
              preferredMode === 'terminal'
                ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-950/20'
                : 'border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 hover:border-slate-300 dark:hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    新版交易终端 (Terminal)
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  当前页面
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed mb-4">
                专为交易用户打造的一站式工作台，融合 Material Design 3 风格，打通股票现货与期权衍生品持仓，支持手机底栏与桌面标签切换。
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => handlePreferredModeToggle('terminal')}
                className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  preferredMode === 'terminal'
                    ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                    : 'border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                }`}
              >
                {preferredMode === 'terminal' ? '已设为默认偏好' : '设为默认交易风格'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 核心卡片 2：顶栏显示与吸顶设置（解决“我不想一直有顶栏”的痛点） */}
      <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-6 border ${themes[theme].border} shadow-xs space-y-4`}>
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              顶栏显示与视口控制
            </h3>
          </div>
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            告别遮挡 · 释放屏幕高度
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-zinc-400">
          很多用户不希望顶栏一直固定在屏幕上方占用空间。您可以根据个人使用习惯自由选择顶栏显示行为：
        </p>

        {/* 顶栏模式 3 选 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 模式 1：随页面滚动（推荐） */}
          <button
            type="button"
            onClick={() => onTopBarModeChange('scroll')}
            className={`p-3.5 rounded-xl border-2 text-left transition-all duration-150 select-none ${
              topBarMode === 'scroll'
                ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30 shadow-xs'
                : 'border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 hover:border-slate-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <ArrowDownCircle className={`w-4 h-4 ${topBarMode === 'scroll' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`} />
                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  随页面滚动
                </span>
              </div>
              {topBarMode === 'scroll' && (
                <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
              <span className="text-blue-600 dark:text-blue-400 font-semibold">[推荐]</span> 顶栏不吸顶，向上浏览内容时自动滑出视口，彻底不挡屏幕。
            </p>
          </button>

          {/* 模式 2：完全隐藏顶栏 */}
          <button
            type="button"
            onClick={() => onTopBarModeChange('hidden')}
            className={`p-3.5 rounded-xl border-2 text-left transition-all duration-150 select-none ${
              topBarMode === 'hidden'
                ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30 shadow-xs'
                : 'border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 hover:border-slate-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <EyeOff className={`w-4 h-4 ${topBarMode === 'hidden' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`} />
                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  完全隐藏顶栏
                </span>
              </div>
              {topBarMode === 'hidden' && (
                <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
              极简沉浸全屏模式，零顶栏高度占用。可通过本设置页或底部导航无障碍切换账户。
            </p>
          </button>

          {/* 模式 3：常驻吸顶 */}
          <button
            type="button"
            onClick={() => onTopBarModeChange('sticky')}
            className={`p-3.5 rounded-xl border-2 text-left transition-all duration-150 select-none ${
              topBarMode === 'sticky'
                ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30 shadow-xs'
                : 'border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 hover:border-slate-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Pin className={`w-4 h-4 ${topBarMode === 'sticky' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`} />
                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  常驻吸顶
                </span>
              </div>
              {topBarMode === 'sticky' && (
                <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
              顶栏始终固定在屏幕最顶端，随时可见账户选择与刷新按钮。
            </p>
          </button>
        </div>

        {/* 隐藏全局主站顶栏辅助开关 */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800">
          <div>
            <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
              隐藏主站全局导航栏 (仅在终端页面生效)
            </span>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              开启后消除主站 TraderLog 与面包屑顶栏，避免终端页面出现“双层顶栏”现象。
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleGlobalNav}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              hideGlobalNav ? 'bg-blue-600' : 'bg-slate-300 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                hideGlobalNav ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 核心卡片 3：当前账户管理（顶栏隐藏时极其有用） */}
      <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-6 border ${themes[theme].border} shadow-xs space-y-3`}>
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              当前交易账户
            </h3>
          </div>
          <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
            {selectedAccountId || '未选择'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-600 dark:text-zinc-400">
            当顶部栏隐藏时，您可在此随时切换操作账户，终端所有资产与交易将自动同步：
          </p>
          <div className="shrink-0">
            <AccountSelector
              userId={user?.id || 'demo'}
              theme={theme}
              selectedAccountId={selectedAccountId}
              onAccountChange={onAccountChange}
            />
          </div>
        </div>
      </div>

      {/* 核心卡片 4：外观与缓存管理 */}
      <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-6 border ${themes[theme].border} shadow-xs space-y-4`}>
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              主题与数据维护
            </h3>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
              色彩主题外观
            </span>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              支持明亮、暗黑夜间及经典金融蓝
            </p>
          </div>
          {onThemeChange && (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
              {[
                { id: 'light' as Theme, label: '明亮', icon: Sun },
                { id: 'dark' as Theme, label: '暗黑', icon: Moon },
                { id: 'blue' as Theme, label: '金融蓝', icon: Palette },
              ].map((t) => {
                const Icon = t.icon;
                const isSelected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onThemeChange(t.id)}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
          <div>
            <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
              数据同步与缓存清理
            </span>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              若遇到数据不同步或图表缓存异常，可尝试手动同步或清理
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onRefreshAll();
                toast.success('已全面刷新终端行情与资产数据');
              }}
              className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-medium transition-colors"
            >
              刷新数据
            </button>
            <button
              type="button"
              onClick={handleClearCache}
              className="py-1.5 px-3 rounded-lg border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-medium transition-colors"
            >
              清除本地缓存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
