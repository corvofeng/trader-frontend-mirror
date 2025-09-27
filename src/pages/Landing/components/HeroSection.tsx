import React from 'react';
import { TrendingUp, Sigma, Sun, Moon } from 'lucide-react';
import { Theme } from '../../../lib/theme';

interface HeroSectionProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onNavigateToJournal: () => void;
  onNavigateToOptions: () => void;
}

export function HeroSection({ 
  theme, 
  onThemeChange, 
  onNavigateToJournal, 
  onNavigateToOptions 
}: HeroSectionProps) {
  const isDark = theme === 'dark';

  return (
    <div 
      className={`bg-cover bg-center bg-no-repeat ${
        isDark ? 'bg-gray-900' : 'bg-white'
      }`}
      style={{
        backgroundImage: isDark 
          ? `linear-gradient(to bottom, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.8)), url('https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&q=80&w=2070')`
          : `linear-gradient(to bottom, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.8)), url('https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&q=80&w=2070')`
      }}
    >
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 flex justify-end">
        <button
          onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
          className={`p-2 rounded-full ${isDark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800'} hover:bg-opacity-90 transition-colors duration-200`}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h1 className={`text-4xl sm:text-6xl font-bold mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Track Your Trading Journey
          </h1>
          <p className={`text-xl mb-8 ${isDark ? 'text-gray-200' : 'text-gray-600'}`}>
            Professional tools to analyze, track, and improve your trading performance
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onNavigateToJournal}
              className="inline-flex items-center px-8 py-4 rounded-lg text-lg font-medium shadow-lg transition-all hover:scale-105 bg-blue-600 text-white hover:bg-blue-700"
            >
              <TrendingUp className="w-6 h-6 mr-2" />
              Start Trading Journal
            </button>
            <button
              onClick={onNavigateToOptions}
              className={`inline-flex items-center px-8 py-4 rounded-lg text-lg font-medium shadow-lg transition-all hover:scale-105 ${
                isDark ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              <Sigma className="w-6 h-6 mr-2" />
              Options Trading
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}