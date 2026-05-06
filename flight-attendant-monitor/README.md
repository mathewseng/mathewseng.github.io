# Atlanta Flight-Attendant Job Monitor

This is a small server-friendly Python monitor for flight-attendant openings that are Atlanta/ATL-based, or from airlines whose official flight-attendant pages list Atlanta as a crew base.

It checks official airline career sources, remembers postings it has already seen, and notifies you only when a new matching posting appears.

## Quick Start

```bash
cd flight-attendant-monitor
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` with your SMTP sender credentials. For Gmail, use a Google app password, not your normal Google password. The recipient is already set to `mathewseng2002@gmail.com`.

Send a test email with the current availability report:

```bash
python monitor.py --test-email
```

Prime the state once if you do not want to be notified about jobs already open right now:

```bash
python monitor.py --prime
```

Run one check:

```bash
python monitor.py --verbose
```

Run continuously, checking every hour:

```bash
python monitor.py --daemon --interval 3600
```

## Hourly Server Setup

### Cron

Run `crontab -e` and add:

```cron
0 * * * * cd /path/to/flight-attendant-monitor && .venv/bin/python monitor.py >> monitor.log 2>&1
```

### systemd

Copy the folder to `/opt/flight-attendant-monitor`, then:

```bash
sudo cp systemd/flight-attendant-monitor.service /etc/systemd/system/
sudo cp systemd/flight-attendant-monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now flight-attendant-monitor.timer
```

Check logs:

```bash
journalctl -u flight-attendant-monitor.service -n 100 --no-pager
```

## Sources

The starter `sources.json` includes official sources for Delta, Southwest, Frontier, American, United, Spirit, JetBlue, Endeavor, Envoy, and SkyWest.

Important details:

- Delta, Southwest, and Frontier are configured as ATL-base airlines because their official flight-attendant pages list Atlanta/ATL as a base.
- Other airlines are included for completeness, but they only alert if the posting itself mentions Atlanta/ATL.
- Some career sites block server-side requests with WAF or bot challenges. The monitor reports source warnings instead of silently failing.
- You can add, remove, disable, or tune sources in `sources.json`.

## Email Setup

The monitor sends email through SMTP only. For Gmail:

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USERNAME=mathewseng2002@gmail.com`
- `SMTP_PASSWORD=<Google app password>`
- `SMTP_FROM=mathewseng2002@gmail.com`
- `NOTIFY_EMAIL_TO=mathewseng2002@gmail.com`

Use `python monitor.py --email-report` any time you want a manual current-status email without changing the seen-job state.

## How It Checks

Every run downloads each configured official airline career source in `sources.json`, extracts job records, and filters them.

- Phenom career pages, such as Southwest and United, are parsed from embedded `phApp.ddo` JSON job data.
- JetBlue is read from the SuccessFactors RSS job feed.
- Frontier is read from its official flight-attendant application page and apply link.
- Other airline pages are parsed from structured job JSON or job links where available.
- Matching requires a flight-attendant/cabin-crew title, excludes non-FA roles like recruiter/scheduler/instructor, then applies Atlanta rules.

Delta, Southwest, and Frontier are configured as ATL-base airlines because their official flight-attendant pages list Atlanta/ATL as a base. Other airlines only alert if the posting itself mentions Atlanta/ATL.

To audit what happened, run:

```bash
python monitor.py --verbose --dry-run
```

That prints how many jobs each source returned, how many matched, and any warning if a career site blocked or changed.

## Files

- `monitor.py`: the checker and notifier.
- `sources.json`: airline career sources and Atlanta/base matching rules.
- `.state/seen_jobs.json`: created automatically to remember postings already seen.
- `.env`: your notification settings. Keep it private.
