import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { Theme, themes } from '../../constants/theme';

interface BreadcrumbItem {
  label: string;
  path: string;
  isActive?: boolean;
}

interface BreadcrumbsProps {
  theme: Theme;
  customItems?: BreadcrumbItem[];
}

export function Breadcrumbs({ theme, customItems }: BreadcrumbsProps) {
  const location = useLocation();
  
  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    if (customItems) return customItems;
    
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get('tab');
    const uuid = searchParams.get('uuid');
    
    const breadcrumbs: BreadcrumbItem[] = [
      { label: 'Home', path: '/' }
    ];
    
    if (pathSegments.includes('journal')) {
      breadcrumbs.push({ label: 'Trading Journal', path: '/journal' });
      
      if (tab) {
        const tabLabels: Record<string, string> = {
          portfolio: uuid ? 'Shared Portfolio' : 'Portfolio Overview',
          trades: 'Trade Plans',
          history: 'Trade History',
          upload: 'Portfolio Upload',
          operations: 'System Operations',
          analysis: 'Performance Analysis',
          settings: 'Account Settings'
        };
        
        if (tabLabels[tab]) {
          breadcrumbs.push({ 
            label: tabLabels[tab], 
            path: `/journal?tab=${tab}${uuid ? `&uuid=${uuid}` : ''}`,
            isActive: true 
          });
        }
      }
    } else if (pathSegments.includes('options')) {
      breadcrumbs.push({ label: 'Options Trading', path: '/options', isActive: true });
    }
    
    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  if (breadcrumbs.length <= 1) return null;

  return (
    <nav 
      className={`${themes[theme].background} px-4 py-2 border-b ${themes[theme].border}`}
      aria-label="Breadcrumb navigation"
    >
      <div className="max-w-7xl mx-auto">
        <ol className="flex items-center space-x-2 text-sm">
          {breadcrumbs.map((item, index) => (
            <li key={item.path} className="flex items-center">
              {index > 0 && (
                <ChevronRight className={`w-4 h-4 mx-2 ${themes[theme].text} opacity-50`} />
              )}
              
              {item.isActive ? (
                <span 
                  className={`${themes[theme].text} font-medium`}
                  aria-current="page"
                >
                  {index === 0 && <Home className="w-4 h-4 inline mr-1" />}
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.path}
                  className={`${themes[theme].text} opacity-75 hover:opacity-100 transition-opacity duration-200 flex items-center`}
                  title={`Navigate to ${item.label}`}
                >
                  {index === 0 && <Home className="w-4 h-4 inline mr-1" />}
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}