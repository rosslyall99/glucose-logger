import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
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

function formatDurationMinutes(durationSeconds) {
  if (!Number.isFinite(Number(durationSeconds))) return 0;
  return Math.max(0, Math.round(Number(durationSeconds) / 60));
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInputValue(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getLocalDateString(date) {
  const localDate = new Date(date);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const day = String(localDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateInput(value) {
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function startOfLocalDay(date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatShortDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getDataPeriodConfig(periodPreset, customStartDate, customEndDate) {
  const now = new Date();

  if (periodPreset === "today") {
    const start = startOfLocalDay(now);
    return {
      label: "Today",
      promptLabel: "Today",
      filenameLabel: "today",
      start,
      end: now,
      error: "",
    };
  }

  if (periodPreset === "yesterday") {
    const end = startOfLocalDay(now);
    const start = addDays(end, -1);
    return {
      label: "Yesterday",
      promptLabel: "Yesterday",
      filenameLabel: "yesterday",
      start,
      end,
      error: "",
    };
  }

  const startDate = parseLocalDateInput(customStartDate);
  const endDate = parseLocalDateInput(customEndDate);

  if (!startDate || !endDate) {
    return {
      label: "Custom range",
      promptLabel: "Custom range",
      filenameLabel: "custom-range",
      start: null,
      end: null,
      error: "Choose both a start date and an end date.",
    };
  }

  if (endDate < startDate) {
    return {
      label: "Custom range",
      promptLabel: "Custom range",
      filenameLabel: "custom-range",
      start: null,
      end: null,
      error: "End date cannot be before start date.",
    };
  }

  return {
    label: `Custom range: ${formatShortDate(startDate)} to ${formatShortDate(endDate)}`,
    promptLabel: `Custom range: ${formatShortDate(startDate)} to ${formatShortDate(endDate)}`,
    filenameLabel: `${customStartDate}-to-${customEndDate}`,
    start: startOfLocalDay(startDate),
    end: startOfLocalDay(addDays(endDate, 1)),
    error: "",
  };
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";

  const stringValue = String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function buildCsv(rows, columns) {
  const headerRow = columns.join(",");
  const dataRows = rows.map((row) =>
    columns.map((column) => escapeCsvValue(row[column])).join(","),
  );

  return [headerRow, ...dataRows].join("\r\n");
}

function downloadCsvFile(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function downloadTextFile(filename, textContent) {
  const blob = new Blob([textContent], { type: "text/plain;charset=utf-8;" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function getAiReviewSupabaseErrorMessage(error) {
  const message = error?.message || "Something went wrong with AI reviews.";

  if (message.includes("Could not find the table 'public.ai_daily_reviews'")) {
    return "AI reviews are not set up in Supabase yet. Run docs/supabase-ai-daily-reviews.sql once, then refresh the app.";
  }

  return message;
}

function dedupeAiReviewsByDate(reviews) {
  const latestByDate = new Map();

  reviews.forEach((review) => {
    const existingReview = latestByDate.get(review.review_date);
    const existingTime = new Date(
      existingReview?.updated_at || existingReview?.created_at || 0,
    ).getTime();
    const nextTime = new Date(
      review.updated_at || review.created_at || 0,
    ).getTime();

    if (!existingReview || nextTime >= existingTime) {
      latestByDate.set(review.review_date, review);
    }
  });

  return [...latestByDate.values()].sort(
    (a, b) => new Date(a.review_date) - new Date(b.review_date),
  );
}

const GLUCOSE_GRID_TICKS = Array.from({ length: 18 }, (_, index) => index + 1);
const GLUCOSE_LINE_COLORS = {
  red: "#dc2626",
  amber: "#f59e0b",
  green: "#16a34a",
};

function downsampleChartPoints(points, maxPoints = 180) {
  if (points.length <= maxPoints) return points;

  const sampled = [];
  const step = (points.length - 1) / (maxPoints - 1);

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round(index * step);
    sampled.push(points[sourceIndex]);
  }

  return sampled;
}

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

  if (value < 3.9) return { label: "Low", className: "status-low" };
  if (value < 9) return { label: "In range", className: "status-good" };
  if (value <= 11.1) return { label: "High", className: "status-high" };

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
        <img
          src="/icons/range-header-logo-600.png"
          alt="Range"
          className="login-wordmark"
        />

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

function AiReviewModal({ review, onClose }) {
  if (!review) return null;

  return (
    <div className="modal-backdrop">
      <section className="event-modal ai-review-modal">
        <button type="button" className="modal-close" onClick={onClose}>
          x
        </button>

        <p className="eyebrow">Saved AI review</p>
        <h2>Saved AI review</h2>

        <div className="ai-review-modal-content">
          <p className="ai-review-modal-meta">
            Review date: <strong>{review.review_date}</strong>
          </p>
          <p className="ai-review-modal-meta">
            Last saved:{" "}
            <strong>
              {formatDateTime(review.updated_at || review.created_at)}
            </strong>
          </p>

          <div className="ai-review-modal-block">
            <strong>Review</strong>
            <div className="saved-ai-review-markdown">
              <ReactMarkdown>{review.response_text || ""}</ReactMarkdown>
            </div>
          </div>

          {review.notes ? (
            <div className="ai-review-modal-block">
              <strong>Private notes</strong>
              <p>{review.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="event-form-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

function EventModal({
  eventType,
  userId,
  existingEvent = null,
  onClose,
  onSaved,
  onDelete,
  isDeleting = false,
}) {
  const isEditing = Boolean(existingEvent);
  const initialLoggedAt = existingEvent
    ? new Date(existingEvent.logged_at)
    : new Date();
  const [amount, setAmount] = useState(
    existingEvent?.amount !== null && existingEvent?.amount !== undefined
      ? String(existingEvent.amount)
      : "",
  );
  const [notes, setNotes] = useState(existingEvent?.notes || "");
  const [loggedDate, setLoggedDate] = useState(
    formatDateInputValue(initialLoggedAt),
  );
  const [loggedTime, setLoggedTime] = useState(
    formatTimeInputValue(initialLoggedAt),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const resolvedEventType = existingEvent?.event_type || eventType;
  const config = EVENT_CONFIG[resolvedEventType] || EVENT_CONFIG.note;
  const isNote = resolvedEventType === "note";

  useEffect(() => {
    const nextLoggedAt = existingEvent
      ? new Date(existingEvent.logged_at)
      : new Date();
    setAmount(
      existingEvent?.amount !== null && existingEvent?.amount !== undefined
        ? String(existingEvent.amount)
        : "",
    );
    setNotes(existingEvent?.notes || "");
    setLoggedDate(formatDateInputValue(nextLoggedAt));
    setLoggedTime(formatTimeInputValue(nextLoggedAt));
    setErrorMessage("");
  }, [eventType, existingEvent]);

  async function handleSubmit(event) {
    event.preventDefault();

    setIsSaving(true);
    setErrorMessage("");

    const parsedAmount = isNote ? null : numberOrNull(amount);
    const trimmedNotes = notes.trim() || null;

    if (isEditing && (!loggedDate || !loggedTime)) {
      setErrorMessage("Choose both a date and time before saving.");
      setIsSaving(false);
      return;
    }

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

    const loggedAt = isEditing
      ? new Date(`${loggedDate}T${loggedTime}:00`)
      : new Date();

    if (Number.isNaN(loggedAt.getTime())) {
      setErrorMessage("Enter a valid date and time before saving.");
      setIsSaving(false);
      return;
    }

    const eventPayload = {
      event_type: resolvedEventType,
      amount: parsedAmount,
      unit: config.unit || null,
      notes: trimmedNotes,
      ...(isEditing ? { logged_at: loggedAt.toISOString() } : {}),
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

    const savedEvent = existingEvent
      ? {
          ...existingEvent,
          ...eventPayload,
        }
      : null;

    await onSaved?.(savedEvent);
    onClose();
  }

  async function handleDeleteClick() {
    if (!existingEvent || !onDelete) return;
    await onDelete(existingEvent);
  }

  return (
    <div className="modal-backdrop">
      <section className={`event-modal ${isEditing ? "event-edit-modal" : ""}`}>
        <button type="button" className="modal-close" onClick={onClose}>
          ×
        </button>

        <p className="eyebrow">{isEditing ? config.label : "Record event"}</p>
        <h2>{isEditing ? "Edit event" : config.label}</h2>

        <form className="event-form" onSubmit={handleSubmit}>
          {!isNote ? (
            <label>
              {config.amountLabel}
              <div
                className={
                  isEditing ? "event-edit-amount-control" : "input-with-unit"
                }
              >
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

          {isEditing ? (
            <div className="event-edit-datetime-row">
              <label className="event-edit-field">
                <span>Logged date</span>
                <input
                  type="date"
                  value={loggedDate}
                  onChange={(event) => setLoggedDate(event.target.value)}
                />
              </label>

              <label className="event-edit-field">
                <span>Logged time</span>
                <input
                  type="time"
                  value={loggedTime}
                  onChange={(event) => setLoggedTime(event.target.value)}
                />
              </label>
            </div>
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

          <div className="event-form-actions">
            {isEditing ? (
              <button
                type="button"
                className="small-action-button danger-action-button"
                onClick={handleDeleteClick}
                disabled={isSaving || isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete event"}
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={isSaving || isDeleting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="refresh-button"
              disabled={isSaving || isDeleting}
            >
              {isSaving
                ? "Saving..."
                : isEditing
                  ? "Save changes"
                  : "Save event"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RecordEventPanel({ userId, onSaved }) {
  const [activeEventType, setActiveEventType] = useState(null);

  return (
    <section className="table-card record-panel">
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

function MobileChartEventsList({
  events,
  isLoading,
  onSelect,
  onEdit,
  selectedEventId,
}) {
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPressTimer = () => {
    window.clearTimeout(longPressTimerRef.current);
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  const getLongPressHandlers = (eventItem) => ({
    onPointerDown: () => {
      longPressTriggeredRef.current = false;
      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        onEdit?.(eventItem);
      }, 550);
    },
    onPointerUp: () => {
      clearLongPressTimer();
    },
    onPointerLeave: () => {
      clearLongPressTimer();
    },
    onPointerCancel: () => {
      clearLongPressTimer();
    },
    onClick: (clickEvent) => {
      if (longPressTriggeredRef.current) {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        longPressTriggeredRef.current = false;
        return;
      }

      onSelect?.(eventItem);
    },
  });

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
                role="button"
                tabIndex={0}
                aria-pressed={selectedEventId === event.id}
                onKeyDown={(eventKey) => {
                  if (eventKey.key === "Enter" || eventKey.key === " ") {
                    eventKey.preventDefault();
                    onSelect?.(event);
                  }
                }}
                {...getLongPressHandlers(event)}
              >
                <div className="mobile-event-grid">
                  <div className="mobile-event-time">
                    <strong>{formatTime(event.logged_at)}</strong>
                  </div>

                  <div className="mobile-event-type">
                    <span className="log-event-dot" aria-hidden="true" />
                    <strong className="log-event-title">{config.label}</strong>
                  </div>
                  {eventAmount ? (
                    <div className="mobile-event-amount">
                      <span className="log-amount event-value-pill">
                        {eventAmount}
                      </span>
                    </div>
                  ) : null}
                  <div className="mobile-event-notes">
                    {event.notes ? (
                      <span className="mobile-chart-event-note">
                        {event.notes}
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AutomaticEventsList({ exerciseEvents, isLoading }) {
  return (
    <section className="table-card recorded-events-card automatic-events-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Automatic events</p>
        </div>
      </div>

      {isLoading ? (
        <p>Loading automatic events...</p>
      ) : exerciseEvents.length === 0 ? (
        <p>No automatic events recorded for this period.</p>
      ) : (
        <div className="log-list">
          {exerciseEvents.map((event) => {
            const durationMinutes = formatDurationMinutes(
              event.duration_seconds,
            );
            return (
              <article key={event.id} className="log-item automatic-event-item">
                <strong>
                  Walking · {durationMinutes} min ·{" "}
                  {formatTime(event.start_time)}–{formatTime(event.end_time)}
                </strong>
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
  userId,
  readings,
  events,
  automaticEvents,
  isLoadingReadings,
  isLoadingEvents,
  isLoadingAutomaticEvents,
  onExportCombinedData,
  exportState,
  exportErrorMessage,
  dataPeriodPreset,
  onDataPeriodPresetChange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  dataPeriodLabel,
  dataPeriodStart,
  dataPeriodEnd,
  dataPeriodError,
}) {
  const dataPageIsLoading =
    isLoadingReadings || isLoadingEvents || isLoadingAutomaticEvents;
  const [copyStatus, setCopyStatus] = useState("");
  const [aiReviewText, setAiReviewText] = useState("");
  const [aiReviewNotes, setAiReviewNotes] = useState("");
  const [isSavingAiReview, setIsSavingAiReview] = useState(false);
  const [aiReviewSaveMessage, setAiReviewSaveMessage] = useState("");
  const [aiReviewError, setAiReviewError] = useState("");
  const [savedAiReviewForDate, setSavedAiReviewForDate] = useState(null);
  const [longTermReviewRange, setLongTermReviewRange] = useState("7");
  const [isLoadingSavedReviews, setIsLoadingSavedReviews] = useState(false);
  const [longTermPromptMessage, setLongTermPromptMessage] = useState("");
  const [longTermPromptError, setLongTermPromptError] = useState("");
  const [isViewingAiReview, setIsViewingAiReview] = useState(false);
  const [isDeletingAiReview, setIsDeletingAiReview] = useState(false);
  const startDateInputRef = useRef(null);
  const endDateInputRef = useRef(null);

  const openNativeDatePicker = (input) => {
    if (!input) return;

    input.focus();

    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch {
        // Ignore browsers that expose but restrict showPicker.
      }
    }
  };

  const buildDataPrompt = () => {
    const sortedReadings = [...readings].sort(
      (a, b) => new Date(a.reading_time) - new Date(b.reading_time),
    );
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.logged_at) - new Date(b.logged_at),
    );
    const sortedAutomaticEvents = [...automaticEvents].sort(
      (a, b) => new Date(a.start_time) - new Date(b.start_time),
    );
    const timeBlocks = [
      { label: "Overnight", startHour: 0, endHour: 5 },
      { label: "Morning", startHour: 5, endHour: 11 },
      { label: "Midday", startHour: 11, endHour: 14 },
      { label: "Afternoon", startHour: 14, endHour: 18 },
      { label: "Evening", startHour: 18, endHour: 22 },
      { label: "Night", startHour: 22, endHour: 24 },
    ];

    const formatPromptDate = (value) =>
      new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(value));

    const summarizeReadings = (segmentReadings) => {
      const values = segmentReadings
        .map((reading) => Number(reading.glucose_value))
        .filter((value) => Number.isFinite(value));

      if (values.length === 0) {
        return { count: 0, average: null, min: null, max: null };
      }

      const total = values.reduce((sum, value) => sum + value, 0);
      return {
        count: values.length,
        average: total / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    };

    const getTrend = (segmentReadings) => {
      if (segmentReadings.length < 2)
        return "not enough data to draw a conclusion";

      const first = Number(segmentReadings[0].glucose_value);
      const last = Number(
        segmentReadings[segmentReadings.length - 1].glucose_value,
      );

      if (!Number.isFinite(first) || !Number.isFinite(last)) {
        return "not enough data to draw a conclusion";
      }

      if (last - first >= 1) return "generally rising";
      if (last - first <= -1) return "generally falling";
      return "fairly steady overall";
    };

    const sampleReadings = (segmentReadings, intervalMinutes = 30) => {
      if (segmentReadings.length <= 1) return segmentReadings;

      const sampled = [segmentReadings[0]];
      let lastIncludedTime = new Date(
        segmentReadings[0].reading_time,
      ).getTime();

      for (let index = 1; index < segmentReadings.length - 1; index += 1) {
        const reading = segmentReadings[index];
        const readingTime = new Date(reading.reading_time).getTime();

        if (readingTime - lastIncludedTime >= intervalMinutes * 60 * 1000) {
          sampled.push(reading);
          lastIncludedTime = readingTime;
        }
      }

      const lastReading = segmentReadings[segmentReadings.length - 1];
      if (sampled[sampled.length - 1]?.id !== lastReading.id) {
        sampled.push(lastReading);
      }

      return sampled;
    };

    const overallSummary = summarizeReadings(sortedReadings);
    const dateReference =
      sortedReadings[0]?.reading_time ||
      sortedEvents[0]?.logged_at ||
      sortedAutomaticEvents[0]?.start_time ||
      new Date().toISOString();
    const highestReading =
      sortedReadings.length > 0
        ? sortedReadings.reduce((highest, reading) =>
            Number(reading.glucose_value) > Number(highest.glucose_value)
              ? reading
              : highest,
          )
        : null;
    const lowestReading =
      sortedReadings.length > 0
        ? sortedReadings.reduce((lowest, reading) =>
            Number(reading.glucose_value) < Number(lowest.glucose_value)
              ? reading
              : lowest,
          )
        : null;
    const aboveRangeCount = sortedReadings.filter(
      (reading) => Number(reading.glucose_value) > 11.1,
    ).length;
    const belowRangeCount = sortedReadings.filter(
      (reading) => Number(reading.glucose_value) < 3.9,
    ).length;

    const timeBlockLines = timeBlocks.map((block) => {
      const blockReadings = sortedReadings.filter((reading) => {
        const hour = new Date(reading.reading_time).getHours();
        return hour >= block.startHour && hour < block.endHour;
      });

      if (blockReadings.length === 0) {
        return `- ${block.label}: no readings.`;
      }

      const summary = summarizeReadings(blockReadings);
      return `- ${block.label}: ${summary.count} readings, avg ${formatGlucoseValue(summary.average)}, min/max ${formatGlucoseValue(summary.min)}/${formatGlucoseValue(summary.max)}, ${getTrend(blockReadings)}.`;
    });

    const eventLines =
      sortedEvents.length > 0
        ? sortedEvents.map((event) => {
            const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.note;
            const amount = formatEventAmount(event);
            const notes = event.notes ? ` - ${event.notes}` : "";
            return `- ${formatTime(event.logged_at)} ${config.label}${amount ? ` ${amount}` : ""}${notes}`;
          })
        : ["- None recorded."];

    const walkingSessionLines =
      sortedAutomaticEvents.length > 0
        ? sortedAutomaticEvents.map((event) => {
            const durationMinutes = formatDurationMinutes(
              event.duration_seconds,
            );
            return `- Walking ${formatTime(event.start_time)}-${formatTime(event.end_time)}, ${durationMinutes} min`;
          })
        : ["Exercise / automatic events: none recorded."];

    const totalWalkingMinutes = formatDurationMinutes(
      sortedAutomaticEvents.reduce(
        (sum, event) => sum + Number(event.duration_seconds || 0),
        0,
      ),
    );

    const sampledReadingLines =
      sortedReadings.length > 0
        ? sampleReadings(sortedReadings, 60).map(
            (reading) =>
              `- ${formatTime(reading.reading_time)} ${formatGlucoseValue(reading.glucose_value)} ${reading.unit || "mmol/l"}`,
          )
        : ["- None recorded."];

    return [
      "Personal pattern spotting only. Please keep the response concise. Do not give medical advice, diagnosis, or insulin dosing recommendations.",
      "Do not recommend insulin dose changes.",
      "Use cautious wording such as may be worth reviewing, could be useful to compare, or not enough data to draw a conclusion.",
      "",
      "Please analyse this glucose, manual event, and automatic exercise summary and return:",
      "1. Brief day summary",
      "2. Main glucose patterns",
      "3. Notable higher/lower periods",
      "4. Event timing observations where possible, including cautious exercise timing observations in relation to glucose where relevant",
      "5. Data gaps",
      "6. Cautious discussion points",
      "",
      `Period: ${dataPeriodLabel}`,
      `Date: ${formatPromptDate(dateReference)}`,
      `Readings: ${overallSummary.count}`,
      `Average: ${overallSummary.average === null ? "No data" : formatGlucoseValue(overallSummary.average)}`,
      `High/low: ${highestReading ? `${formatGlucoseValue(highestReading.glucose_value)} ${highestReading.unit || "mmol/l"} at ${formatTime(highestReading.reading_time)}` : "No data"} / ${lowestReading ? `${formatGlucoseValue(lowestReading.glucose_value)} ${lowestReading.unit || "mmol/l"} at ${formatTime(lowestReading.reading_time)}` : "No data"}`,
      `Above 11.1: ${aboveRangeCount}`,
      `Below 3.9: ${belowRangeCount}`,
      "",
      "Time blocks:",
      ...timeBlockLines,
      "",
      "Manual events:",
      ...eventLines,
      "",
      "Exercise / automatic events:",
      ...walkingSessionLines,
      ...(sortedAutomaticEvents.length > 0
        ? [
            `Total walking time: ${totalWalkingMinutes} min`,
            `Walking sessions: ${sortedAutomaticEvents.length}`,
          ]
        : []),
      "",
      "Glucose samples, about hourly:",
      ...sampledReadingLines,
    ].join("\n");
  };

  const dataPromptText = buildDataPrompt();

  const selectedReviewDate = dataPeriodStart
    ? getLocalDateString(dataPeriodStart)
    : "";

  const buildLongTermPrompt = ({
    rangeDays,
    rangeStart,
    rangeEnd,
    reviews,
  }) => {
    const formatCoveredDate = (value) =>
      new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(value);

    return [
      "Personal pattern spotting only. Do not give medical advice, diagnosis, or insulin dosing recommendations. Do not recommend insulin dose changes. Please review these saved daily glucose summaries and look only for repeated patterns, recurring time-of-day themes, possible repeated triggers, data gaps, and cautious points worth discussing.",
      "",
      `Period covered: last ${rangeDays} days (${formatCoveredDate(rangeStart)} to ${formatCoveredDate(rangeEnd)})`,
      `Saved daily reviews: ${reviews.length}`,
      "",
      "Saved daily reviews:",
      ...reviews.flatMap((review) => {
        const notesLine = review.notes
          ? [`Private notes: ${review.notes}`]
          : [];
        return [
          `Date: ${review.review_date}`,
          `Period: ${review.period_label}`,
          "Review:",
          review.response_text,
          ...notesLine,
          "",
        ];
      }),
    ].join("\n");
  };

  async function loadAiReviewsForSelectedPeriod() {
    if (!userId || !dataPeriodStart || !dataPeriodEnd || dataPeriodError) {
      setSavedAiReviewForDate(null);
      setIsLoadingSavedReviews(false);
      return;
    }

    setIsLoadingSavedReviews(true);
    setAiReviewError("");

    const { data, error } = await supabase
      .from("ai_daily_reviews")
      .select(
        "id, period_label, review_date, response_text, notes, created_at, updated_at, prompt_text",
      )
      .eq("user_id", userId)
      .eq("review_date", selectedReviewDate)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setSavedAiReviewForDate(null);
      setAiReviewError(getAiReviewSupabaseErrorMessage(error));
    } else {
      setSavedAiReviewForDate(data || null);
    }

    setIsLoadingSavedReviews(false);
  }

  async function handleSaveAiDailyReview() {
    const trimmedResponse = aiReviewText.trim();
    const trimmedNotes = aiReviewNotes.trim();

    if (!trimmedResponse) {
      setAiReviewSaveMessage("");
      setAiReviewError("Paste an AI review response before saving.");
      return;
    }

    if (!userId || !dataPeriodStart || !dataPeriodEnd || dataPeriodError) {
      setAiReviewSaveMessage("");
      setAiReviewError(
        "Choose a valid data period before saving an AI review.",
      );
      return;
    }

    setIsSavingAiReview(true);
    setAiReviewSaveMessage("");
    setAiReviewError("");

    const payload = {
      user_id: userId,
      review_date: selectedReviewDate,
      period_label: dataPeriodLabel,
      period_start: dataPeriodStart.toISOString(),
      period_end: dataPeriodEnd.toISOString(),
      prompt_text: dataPromptText || null,
      response_text: trimmedResponse,
      notes: trimmedNotes || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("ai_daily_reviews")
      .upsert(payload, { onConflict: "user_id,review_date" });

    if (error) {
      setAiReviewError(getAiReviewSupabaseErrorMessage(error));
      setIsSavingAiReview(false);
      return;
    }

    setAiReviewText("");
    setAiReviewNotes("");
    setAiReviewSaveMessage(
      "AI review saved for this date. This replaces any previous review for the same date.",
    );
    setIsSavingAiReview(false);
    await loadAiReviewsForSelectedPeriod();
  }

  async function handleDeleteAiReview() {
    if (!savedAiReviewForDate || !userId) return;

    const confirmed = window.confirm(
      `Delete the saved AI review for ${savedAiReviewForDate.review_date}?`,
    );

    if (!confirmed) return;

    setIsDeletingAiReview(true);
    setAiReviewSaveMessage("");
    setAiReviewError("");

    const { error } = await supabase
      .from("ai_daily_reviews")
      .delete()
      .eq("id", savedAiReviewForDate.id)
      .eq("user_id", userId);

    if (error) {
      setAiReviewError(getAiReviewSupabaseErrorMessage(error));
      setIsDeletingAiReview(false);
      return;
    }

    setSavedAiReviewForDate(null);
    setIsViewingAiReview(false);
    setAiReviewSaveMessage("Saved AI review deleted.");
    setIsDeletingAiReview(false);
  }

  async function handleCopyLongTermAiPrompt() {
    if (!userId) {
      setLongTermPromptMessage("");
      setLongTermPromptError(
        "You need to be signed in to load saved AI reviews.",
      );
      return;
    }

    const rangeDays = Number(longTermReviewRange);
    const rangeEnd = startOfLocalDay(addDays(new Date(), 1));
    const rangeStart = startOfLocalDay(addDays(rangeEnd, -rangeDays));
    const rangeStartDate = getLocalDateString(rangeStart);
    const rangeEndDate = getLocalDateString(addDays(rangeEnd, -1));

    setLongTermPromptMessage("");
    setLongTermPromptError("");

    const { data, error } = await supabase
      .from("ai_daily_reviews")
      .select(
        "id, review_date, period_label, response_text, notes, created_at, updated_at",
      )
      .eq("user_id", userId)
      .gte("review_date", rangeStartDate)
      .lte("review_date", rangeEndDate)
      .order("review_date", { ascending: true })
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      setLongTermPromptError(getAiReviewSupabaseErrorMessage(error));
      return;
    }

    const reviews = dedupeAiReviewsByDate(data || []);
    if (reviews.length === 0) {
      setLongTermPromptError("No saved AI reviews found for this range yet.");
      return;
    }

    const promptText = buildLongTermPrompt({
      rangeDays,
      rangeStart,
      rangeEnd: addDays(rangeEnd, -1),
      reviews,
    });

    try {
      await navigator.clipboard.writeText(promptText);
      setLongTermPromptMessage(
        `Copied longer-term prompt with ${reviews.length} saved review${reviews.length === 1 ? "" : "s"}.`,
      );
    } catch {
      setLongTermPromptError("Could not copy automatically. Please try again.");
    }
  }

  async function handleDownloadLongTermAiReviews() {
    if (!userId) {
      setLongTermPromptMessage("");
      setLongTermPromptError(
        "You need to be signed in to load saved AI reviews.",
      );
      return;
    }

    const rangeDays = Number(longTermReviewRange);
    const rangeEnd = startOfLocalDay(addDays(new Date(), 1));
    const rangeStart = startOfLocalDay(addDays(rangeEnd, -rangeDays));
    const rangeStartDate = getLocalDateString(rangeStart);
    const rangeEndDate = getLocalDateString(addDays(rangeEnd, -1));

    setLongTermPromptMessage("");
    setLongTermPromptError("");

    const { data, error } = await supabase
      .from("ai_daily_reviews")
      .select(
        "id, review_date, period_label, response_text, notes, created_at, updated_at",
      )
      .eq("user_id", userId)
      .gte("review_date", rangeStartDate)
      .lte("review_date", rangeEndDate)
      .order("review_date", { ascending: true })
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      setLongTermPromptError(getAiReviewSupabaseErrorMessage(error));
      return;
    }

    const reviews = dedupeAiReviewsByDate(data || []);
    if (reviews.length === 0) {
      setLongTermPromptError("No saved AI reviews found for this range yet.");
      return;
    }

    const promptText = buildLongTermPrompt({
      rangeDays,
      rangeStart,
      rangeEnd: addDays(rangeEnd, -1),
      reviews,
    });

    downloadTextFile(`range-ai-reviews-last-${rangeDays}-days.txt`, promptText);
    setLongTermPromptMessage(
      `Downloaded longer-term AI prompt with ${reviews.length} saved review${reviews.length === 1 ? "" : "s"}.`,
    );
  }

  useEffect(() => {
    let isCurrent = true;

    async function syncAiReviewsForSelectedPeriod() {
      if (!userId || !dataPeriodStart || !dataPeriodEnd || dataPeriodError) {
        if (!isCurrent) return;

        setSavedAiReviewForDate(null);
        setIsLoadingSavedReviews(false);
        return;
      }

      setIsLoadingSavedReviews(true);
      setAiReviewError("");

      const { data, error } = await supabase
        .from("ai_daily_reviews")
        .select(
          "id, period_label, review_date, response_text, notes, created_at, updated_at, prompt_text",
        )
        .eq("user_id", userId)
        .eq("review_date", selectedReviewDate)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!isCurrent) return;

      if (error) {
        setSavedAiReviewForDate(null);
        setAiReviewError(getAiReviewSupabaseErrorMessage(error));
      } else {
        setSavedAiReviewForDate(data || null);
      }

      setIsLoadingSavedReviews(false);
    }

    syncAiReviewsForSelectedPeriod();

    return () => {
      isCurrent = false;
    };
  }, [
    dataPeriodEnd,
    dataPeriodError,
    dataPeriodLabel,
    dataPeriodStart,
    selectedReviewDate,
    userId,
  ]);

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(dataPromptText);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <>
      <section className="table-card insights-card data-period-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Data period</p>
          </div>
        </div>

        <div className="data-period-controls" aria-label="Data period selector">
          <button
            type="button"
            className={dataPeriodPreset === "today" ? "active" : ""}
            onClick={() => onDataPeriodPresetChange("today")}
          >
            Today
          </button>
          <button
            type="button"
            className={dataPeriodPreset === "yesterday" ? "active" : ""}
            onClick={() => onDataPeriodPresetChange("yesterday")}
          >
            Yesterday
          </button>
          <button
            type="button"
            className={dataPeriodPreset === "custom" ? "active" : ""}
            onClick={() => onDataPeriodPresetChange("custom")}
          >
            Custom
          </button>
        </div>

        {dataPeriodPreset === "custom" ? (
          <div className="data-period-inputs">
            <label>
              Start date
              <div className="data-period-input-wrap">
                <input
                  ref={startDateInputRef}
                  type="date"
                  value={customStartDate}
                  onChange={(event) =>
                    onCustomStartDateChange(event.target.value)
                  }
                  onClick={(event) => openNativeDatePicker(event.currentTarget)}
                  onFocus={(event) => openNativeDatePicker(event.currentTarget)}
                />
                <button
                  type="button"
                  className="data-period-picker-button"
                  aria-label="Open start date picker"
                  onClick={() =>
                    openNativeDatePicker(startDateInputRef.current)
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm12 8H5v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8ZM6 6a1 1 0 0 0-1 1v1h14V7a1 1 0 0 0-1-1H6Z" />
                  </svg>
                </button>
              </div>
            </label>
            <label>
              End date
              <div className="data-period-input-wrap">
                <input
                  ref={endDateInputRef}
                  type="date"
                  value={customEndDate}
                  onChange={(event) =>
                    onCustomEndDateChange(event.target.value)
                  }
                  onClick={(event) => openNativeDatePicker(event.currentTarget)}
                  onFocus={(event) => openNativeDatePicker(event.currentTarget)}
                />
                <button
                  type="button"
                  className="data-period-picker-button"
                  aria-label="Open end date picker"
                  onClick={() => openNativeDatePicker(endDateInputRef.current)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm12 8H5v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8ZM6 6a1 1 0 0 0-1 1v1h14V7a1 1 0 0 0-1-1H6Z" />
                  </svg>
                </button>
              </div>
            </label>
          </div>
        ) : null}

        {dataPeriodError ? (
          <p className="form-error data-page-feedback">{dataPeriodError}</p>
        ) : null}
      </section>

      <section className="table-card insights-card export-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Export data</p>
          </div>
        </div>
        <div className="export-actions" aria-label="Export data downloads">
          <button
            type="button"
            className="refresh-button"
            onClick={onExportCombinedData}
            disabled={exportState === "combined" || Boolean(dataPeriodError)}
          >
            {exportState === "combined"
              ? "Preparing combined CSV..."
              : "Download glucose + events CSV"}
          </button>
        </div>

        {exportErrorMessage ? (
          <p className="form-error export-error-message">
            {exportErrorMessage}
          </p>
        ) : null}
      </section>

      <section className="table-card insights-card data-prompt-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AI Prompt</p>
          </div>
        </div>
        <div className="data-page-actions">
          <button
            type="button"
            className="refresh-button"
            onClick={handleCopyPrompt}
            disabled={dataPageIsLoading || Boolean(dataPeriodError)}
          >
            {dataPageIsLoading
              ? "Preparing prompt..."
              : "Copy prompt for ChatGPT"}
          </button>
        </div>

        {copyStatus === "success" ? (
          <p className="data-page-feedback">Copied to clipboard.</p>
        ) : null}

        {copyStatus === "error" ? (
          <p className="form-error data-page-feedback">
            Could not copy automatically. Please try again.
          </p>
        ) : null}
      </section>

      <section className="table-card insights-card ai-review-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AI daily review</p>
          </div>
        </div>
        <div className="ai-review-form">
          <label>
            Paste ChatGPT response
            <textarea
              rows="7"
              value={aiReviewText}
              onChange={(event) => setAiReviewText(event.target.value)}
              placeholder="Paste a cautious AI pattern review here."
            />
          </label>

          <label>
            Private notes
            <textarea
              rows="3"
              value={aiReviewNotes}
              onChange={(event) => setAiReviewNotes(event.target.value)}
              placeholder="Optional notes for yourself."
            />
          </label>
        </div>

        <div className="ai-review-actions">
          <button
            type="button"
            className="refresh-button"
            onClick={handleSaveAiDailyReview}
            disabled={isSavingAiReview || Boolean(dataPeriodError)}
          >
            {isSavingAiReview ? "Saving AI review..." : "Save AI review"}
          </button>
        </div>

        {aiReviewSaveMessage ? (
          <p className="data-page-feedback">{aiReviewSaveMessage}</p>
        ) : null}

        {aiReviewError ? (
          <p className="form-error data-page-feedback">{aiReviewError}</p>
        ) : null}

        <div className="saved-review-status">
          <h3 className="data-section-heading">Saved review</h3>

          {isLoadingSavedReviews ? (
            <p>Loading saved AI reviews...</p>
          ) : !savedAiReviewForDate ? (
            <p className="saved-review-empty">
              No saved AI review for this date yet.
            </p>
          ) : (
            <div className="saved-review-row">
              <p className="saved-review-date">
                Last saved{" "}
                {formatDateTime(
                  savedAiReviewForDate.updated_at ||
                    savedAiReviewForDate.created_at,
                )}
              </p>
              <div className="saved-review-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsViewingAiReview(true)}
                >
                  View
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleDeleteAiReview}
                  disabled={isDeletingAiReview}
                >
                  {isDeletingAiReview ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="table-card insights-card ai-review-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Longer-term AI prompt</p>
          </div>
        </div>
        <div
          className="long-term-range-controls"
          aria-label="Longer-term AI review range"
        >
          <button
            type="button"
            className={longTermReviewRange === "7" ? "active" : ""}
            onClick={() => setLongTermReviewRange("7")}
          >
            Last 7 days
          </button>
          <button
            type="button"
            className={longTermReviewRange === "14" ? "active" : ""}
            onClick={() => setLongTermReviewRange("14")}
          >
            Last 14 days
          </button>
          <button
            type="button"
            className={longTermReviewRange === "30" ? "active" : ""}
            onClick={() => setLongTermReviewRange("30")}
          >
            Last 30 days
          </button>
        </div>

        <div
          className="export-actions ai-review-export-actions"
          aria-label="Longer-term AI prompt actions"
        >
          <button
            type="button"
            className="refresh-button"
            onClick={handleCopyLongTermAiPrompt}
          >
            Copy longer-term prompt
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleDownloadLongTermAiReviews}
          >
            Download AI reviews text
          </button>
        </div>

        {longTermPromptMessage ? (
          <p className="data-page-feedback">{longTermPromptMessage}</p>
        ) : null}

        {longTermPromptError ? (
          <p className="form-error data-page-feedback">{longTermPromptError}</p>
        ) : null}
      </section>

      {isViewingAiReview && savedAiReviewForDate ? (
        <AiReviewModal
          review={savedAiReviewForDate}
          onClose={() => setIsViewingAiReview(false)}
        />
      ) : null}
    </>
  );

}

function Dashboard({ session }) {
  const [readings, setReadings] = useState([]);
  const [chartDayReadings, setChartDayReadings] = useState([]);
  const [isLoadingChartDayReadings, setIsLoadingChartDayReadings] =
    useState(false);
  const [todayStatsReadings, setTodayStatsReadings] = useState([]);
  const [isLoadingTodayStatsReadings, setIsLoadingTodayStatsReadings] =
    useState(false);
  const [dataPeriodReadings, setDataPeriodReadings] = useState([]);
  const [events, setEvents] = useState([]);
  const [chartExerciseEvents, setChartExerciseEvents] = useState([]);
  const [dataPeriodExerciseEvents, setDataPeriodExerciseEvents] = useState([]);
  const [selectedChartItem, setSelectedChartItem] = useState(null);
  const [activePage, setActivePage] = useState("record");
  const [chartRange, setChartRange] = useState("today");
  const [chartDayOffset, setChartDayOffset] = useState(0);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [readingsPage, setReadingsPage] = useState(1);
  const [editingEvent, setEditingEvent] = useState(null);
  const [deletingEventId, setDeletingEventId] = useState(null);
  const [isLoadingReadings, setIsLoadingReadings] = useState(true);
  const [isLoadingDataPeriodReadings, setIsLoadingDataPeriodReadings] =
    useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingChartExerciseEvents, setIsLoadingChartExerciseEvents] =
    useState(false);
  const [
    isLoadingDataPeriodExerciseEvents,
    setIsLoadingDataPeriodExerciseEvents,
  ] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [exportState, setExportState] = useState("");
  const [exportErrorMessage, setExportErrorMessage] = useState("");
  const [dataPeriodPreset, setDataPeriodPreset] = useState("today");
  const [customStartDate, setCustomStartDate] = useState(() =>
    formatDateInputValue(new Date()),
  );
  const [customEndDate, setCustomEndDate] = useState(() =>
    formatDateInputValue(new Date()),
  );
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

  async function fetchAllGlucoseReadings(startIso, endIso) {
    const pageSize = 1000;
    let from = 0;
    const allRows = [];

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("glucose_readings")
        .select("id, reading_time, glucose_value, unit, created_at")
        .gte("reading_time", startIso)
        .lt("reading_time", endIso)
        .order("reading_time", { ascending: true })
        .range(from, to);

      if (error) {
        throw error;
      }

      const rows = data || [];
      allRows.push(...rows);

      if (rows.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    return allRows;
  }

  async function fetchAllExerciseEvents(startIso, endIso) {
    const pageSize = 1000;
    let from = 0;
    const allRows = [];

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("exercise_events")
        .select(
          "id, start_time, end_time, duration_seconds, source, source_app, source_record_id, exercise_type, exercise_label, raw_payload, created_at",
        )
        .eq("exercise_label", "walking")
        .lt("start_time", endIso)
        .gt("end_time", startIso)
        .order("start_time", { ascending: true })
        .range(from, to);

      if (error) {
        throw error;
      }

      const rows = data || [];
      allRows.push(...rows);

      if (rows.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    return allRows;
  }

  async function loadEvents() {
    const { data, error } = await supabase
      .from("treatment_events")
      .select("id, logged_at, event_type, amount, unit, notes, created_at")
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

  function openEditEventModal(event) {
    setEditingEvent(event);
  }

  async function handleDeleteEventFromModal(event) {
    const didDelete = await handleDeleteEvent(event);

    if (didDelete) {
      setEditingEvent(null);
    }
  }

  async function handleSavedEventEdit(updatedEvent) {
    if (!updatedEvent) {
      await loadEvents();
      setLastUpdatedAt(new Date());
      return;
    }

    setEvents((currentEvents) =>
      currentEvents
        .map((event) =>
          event.id === updatedEvent.id ? { ...event, ...updatedEvent } : event,
        )
        .sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at)),
    );
    setSelectedChartItem((currentItem) => {
      if (
        currentItem?.type !== "event" ||
        currentItem.data.id !== updatedEvent.id
      ) {
        return currentItem;
      }

      const updatedEventTime = new Date(updatedEvent.logged_at).getTime();
      const isInCurrentChartWindow =
        updatedEventTime >= chartWindow.startMs &&
        updatedEventTime <= chartWindow.endMs;

      if (!isInCurrentChartWindow) {
        return null;
      }

      return {
        type: "event",
        data: {
          ...currentItem.data,
          ...updatedEvent,
        },
      };
    });
    setLastUpdatedAt(new Date());
  }

  async function handleExportCombinedData() {
    const nextDataPeriod = getDataPeriodConfig(
      dataPeriodPreset,
      customStartDate,
      customEndDate,
    );
    if (nextDataPeriod.error) {
      setExportErrorMessage(nextDataPeriod.error);
      return;
    }

    setExportState("combined");
    setExportErrorMessage("");

    try {
      const glucoseRows = dataPeriodReadings.map(
        ({ reading_time, glucose_value, unit, created_at }) => ({
          record_type: "glucose",
          time: reading_time,
          glucose_value,
          glucose_unit: unit,
          event_type: "",
          event_label: "",
          amount: "",
          amount_unit: "",
          notes: "",
          created_at,
        }),
      );
      const eventRows = dataPeriodEvents.map(
        ({ logged_at, event_type, amount, unit, notes, created_at }) => ({
          record_type: "event",
          time: logged_at,
          glucose_value: "",
          glucose_unit: "",
          event_type,
          event_label: EVENT_CONFIG[event_type]?.label || event_type,
          amount: amount ?? "",
          amount_unit: unit || "",
          notes: notes || "",
          created_at,
        }),
      );
      const combinedRows = [...glucoseRows, ...eventRows].sort(
        (a, b) => new Date(a.time) - new Date(b.time),
      );
      const csvContent = buildCsv(combinedRows, [
        "record_type",
        "time",
        "glucose_value",
        "glucose_unit",
        "event_type",
        "event_label",
        "amount",
        "amount_unit",
        "notes",
        "created_at",
      ]);

      downloadCsvFile(
        `range-glucose-events-${nextDataPeriod.filenameLabel}.csv`,
        csvContent,
      );
    } catch (error) {
      setExportErrorMessage(error.message || "Could not export combined data.");
    } finally {
      setExportState("");
    }
  }

  async function handleDeleteEvent(event) {
    const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.note;
    const confirmed = window.confirm(
      `Delete this ${config.label.toLowerCase()} event from ${formatDateTime(
        event.logged_at,
      )}?`,
    );

    if (!confirmed) return false;

    setDeletingEventId(event.id);

    const { error } = await supabase
      .from("treatment_events")
      .delete()
      .eq("id", event.id)
      .eq("user_id", session.user.id);

    if (error) {
      setErrorMessage(error.message);
      setDeletingEventId(null);
      return false;
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
    return true;
  }

  useEffect(() => {
    loadDashboardData();

    const fallbackRefresh = window.setInterval(() => {
      loadDashboardData();
    }, 30000);

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
      .subscribe();

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
      .subscribe();

    return () => {
      window.clearInterval(fallbackRefresh);
      supabase.removeChannel(glucoseChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, []);

  const latestReading = readings[0] || null;
  const status = getStatus(latestReading?.glucose_value);

  const todayReadings = todayStatsReadings;

  const todayAverage = useMemo(() => {
    if (todayReadings.length === 0) return null;

    const total = todayReadings.reduce(
      (sum, reading) => sum + Number(reading.glucose_value),
      0,
    );

    return total / todayReadings.length;
  }, [todayReadings]);

  const dataPeriod = useMemo(
    () => getDataPeriodConfig(dataPeriodPreset, customStartDate, customEndDate),
    [dataPeriodPreset, customStartDate, customEndDate],
  );

  const dataPeriodEvents = useMemo(() => {
    if (dataPeriod.error || !dataPeriod.start || !dataPeriod.end) return [];

    return events.filter((event) => {
      const eventTime = new Date(event.logged_at).getTime();
      return (
        eventTime >= dataPeriod.start.getTime() &&
        eventTime < dataPeriod.end.getTime()
      );
    });
  }, [events, dataPeriod]);

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

  useEffect(() => {
    let isCurrent = true;

    async function syncTodayStatsReadings() {
      setIsLoadingTodayStatsReadings(true);

      const todayStart = startOfLocalDay(new Date());
      const tomorrowStart = addDays(todayStart, 1);

      try {
        const data = await fetchAllGlucoseReadings(
          todayStart.toISOString(),
          tomorrowStart.toISOString(),
        );

        if (!isCurrent) return;

        setTodayStatsReadings(data || []);
      } catch (error) {
        if (!isCurrent) return;

        setErrorMessage(error.message);
        setTodayStatsReadings([]);
      } finally {
        if (isCurrent) {
          setIsLoadingTodayStatsReadings(false);
        }
      }
    }

    syncTodayStatsReadings();

    return () => {
      isCurrent = false;
    };
  }, [lastUpdatedAt]);

  useEffect(() => {
    let isCurrent = true;

    async function syncDataPeriodReadings() {
      if (dataPeriod.error || !dataPeriod.start || !dataPeriod.end) {
        if (!isCurrent) return;

        setDataPeriodReadings([]);
        setIsLoadingDataPeriodReadings(false);
        return;
      }

      setIsLoadingDataPeriodReadings(true);

      try {
        const data = await fetchAllGlucoseReadings(
          dataPeriod.start.toISOString(),
          dataPeriod.end.toISOString(),
        );

        if (!isCurrent) return;

        setDataPeriodReadings(data || []);
      } catch (error) {
        if (!isCurrent) return;

        setErrorMessage(error.message);
        setDataPeriodReadings([]);
      } finally {
        if (isCurrent) {
          setIsLoadingDataPeriodReadings(false);
        }
      }
    }

    syncDataPeriodReadings();

    return () => {
      isCurrent = false;
    };
  }, [dataPeriod, lastUpdatedAt]);

  useEffect(() => {
    let isCurrent = true;

    async function syncDataPeriodExerciseEvents() {
      if (dataPeriod.error || !dataPeriod.start || !dataPeriod.end) {
        if (!isCurrent) return;

        setDataPeriodExerciseEvents([]);
        setIsLoadingDataPeriodExerciseEvents(false);
        return;
      }

      setIsLoadingDataPeriodExerciseEvents(true);

      try {
        const data = await fetchAllExerciseEvents(
          dataPeriod.start.toISOString(),
          dataPeriod.end.toISOString(),
        );

        if (!isCurrent) return;

        setDataPeriodExerciseEvents(data || []);
      } catch (error) {
        if (!isCurrent) return;

        setErrorMessage(error.message);
        setDataPeriodExerciseEvents([]);
      } finally {
        if (isCurrent) {
          setIsLoadingDataPeriodExerciseEvents(false);
        }
      }
    }

    syncDataPeriodExerciseEvents();

    return () => {
      isCurrent = false;
    };
  }, [dataPeriod, lastUpdatedAt]);

  useEffect(() => {
    let isCurrent = true;

    async function syncChartDayReadings() {
      if (chartRange !== "today") {
        if (!isCurrent) return;

        setIsLoadingChartDayReadings(false);
        return;
      }

      setIsLoadingChartDayReadings(true);

      const startIso = selectedDayStart.toISOString();
      const endIso = selectedDayEnd.toISOString();

      try {
        const data = await fetchAllGlucoseReadings(startIso, endIso);

        if (!isCurrent) return;

        setChartDayReadings(data || []);
      } catch (error) {
        if (!isCurrent) return;

        setErrorMessage(error.message);
        setChartDayReadings([]);
      } finally {
        if (isCurrent) {
          setIsLoadingChartDayReadings(false);
        }
      }
    }

    syncChartDayReadings();

    return () => {
      isCurrent = false;
    };
  }, [chartRange, lastUpdatedAt, selectedDayEnd, selectedDayStart]);

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
      const latestSelectedDayReading =
        selectedDayReadings[selectedDayReadings.length - 1] || null;

      if (isToday) {
        const end = latestSelectedDayReading
          ? new Date(latestSelectedDayReading.reading_time)
          : new Date();
        const start = new Date(end.getTime() - durationMs);

        return {
          startMs: start.getTime(),
          endMs: end.getTime(),
          displayStartMs: start.getTime(),
          displayEndMs: end.getTime(),
        };
      }

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
  }, [
    chartRange,
    chartDayOffset,
    selectedDayEnd,
    selectedDayReadings,
    selectedDayStart,
  ]);

  const chartReadings = useMemo(() => {
    if (chartRange === "today") {
      return chartDayReadings;
    }

    return readings.filter((reading) => {
      const readingTime = new Date(reading.reading_time).getTime();
      return (
        readingTime >= chartWindow.startMs && readingTime <= chartWindow.endMs
      );
    });
  }, [chartDayReadings, chartRange, readings, chartWindow]);

  useEffect(() => {
    let isCurrent = true;

    async function syncChartExerciseEvents() {
      setIsLoadingChartExerciseEvents(true);

      try {
        const data = await fetchAllExerciseEvents(
          new Date(chartWindow.startMs).toISOString(),
          new Date(chartWindow.endMs).toISOString(),
        );

        if (!isCurrent) return;

        setChartExerciseEvents(data || []);
      } catch (error) {
        if (!isCurrent) return;

        setErrorMessage(error.message);
        setChartExerciseEvents([]);
      } finally {
        if (isCurrent) {
          setIsLoadingChartExerciseEvents(false);
        }
      }
    }

    syncChartExerciseEvents();

    return () => {
      isCurrent = false;
    };
  }, [chartWindow.endMs, chartWindow.startMs, lastUpdatedAt]);

  const visualChartData = useMemo(() => {
    const mappedPoints = [...chartReadings]
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

    const maxPoints = chartRange === "today" ? 96 : 120;

    return downsampleChartPoints(mappedPoints, maxPoints);
  }, [chartReadings, chartRange]);

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
    if (visualChartData.length === 0) {
      return { solidSegments: [], gapSegments: [], coloredSegments: [] };
    }

    const solidSegments = [];
    const gapSegments = [];
    let currentSegment = [visualChartData[0]];

    for (let index = 1; index < visualChartData.length; index += 1) {
      const previousPoint = visualChartData[index - 1];
      const point = visualChartData[index];
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
  }, [visualChartData]);

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
          eventTime >= chartWindow.startMs && eventTime <= chartWindow.endMs
        );
      })
      .sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));
  }, [events, chartWindow]);

  const chartWalkingBlocks = useMemo(() => {
    return [...chartExerciseEvents]
      .filter((event) => {
        const startTime = new Date(event.start_time).getTime();
        const endTime = new Date(event.end_time).getTime();

        return (
          Number.isFinite(startTime) &&
          Number.isFinite(endTime) &&
          endTime > chartWindow.startMs &&
          startTime < chartWindow.endMs
        );
      })
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .map((event) => ({
        ...event,
        x1: Math.max(
          chartWindow.displayStartMs,
          new Date(event.start_time).getTime(),
        ),
        x2: Math.min(
          chartWindow.displayEndMs,
          new Date(event.end_time).getTime(),
        ),
      }));
  }, [chartExerciseEvents, chartWindow]);

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
    chartDayOffset === 0 ? "Today" : formatDateOnly(selectedDayStart);
  const chartHeight = chartWidth > 0 && chartWidth <= 430 ? 300 : 390;
  const showChartLoading =
    chartRange === "today" &&
    isLoadingChartDayReadings &&
    chartDayReadings.length === 0;
  const showChartEmpty = !showChartLoading && visualChartData.length === 0;
  const shouldRenderGlucoseScatter = chartRange !== "today";

  return (
    <main className="app-shell">
      <section className="hero-card app-header-card">
        <div className="app-header-title">
          <img
            src="/icons/range-header-logo-600.png"
            alt="Range"
            className="range-header-logo"
          />
        </div>

        <div className="app-header-actions">
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
          Events
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
          Data
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
              <strong>
                {isLoadingTodayStatsReadings
                  ? "Loading..."
                  : todayReadings.length}
              </strong>
              <p>Readings received today</p>
            </article>

            <article className="stat-card">
              <span className="card-label">Today’s average</span>
              <strong>
                {isLoadingTodayStatsReadings
                  ? "Loading..."
                  : todayAverage === null
                    ? "—"
                    : todayAverage.toFixed(1)}
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

              <div
                className="chart-wrap"
                ref={chartWrapRef}
                style={{ minHeight: chartHeight }}
              >
                {showChartLoading ? (
                  <p className="chart-empty">Loading chart data...</p>
                ) : showChartEmpty ? (
                  <p className="chart-empty">No chart data yet.</p>
                ) : chartWidth > 0 ? (
                  <ComposedChart
                    width={chartWidth}
                    height={chartHeight}
                    data={visualChartData}
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

                    {chartWalkingBlocks.map((event) => (
                      <ReferenceArea
                        key={event.id}
                        yAxisId="glucose"
                        x1={event.x1}
                        x2={event.x2}
                        y1={1}
                        y2={19}
                        ifOverflow="visible"
                        className="walking-reference-area"
                        fill="#4b7f52"
                        fillOpacity={0.07}
                        strokeOpacity={0}
                      />
                    ))}

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

                    {shouldRenderGlucoseScatter ? (
                      <Scatter
                        yAxisId="glucose"
                        data={visualChartData}
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
                    ) : null}

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
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openEditEventModal(selectedChartEvent)}
                      >
                        Edit event
                      </button>
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
            onSelect={(event) =>
              setSelectedChartItem({
                type: "event",
                data: event,
              })
            }
            onEdit={openEditEventModal}
            selectedEventId={selectedEventId}
          />

          <AutomaticEventsList
            exerciseEvents={chartWalkingBlocks}
            isLoading={isLoadingChartExerciseEvents}
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
          userId={session.user.id}
          readings={dataPeriodReadings}
          events={dataPeriodEvents}
          automaticEvents={dataPeriodExerciseEvents}
          isLoadingReadings={isLoadingDataPeriodReadings}
          isLoadingEvents={isLoadingEvents}
          isLoadingAutomaticEvents={isLoadingDataPeriodExerciseEvents}
          onExportCombinedData={handleExportCombinedData}
          exportState={exportState}
          exportErrorMessage={exportErrorMessage}
          dataPeriodPreset={dataPeriodPreset}
          onDataPeriodPresetChange={setDataPeriodPreset}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onCustomStartDateChange={setCustomStartDate}
          onCustomEndDateChange={setCustomEndDate}
          dataPeriodLabel={dataPeriod.label}
          dataPeriodStart={dataPeriod.start}
          dataPeriodEnd={dataPeriod.end}
          dataPeriodError={dataPeriod.error}
        />
      ) : null}

      {editingEvent ? (
        <EventModal
          eventType={editingEvent.event_type}
          userId={session.user.id}
          existingEvent={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={handleSavedEventEdit}
          onDelete={handleDeleteEventFromModal}
          isDeleting={deletingEventId === editingEvent.id}
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
