# Project Summary: Range

## Purpose

Range is a personal glucose logging and pattern-spotting web app.

The project exists to help combine automatic glucose readings with manually recorded context, such as carbs, fast acting insulin, background insulin, and notes. The aim is to make glucose patterns easier to review and discuss, not to provide medical decisions or insulin dosing advice.

The app is being built around a real personal workflow:

- Freestyle Libre sensor data is read through the user's existing phone/watch setup.
- GlucoDataHandler detects new glucose readings.
- MacroDroid sends readings into Supabase.
- The React app displays the readings and related manual events.
- Selected periods of data can be copied into a ChatGPT prompt or downloaded as CSV for review.

## Project Name and Branding

The current app name is `Range`.

The name fits the purpose of the app because it focuses on whether glucose values are low, in range, high, or moving through a meaningful period of time. It also avoids sounding too clinical or alarmist.

The app uses Range logo assets and a simple three-tab structure:

- Events
- Chart
- Data

## Safety Positioning

Range is intentionally framed as a personal logging, review, and pattern-spotting tool.

It should not be described as:

- a diagnostic tool
- a dosing calculator
- a replacement for LibreLink
- a medical device
- a replacement for clinical advice

A sensible portfolio description would be:

> Range is a personal diabetes data dashboard that combines glucose readings and recorded events to help identify patterns and prepare better discussion points for healthcare appointments.

## Tech Stack

Frontend:

- React
- Vite
- Supabase JavaScript client
- plain CSS

Backend/data:

- Supabase Auth
- Supabase Database
- Supabase Edge Function
- Supabase Row Level Security

Automation:

- Freestyle Libre sensor
- GlucoDataHandler
- MacroDroid
- HTTP POST workflow

Deployment/workflow:

- GitHub
- Vercel

## Main App Areas

## 1. Events Page

The Events page is the fast-entry screen.

The key design decision was to avoid a complicated combined form. Instead, the user records one event at a time using large phone-friendly controls.

Current event types:

- carbs
- fast acting insulin
- background insulin
- note

This approach keeps the data model cleaner because each thing that happened is stored as its own event. For example, eating carbs and taking fast acting insulin are related in real life, but they are still separate records in the app.

### Why this matters

Separate event records make the chart easier to understand because each event marker has one clear meaning. It also avoids forcing the user to fill in fields that may not apply at that moment.

## 2. Chart Page

The Chart page is the main visual review screen.

The chart shows glucose readings as a simple line graph. Manual events are not plotted as glucose values. Instead, they appear as markers at the time they happened.

Current chart principles:

- glucose readings remain the main line
- events are contextual markers only
- the chart should be useful at a glance
- mobile use matters as much as desktop use
- event details should be easy to inspect without cluttering the graph

Current chart features include:

- Last hour, Last 3 hours, and Today selectors
- Today date navigation
- threshold emphasis around low/high values
- event markers for carbs, fast acting insulin, and background insulin
- click-to-select event behaviour
- mobile recorded-events panel
- simplified layout for smaller screens

### Event colours

Current marker colour decisions:

- carbs: blue
- fast acting insulin: red
- background insulin: green

Notes are treated differently and are not intended to dominate the chart visually.

## 3. Data Page

The Data page replaced the earlier Insights direction for the current stage.

The purpose of the Data page is to make selected periods easier to review, copy, and export.

It includes a shared period selector:

- Today
- Yesterday
- Custom

The Custom option uses date inputs arranged side by side. The active selector is shown with a faint green pill treatment, matching the current app polish.

The selected period feeds both:

- Copy prompt for ChatGPT
- Download CSV

This means the user can select a period once and use that same period consistently for both AI-supported pattern discussion and spreadsheet-style export.

## Data Capture Workflow

## Automatic Glucose Readings

The automatic reading workflow is:

1. Freestyle Libre sensor produces readings.
2. GlucoDataHandler receives or detects the current reading.
3. MacroDroid reacts to the new glucose value.
4. MacroDroid sends an HTTP POST request to the Supabase Edge Function.
5. The Edge Function checks the `x-glucose-token` header.
6. If valid, the reading is inserted into `glucose_readings`.
7. The app reads from Supabase and updates the chart.

The current Edge Function is called:

- `glucose-intake`

The current readings table is:

- `glucose_readings`

Important implementation note:

- The arrow/trend field was deliberately left out of the payload for the current version.

## Manual Events

Manual events are stored separately from glucose readings.

The current manual event table is:

- `treatment_events`

The current event types are:

- carbs
- fast_insulin
- background_insulin
- note

Each event can have a value and optional notes depending on the event type.

## Supabase Objects

Known Supabase objects in the current architecture:

### Tables

- `glucose_readings`
- `treatment_events`

### Edge Functions

- `glucose-intake`

### Security

- Supabase Auth is used for the app.
- Row Level Security is part of the intended data protection approach.
- The intake Edge Function uses a shared token header for external writes from MacroDroid.

## Current Implementation Status

Based on the working state described so far, the app has:

- working Supabase project connection
- deployed Edge Function
- MacroDroid posting glucose readings successfully
- readings inserted into Supabase
- React/Vite app reading live data
- basic auth working
- manual treatment/event logging
- simple glucose chart
- event markers on the chart
- mobile-focused event entry
- Chart and Data tabs
- Data page period selector
- CSV export using selected period
- copyable ChatGPT prompt using selected period
- Range branding and logo assets
- responsive mobile improvements

## Design Decisions

## 1. Simple glucose line first

The glucose chart deliberately stays focused on glucose readings.

Carbs and insulin are not plotted as numeric values on the same axis because that would make the chart misleading. They are shown as context markers instead.

## 2. Events are separate records

Carbs, fast acting insulin, background insulin, and notes are logged separately. This keeps the data clean and avoids turning the quick entry page into a complicated diary form.

## 3. Phone-first entry

The app is designed around the reality that events usually need to be logged quickly on a phone, not carefully entered at a desktop.

This affects the whole interface:

- large buttons
- minimal form friction
- clear event categories
- mobile chart adjustments
- recorded-events panel for smaller screens

## 4. Pattern spotting, not medical advice

The app can help prepare better questions and observations, but it should not claim to make medical recommendations.

Good wording:

- "You may want to discuss this pattern with your clinician."
- "This looks like a possible trend."
- "This period may be worth reviewing."

Avoid wording:

- "Take more insulin."
- "Change your dose."
- "This diagnosis means..."

## 5. Data page before full AI insights

The earlier Insights idea was deliberately reworked into a Data page first. This is a good development decision because reliable data selection, export, and prompt copying are useful foundations before adding heavier insight features.

## Current Limitations

Range is still a personal project and has known limitations:

- It is not a medical device.
- It does not give dosing advice.
- Exercise data is not yet integrated.
- Samsung Health and Health Connect integration has been explored but not completed.
- Walking detection through MacroDroid/Tasker is still unresolved.
- The app currently uses a small set of manual event types.
- There is not yet a dedicated clinician report view.
- There are no automated tests yet.
- The app currently depends on external phone automation for glucose intake.

## Future Improvements

Likely next improvements include:

1. PWA/app install polish.
2. More robust Android background automation checks.
3. Walking/exercise integration.
4. Better day/week trend summaries.
5. More advanced but safety-conscious insights.
6. Clinician-friendly export/report format.
7. Event editing and deletion polish.
8. More filtering options on the Data page.
9. Automated tests for core UI and data flows.
10. Better documentation of Supabase setup.

## Exercise Integration Notes

Exercise is a major future feature because walking can have a significant effect on glucose levels.

The desired chart behaviour is to show walks or exercise sessions as coloured blocks across the time period where the exercise happened.

Explored options so far:

- Samsung Health
- Health Connect
- Tasker Health Connect plugin
- MacroDroid walking started/stopped triggers

Current status:

- Not implemented yet.
- Walking is the main exercise type of interest.
- The preferred rule is likely to record walks longer than five minutes.
- The chart should display exercise as a time block, not as a glucose value.

## Suggested GitHub README Angle

The README should present Range as:

- a personal data dashboard
- a React/Supabase project
- a practical automation integration
- a safety-conscious health logging tool

It should avoid implying that the app gives medical advice.

## Suggested Portfolio Case Study Angle

Strong case study title:

> Range: A personal glucose logging app that combines sensor readings with real-life context.

Strong portfolio themes:

- building for a real personal need
- connecting phone automation to a Supabase backend
- designing quick event entry for mobile use
- visualising context without polluting the glucose chart
- making AI-supported analysis safer by focusing on prompts and exports rather than direct medical recommendations
- planning future integrations around walking and exercise

## Portfolio Summary Paragraph

Range is a personal glucose logging app built with React, Vite, Supabase, GlucoDataHandler and MacroDroid. It captures glucose readings from a Libre sensor workflow, lets carbs and insulin events be logged quickly on a phone, and presents the data in a simple chart and export interface. The project focuses on pattern spotting and preparation for healthcare conversations rather than medical advice, with future plans for walking/exercise integration and clinician-friendly reports.
