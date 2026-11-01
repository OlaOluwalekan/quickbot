const InlineLoading = () => {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="inline-flex items-center gap-1"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
    </div>
  );
};

export default InlineLoading;
