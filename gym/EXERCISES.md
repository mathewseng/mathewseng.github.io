# Exercise Registry

Exercise identifiers are stable keys. A Smith-machine press and a free-weight barbell press must never share a history or personal record.

## Chest and Pressing

- `smith-flat-bench`
- `smith-incline-bench`
- `incline-bench-machine`
- `dumbbell-bench`
- `shoulder-press`
- `machine-chest-press`
- `high-cable-chest-press`
- `mid-cable-fly`

## Back and Pulling

- `strict-pull-up`
- `lat-pulldown`
- `seated-cable-row`
- `standing-cable-row`
- `chest-supported-row`
- `machine-row`
- `face-pull`
- `reverse-cable-fly`

## Arms

- `triceps-pushdown`
- `overhead-triceps-extension`
- `spider-curl`
- `incline-curl`
- `hammer-curl`

## Shoulders

- `cable-lateral-raise`
- `dumbbell-lateral-raise`
- `cable-front-raise`
- `rear-delt-machine`

## Legs

- `goblet-squat`
- `smith-squat`
- `leg-press`
- `split-squat`
- `lunge`
- `leg-extension`
- `hamstring-curl`
- `romanian-deadlift`
- `hip-thrust`
- `calf-raise`

## Carries and Core

- `farmers-carry`
- `front-loaded-carry`
- `zercher-carry`
- `plank`
- `pallof-press`
- `hanging-leg-raise`
- `leg-raise`
- `reverse-crunch`
- `cable-ab-crunch`
- `ab-wheel`

## Definition Shape

Each structured exercise definition supports:

- Canonical name
- Aliases
- Category
- Muscle groups
- Equipment
- Whether weight may be per side
- Whether volume calculation is meaningful
- Whether estimated 1RM is appropriate
- Whether failure is relatively safe
- Whether the movement may stress the back
- Default repetition range
- Notes

## Historical Identity and Ambiguity

| Recorded label              | Canonical identifier                                                  | Equipment/identity rule                                                               | Known ambiguity                                                       |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Smith-Machine Flat Bench    | `smith-flat-bench`                                                    | 25 lb Smith bar included in every recorded load; keep machine identity when available | Exact machine identifier not recorded                                 |
| Smith-Machine Incline Bench | `smith-incline-bench`                                                 | Same Smith-specific separation                                                        | Exact machine identifier not recorded                                 |
| Incline Bench Machine       | `incline-bench-machine`                                               | Independent machine exercise, not Smith incline bench                                 | Machine identity and resistance curve not recorded                    |
| Strict Pull-Up              | `strict-pull-up`                                                      | Body-weight skill; do not calculate external-load volume from body weight by default  | Exact date missing                                                    |
| Lat Pulldown                | `lat-pulldown`                                                        | Machine stack value                                                                   | Cable ratio/machine identity not recorded                             |
| Shoulder Press              | `shoulder-press`                                                      | Preserve equipment when future entries clarify it                                     | Equipment and per-side interpretation not recorded                    |
| Triceps Pushdown            | `triceps-pushdown`                                                    | Machine stack value                                                                   | Cable ratio/machine identity not recorded                             |
| Overhead Triceps Extension  | `overhead-triceps-extension`                                          | Preserve equipment and attachment when known                                          | Equipment/attachment not fully recorded                               |
| Cable Lateral Raise         | `cable-lateral-raise`                                                 | Can be per arm                                                                        | July 16 explicitly says per arm                                       |
| Cable Front Raise           | `cable-front-raise`                                                   | Can be per side                                                                       | Return session reports 10 lb per side and likely counts sides as sets |
| Spider Curl                 | `spider-curl`                                                         | May use two dumbbells                                                                 | It is unclear whether 15 lb is per hand                               |
| Incline Curl                | `incline-curl`                                                        | May use two dumbbells                                                                 | It is unclear whether 15 lb is per hand                               |
| Lateral Raise               | unresolved between `cable-lateral-raise` and `dumbbell-lateral-raise` | Do not choose a canonical ID until clarified                                          | July 27 equipment and per-side status are unknown                     |
| High Cable Chest Press      | `high-cable-chest-press`                                              | Preserve the entered stack load; record per-side status when known                    | August 3 cable setup and per-side status are unknown                  |
| Mid Cable Fly               | `mid-cable-fly`                                                       | Preserve the entered stack load; record per-side status when known                    | August 3 cable setup and per-side status are unknown                  |
| Leg Raise                   | `leg-raise`                                                           | Record the variation and exact sets when known                                        | August 3 supplies only a 60-repetition aggregate total                |
| Reverse Crunch              | `reverse-crunch`                                                      | Bodyweight core movement; do not force external-load volume                           | August 3 supplies only a 60-repetition aggregate total                |
| Smith-Machine Squat         | `smith-squat`                                                         | 25 lb Smith bar included; preserve the primary Smith-machine identity                 | August 10 back-pain response and RIR were not supplied                |
| Leg Press                   | `leg-press`                                                           | Machine-specific load; do not compare across different leg-press machines             | Exact machine identity was not recorded                               |
| Standing Overhead Press     | `shoulder-press`                                                      | August 10 used 20 lb per dumbbell; keep separate from unspecified shoulder-press data | Earlier 30 lb shoulder-press equipment remains unknown                |
| Standing Calf Raise         | `calf-raise`                                                          | August 10 loaded sets used 35 lb per hand                                             | Bodyweight plus external-load volume is not combined automatically    |

## Calculation Defaults

- Preserve the weight exactly as entered.
- Never multiply a per-side load unless the user explicitly chooses that behavior.
- Machine-stack values remain machine-specific.
- Estimated 1RM is appropriate only for suitable resistance exercises and qualifying completed working sets.
- Failed attempts, warm-ups, and sets over 12 repetitions are excluded from estimated 1RM by default.
- Body-weight-only pull-ups, duration-based carries, and core holds should use movement-appropriate records rather than forced weight-volume or estimated-1RM values.
