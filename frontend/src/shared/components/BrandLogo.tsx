/**
 * The SEH app icon. It is the same file the browser uses as the tab icon (public/favicon.svg),
 * so there is one source of truth for the logo.
 */
export function BrandLogo({
  size,
  className,
}: {
  size: number;
  className?: string;
}) {
  return (
    <img
      className={'brand-logo' + (className ? ` ${className}` : '')}
      src={`${import.meta.env.BASE_URL.replace(/\/?$/, '/')}favicon.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
