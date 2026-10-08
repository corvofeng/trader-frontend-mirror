import React from 'react';
import { isCloudflareEnv } from '../../lib/services';
import { CloudflareNavigation } from './CloudflareNavigation';
import { BusinessNavigation } from './BusinessNavigation';
import type { NavigationProps } from './types';

export function Navigation(props: NavigationProps) {
  if (isCloudflareEnv) {
    return <CloudflareNavigation {...props} />;
  }
  return <BusinessNavigation {...props} />;
}

export type { NavigationProps };
