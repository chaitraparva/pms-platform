import { useState } from 'react';
import { MONTHS } from '../lib/format';

export interface Series { name: string; color: string; values: number[] }

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export function BarChart({ labels, series, fmt, tipFmt, w = 640, h = 220, label, onBar }: { labels: string[]; series: Series[]; fmt: (v: number) => string; tipFmt?: (v: number) => string; w?: number; h?: number; label: string; onBar?: (labelIndex: number, seriesIndex: number) => void }) {
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null);
  const L = 56, B = 26, T = 10, R = 8;
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
  const iw = w - L - R, ih = h - T - B, gw = iw / Math.max(1, labels.length);
  const bw = Math.min(28, (gw - 12) / series.length);
  const y = (v: number) => T + ih - (v / max) * ih;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        {[0, 1, 2, 3, 4].map(i => {
          const v = (max * i) / 4;
          return <g key={i}><line className="gl" x1={L} x2={w - R} y1={y(v)} y2={y(v)} /><text x={L - 8} y={y(v) + 4} textAnchor="end">{fmt(v)}</text></g>;
        })}
        {labels.map((lb, i) => {
          const x0 = L + gw * i + (gw - bw * series.length - 3 * (series.length - 1)) / 2;
          return (
            <g key={lb + i}>
              {series.map((s, j) => {
                const v = s.values[i] || 0;
                const bh = Math.max(v > 0 ? 2 : 0, (v / max) * ih);
                return <rect key={j} className={'bar' + (onBar ? ' click' : '')} x={x0 + j * (bw + 3)} y={T + ih - bh} width={bw} height={bh} rx={3} fill={s.color}
                  onClick={onBar ? () => onBar(i, j) : undefined}
                  onMouseMove={e => setTip({ x: e.clientX, y: e.clientY, t: `${s.name} · ${lb}: ${(tipFmt || fmt)(v)}` })} onMouseLeave={() => setTip(null)} />;
              })}
              <text x={L + gw * i + gw / 2} y={h - 8} textAnchor="middle">{lb}</text>
            </g>
          );
        })}
      </svg>
      {tip && <div className="ctip" style={{ display: 'block', left: tip.x + 12, top: tip.y - 34 }}>{tip.t}</div>}
    </div>
  );
}

export function Donut({ parts, fmt, center1, center2, label, onPart }: { parts: { name: string; value: number; color: string; sub?: string }[]; fmt: (v: number) => string; center1: string; center2: string; label: string; onPart?: (index: number) => void }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = 54, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={label}>
        <circle r={r} cx="70" cy="70" fill="none" stroke="var(--surface-2)" strokeWidth="18" />
        {parts.map((p, ix) => {
          const len = (c * p.value) / total;
          const el = <circle key={p.name} className={onPart ? 'donut-seg' : undefined} onClick={onPart ? () => onPart(ix) : undefined} r={r} cx="70" cy="70" fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"><title>{p.name}: {fmt(p.value)}</title></circle>;
          off += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--fg-3)' }}>{center1}</text>
        <text x="70" y="84" textAnchor="middle" style={{ fontSize: 15, fontWeight: 600, fill: 'var(--fg)' }}>{center2}</text>
      </svg>
      <div style={{ display: 'grid', gap: 8, fontSize: 13, flex: 1, minWidth: 150 }}>
        {parts.map((p, ix) => {
          const inner = <>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flex: 'none' }} />
            <span style={{ flex: 1 }}>{p.name}{p.sub && <small className="muted" style={{ display: 'block' }}>{p.sub}</small>}</span><b className="num" style={{ fontWeight: 500 }}>{fmt(p.value)}</b>
          </>;
          return onPart
            ? <button key={p.name} type="button" className="legend-btn" style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={() => onPart(ix)}>{inner}</button>
            : <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{inner}</div>;
        })}
      </div>
    </div>
  );
}

export const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--violet)', 'var(--green)', 'var(--amber)'];
export const monthLabel = (ym: string) => MONTHS[+ym.slice(5, 7) - 1] + (ym.slice(5, 7) === '01' ? ' ' + ym.slice(2, 4) : '');
