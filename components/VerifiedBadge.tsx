/**
 * Insignia de usuario verificado
 * Muestra un ícono azul con check cuando el usuario está verificado
 */
export function VerifiedBadge({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = {
    sm: 'h-3 w-3 p-0.5',
    md: 'h-4 w-4 p-1',
    lg: 'h-5 w-5 p-1.5',
  };

  const iconSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-blue-500 ${sizeClasses[size]} ${className}`}
      title="Usuario verificado"
      aria-label="Usuario verificado"
    >
      <svg className={`${iconSizes[size]} text-white`} fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}
