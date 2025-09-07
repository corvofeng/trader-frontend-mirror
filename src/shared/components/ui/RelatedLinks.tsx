import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp, BarChart2, Upload, Settings } from 'lucide-react';
import { Theme, themes } from '../../lib/theme';

interface RelatedLink {
  title: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'trading' | 'analysis' | 'management';
}

interface RelatedLinksProps {
  theme: Theme;
  currentPath: string;
  maxItems?: number;
}

const ALL_LINKS: RelatedLink[] = [
  {
    title: 'Portfolio Overview',
    description: 'View your complete portfolio performance and holdings',
    path: '/journal?tab=portfolio',
    icon: BarChart2,
    category: 'analysis'
  },
  {
    title: 'Trade Plans',
    description: 'Create and manage your trading strategies',
    path: '/journal?tab=trades',
    icon: TrendingUp,
    category: 'trading'
  },
  {
    title: 'Trade History',
    description: 'Review your completed trades and performance',
    path: '/journal?tab=history',
    icon: BarChart2,
    category: 'analysis'
  },
  {
    title: 'Options Trading',
    description: 'Advanced options analysis and trading tools',
    path: '/options',
    icon: TrendingUp,
    category: 'trading'
  },
  {
    title: 'Portfolio Upload',
    description: 'Import and share your portfolio data',
    path: '/journal?tab=upload',
    icon: Upload,
    category: 'management'
  },
  {
    title: 'System Operations',
    description: 'Monitor system performance and operations',
    path: '/journal?tab=operations',
    icon: Settings,
    category: 'management'
  }
];

export function RelatedLinks({ theme, currentPath, maxItems = 3 }: RelatedLinksProps) {
  const filteredLinks = ALL_LINKS
    .filter(link => link.path !== currentPath)
    .slice(0, maxItems);

  if (filteredLinks.length === 0) return null;

  return (
    <div className={`${themes[theme].card} rounded-lg p-6 shadow-md`}>
      <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>
        Related Features
      </h3>
      <div className="space-y-3">
        {filteredLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-start space-x-3 p-3 rounded-lg ${themes[theme].cardHover} group transition-all duration-200`}
              title={`Navigate to ${link.title}`}
            >
              <Icon className={`w-5 h-5 mt-0.5 ${themes[theme].text} opacity-75 group-hover:opacity-100`} />
              <div className="flex-1 min-w-0">
                <h4 className={`text-sm font-medium ${themes[theme].text} group-hover:text-blue-600 transition-colors`}>
                  {link.title}
                </h4>
                <p className={`text-xs ${themes[theme].text} opacity-75 mt-1`}>
                  {link.description}
                </p>
              </div>
              <ArrowRight className={`w-4 h-4 ${themes[theme].text} opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all`} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}