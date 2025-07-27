import React from 'react';
import { Link } from 'react-router-dom';
import { Home, BarChart2, TrendingUp, Upload, Settings, Activity, BookOpen, Sigma } from 'lucide-react';
import { Theme, themes } from '../../lib/theme';

interface SiteMapProps {
  theme: Theme;
}

interface SiteSection {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  links: Array<{
    title: string;
    path: string;
    description: string;
  }>;
}

const SITE_SECTIONS: SiteSection[] = [
  {
    title: 'Main Pages',
    icon: Home,
    links: [
      {
        title: 'Home',
        path: '/',
        description: 'Welcome page with market overview and features'
      },
      {
        title: 'Trading Journal',
        path: '/journal',
        description: 'Complete trading management dashboard'
      },
      {
        title: 'Options Trading',
        path: '/options',
        description: 'Advanced options analysis and trading tools'
      }
    ]
  },
  {
    title: 'Portfolio Management',
    icon: BarChart2,
    links: [
      {
        title: 'Portfolio Overview',
        path: '/journal?tab=portfolio',
        description: 'View holdings, performance metrics, and trends'
      },
      {
        title: 'Portfolio Upload',
        path: '/journal?tab=upload',
        description: 'Import portfolio data and generate shareable links'
      }
    ]
  },
  {
    title: 'Trading Tools',
    icon: TrendingUp,
    links: [
      {
        title: 'Trade Plans',
        path: '/journal?tab=trades',
        description: 'Create and manage trading strategies'
      },
      {
        title: 'Trade History',
        path: '/journal?tab=history',
        description: 'Review completed trades and charts'
      }
    ]
  },
  {
    title: 'Analysis & Operations',
    icon: Activity,
    links: [
      {
        title: 'Performance Analysis',
        path: '/journal?tab=analysis',
        description: 'Detailed performance metrics and insights'
      },
      {
        title: 'System Operations',
        path: '/journal?tab=operations',
        description: 'Monitor system performance and API calls'
      },
      {
        title: 'Account Settings',
        path: '/journal?tab=settings',
        description: 'Manage account preferences and configuration'
      }
    ]
  }
];

export function SiteMap({ theme }: SiteMapProps) {
  return (
    <div className={`${themes[theme].card} rounded-lg p-6 shadow-md`}>
      <h2 className={`text-xl font-bold ${themes[theme].text} mb-6`}>
        Site Navigation
      </h2>
      
      <div className="grid gap-6 md:grid-cols-2">
        {SITE_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.title} className="space-y-3">
              <div className="flex items-center space-x-2">
                <Icon className={`w-5 h-5 ${themes[theme].text}`} />
                <h3 className={`text-lg font-semibold ${themes[theme].text}`}>
                  {section.title}
                </h3>
              </div>
              
              <ul className="space-y-2 ml-7">
                {section.links.map((link) => (
                  <li key={link.path}>
                    <Link
                      to={link.path}
                      className={`block p-2 rounded-md ${themes[theme].cardHover} group transition-colors duration-200`}
                      title={link.description}
                    >
                      <div className={`text-sm font-medium ${themes[theme].text} group-hover:text-blue-600 transition-colors`}>
                        {link.title}
                      </div>
                      <div className={`text-xs ${themes[theme].text} opacity-75 mt-1`}>
                        {link.description}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}