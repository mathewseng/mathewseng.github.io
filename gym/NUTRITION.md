# Nutrition and Supplement Log

Supplement entries are personal observations, not medical recommendations.

## Current Known Information

- Current reported body weight: 150 lb on September 2, 2026
- This was reported after the Barcelona work trip; weigh-in time and conditions were not supplied.
- One post-travel observation cannot establish a body-composition change or trend.
- Primary nutrition objective: support muscle growth, strength, recovery, and consistent training
- Exact daily calories are not yet recorded
- Exact daily protein intake is not yet recorded
- Exact water intake is not yet recorded

## Creatine

### Current Reported Use

- Reported creatine intake: approximately 15–20 g per day
- Creatine was not taken during the approximately 10-day travel period
- Date that the current dose began: unknown
- Creatine type: not yet recorded
- Whether doses are divided throughout the day: not yet recorded
- No assumption should be made about medical history, kidney health, medications, or clinician guidance

The 15–20 g amount is a range reported by the user, not a dated daily entry and not a prescribed target. The travel pause is a range annotation; fake dates must not be created for missed days.

### Application Behavior

- Track creatine intake by date.
- Allow dose entry in grams.
- Show missed or paused days without labeling them as failures.
- Visually distinguish a short loading phase from ongoing maintenance use.
- Do not recommend that the user continue 15–20 g daily indefinitely.
- Display a neutral notice that 15–20 g/day resembles commonly studied short loading protocols, while lower maintenance amounts are commonly used afterward.
- Recommend discussing prolonged high-dose use with a qualified clinician, especially when kidney disease, relevant medication use, dehydration risk, or other medical concerns may be present.
- Do not diagnose or provide personalized medical dosing.
- Allow the user to set a personal target only after acknowledging the notice.
- Track travel gaps and other reasons for missed use.
- A value at or above 15 g/day should trigger a neutral review notice without blocking entry or labeling the user unsafe.
- Do not infer that the travel pause caused a particular workout result.

## Daily Nutrition Fields

Allow entry of:

- Date
- Morning body weight
- Calories
- Protein in grams
- Carbohydrates in grams
- Fat in grams
- Fiber in grams
- Water intake
- Creatine dose in grams
- Other supplements
- Appetite
- Meal quality
- Notes
- Travel status
- Illness status

## Dated Entries

### September 2, 2026

- Body weight: 150 lb
- Context: reported after returning from approximately two weeks of work travel in Barcelona
- Weigh-in time and conditions: not recorded
- Data quality: partial context; body-weight value and date were supplied

Workout/readiness context uses the 0–6 model described in `DATA_MODEL.md`. Nutrition-only fields may use their own explicitly documented scales, but they must never be silently treated as workout-readiness ratings.

## Nutrition Dashboard

Show:

- Seven-day average body weight
- Thirty-day body-weight trend
- Average calories, when recorded
- Average protein, when recorded
- Creatine adherence based only on the user's chosen plan
- Travel and illness context
- Missing-data indicators
- Correlation views only as descriptive charts, not causal claims

## Guardrails

- Do not invent calorie or protein targets without user input.
- The interface may offer optional general-purpose target configuration.
- Do not claim that supplements replace adequate food, sleep, or training.
- Do not shame missed nutrition or supplement entries.
- Do not claim that a brief creatine pause caused a specific performance change.

## Evidence Note

Commonly studied creatine-loading protocols use approximately 20 g/day, often split into several doses, for about 5–7 days, followed by a lower maintenance intake. This is background information only and is not a personalized prescription.
