import { useNavigate } from 'react-router-dom';
import { } from 'lucide-react';
import { HeroSection } from './components/HeroSection';
import { MarketOverview } from './components/MarketOverview';
import { PortfolioPreview } from './components/PortfolioPreview';
import { FeaturesGrid } from './components/FeaturesGrid';
import { RelatedLinks } from '../../shared/components';
import { Theme } from '../../lib/theme';
import type { User } from '../../lib/services/types';

interface LandingProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  user: User | null;
}

export function Landing({ theme, onThemeChange, user }: LandingProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <HeroSection 
        theme={theme} 
        onThemeChange={onThemeChange}
        onNavigateToJournal={() => navigate('/journal')}
        onNavigateToOptions={() => navigate('/options')}
        onNavigateToAdmin={user ? () => navigate('/admin') : undefined}
        onNavigateToAbout={() => navigate('/about')}
      />
      
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <MarketOverview theme={theme} />
          <PortfolioPreview theme={theme} />
          <FeaturesGrid theme={theme} user={user} />
          
          <div className="mt-16">
            <RelatedLinks 
              theme={theme} 
              currentPath="/" 
              maxItems={4}
              hideTradePlans={!user}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
