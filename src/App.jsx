import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Scatter,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "./lib/supabaseClient";
import "./App.css";

const READINGS_PER_PAGE = 12;
const GLUCOSE_GAP_MS = 20 * 60 * 1000;
const EVENT_TYPE_ORDER = {
  background_insulin: 0,
  fast_insulin: 1,
  carbs: 2,
  note: 3,
};

const EVENT_CONFIG = {
  carbs: {
    label: "Carbs",
    unit: "g",
    buttonLabel: "Record Carbs",
    amountLabel: "Carbs",
    placeholder: "e.g. 45",
    className: "event-carbs",
  },
  fast_insulin: {
    label: "Fast acting insulin",
    unit: "u",
    buttonLabel: "Record Fast Acting",
    amountLabel: "Fast acting units",
    placeholder: "e.g. 6",
    className: "event-fast",
  },
  background_insulin: {
    label: "Background insulin",
    unit: "u",
    buttonLabel: "Record Background",
    amountLabel: "Background units",
    placeholder: "e.g. 18",
    className: "event-background",
  },
  note: {
    label: "Note",
    unit: "",
    buttonLabel: "Add Note",
    amountLabel: "Amount",
    placeholder: "",
    className: "event-note",
  },
};

function formatDateTime(value) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateOnly(value) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const GLUCOSE_GRID_TICKS = Array.from({ length: 18 }, (_, index) => index + 1);
const GLUCOSE_LINE_COLORS = {
  red: "#dc2626",
  amber: "#f59e0b",
  green: "#16a34a",
};

function GlucoseYAxisTick({ x, y, payload }) {
  const value = Number(payload?.value);

  return (
    <text x={x} y={y} dy={4} textAnchor="end" className="glucose-y-axis-tick">
      {value}
    </text>
  );
}

function GlucoseXAxisTick({ x, y, payload, startMs, endMs, tickFormatter }) {
  const value = Number(payload?.value);
  const isStart = value === startMs;
  const isEnd = value === endMs;
  const adjustedX = isStart ? x + 2 : isEnd ? x - 2 : x;

  return (
    <text
      x={adjustedX}
      y={y}
      dy={24}
      textAnchor={isStart ? "start" : isEnd ? "end" : "middle"}
      className="glucose-x-axis-tick"
    >
      {tickFormatter(value)}
    </text>
  );
}

function formatGlucoseValue(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "--";
  }

  return numericValue.toLocaleString("en-GB", {
    minimumFractionDigits: Number.isInteger(numericValue) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function getPaleEventColor(eventType) {
  if (eventType === "carbs") return "#93c5fd";
  if (eventType === "fast_insulin") return "#fca5a5";
  if (eventType === "background_insulin") return "#86efac";
  return "#cbd5e1";
}

function ChartEventDot(props) {
  const { cx, cy, payload, onSelect, selectedEventId } = props;
  const event = payload?.event;

  if (!event || cx === undefined || cy === undefined) {
    return null;
  }

  const isSelected = selectedEventId === event.id;
  const color = getEventLineColor(event.event_type);
  const paleColor = getPaleEventColor(event.event_type);

  return (
    <g
      className={`chart-event-marker ${isSelected ? "is-selected" : ""}`}
      style={{
        "--event-dot-color": color,
        "--event-dot-pale-color": paleColor,
      }}
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(event)}
      onKeyDown={(eventKey) => {
        if (eventKey.key === "Enter" || eventKey.key === " ") {
          eventKey.preventDefault();
          onSelect?.(event);
        }
      }}
    >
      <circle cx={cx} cy={cy} r={13} fill="transparent" />
      <circle
        cx={cx}
        cy={cy}
        r={isSelected ? 7.5 : 7}
        fill={isSelected ? paleColor : color}
        stroke="#ffffff"
        strokeWidth={2}
      />
    </g>
  );
}

function ClickableGlucosePoint(props) {
  const { cx, cy, payload, onSelect, selectedReadingId } = props;

  if (cx === undefined || cy === undefined || !payload) {
    return null;
  }

  const isSelected = selectedReadingId === payload.id;
  const strokeColor = getGlucoseLineColor(payload.glucose);

  return (
    <g
      className={`chart-reading-hit ${isSelected ? "is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Select glucose reading ${formatGlucoseValue(payload.glucose)} millimoles per litre at ${payload.fullTime}`}
      onClick={() => onSelect?.(payload)}
      onKeyDown={(eventKey) => {
        if (eventKey.key === "Enter" || eventKey.key === " ") {
          eventKey.preventDefault();
          onSelect?.(payload);
        }
      }}
    >
      <circle cx={cx} cy={cy} r={10} fill="transparent" />
      <circle
        className="chart-reading-hit-core"
        cx={cx}
        cy={cy}
        r={isSelected ? 4.5 : 2.5}
        fill={isSelected ? strokeColor : "transparent"}
        stroke={isSelected ? "#ffffff" : "transparent"}
        strokeWidth={isSelected ? 1.75 : 0}
      />
    </g>
  );
}

function getGlucoseLineColor(value) {
  if (value < 3.9) return GLUCOSE_LINE_COLORS.red;
  if (value < 5.5) return GLUCOSE_LINE_COLORS.amber;
  if (value <= 9) return GLUCOSE_LINE_COLORS.green;
  if (value <= 11.1) return GLUCOSE_LINE_COLORS.amber;
  return GLUCOSE_LINE_COLORS.red;
}

function getGlucoseSelectionTone(value) {
  if (!Number.isFinite(Number(value))) return "tone-grey";
  if (value < 3.9) return "tone-red";
  if (value < 5.5) return "tone-amber";
  if (value <= 9) return "tone-green";
  if (value <= 11.1) return "tone-amber";
  return "tone-red";
}

function getStatus(reading) {
  const value = Number(reading);

  if (!Number.isFinite(value)) {
    return { label: "Unknown", className: "status-neutral" };
  }

  if (value < 3.9) return { label: "Very low", className: "status-very-low" };
  if (value < 5.6) return { label: "Low", className: "status-low" };
  if (value < 8.4) return { label: "In range", className: "status-good" };
  if (value < 11.2) return { label: "High", className: "status-high" };

  return { label: "Very high", className: "status-very-high" };
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  async function handleSubmit(event) {
    event.preventDefault();

    setIsSigningIn(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
    }

    setIsSigningIn(false);
  }

  return (
    <main className="app-shell login-shell">
      <section className="login-card">
        <p className="eyebrow">Glucose Logger</p>
        <h1>Sign in</h1>
        <p className="hero-copy">
          Sign in to view your private glucose dashboard.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

          <button
            type="submit"
            className="refresh-button"
            disabled={isSigningIn}
          >
            {isSigningIn ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function EventModal({
  eventType,
  userId,
  existingEvent = null,
  onClose,
  onSaved,
}) {
  const config = EVENT_CONFIG[eventType];
  const isEditing = Boolean(existingEvent);
  const [amount, setAmount] = useState(
    existingEvent?.amount !== null && existingEvent?.amount !== undefined
      ? String(existingEvent.amount)
      : "",
  );
  const [notes, setNotes] = useState(existingEvent?.notes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isNote = eventType === "note";

  async function handleSubmit(event) {
    event.preventDefault();

    setIsSaving(true);
    setErrorMessage("");

    const parsedAmount = isNote ? null : numberOrNull(amount);
    const trimmedNotes = notes.trim() || null;

    if (!isNote && parsedAmount === null) {
      setErrorMessage("Enter a value before saving.");
      setIsSaving(false);
      return;
    }

    if (isNote && !trimmedNotes) {
      setErrorMessage("Enter a note before saving.");
      setIsSaving(false);
      return;
    }

    const eventPayload = {
      event_type: eventType,
      amount: parsedAmount,
      unit: config.unit || null,
      notes: trimmedNotes,
    };

    const { error } = existingEvent
      ? await supabase
          .from("treatment_events")
          .update(eventPayload)
          .eq("id", existingEvent.id)
          .eq("user_id", userId)
      : await supabase.from("treatment_events").insert({
          ...eventPayload,
          user_id: userId,
          logged_at: new Date().toISOString(),
        });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    await onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <section className="event-modal">
        <button type="button" className="modal-close" onClick={onClose}>
          ×
        </button>

        <p className="eyebrow">{isEditing ? "Edit event" : "Record event"}</p>
        <h2>{config.label}</h2>

        <form className="event-form" onSubmit={handleSubmit}>
          {!isNote ? (
            <label>
              {config.amountLabel}
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder={config.placeholder}
                  autoFocus
                />
                <span>{config.unit}</span>
              </div>
            </label>
          ) : null}

          <label>
            Notes
            <textarea
              rows="3"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={
                isNote
                  ? "What happened?"
                  : "Optional, e.g. breakfast, correction, bedtime"
              }
              autoFocus={isNote}
            />
          </label>

          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

          <button type="submit" className="refresh-button" disabled={isSaving}>
            {isSaving ? "Saving..." : isEditing ? "Save changes" : "Save event"}
          </button>
        </form>
      </section>
    </div>
  );
}

function RecordEventPanel({ userId, onSaved }) {
  const [activeEventType, setActiveEventType] = useState(null);

  return (
    <section className="table-card record-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Record event</p>
          <h2>Quick entry</h2>
        </div>
      </div>

      <div className="event-button-grid">
        {Object.entries(EVENT_CONFIG).map(([eventType, config]) => (
          <button
            key={eventType}
            type="button"
            className={`event-button ${config.className}`}
            onClick={() => setActiveEventType(eventType)}
          >
            <span>{config.buttonLabel}</span>
            <small>
              {eventType === "carbs"
                ? "Food / drink"
                : eventType === "fast_insulin"
                  ? "Meal or correction"
                  : eventType === "background_insulin"
                    ? "Basal / background"
                    : "Anything useful"}
            </small>
          </button>
        ))}
      </div>

      {activeEventType ? (
        <EventModal
          eventType={activeEventType}
          userId={userId}
          onClose={() => setActiveEventType(null)}
          onSaved={onSaved}
        />
      ) : null}
    </section>
  );
}

function TodayEventsList({
  events,
  isLoading,
  onEdit,
  onDelete,
  deletingEventId,
}) {
  const today = new Date().toDateString();
  const todaysEvents = events.filter((event) => {
    return new Date(event.logged_at).toDateString() === today;
  });

  return (
    <section className="table-card recorded-events-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Recorded events</p>
        </div>
      </div>

      {isLoading ? (
        <p>Loading events...</p>
      ) : todaysEvents.length === 0 ? (
        <p>No manual events today.</p>
      ) : (
        <div className="log-list">
          {todaysEvents.map((event) => {
            const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.note;
            const isDeleting = deletingEventId === event.id;

            return (
              <article
                key={event.id}
                className={`log-item ${config.className}`}
              >
                <div className="log-datetime">
                  <strong>{formatDateOnly(event.logged_at)}</strong>
                  <span>{formatTime(event.logged_at)}</span>
                </div>

                <div className="log-event-main">
                  <span className="log-event-dot" aria-hidden="true" />
                  <strong
                    className="log-event-title"
                    title={event.notes || "No notes recorded"}
                  >
                    {config.label}
                  </strong>
                  {event.amount !== null ? (
                    <span className="log-amount">
                      {event.amount}
                      {event.unit ? event.unit : ""}
                    </span>
                  ) : null}
                  {event.notes ? (
                    <span className="log-notes-wrap">
                      <button
                        type="button"
                        className="log-notes-pill"
                        aria-label={`Notes for ${config.label}`}
                      >
                        Notes
                      </button>
                      <span className="log-notes-tooltip" role="tooltip">
                        {event.notes}
                      </span>
                    </span>
                  ) : null}
                </div>

                <div className="log-actions">
                  <button
                    type="button"
                    className="small-action-button"
                    onClick={() => onEdit?.(event)}
                    disabled={isDeleting}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="small-action-button danger-action-button"
                    onClick={() => onDelete?.(event)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MobileChartEventsList({ events, isLoading }) {
  return (
    <section className="table-card recorded-events-card mobile-chart-events-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Recorded events</p>
        </div>
      </div>

      {isLoading ? (
        <p>Loading events...</p>
      ) : events.length === 0 ? (
        <p>No manual events in this period.</p>
      ) : (
        <div className="log-list mobile-chart-log-list">
          {events.map((event) => {
            const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.note;
            const eventAmount = formatEventAmount(event);

            return (
              <article
                key={event.id}
                className={`log-item mobile-chart-log-item ${config.className}`}
              >
                <div className="log-datetime">
                  <strong>{formatTime(event.logged_at)}</strong>
                </div>

                <div className="log-event-main">
                  <span className="log-event-dot" aria-hidden="true" />
                  <strong className="log-event-title">{config.label}</strong>
                  {eventAmount ? (
                    <span className="log-amount">{eventAmount}</span>
                  ) : null}
                  {event.notes ? (
                    <span className="mobile-chart-event-note">{event.notes}</span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getEventLineColor(eventType) {
  if (eventType === "carbs") return "#2563eb";
  if (eventType === "fast_insulin") return "#dc2626";
  if (eventType === "background_insulin") return "#16a34a";
  return "#64748b";
}

function formatEventAmount(event) {
  if (event?.amount === null || event?.amount === undefined) return "";
  return `${event.amount}${event.unit || ""}`;
}

function getEventTimeOffsetMs(eventType) {
  if (eventType === "carbs") return -10 * 60 * 1000;
  if (eventType === "fast_insulin") return -3 * 60 * 1000;
  if (eventType === "background_insulin") return 4 * 60 * 1000;
  return 11 * 60 * 1000;
}

function InsightsPanel({
  readings,
  events,
  isLoadingReadings,
  isLoadingEvents,
}) {
  const isLoading = isLoadingReadings || isLoadingEvents;
  const readingValues = readings
    .map((reading) => Number(reading.glucose_value))
    .filter((value) => Number.isFinite(value));
  const averageGlucose = readingValues.length
    ? readingValues.reduce((sum, value) => sum + value, 0) /
      readingValues.length
    : null;
  const highestReading = readingValues.length
    ? Math.max(...readingValues)
    : null;
  const lowestReading = readingValues.length
    ? Math.min(...readingValues)
    : null;

  const morningReadings = readings.filter((reading) => {
    const hour = new Date(reading.reading_time).getHours();
    return hour >= 5 && hour < 12;
  });
  const afternoonEveningReadings = readings.filter((reading) => {
    const hour = new Date(reading.reading_time).getHours();
    return hour >= 12 && hour < 23;
  });

  const getAverageForReadings = (segmentReadings) => {
    if (segmentReadings.length === 0) return null;

    const total = segmentReadings.reduce(
      (sum, reading) => sum + Number(reading.glucose_value),
      0,
    );

    return total / segmentReadings.length;
  };

  const morningAverage = getAverageForReadings(morningReadings);
  const afternoonEveningAverage = getAverageForReadings(
    afternoonEveningReadings,
  );
  const highReadings = readings.filter(
    (reading) => Number(reading.glucose_value) > 9,
  );
  const carbEvents = events.filter((event) => event.event_type === "carbs");
  const carbEventsWithHigherFollowUp = carbEvents.filter((event) => {
    const eventTime = new Date(event.logged_at).getTime();

    return readings.some((reading) => {
      const readingTime = new Date(reading.reading_time).getTime();
      const minutesAfterEvent = readingTime - eventTime;

      return (
        minutesAfterEvent >= 0 &&
        minutesAfterEvent <= 2 * 60 * 60 * 1000 &&
        Number(reading.glucose_value) > 9
      );
    });
  });

  const prompts = [];

  if (
    morningAverage !== null &&
    afternoonEveningAverage !== null &&
    morningReadings.length >= 2 &&
    afternoonEveningReadings.length >= 2 &&
    morningAverage > afternoonEveningAverage + 0.8
  ) {
    prompts.push(
      "Morning readings appear a little higher than afternoon or evening readings today, which may be worth reviewing.",
    );
  }

  if (highReadings.length >= 3) {
    prompts.push(
      `${highReadings.length} readings were above range today, which could be useful to compare with timing, meals, or activity as a discussion prompt.`,
    );
  }

  if (carbEventsWithHigherFollowUp.length >= 2) {
    prompts.push(
      "Some readings after carb events appeared higher today, so carb timing or meal notes may be worth reviewing.",
    );
  }

  if (events.length <= 1) {
    prompts.push(
      "There are only a few manual events recorded today, so adding more notes could make patterns easier to spot.",
    );
  }

  if (prompts.length === 0 && !isLoading) {
    prompts.push(
      "No clear review prompts stand out from today’s entries yet; more readings or notes could be useful to compare later.",
    );
  }

  return (
    <>
      <section className="table-card insights-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Insights</p>
            <h2>Today at a glance</h2>
          </div>
        </div>

        <p>
          These insights are for personal logging and pattern spotting only.
          They highlight observations from today’s entries and discussion
          prompts to review later.
        </p>

        <section className="insights-summary-grid" aria-label="Today summary">
          <article className="stat-card insights-stat-card">
            <span className="card-label">Average glucose</span>
            <strong>
              {isLoading
                ? "Loading..."
                : averageGlucose === null
                  ? "—"
                  : averageGlucose.toFixed(1)}
            </strong>
            <p>From today’s glucose readings</p>
          </article>

          <article className="stat-card insights-stat-card">
            <span className="card-label">Highest reading</span>
            <strong>
              {isLoading ? "Loading..." : (highestReading ?? "—")}
            </strong>
            <p>Highest reading logged today</p>
          </article>

          <article className="stat-card insights-stat-card">
            <span className="card-label">Lowest reading</span>
            <strong>{isLoading ? "Loading..." : (lowestReading ?? "—")}</strong>
            <p>Lowest reading logged today</p>
          </article>

          <article className="stat-card insights-stat-card">
            <span className="card-label">Number of readings</span>
            <strong>
              {isLoadingReadings ? "Loading..." : readings.length}
            </strong>
            <p>Glucose readings recorded today</p>
          </article>

          <article className="stat-card insights-stat-card">
            <span className="card-label">Manual events</span>
            <strong>{isLoadingEvents ? "Loading..." : events.length}</strong>
            <p>Entries from carbs, insulin, or notes today</p>
          </article>
        </section>
      </section>

      <section className="table-card insights-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Patterns to review</p>
            <h2>Discussion prompts</h2>
          </div>
        </div>

        <div className="insights-grid">
          {isLoading ? (
            <article>
              <strong>Loading today’s patterns</strong>
              <p>Today’s readings and events are still loading.</p>
            </article>
          ) : (
            prompts.map((prompt) => (
              <article key={prompt}>
                <strong>Review prompt</strong>
                <p>{prompt}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}

function InsightsPanelStage1B({
  readings,
  events,
  isLoadingReadings,
  isLoadingEvents,
}) {
  const isLoading = isLoadingReadings || isLoadingEvents;
  const readingValues = readings
    .map((reading) => Number(reading.glucose_value))
    .filter((value) => Number.isFinite(value));
  const averageGlucose = readingValues.length
    ? readingValues.reduce((sum, value) => sum + value, 0) /
      readingValues.length
    : null;
  const highestReading = readingValues.length
    ? Math.max(...readingValues)
    : null;
  const lowestReading = readingValues.length
    ? Math.min(...readingValues)
    : null;

  const morningReadings = readings.filter((reading) => {
    const hour = new Date(reading.reading_time).getHours();
    return hour >= 5 && hour < 12;
  });
  const afternoonEveningReadings = readings.filter((reading) => {
    const hour = new Date(reading.reading_time).getHours();
    return hour >= 12 && hour < 23;
  });

  const getAverageForReadings = (segmentReadings) => {
    if (segmentReadings.length === 0) return null;

    const total = segmentReadings.reduce(
      (sum, reading) => sum + Number(reading.glucose_value),
      0,
    );

    return total / segmentReadings.length;
  };

  const morningAverage = getAverageForReadings(morningReadings);
  const afternoonEveningAverage = getAverageForReadings(
    afternoonEveningReadings,
  );
  const aboveRangeReadings = readings.filter(
    (reading) => Number(reading.glucose_value) > 11.1,
  );
  const belowRangeReadings = readings.filter(
    (reading) => Number(reading.glucose_value) < 3.9,
  );
  const carbEvents = events.filter((event) => event.event_type === "carbs");
  const insulinEvents = events.filter((event) => {
    return (
      event.event_type === "fast_insulin" ||
      event.event_type === "background_insulin"
    );
  });
  const noteEvents = events.filter((event) => event.event_type === "note");
  const hasEnoughMorningComparisonData =
    morningReadings.length >= 2 && afternoonEveningReadings.length >= 2;

  const patternCards = [
    {
      title: "Morning vs later readings",
      body: hasEnoughMorningComparisonData
        ? morningAverage > afternoonEveningAverage + 0.8
          ? `Morning readings averaged ${morningAverage.toFixed(1)} compared with ${afternoonEveningAverage.toFixed(1)} later in the day, which may be worth reviewing.`
          : `Morning readings averaged ${morningAverage.toFixed(1)} and later readings averaged ${afternoonEveningAverage.toFixed(1)} today, which could be useful to compare over time as a discussion prompt.`
        : "Not enough data yet to compare morning readings with afternoon or evening readings.",
    },
    {
      title: "Above-range readings",
      body:
        aboveRangeReadings.length === 0
          ? "No readings above 11.1 were logged today."
          : `${aboveRangeReadings.length} readings were above 11.1 today, which may be worth reviewing alongside meals, timing, or activity as a discussion prompt.`,
    },
    {
      title: "Below-range readings",
      body:
        belowRangeReadings.length === 0
          ? "No readings below 3.9 were logged today."
          : `${belowRangeReadings.length} readings were below 3.9 today, which could be useful to compare with timing or notes as a discussion prompt.`,
    },
    {
      title: "Carb events",
      body:
        carbEvents.length === 0
          ? "No carb events are recorded today, so meal timing may be harder to compare. Not enough data yet for that pattern."
          : `${carbEvents.length} carb event${carbEvents.length === 1 ? "" : "s"} ${carbEvents.length === 1 ? "is" : "are"} recorded today, which may be worth reviewing against nearby readings.`,
    },
    {
      title: "Insulin events",
      body:
        insulinEvents.length === 0
          ? "No insulin events are recorded today, so not enough data yet to compare readings with insulin timing."
          : `${insulinEvents.length} insulin event${insulinEvents.length === 1 ? "" : "s"} ${insulinEvents.length === 1 ? "is" : "are"} recorded today, which could be useful to compare with readings later in the day.`,
    },
    {
      title: "Notes",
      body:
        noteEvents.length === 0
          ? "No notes are recorded today. Adding context like meals, activity, or how the day felt may make patterns easier to spot."
          : `${noteEvents.length} note${noteEvents.length === 1 ? "" : "s"} ${noteEvents.length === 1 ? "is" : "are"} recorded today, which may be worth reviewing alongside the readings and events.`,
    },
  ];

  return (
    <>
      <section className="table-card insights-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Insights</p>
            <h2>Today at a glance</h2>
          </div>
        </div>

        <p>
          These insights are for personal logging and pattern spotting only.
          They highlight observations from today's entries and discussion
          prompts to review later.
        </p>

        <p className="insights-safety-note">
          These are personal pattern-spotting prompts only and are not medical
          advice.
        </p>

        <section className="insights-summary-grid" aria-label="Today summary">
          <article className="stat-card insights-stat-card">
            <span className="card-label">Average glucose</span>
            <strong>
              {isLoading
                ? "Loading..."
                : averageGlucose === null
                  ? "-"
                  : averageGlucose.toFixed(1)}
            </strong>
            <p>From today's glucose readings</p>
          </article>

          <article className="stat-card insights-stat-card">
            <span className="card-label">Highest reading</span>
            <strong>
              {isLoading ? "Loading..." : (highestReading ?? "-")}
            </strong>
            <p>Highest reading logged today</p>
          </article>

          <article className="stat-card insights-stat-card">
            <span className="card-label">Lowest reading</span>
            <strong>{isLoading ? "Loading..." : (lowestReading ?? "-")}</strong>
            <p>Lowest reading logged today</p>
          </article>

          <article className="stat-card insights-stat-card">
            <span className="card-label">Number of readings</span>
            <strong>
              {isLoadingReadings ? "Loading..." : readings.length}
            </strong>
            <p>Glucose readings recorded today</p>
          </article>

          <article className="stat-card insights-stat-card">
            <span className="card-label">Manual events</span>
            <strong>{isLoadingEvents ? "Loading..." : events.length}</strong>
            <p>Entries from carbs, insulin, or notes today</p>
          </article>
        </section>
      </section>

      <section className="table-card insights-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Patterns to review</p>
            <h2>Discussion prompts</h2>
          </div>
        </div>

        <div className="insights-grid">
          {isLoading ? (
            <article>
              <strong>Loading today's patterns</strong>
              <p>Today's readings and events are still loading.</p>
            </article>
          ) : (
            patternCards.map((card) => (
              <article key={card.title}>
                <strong>{card.title}</strong>
                <p>{card.body}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}

function Dashboard({ session }) {
  const [readings, setReadings] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedChartItem, setSelectedChartItem] = useState(null);
  const [activePage, setActivePage] = useState("record");
  const [chartRange, setChartRange] = useState("today");
  const [chartDayOffset, setChartDayOffset] = useState(0);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [readingsPage, setReadingsPage] = useState(1);
  const [editingEvent, setEditingEvent] = useState(null);
  const [deletingEventId, setDeletingEventId] = useState(null);
  const [isLoadingReadings, setIsLoadingReadings] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [liveStatus, setLiveStatus] = useState("Connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const chartWrapRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);

  async function loadReadings() {
    setErrorMessage("");

    const { data, error } = await supabase
      .from("glucose_readings")
      .select("id, reading_time, glucose_value, unit, created_at")
      .order("reading_time", { ascending: false })
      .limit(10000);

    if (error) {
      setErrorMessage(error.message);
      setReadings([]);
    } else {
      setReadings(data || []);
    }

    setIsLoadingReadings(false);
  }

  async function loadEvents() {
    const startOfWindow = new Date();
    startOfWindow.setDate(startOfWindow.getDate() - 14);

    const { data, error } = await supabase
      .from("treatment_events")
      .select("id, logged_at, event_type, amount, unit, notes, created_at")
      .gte("logged_at", startOfWindow.toISOString())
      .order("logged_at", { ascending: false });

    if (!error) {
      setEvents(data || []);
    }

    setIsLoadingEvents(false);
  }

  async function loadDashboardData() {
    await Promise.all([loadReadings(), loadEvents()]);
    setLastUpdatedAt(new Date());
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function handleDeleteEvent(event) {
    const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.note;
    const confirmed = window.confirm(
      `Delete this ${config.label.toLowerCase()} event from ${formatDateTime(
        event.logged_at,
      )}?`,
    );

    if (!confirmed) return;

    setDeletingEventId(event.id);

    const { error } = await supabase
      .from("treatment_events")
      .delete()
      .eq("id", event.id)
      .eq("user_id", session.user.id);

    if (error) {
      setErrorMessage(error.message);
    } else {
      if (
        selectedChartItem?.type === "event" &&
        selectedChartItem.data.id === event.id
      ) {
        setSelectedChartItem(null);
      }
      await loadEvents();
      setLastUpdatedAt(new Date());
    }

    setDeletingEventId(null);
  }

  useEffect(() => {
    loadDashboardData();

    const fallbackRefresh = window.setInterval(() => {
      loadDashboardData();
    }, 30000);

    function updateLiveStatus(status) {
      if (status === "SUBSCRIBED") {
        setLiveStatus("Live");
        return;
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setLiveStatus("Reconnecting");
        return;
      }

      setLiveStatus("Connecting");
    }

    const glucoseChannel = supabase
      .channel("glucose-readings-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "glucose_readings",
        },
        () => {
          loadReadings();
          setLastUpdatedAt(new Date());
        },
      )
      .subscribe(updateLiveStatus);

    const eventsChannel = supabase
      .channel("treatment-events-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "treatment_events",
        },
        () => {
          loadEvents();
          setLastUpdatedAt(new Date());
        },
      )
      .subscribe(updateLiveStatus);

    return () => {
      window.clearInterval(fallbackRefresh);
      supabase.removeChannel(glucoseChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, []);

  const latestReading = readings[0] || null;
  const status = getStatus(latestReading?.glucose_value);

  const todayReadings = useMemo(() => {
    const today = new Date().toDateString();

    return readings.filter((reading) => {
      return new Date(reading.reading_time).toDateString() === today;
    });
  }, [readings]);

  const todayAverage = useMemo(() => {
    if (todayReadings.length === 0) return null;

    const total = todayReadings.reduce(
      (sum, reading) => sum + Number(reading.glucose_value),
      0,
    );

    return total / todayReadings.length;
  }, [todayReadings]);

  const todayEvents = useMemo(() => {
    const today = new Date().toDateString();

    return events.filter((event) => {
      return new Date(event.logged_at).toDateString() === today;
    });
  }, [events]);

  const selectedDayStart = useMemo(() => {
    const selectedDay = new Date();
    selectedDay.setDate(selectedDay.getDate() - chartDayOffset);
    selectedDay.setHours(0, 0, 0, 0);
    return selectedDay;
  }, [chartDayOffset]);

  const selectedDayEnd = useMemo(() => {
    const end = new Date(selectedDayStart);
    end.setDate(end.getDate() + 1);
    return end;
  }, [selectedDayStart]);

  const selectedDayReadings = useMemo(() => {
    return [...readings]
      .filter((reading) => {
        const readingTime = new Date(reading.reading_time).getTime();
        return (
          readingTime >= selectedDayStart.getTime() &&
          readingTime < selectedDayEnd.getTime()
        );
      })
      .sort((a, b) => new Date(a.reading_time) - new Date(b.reading_time));
  }, [readings, selectedDayStart, selectedDayEnd]);

  const chartWindow = useMemo(() => {
    const isToday = chartDayOffset === 0;
    const durationMs =
      chartRange === "last_hour" ? 60 * 60 * 1000 : 4 * 60 * 60 * 1000;

    if (chartRange === "last_hour" || chartRange === "last_4h") {
      if (isToday) {
        const end = new Date();
        const start = new Date(end.getTime() - durationMs);

        return {
          startMs: start.getTime(),
          endMs: end.getTime(),
          displayStartMs: start.getTime(),
          displayEndMs: end.getTime(),
        };
      }

      const latestSelectedDayReading =
        selectedDayReadings[selectedDayReadings.length - 1] || null;
      const fallbackEnd = new Date(selectedDayEnd.getTime() - 1);
      const end = latestSelectedDayReading
        ? new Date(latestSelectedDayReading.reading_time)
        : fallbackEnd;
      const start = new Date(end.getTime() - durationMs);

      return {
        startMs: start.getTime(),
        endMs: end.getTime(),
        displayStartMs: start.getTime(),
        displayEndMs: end.getTime(),
      };
    }

    return {
      startMs: selectedDayStart.getTime(),
      endMs: selectedDayEnd.getTime(),
      displayStartMs: selectedDayStart.getTime(),
      displayEndMs: selectedDayEnd.getTime(),
    };
  }, [chartRange, chartDayOffset, selectedDayEnd, selectedDayReadings, selectedDayStart]);

  const chartReadings = useMemo(() => {
    return readings.filter((reading) => {
      const readingTime = new Date(reading.reading_time).getTime();
      return (
        readingTime >= chartWindow.startMs && readingTime <= chartWindow.endMs
      );
    });
  }, [readings, chartWindow]);

  const chartData = useMemo(() => {
    return [...chartReadings]
      .sort((a, b) => new Date(a.reading_time) - new Date(b.reading_time))
      .map((reading) => {
        const readingDate = new Date(reading.reading_time);

        return {
          id: reading.id,
          x: readingDate.getTime(),
          fullTime: formatDateTime(reading.reading_time),
          glucose: Number(reading.glucose_value),
          unit: reading.unit || "mmol/l",
        };
      });
  }, [chartReadings]);

  const chartTicks = useMemo(() => {
    if (chartRange === "today") {
      const sixHours = 6 * 60 * 60 * 1000;
      return [0, 1, 2, 3, 4].map(
        (step) => chartWindow.startMs + step * sixHours,
      );
    }

    if (chartRange === "last_4h") {
      const oneHour = 60 * 60 * 1000;
      return [4, 3, 2, 1, 0].map(
        (hoursAgo) => chartWindow.endMs - hoursAgo * oneHour,
      );
    }

    const fifteenMinutes = 15 * 60 * 1000;
    return [4, 3, 2, 1, 0].map(
      (stepsAgo) => chartWindow.endMs - stepsAgo * fifteenMinutes,
    );
  }, [chartRange, chartWindow]);

  const formatChartTick = (value) => {
    if (chartRange === "today" && Math.abs(value - chartWindow.endMs) < 1000) {
      return "24:00";
    }

    return formatTime(value);
  };

  const glucoseLineSegments = useMemo(() => {
    if (chartData.length === 0) {
      return { solidSegments: [], gapSegments: [], coloredSegments: [] };
    }

    const solidSegments = [];
    const gapSegments = [];
    let currentSegment = [chartData[0]];

    for (let index = 1; index < chartData.length; index += 1) {
      const previousPoint = chartData[index - 1];
      const point = chartData[index];
      const gapMs = point.x - previousPoint.x;

      if (gapMs > GLUCOSE_GAP_MS) {
        solidSegments.push(currentSegment);
        gapSegments.push([previousPoint, point]);
        currentSegment = [point];
      } else {
        currentSegment.push(point);
      }
    }

    if (currentSegment.length > 0) {
      solidSegments.push(currentSegment);
    }

    const coloredSegments = [];

    solidSegments.forEach((segment, segmentIndex) => {
      if (segment.length === 0) return;

      let currentColoredSegment = {
        id: `glucose-colored-${segmentIndex}-0`,
        color: getGlucoseLineColor(segment[0].glucose),
        data: [segment[0]],
      };

      let colorSegmentIndex = 0;

      for (let index = 1; index < segment.length; index += 1) {
        const point = segment[index];
        const pointColor = getGlucoseLineColor(point.glucose);

        if (pointColor !== currentColoredSegment.color) {
          coloredSegments.push(currentColoredSegment);
          colorSegmentIndex += 1;
          currentColoredSegment = {
            id: `glucose-colored-${segmentIndex}-${colorSegmentIndex}`,
            color: pointColor,
            data: [segment[index - 1], point],
          };
        } else {
          currentColoredSegment.data.push(point);
        }
      }

      coloredSegments.push(currentColoredSegment);
    });

    return { solidSegments, gapSegments, coloredSegments };
  }, [chartData]);

  const eventChartPoints = useMemo(() => {
    const chartEvents = events
      .filter((event) => {
        const eventTime = new Date(event.logged_at).getTime();
        return (
          eventTime >= chartWindow.startMs && eventTime <= chartWindow.endMs
        );
      })
      .sort((a, b) => {
        const timeDiff = new Date(a.logged_at) - new Date(b.logged_at);
        if (timeDiff !== 0) return timeDiff;

        const orderA = EVENT_TYPE_ORDER[a.event_type] ?? 99;
        const orderB = EVENT_TYPE_ORDER[b.event_type] ?? 99;
        if (orderA !== orderB) return orderA - orderB;

        return (
          new Date(a.created_at || a.logged_at) -
          new Date(b.created_at || b.logged_at)
        );
      });

    const groupCounts = new Map();
    const groupIndexes = new Map();

    chartEvents.forEach((event) => {
      const eventTime = new Date(event.logged_at).getTime();
      const groupKey = Math.floor(eventTime / (12 * 60 * 1000));
      groupCounts.set(groupKey, (groupCounts.get(groupKey) || 0) + 1);
    });

    return chartEvents.map((event) => {
      const eventTime = new Date(event.logged_at).getTime();
      const groupKey = Math.floor(eventTime / (12 * 60 * 1000));
      const groupCount = groupCounts.get(groupKey) || 1;
      const groupIndex = groupIndexes.get(groupKey) || 0;
      groupIndexes.set(groupKey, groupIndex + 1);

      const displayOffset =
        groupCount > 1
          ? (groupIndex - (groupCount - 1) / 2) * 18 * 60 * 1000
          : getEventTimeOffsetMs(event.event_type);

      const displayTime = Math.min(
        chartWindow.displayEndMs,
        Math.max(chartWindow.displayStartMs, eventTime + displayOffset),
      );

      return {
        x: displayTime,
        eventDotY: Math.max(17.55, 18.35 - groupIndex * 0.26),
        event,
      };
    });
  }, [events, chartWindow]);

  const chartPeriodEvents = useMemo(() => {
    return [...events]
      .filter((event) => {
        const eventTime = new Date(event.logged_at).getTime();
        return (
          eventTime >= chartWindow.startMs &&
          eventTime <= chartWindow.endMs
        );
      })
      .sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));
  }, [events, chartWindow]);

  const periodReadings = useMemo(() => {
    return [...chartReadings].sort((a, b) => {
      return new Date(b.reading_time) - new Date(a.reading_time);
    });
  }, [chartReadings]);

  const readingsTotalPages = Math.max(
    1,
    Math.ceil(periodReadings.length / READINGS_PER_PAGE),
  );

  const paginatedPeriodReadings = useMemo(() => {
    const safePage = Math.min(readingsPage, readingsTotalPages);
    const startIndex = (safePage - 1) * READINGS_PER_PAGE;
    return periodReadings.slice(startIndex, startIndex + READINGS_PER_PAGE);
  }, [periodReadings, readingsPage, readingsTotalPages]);

  useEffect(() => {
    setReadingsPage(1);
  }, [chartRange, chartDayOffset]);

  useEffect(() => {
    if (chartRange === "today") {
      setSelectedChartItem(null);
    }
  }, [chartRange, chartDayOffset]);

  useEffect(() => {
    if (readingsPage > readingsTotalPages) {
      setReadingsPage(readingsTotalPages);
    }
  }, [readingsPage, readingsTotalPages]);

  useEffect(() => {
    if (activePage !== "chart" || !chartWrapRef.current) return;

    const chartNode = chartWrapRef.current;
    const updateChartWidth = () => {
      const nextWidth = Math.max(
        0,
        Math.floor(chartNode.getBoundingClientRect().width),
      );
      setChartWidth(nextWidth);
    };

    updateChartWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateChartWidth);
      return () => window.removeEventListener("resize", updateChartWidth);
    }

    const resizeObserver = new ResizeObserver(() => {
      updateChartWidth();
    });

    resizeObserver.observe(chartNode);
    return () => resizeObserver.disconnect();
  }, [activePage, chartRange, chartDayOffset]);

  const selectedReadingId =
    selectedChartItem?.type === "reading" ? selectedChartItem.data.id : null;
  const selectedEventId =
    selectedChartItem?.type === "event" ? selectedChartItem.data.id : null;
  const selectedChartEvent =
    selectedChartItem?.type === "event" ? selectedChartItem.data : null;
  const selectedChartReading =
    selectedChartItem?.type === "reading" ? selectedChartItem.data : null;
  const selectedChartEventConfig = selectedChartEvent
    ? EVENT_CONFIG[selectedChartEvent.event_type] || EVENT_CONFIG.note
    : null;
  const selectedChartEventAmount = selectedChartEvent
    ? formatEventAmount(selectedChartEvent) || "Note"
    : "";
  const selectedChartReadingTone = selectedChartReading
    ? getGlucoseSelectionTone(selectedChartReading.glucose)
    : "tone-grey";

  const chartDayLabel =
    chartDayOffset === 0
      ? "Today"
      : formatDateOnly(selectedDayStart);

  return (
    <main className="app-shell">
      <section className="hero-card app-header-card">
        <div className="app-header-title">
          <h1>Glucose Logger</h1>
        </div>

        <div className="app-header-actions">
          <span
            className={`live-status-pill ${
              liveStatus === "Live" ? "is-live" : "is-waiting"
            }`}
          >
            {liveStatus}
          </span>

          <div className="account-menu">
            <button
              type="button"
              className="account-button"
              aria-label="Account"
              aria-expanded={isAccountOpen}
              onClick={() => setIsAccountOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4Zm0 2c-3.3 0-7 1.7-7 4v1c0 .6.4 1 1 1h12c.6 0 1-.4 1-1v-1c0-2.3-3.7-4-7-4Z" />
              </svg>
              <span>Account</span>
            </button>

            {isAccountOpen ? (
              <div className="account-popover">
                <p>
                  <strong>Last checked</strong>
                  <span>
                    {lastUpdatedAt ? formatTime(lastUpdatedAt) : "Waiting"}
                  </span>
                </p>
                <p>
                  <strong>Signed in as</strong>
                  <span>{session.user.email}</span>
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <nav className="app-tabs" aria-label="App pages">
        <button
          type="button"
          className={activePage === "record" ? "active" : ""}
          onClick={() => setActivePage("record")}
        >
          Record event
        </button>
        <button
          type="button"
          className={activePage === "chart" ? "active" : ""}
          onClick={() => setActivePage("chart")}
        >
          Chart
        </button>
        <button
          type="button"
          className={activePage === "insights" ? "active" : ""}
          onClick={() => setActivePage("insights")}
        >
          Insights
        </button>
      </nav>

      {errorMessage ? (
        <section className="error-card">
          <strong>Could not load readings</strong>
          <p>{errorMessage}</p>
        </section>
      ) : null}

      {activePage === "record" ? (
        <div className="record-page-sections">
          <RecordEventPanel userId={session.user.id} onSaved={loadEvents} />
          <TodayEventsList
            events={events}
            isLoading={isLoadingEvents}
            onEdit={setEditingEvent}
            onDelete={handleDeleteEvent}
            deletingEventId={deletingEventId}
          />
        </div>
      ) : null}

      {activePage === "chart" ? (
        <>
          <section className="summary-grid">
            <article
              className={`latest-card latest-reading-simple ${status.className}`}
            >
              <span className="card-label">Latest reading</span>

              {isLoadingReadings ? (
                <strong className="latest-value">Loading...</strong>
              ) : latestReading ? (
                <>
                  <strong className="latest-reading-number">
                    {latestReading.glucose_value}
                    <span>{latestReading.unit}</span>
                  </strong>
                  <p className={`latest-status-text ${status.className}`}>
                    {status.label}
                  </p>
                </>
              ) : (
                <strong className="latest-reading-number">No data</strong>
              )}
            </article>

            <article className="stat-card">
              <span className="card-label">Today’s readings</span>
              <strong>{todayReadings.length}</strong>
              <p>Readings received today</p>
            </article>

            <article className="stat-card">
              <span className="card-label">Today’s average</span>
              <strong>
                {todayAverage === null ? "—" : todayAverage.toFixed(1)}
              </strong>
              <p>Based on today’s readings</p>
            </article>
          </section>

          <section className="chart-card">
            <div className="chart-layout">
              <div className="chart-heading-area">
                <h2 className="chart-title">GLUCOSE CHART</h2>

                {chartRange === "today" ? (
                  <div className="day-nav" aria-label="Chart day navigation">
                    <button
                      type="button"
                      aria-label="Previous day"
                      onClick={() => setChartDayOffset((offset) => offset + 1)}
                    >
                      ‹
                    </button>
                    <span>{chartDayLabel}</span>
                    <button
                      type="button"
                      aria-label="Next day"
                      onClick={() =>
                        setChartDayOffset((offset) => Math.max(0, offset - 1))
                      }
                      disabled={chartDayOffset === 0}
                    >
                      ›
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="chart-range-controls" aria-label="Chart range">
                <button
                  type="button"
                  className={chartRange === "last_hour" ? "active" : ""}
                  onClick={() => {
                    setChartRange("last_hour");
                  }}
                >
                  Last hour
                </button>
                <button
                  type="button"
                  className={chartRange === "last_4h" ? "active" : ""}
                  onClick={() => {
                    setChartRange("last_4h");
                  }}
                >
                  Last 4hrs
                </button>
                <button
                  type="button"
                  className={chartRange === "today" ? "active" : ""}
                  onClick={() => setChartRange("today")}
                >
                  Today
                </button>
              </div>

              <div className="chart-legend" aria-label="Chart legend">
                <span className="legend-carbs">Carbs</span>
                <span className="legend-fast">Fast acting</span>
                <span className="legend-background">Background</span>
              </div>

              {chartData.length === 0 ? (
                <p className="chart-empty">No chart data yet.</p>
              ) : (
                <div className="chart-wrap" ref={chartWrapRef}>
                  {chartWidth > 0 ? (
                    <ComposedChart
                      width={chartWidth}
                      height={chartWidth <= 430 ? 300 : 390}
                      data={chartData}
                      margin={
                        chartWidth <= 430
                          ? { top: 12, right: 0, left: 6, bottom: 12 }
                          : { top: 18, right: 0, left: 0, bottom: 34 }
                      }
                    >
                      <CartesianGrid vertical={false} strokeDasharray="2 4" />
                      <XAxis
                        dataKey="x"
                        type="number"
                        scale="time"
                        domain={[
                          chartWindow.displayStartMs,
                          chartWindow.displayEndMs,
                        ]}
                        ticks={chartTicks}
                        padding={{ left: 0, right: 0 }}
                        height={48}
                        interval={0}
                        minTickGap={0}
                        tickMargin={8}
                        tick={(props) => (
                          <GlucoseXAxisTick
                            {...props}
                            startMs={chartWindow.displayStartMs}
                            endMs={chartWindow.displayEndMs}
                            tickFormatter={formatChartTick}
                          />
                        )}
                        allowDataOverflow={false}
                      />
                      <YAxis
                        yAxisId="glucose"
                        type="number"
                        domain={[1, 19]}
                        ticks={GLUCOSE_GRID_TICKS}
                        width={chartWidth <= 430 ? 18 : 28}
                        interval={0}
                        axisLine={false}
                        tickLine={false}
                        tick={<GlucoseYAxisTick />}
                        tickMargin={6}
                        allowDataOverflow
                      />
                      <ReferenceLine
                        yAxisId="glucose"
                        y={5.5}
                        stroke="#111827"
                        strokeWidth={1.5}
                        strokeOpacity={0.3}
                      />
                      <ReferenceLine
                        yAxisId="glucose"
                        y={9}
                        stroke="#111827"
                        strokeWidth={1.5}
                        strokeOpacity={0.3}
                      />
                      <ReferenceLine
                        yAxisId="glucose"
                        y={3.9}
                        stroke="#111827"
                        strokeWidth={2.25}
                        strokeOpacity={0.45}
                      />
                      <ReferenceLine
                        yAxisId="glucose"
                        y={11.1}
                        stroke="#111827"
                        strokeWidth={2.25}
                        strokeOpacity={0.45}
                      />

                      {glucoseLineSegments.gapSegments.map((segment, index) => (
                        <Line
                          key={`glucose-gap-${index}`}
                          yAxisId="glucose"
                          name="Glucose gap"
                          type="linear"
                          data={segment}
                          dataKey="glucose"
                          stroke="#1e5f8f"
                          strokeWidth={2}
                          strokeDasharray="7 7"
                          strokeOpacity={0.35}
                          dot={false}
                          activeDot={false}
                          isAnimationActive={false}
                        />
                      ))}

                      {glucoseLineSegments.coloredSegments.map((segment) => (
                        <Line
                          key={segment.id}
                          yAxisId="glucose"
                          name="Glucose"
                          type="monotone"
                          data={segment.data}
                          dataKey="glucose"
                          stroke={segment.color}
                          strokeWidth={4}
                          dot={false}
                          activeDot={false}
                          isAnimationActive={false}
                        />
                      ))}

                      <Scatter
                        yAxisId="glucose"
                        data={chartData}
                        dataKey="glucose"
                        shape={(props) => (
                          <ClickableGlucosePoint
                            {...props}
                            onSelect={(reading) =>
                              setSelectedChartItem({
                                type: "reading",
                                data: reading,
                              })
                            }
                            selectedReadingId={selectedReadingId}
                          />
                        )}
                      />

                      <Scatter
                        yAxisId="glucose"
                        data={eventChartPoints}
                        dataKey="eventDotY"
                        shape={(props) => (
                          <ChartEventDot
                            {...props}
                            onSelect={(event) =>
                              setSelectedChartItem({
                                type: "event",
                                data: event,
                              })
                            }
                            selectedEventId={selectedEventId}
                          />
                        )}
                      />
                    </ComposedChart>
                  ) : null}
                </div>
              )}
            </div>
            {selectedChartItem ? (
              <section
                className={`selected-chart-item-panel ${
                  selectedChartEvent
                    ? `is-event ${selectedChartEventConfig.className}`
                    : `is-reading ${selectedChartReadingTone}`
                }`}
              >
                <div className="selected-chart-item-header">
                  <span className="selected-chart-item-kicker">
                    {selectedChartEvent ? "Selected event" : "Selected reading"}
                  </span>
                  <button
                    type="button"
                    className="selected-event-clear"
                    onClick={() => setSelectedChartItem(null)}
                  >
                    Close
                  </button>
                </div>
                <div className="selected-chart-item-main">
                  {selectedChartEvent ? (
                    <>
                      <div className="selected-chart-item-line">
                        <strong>
                          {formatDateTime(selectedChartEvent.logged_at)}
                        </strong>
                        <span
                          className={`selected-chart-item-pill ${
                            selectedChartEventConfig.className
                          }`}
                        >
                          {selectedChartEventConfig.label}
                        </span>
                        <span
                          className={`selected-chart-item-pill ${
                            selectedChartEventAmount === "Note"
                              ? "event-note"
                              : selectedChartEventConfig.className
                          }`}
                        >
                          {selectedChartEventAmount}
                        </span>
                        {selectedChartEvent.notes ? (
                          <span
                            className={`selected-chart-item-pill selected-chart-item-pill-note ${
                              selectedChartEventConfig.className
                            }`}
                          >
                            {selectedChartEvent.notes}
                          </span>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="selected-chart-item-line">
                        <strong>{selectedChartReading.fullTime}</strong>
                        <span className="selected-chart-item-pill tone-grey">
                          Glucose
                        </span>
                        <span
                          className={`selected-chart-item-pill ${
                            selectedChartReadingTone
                          }`}
                        >
                          {formatGlucoseValue(selectedChartReading.glucose)}{" "}
                          {selectedChartReading.unit}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </section>
            ) : null}
          </section>

          <MobileChartEventsList
            events={chartPeriodEvents}
            isLoading={isLoadingEvents}
          />

          <section className="table-card compact-readings-card">
            <div className="section-heading readings-heading">
              <div>
                <p className="eyebrow">Recent data ({periodReadings.length})</p>
              </div>

              {periodReadings.length > READINGS_PER_PAGE ? (
                <div
                  className="pagination-controls"
                  aria-label="Readings pagination"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setReadingsPage((page) => Math.max(1, page - 1))
                    }
                    disabled={readingsPage <= 1}
                  >
                    Previous
                  </button>
                  <span>
                    Page {Math.min(readingsPage, readingsTotalPages)} of{" "}
                    {readingsTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setReadingsPage((page) =>
                        Math.min(readingsTotalPages, page + 1),
                      )
                    }
                    disabled={readingsPage >= readingsTotalPages}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>

            {isLoadingReadings ? (
              <p>Loading readings...</p>
            ) : periodReadings.length === 0 ? (
              <p>No readings found in this chart range.</p>
            ) : (
              <div className="table-wrap readings-table-wrap">
                <table className="compact-readings-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Reading</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPeriodReadings.map((reading) => {
                      const rowStatus = getStatus(reading.glucose_value);

                      return (
                        <tr key={reading.id}>
                          <td>{formatDateTime(reading.reading_time)}</td>
                          <td>
                            <strong>{reading.glucose_value}</strong>{" "}
                            {reading.unit}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${rowStatus.className}`}
                            >
                              {rowStatus.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {activePage === "insights" ? (
        <InsightsPanelStage1B
          readings={todayReadings}
          events={todayEvents}
          isLoadingReadings={isLoadingReadings}
          isLoadingEvents={isLoadingEvents}
        />
      ) : null}

      {editingEvent ? (
        <EventModal
          eventType={editingEvent.event_type}
          userId={session.user.id}
          existingEvent={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={loadEvents}
        />
      ) : null}
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (isCheckingSession) {
    return (
      <main className="app-shell">
        <section className="hero-card">
          <p>Checking session...</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <Dashboard session={session} />;
}
