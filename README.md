# Fitness Assistant Portfolio Edition

A privacy-aware fitness chatbot portfolio project with contextual follow-ups, multilingual responses, structured workout and nutrition guidance, deterministic calculations, and optional AI-provider integration.

## Portfolio status

This repository is an independent, sanitized portfolio edition:

- no company branding, logos, domains, IP addresses, or production infrastructure;
- no former-company background or scene assets;
- no proprietary exercise or sports images;
- no real profiles, conversations, review records, credentials, or API keys;
- no affiliation with a former employer or client.

Visual exercise assets are intentionally omitted until independently licensed replacements are available.

## Run locally

Python 3.10 or newer is recommended.

```bash
python server.py
```

Then open `http://localhost:4173`.

The deterministic local engine works without API keys. To try optional providers, copy `.env.example` to `.env`, keep that file private, and add your own credentials.

## Highlights

- conversational state and contextual follow-ups;
- separated visitor profiles and temporary session memory;
- workout, nutrition, protein, hydration, recovery, and sports topics;
- weekly and periodized plan generation;
- BMI, calorie, protein, and hydration calculations;
- Portuguese, English, Spanish, German, French, Italian, and Turkish support;
- privacy controls and data deletion;
- safety handling for pain, injuries, medical-risk questions, and minors;
- optional Groq and Gemini integration with local fallback;
- safe table rendering and Markdown cleanup.

## Safety

The application provides educational information only. It does not diagnose conditions or replace qualified medical, nutrition, physiotherapy, or fitness professionals.

## Before publishing a live demo

Keep provider credentials on a server-side function, enable rate limiting, and do not place API keys in browser JavaScript.
