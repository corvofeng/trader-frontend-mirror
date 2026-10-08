import type { User } from '../../lib/services/types';
import type { Theme } from '../../lib/theme';

export interface NavigationProps {
  user: User | null;
  theme: Theme;
  mobileMenuOpen: boolean;
  showThemeDropdown: boolean;
  onThemeChange: (theme: Theme) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onMobileMenuToggle: () => void;
  onThemeDropdownToggle: () => void;
  onOpenCommandPalette?: () => void;
}
