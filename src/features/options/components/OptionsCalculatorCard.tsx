import React from 'react';
import { Calculator } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';

interface OptionsCalculatorCardProps {
  theme: Theme;
  onOpenCalculator: () => void;
}

export function OptionsCalculatorCard({ theme, onOpenCalculator }: OptionsCalculatorCardProps) {
  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Calculator className="w-6 h-6 text-purple-500" />
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              期权收益计算器
            </h2>
          </div>
          <button
            onClick={onOpenCalculator}
            className={`px-4 py-2 rounded-md ${themes[theme].primary}`}
          >
            打开计算器
          </button>
        </div>
      </div>
    </div>
  );
}