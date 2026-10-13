/** A thumbnail of per-range amounts: one column per range, height by share. */
export function RangeStrip({ values }: { values: number[] }) {
  const total = values.reduce((sum, value) => sum + value, 0) || 1
  return <span className="range-strip-mini" aria-hidden="true">{values.map((value, index) =>
    <i key={index} style={{ height: `${Math.max(value / total * 100, 4)}%`, opacity: value ? 1 : .25 }} />)}</span>
}
