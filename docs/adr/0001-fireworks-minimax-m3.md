# ADR 0001 — Fireworks MiniMax M3 as sole LLM provider (Phase 1)

## Status
Accepted

## Context
Hugo previously referenced MegaLLM / Groq / Gemini paths. Phase 1 consolidates on Fireworks.

## Decision
- Provider adapter: `src/lib/hugo/providers/fireworks.ts`
- Model: `accounts/fireworks/models/minimax-m3`
- Base URL: `https://api.fireworks.ai/inference/v1`
- Env: `FIREWORKS_API_KEY`

## Firebase Auth console setup
1. Firebase Console → Authentication → Sign-in method → enable **Email/Password**
2. Create a user or use /login Sign up (defaults to role `viewer` in `users/{uid}`)
3. Promote roles by editing Firestore `users/{uid}.role` to `warehouse` | `procurement` | `admin`
