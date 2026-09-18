/**
 * Streaming skeleton — Next.js shows this automatically while the server
 * component is fetching data during navigation (via React Suspense).
 */
export default function LoanLoading() {
  return (
    <div className="page-container">
      {/* Header skeleton */}
      <div className="page-header">
        <div>
          <div style={shimmerBlock(220, 32)} />
          <div style={{ ...shimmerBlock(320, 14), marginTop: '0.5rem' }} />
        </div>
        <div style={shimmerBlock(72, 32, 'var(--radius-sm)')} />
      </div>

      {/* Section label */}
      <div style={{ ...shimmerBlock(160, 12), marginBottom: '1rem' }} />

      {/* Position summary — 4 cards */}
      <div className="position-summary">
        {[0, 1, 2, 3].map((i) => (
          <div className="position-item" key={i}>
            <div style={shimmerBlock(100, 12)} />
            <div style={{ ...shimmerBlock(140, 36), marginTop: '0.5rem' }} />
          </div>
        ))}
      </div>

      {/* Dashboard body */}
      <div className="dashboard-body">
        {/* Table skeleton */}
        <div className="dashboard-main">
          <div style={{ ...shimmerBlock(160, 12), marginBottom: '1rem' }} />
          <div className="table-container" style={{ padding: '1rem' }}>
            {/* Table header */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
              {[28, 80, 90, 80, 80, 80, 70].map((w, i) => (
                <div key={i} style={shimmerBlock(w, 12)} />
              ))}
            </div>
            {/* Table rows */}
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} style={{ display: 'flex', gap: '1rem', marginBottom: '0.875rem' }}>
                {[28, 80, 90, 80, 80, 80, 70].map((w, i) => (
                  <div key={i} style={shimmerBlock(w, 14)} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Payment form skeleton */}
        <div className="dashboard-sidebar">
          <div className="payment-card">
            <div style={shimmerBlock(140, 14)} />
            <div style={{ ...shimmerBlock(280, 12), marginTop: '1rem' }} />
            <div style={{ ...shimmerBlock('100%' as unknown as number, 36), marginTop: '1rem' }} />
            <div style={{ ...shimmerBlock('100%' as unknown as number, 36), marginTop: '1rem' }} />
            <div style={{ ...shimmerBlock('100%' as unknown as number, 38), marginTop: '1.5rem', borderRadius: 'var(--radius-sm)' }} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}

function shimmerBlock(
  width: number | string,
  height: number,
  borderRadius = '6px'
): React.CSSProperties {
  return {
    width: typeof width === 'number' ? `${width}px` : width,
    height: `${height}px`,
    borderRadius,
    background: 'linear-gradient(90deg, #e8e6e1 25%, #f0eeea 50%, #e8e6e1 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
  };
}
