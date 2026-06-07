# Range

Range is a personal glucose logging and pattern-spotting web app built with React, Vite, Supabase, GlucoDataHandler, and MacroDroid.

The app records glucose readings from a Freestyle Libre workflow, lets manual events be logged quickly on a phone, and presents the data in a simple dashboard designed to help spot patterns over time.

> Range is a personal logging and discussion tool. It is not a medical device and does not provide dosing advice.

## Overview

Range connects three things that are normally awkward to view together:

1. Automatic glucose readings from a Libre sensor workflow.
2. Manual events such as carbs, fast acting insulin, background insulin, and notes.
3. A clean chart and data export flow that can be reviewed personally or shared with a healthcare professional.

The main goal is not to replace LibreLink or clinical advice. The goal is to make day-to-day patterns easier to see by combining readings and context in one place.

## Core User Flows

### 1. Automatic glucose capture

Glucose readings are captured on the phone using GlucoDataHandler and MacroDroid. MacroDroid sends each new reading to a Supabase Edge Function, which validates a shared token and inserts the reading into the `glucose_readings` table.

### 2. Quick manual event logging

The Events page is designed for phone use. Instead of one complicated form, events are recorded one at a time with large touch-friendly buttons.

Supported manual event types:

- carbs
- fast acting insulin
- background insulin
- note

Each event is stored separately in `treatment_events`, which keeps the data cleaner and makes chart markers easier to understand.

### 3. Chart review

The Chart page shows glucose as a simple line graph. Manual events are shown as event markers rather than plotted as glucose values, so the chart remains focused on glucose levels.

Current chart behaviour includes:

- glucose line using live Supabase data
- time windows for Last hour, Last 3 hours, and Today
- Today navigation with previous/next day controls
- emphasis lines around low and high thresholds
- event markers for carbs, fast acting insulin, and background insulin
- click-to-select event details
- mobile-friendly recorded-events panel

### 4. Data review and export

The Data page is used for reviewing and sharing data.

It includes a shared period selector:

- Today
- Yesterday
- Custom

The selected period is used by both:

- the copyable ChatGPT analysis prompt
- CSV export

This makes it easier to copy a useful period of data for pattern discussion or export the same period for review elsewhere.

## Tech Stack

Frontend:

- React
- Vite
- plain CSS
- Supabase JavaScript client

Backend and data:

- Supabase Auth
- Supabase Database
- Supabase Edge Function
- Supabase Row Level Security

Automation and data capture:

- Freestyle Libre sensor
- GlucoDataHandler
- MacroDroid
- HTTP POST to Supabase Edge Function

Deployment:

- GitHub
- Vercel

## Frontend Structure

The app is currently a React/Vite single-page app with simple tab-based navigation.

Main areas:

- Events
- Chart
- Data

The app branding is `Range`, with custom logo assets and a phone-first layout for recording events.

## Supabase Usage

The frontend and intake workflow reference these main Supabase objects.

### Tables

- `glucose_readings`
- `treatment_events`

### Edge Function

- `glucose-intake`

The intake function expects a shared token header and receives glucose reading payloads from MacroDroid.

Typical payload fields:

- glucose value
- unit
- reading time

The arrow/trend field is intentionally not part of the current payload.

## Implemented Features

- Supabase authentication
- automatic glucose reading inserts from MacroDroid
- live chart using readings from Supabase
- manual event logging
- separate event types for carbs, fast acting insulin, background insulin, and notes
- chart markers for manual events
- mobile-friendly event recording
- Chart and Data pages
- Today, Yesterday, and Custom period selector on the Data page
- copyable ChatGPT prompt for selected data period
- CSV export for selected data period
- Range branding and logo assets
- responsive layout improvements for mobile use

## Known Limitations

- The app is for personal logging only and is not intended to provide medical decisions or dosing advice.
- Exercise integration is not yet implemented.
- Health Connect and Samsung Health walking data have been explored but not finalised.
- The app currently focuses on a small number of event types.
- Automated tests are not yet included.
- The data model is intentionally simple at this stage.
- Clinical sharing/export is currently handled through CSV and copied prompts rather than a dedicated clinician portal.

## Future Improvements

Possible next stages include:

- turning the site into a smoother PWA/app-like experience on Android
- adding automatic or semi-automatic walking/exercise blocks
- improving longer-term trend summaries
- adding more advanced insights while keeping them non-medical
- adding better clinician-friendly reports
- adding tests for core data and UI flows
- improving event editing and validation
- adding richer filtering on the Data page

## Portfolio Case Study Angle

A strong portfolio angle for Range is:

> Building a personal health-data logging app that combines automated sensor readings with real-life context, while keeping the interface simple, mobile-first, and safety-conscious.

Good themes to emphasise:

- joining automated sensor data with manual context
- designing for quick phone use rather than desktop admin use
- choosing safety-conscious language around diabetes data
- using Supabase Edge Functions for secure external data intake
- building a real personal tool around a genuine daily workflow
