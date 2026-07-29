# Miscellaneous Training Notes

## Gym Equipment and Loading

- The primary bench is a Smith machine.
- The Smith-machine bar weighs 25 lb.
- All Smith-machine weights in the log already include the bar.
- The gym does not have 2.5 lb plates available.
- Bench and similar bar-loading exercises therefore normally increase by 10 lb total.
- Use rep progression before increasing load.
- Do not silently compare Smith-machine records with free-weight barbell records.
- Different machines may have different cable ratios or resistance curves.
- Machine stack numbers should be tracked as machine-specific values.
- The gym does not have a seated cable-row station.
- Use a standing dual-cable row or chest-supported dumbbell row instead.

## Exercise Standards

### Smith-Machine Bench

A successful repetition should:

- Use a consistent bench position
- Lower under control
- Reach the normal intended chest position
- Press to full lockout
- Receive no assistance
- Avoid counting partial repetitions

### Strict Pull-Up

A successful repetition should:

- Begin from a dead hang or controlled near-dead hang
- Maintain shoulder control
- Avoid excessive kicking or swinging
- Bring the chin to or above the bar
- Lower under control
- Avoid counting partial repetitions

## Programming Notes

- Primary objective is muscle growth with strength progression.
- Most compound sets should finish around 1–3 reps in reserve.
- Most isolation sets should finish around 0–2 reps in reserve.
- Repeated failed repetitions are discouraged.
- Technical failure is preferred over attempting an obviously impossible repetition.
- One-repetition maximum testing should not occur every workout.
- Because weight jumps are large, progression should often occur through added repetitions.
- Temporary strength reductions after travel, poor sleep, soreness, illness, or repeated failed lifts should be shown with context.

## Recovery Notes

- A 10-day gym break occurred during travel.
- No creatine was taken during that travel period.
- Mild illness and fatigue occurred after returning.
- Back pain has previously affected exercise selection.
- The application should support reduced-volume recovery workouts.

## Context Scale

Workout and readiness context uses optional integer ratings from 0 through 6; it does not use yes/no values.

- Energy and sleep: `0 = lowest/worst`, `6 = highest/best`
- Appetite, if captured as readiness context: `0 = lowest/worst`, `6 = highest/best`
- Soreness, illness, back pain, other pain, and travel disruption: `0 = none`, `6 = worst`
- Zero is a recorded value. A missing rating means “not recorded,” not zero.

Historical prose such as “mildly sick” remains prose unless the user supplies a rating. The application must not reverse-engineer a number from that wording.

## Data-Quality Notes

Some entries are incomplete or ambiguous:

- Some historical workouts have no exact date.
- Some final-set repetition counts were not recorded.
- Some cable and dumbbell weights may be per arm.
- Some shoulder sets were counted separately by side.
- Several entries are ramp-up sets rather than true working sets.
- Context descriptions in the source history were not numeric ratings.
- Do not invent missing values.
- Mark uncertain entries explicitly.
