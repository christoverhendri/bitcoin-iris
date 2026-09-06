/** The footer bar. This is a market-data product; the disclaimer is not optional. */
export function Disclaimer() {
  return (
    <footer
      className="iris-micro"
      style={{
        background: 'var(--sunk)',
        borderTop: '1px solid var(--line)',
        padding: '8px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        fontFamily: 'var(--mono)',
        fontSize: 8.5,
        letterSpacing: '.14em',
        color: 'var(--dim)',
        flexShrink: 0,
      }}
    >
      <span>INFORMATIONAL ONLY · NOT FINANCIAL ADVICE</span>
      <span>IRIS BTC © {new Date().getUTCFullYear()}</span>
    </footer>
  );
}
