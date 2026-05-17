import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

interface InternalLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
  openInNewTab?: boolean;
  rel?: string;
  'aria-label'?: string;
}

export function InternalLink({ 
  to, 
  children, 
  className = '', 
  title,
  openInNewTab = false,
  rel,
  'aria-label': ariaLabel,
  ...props 
}: InternalLinkProps) {
  const isHttpExternal = to.startsWith('http') || to.startsWith('//');
  const isSpecialProtocol = to.startsWith('mailto:') || to.startsWith('tel:');
  const useAnchor = isHttpExternal || isSpecialProtocol || openInNewTab;
  const target = openInNewTab || isHttpExternal ? '_blank' : undefined;
  
  const linkProps = {
    className: `${className} transition-colors duration-200`,
    title: title || (typeof children === 'string' ? children : undefined),
    'aria-label': ariaLabel,
    rel: rel || (isHttpExternal ? 'noopener noreferrer' : undefined),
    ...props
  };

  if (useAnchor) {
    return (
      <a
        href={to}
        target={target}
        {...linkProps}
      >
        {children}
        {isHttpExternal && <ExternalLink className="w-3 h-3 inline ml-1" />}
      </a>
    );
  }

  return (
    <Link to={to} {...linkProps}>
      {children}
    </Link>
  );
}
