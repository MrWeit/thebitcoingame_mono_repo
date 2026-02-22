interface PlaceholderProps {
  name: string;
}

export function Placeholder({ name }: PlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-4xl font-display font-semibold text-primary">{name}</h1>
      <p className="text-base text-secondary font-mono">{window.location.pathname}</p>
    </div>
  );
}
