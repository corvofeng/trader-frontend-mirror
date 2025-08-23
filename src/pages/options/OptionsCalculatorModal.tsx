import React from 'react';
import { OptionsCalculator } from './components/OptionsCalculator';
import { Theme } from '../../lib/theme';
import type { OptionsData } from '../../lib/services/types';

interface OptionsCalculatorModalProps {
  theme: Theme;
  optionsData: OptionsData | null;
  selectedSymbol: string;
  onClose: () => void;
}

export function OptionsCalculatorModal(props: OptionsCalculatorModalProps) {
  return <OptionsCalculator {...props} />;
}