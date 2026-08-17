export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <i />
          <span style={{ width: `${45 + ((index * 13) % 35)}%` }} />
        </div>
      ))}
    </div>
  );
}
