import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';

interface SharedViewBannerProps {
  theme: Theme;
}

export function SharedViewBanner({ theme }: SharedViewBannerProps) {
  return (
    <div className={`${themes[theme].card} rounded-lg p-4 border-l-4 border-blue-500`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ExternalLink className="w-5 h-5 text-blue-500" />
          <span className={`text-sm font-medium ${themes[theme].text}`}>
            This is a shared portfolio view
          </span>
        </div>
        <span className={`text-xs ${themes[theme].text} opacity-60`}>
          Read-only access
        </span>
      </div>
    </div>
  );
}