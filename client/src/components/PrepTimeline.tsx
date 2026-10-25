import { useState } from 'react';
import type { ExpandedPlan, SessionTimeline } from '../api.ts';
import { clock, formatDate, formatMinutes } from '../labels.ts';

const COLORS = 6;

export function PrepTimeline({ plan }: { plan: ExpandedPlan }) {
  const [startHour, setStartHour] = useState(10);

  return (
    <div className="timeline">
      <div className="toolbar no-print">
        <label className="inline">
          Start um{' '}
          <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))}>
            {Array.from({ length: 15 }, (_, i) => i + 7).map((h) => (
              <option key={h} value={h}>
                {h}:00 Uhr
              </option>
            ))}
          </select>
        </label>
      </div>
      {plan.timelines.map((t) => (
        <Session key={t.session} timeline={t} startHour={startHour} />
      ))}
    </div>
  );
}

function Session({ timeline, startHour }: { timeline: SessionTimeline; startHour: number }) {
  const recipeIds = [...new Set(timeline.tasks.map((t) => t.recipeId))];
  const colorOf = (id: number | null) => (id == null ? 'c-end' : `c${recipeIds.indexOf(id) % COLORS}`);
  const span = Math.max(1, timeline.totalMinutes);

  if (!timeline.tasks.length) {
    return <p className="muted">Für {formatDate(timeline.prepDate)} ist nichts zu kochen.</p>;
  }

  return (
    <section className="card session-timeline">
      <header>
        <h2>Kochtag: {formatDate(timeline.prepDate)}</h2>
        <p className="muted">
          {clock(startHour, 0)}–{clock(startHour, timeline.totalMinutes)} Uhr · {formatMinutes(timeline.totalMinutes)} gesamt, davon{' '}
          {formatMinutes(timeline.activeMinutes)} aktiv
        </p>
      </header>

      <div className="gantt" aria-hidden>
        {recipeIds.map((id) => {
          const tasks = timeline.tasks.filter((t) => t.recipeId === id);
          return (
            <div key={id ?? 'end'} className="gantt-row">
              <span className="gantt-label">{tasks[0].recipeTitle}</span>
              <div className="gantt-track">
                {tasks.map((t) => (
                  <span
                    key={`${t.stepIndex}-${t.start}`}
                    className={`gantt-bar ${colorOf(id)} ${t.passive ? 'passive' : ''}`}
                    style={{ left: `${(t.start / span) * 100}%`, width: `${((t.end - t.start) / span) * 100}%` }}
                    title={`${clock(startHour, t.start)} ${t.text}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <ol className="steps">
        {timeline.tasks.map((t) => (
          <li key={`${t.recipeId}-${t.stepIndex}-${t.start}`} className={t.passive ? 'passive' : ''}>
            <time>{clock(startHour, t.start)}</time>
            <span className={`dot ${colorOf(t.recipeId)}`} />
            <div>
              <strong>{t.recipeTitle}</strong>
              <p>{t.text}</p>
              <small className="muted">
                {formatMinutes(t.end - t.start)}
                {t.passive ? ' · läuft nebenbei – Zeit für den nächsten Schritt' : ''}
              </small>
            </div>
          </li>
        ))}
      </ol>

      <h3>Boxen</h3>
      <ul className="containers">
        {timeline.containers.map((c) => (
          <li key={c.recipeId}>
            <span className={`dot ${colorOf(c.recipeId)}`} /> {c.portions}× {c.title}
          </li>
        ))}
      </ul>
    </section>
  );
}
