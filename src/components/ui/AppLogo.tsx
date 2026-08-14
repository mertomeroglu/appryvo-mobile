import React from 'react';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  variant?: 'full' | 'icon';
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  size = 'md',
  variant = 'full',
  className = '',
}) => {
  const sizeMap = {
    sm: variant === 'icon' ? 'h-6 w-6' : 'h-6',
    md: variant === 'icon' ? 'h-9 w-9' : 'h-9',
    lg: variant === 'icon' ? 'h-12 w-12' : 'h-12',
    xl: variant === 'icon' ? 'h-16 w-16' : 'h-16',
    '2xl': variant === 'icon' ? 'h-24 w-24' : 'h-24',
  };

  const src = variant === 'icon' ? '/assets/brand/ana_simge.png' : '/assets/brand/ana_logo.png';

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <img
        src={src}
        alt="RYVO"
        className={`${sizeMap[size]} object-contain select-none`}
        onError={(e) => {
          // Fallback if image fails to load in isolated test context
          const target = e.currentTarget;
          target.style.display = 'none';
          if (target.parentElement) {
            target.parentElement.innerHTML = `<span class="font-extrabold text-xl tracking-wider text-brand-gradient">RYVO</span>`;
          }
        }}
      />
    </div>
  );
};
