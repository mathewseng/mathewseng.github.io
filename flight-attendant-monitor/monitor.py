#!/usr/bin/env python3
"""Hourly flight-attendant job monitor for Atlanta/ATL bases."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import smtplib
import ssl
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup


DEFAULT_CONFIG = Path(__file__).with_name("sources.json")
DEFAULT_STATE = Path(__file__).with_name(".state").joinpath("seen_jobs.json")
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (compatible; FlightAttendantJobMonitor/1.0; personal job alert)"
)

DEFAULT_TITLE_TERMS = [
    "flight attendant",
    "flight attendant trainee",
    "cabin crew",
    "cabin attendant",
    "inflight crew",
    "inflight crewmember",
    "in-flight crew",
    "in-flight crewmember",
]

DEFAULT_EXCLUDE_TITLE_TERMS = [
    "recruiter",
    "scheduler",
    "supervisor",
    "manager",
    "instructor",
    "analyst",
    "coordinator",
    "pilot",
    "mechanic",
    "technician",
    "airport operations",
    "customer service",
]

ATLANTA_TERMS = [
    "atlanta",
    "atlanta, ga",
    "atlanta ga",
    "hartsfield",
    "hartsfield-jackson",
    " atl ",
    "(atl)",
    "-atl",
    " atl,",
]


@dataclass(frozen=True)
class Job:
    airline: str
    source: str
    title: str
    url: str
    location: str = ""
    posted: str = ""
    description: str = ""
    external_id: str = ""
    source_note: str = ""

    @property
    def stable_id(self) -> str:
        raw = "|".join(
            [
                normalize_text(self.airline).lower(),
                normalize_text(self.external_id or self.url or self.title).lower(),
            ]
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


@dataclass(frozen=True)
class SourceReport:
    name: str
    airline: str
    collected: int = 0
    matched: int = 0
    error: str = ""


class SourceError(RuntimeError):
    pass


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "job"


def load_json(path: Path, fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    if not path.exists():
        return fallback or {}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, sort_keys=True)
        handle.write("\n")
    tmp.replace(path)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'\"")
            if key and key not in os.environ:
                os.environ[key] = value


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": os.getenv("JOB_MONITOR_USER_AGENT", DEFAULT_USER_AGENT),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    return session


def fetch(
    session: requests.Session,
    url: str,
    *,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
) -> requests.Response:
    try:
        response = session.request(
            method,
            url,
            json=json_body,
            timeout=(10, 35),
            allow_redirects=True,
        )
    except requests.RequestException as exc:
        raise SourceError(f"request failed: {exc}") from exc

    waf_action = response.headers.get("x-amzn-waf-action")
    if response.status_code == 202 and waf_action:
        raise SourceError(f"blocked by AWS WAF challenge ({waf_action})")
    if response.status_code == 403:
        raise SourceError("blocked with HTTP 403")
    if response.status_code >= 400:
        raise SourceError(f"HTTP {response.status_code}")
    if "Access Denied" in response.text and "permission to access" in response.text:
        raise SourceError("blocked with access denied page")
    return response


def walk_dicts(value: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(value, dict):
        found.append(value)
        for item in value.values():
            found.extend(walk_dicts(item))
    elif isinstance(value, list):
        for item in value:
            found.extend(walk_dicts(item))
    return found


def dict_text(data: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        value = data.get(key)
        if isinstance(value, list):
            value = ", ".join(normalize_text(v) for v in value if v)
        if value:
            return normalize_text(value)
    return ""


def job_from_dict(data: dict[str, Any], source: dict[str, Any]) -> Job | None:
    title = dict_text(data, ["title", "jobTitle", "name", "job_title"])
    if not title:
        return None

    external_id = dict_text(
        data,
        ["jobSeqNo", "reqId", "jobId", "jobReqId", "requisitionId", "id", "external_id"],
    )
    location = dict_text(
        data,
        ["location", "locationsText", "cityState", "multi_location", "primaryLocation", "city"],
    )
    posted = dict_text(data, ["postedDate", "postedOn", "datePosted", "dateCreated"])
    description = dict_text(
        data,
        ["descriptionTeaser", "description", "jobDescription", "summary", "shortDescription"],
    )

    url = dict_text(data, ["url", "jobUrl", "externalUrl", "applyUrl", "absolute_url"])
    if not url:
        external_path = dict_text(data, ["externalPath"])
        if external_path:
            url = urllib.parse.urljoin(source.get("candidate_home_url", source["url"]), external_path)
    if not url and data.get("jobSeqNo"):
        base_url = source.get("base_url", source["url"])
        url = urllib.parse.urljoin(base_url, f"job/{data['jobSeqNo']}/{slugify(title)}")
    if not url:
        url = source.get("url", "")
    url = urllib.parse.urljoin(source.get("url", ""), url)

    return Job(
        airline=source["airline"],
        source=source["name"],
        title=title,
        url=url,
        location=location,
        posted=posted,
        description=description,
        external_id=external_id,
        source_note=source.get("match_note", ""),
    )


def collect_phenom(source: dict[str, Any], session: requests.Session) -> list[Job]:
    response = fetch(session, source["url"])
    match = re.search(r"phApp\.ddo\s*=\s*(\{.*?\});\s*phApp\.", response.text, re.S)
    if not match:
        raise SourceError("could not find embedded Phenom job data")
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise SourceError(f"could not parse embedded Phenom JSON: {exc}") from exc

    jobs: dict[str, Job] = {}
    for item in walk_dicts(payload):
        if not any(key in item for key in ("jobSeqNo", "reqId", "jobId")):
            continue
        job = job_from_dict(item, source)
        if job:
            jobs[job.stable_id] = job
    return list(jobs.values())


def collect_workday(source: dict[str, Any], session: requests.Session) -> list[Job]:
    payload = {
        "appliedFacets": source.get("facets", {}),
        "limit": source.get("limit", 50),
        "offset": 0,
        "searchText": source.get("search_text", "flight attendant"),
    }
    response = fetch(session, source["endpoint"], method="POST", json_body=payload)
    try:
        data = response.json()
    except ValueError as exc:
        raise SourceError(f"could not parse Workday JSON: {exc}") from exc

    postings = data.get("jobPostings") or data.get("jobs") or []
    if not isinstance(postings, list):
        raise SourceError("Workday response did not include a postings list")
    jobs = [job_from_dict(item, source) for item in postings if isinstance(item, dict)]
    return [job for job in jobs if job]


def collect_rss(source: dict[str, Any], session: requests.Session) -> list[Job]:
    response = fetch(session, source["url"])
    try:
        root = ET.fromstring(response.content)
    except ET.ParseError as exc:
        raise SourceError(f"could not parse RSS/XML: {exc}") from exc

    jobs: list[Job] = []
    for item in root.findall(".//item"):
        title = normalize_text(item.findtext("title"))
        link = normalize_text(item.findtext("link")) or source["url"]
        description = normalize_text(item.findtext("description"))
        posted = normalize_text(item.findtext("pubDate"))
        if title:
            jobs.append(
                Job(
                    airline=source["airline"],
                    source=source["name"],
                    title=title,
                    url=link,
                    posted=posted,
                    description=description,
                    source_note=source.get("match_note", ""),
                )
            )
    return jobs


def collect_html(source: dict[str, Any], session: requests.Session) -> list[Job]:
    response = fetch(session, source["url"])
    soup = BeautifulSoup(response.text, "html.parser")
    jobs: dict[str, Job] = {}

    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        text = script.string or script.get_text()
        if not text:
            continue
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            continue
        for item in walk_dicts(payload):
            if item.get("@type") == "JobPosting":
                job = job_from_dict(item, source)
                if job:
                    jobs[job.stable_id] = job

    job_href_patterns = source.get(
        "job_href_contains",
        ["/job/", "jobid=", "jobId=", "OpportunityDetail", "/jobs/"],
    )
    blocked_anchor_terms = ("talent community", "job alert", "faq", "search jobs")
    for anchor in soup.find_all("a", href=True):
        href = urllib.parse.urljoin(source["url"], anchor["href"])
        anchor_text = normalize_text(anchor.get_text(" "))
        if not anchor_text:
            continue
        text_lower = anchor_text.lower()
        href_lower = href.lower()
        if any(term in text_lower for term in blocked_anchor_terms):
            continue
        if not any(pattern.lower() in href_lower for pattern in job_href_patterns):
            continue

        parent = anchor.find_parent(["article", "li", "section", "div"])
        context = normalize_text(parent.get_text(" ")) if parent else anchor_text
        title = anchor_text
        if source.get("prefer_parent_title"):
            heading = parent.find(["h1", "h2", "h3", "h4"]) if parent else None
            title = normalize_text(heading.get_text(" ")) if heading else title

        job = Job(
            airline=source["airline"],
            source=source["name"],
            title=title,
            url=href,
            location=context[:350],
            description=context[:1000],
            external_id=href,
            source_note=source.get("match_note", ""),
        )
        jobs[job.stable_id] = job

    return list(jobs.values())


def collect_static_apply(source: dict[str, Any], session: requests.Session) -> list[Job]:
    response = fetch(session, source["url"])
    soup = BeautifulSoup(response.text, "html.parser")

    title = source.get("default_title")
    if not title:
        heading = soup.find(["h1", "h2"])
        title = normalize_text(heading.get_text(" ")) if heading else normalize_text(soup.title)

    href_terms = source.get("apply_href_contains", ["apply", "opportunitydetail", "/jobs/"])
    text_terms = source.get("apply_text_contains", ["apply"])
    jobs: dict[str, Job] = {}
    page_text = normalize_text(soup.get_text(" "))
    for anchor in soup.find_all("a", href=True):
        href = urllib.parse.urljoin(source["url"], anchor["href"])
        anchor_text = normalize_text(anchor.get_text(" "))
        if not anchor_text:
            continue
        href_lower = href.lower()
        text_lower = anchor_text.lower()
        if not any(term.lower() in href_lower for term in href_terms):
            continue
        if not any(term.lower() in text_lower for term in text_terms):
            continue
        job = Job(
            airline=source["airline"],
            source=source["name"],
            title=title,
            url=href,
            location=source.get("location", ""),
            description=page_text[:1500],
            external_id=href,
            source_note=source.get("match_note", ""),
        )
        jobs[job.stable_id] = job
    return list(jobs.values())


COLLECTORS = {
    "html": collect_html,
    "phenom": collect_phenom,
    "rss": collect_rss,
    "static_apply": collect_static_apply,
    "workday": collect_workday,
}


def contains_any(text: str, terms: list[str]) -> bool:
    haystack = f" {text.lower()} "
    return any(term.lower() in haystack for term in terms)


def mentions_atlanta(text: str) -> bool:
    haystack = f" {text.lower()} "
    return any(term in haystack for term in ATLANTA_TERMS)


def is_matching_job(job: Job, source: dict[str, Any], config: dict[str, Any]) -> bool:
    match_config = config.get("match", {})
    title_terms = source.get("title_terms") or match_config.get("title_terms") or DEFAULT_TITLE_TERMS
    exclude_terms = (
        source.get("exclude_title_terms")
        or match_config.get("exclude_title_terms")
        or DEFAULT_EXCLUDE_TITLE_TERMS
    )

    title = job.title.lower()
    full_text = " ".join([job.title, job.location, job.description]).lower()

    if not contains_any(title, title_terms):
        return False
    if contains_any(title, exclude_terms):
        return False
    if source.get("require_atlanta", True):
        source_has_atl_base = bool(source.get("atl_base_airline"))
        if not source_has_atl_base and not mentions_atlanta(full_text):
            return False
    return True


def collect_matches(
    config: dict[str, Any],
    *,
    verbose: bool = False,
) -> tuple[list[Job], list[str], list[SourceReport]]:
    session = build_session()
    matches: dict[str, Job] = {}
    errors: list[str] = []
    reports: list[SourceReport] = []

    for source in config.get("sources", []):
        if not source.get("enabled", True):
            continue
        source_type = source.get("type", "html")
        collector = COLLECTORS.get(source_type)
        if not collector:
            error = f"{source.get('name', 'unknown source')}: unsupported type {source_type}"
            errors.append(error)
            reports.append(
                SourceReport(
                    name=source.get("name", "unknown source"),
                    airline=source.get("airline", "unknown airline"),
                    error=error,
                )
            )
            continue
        try:
            jobs = collector(source, session)
            matched = [job for job in jobs if is_matching_job(job, source, config)]
            reports.append(
                SourceReport(
                    name=source["name"],
                    airline=source["airline"],
                    collected=len(jobs),
                    matched=len(matched),
                )
            )
            if verbose:
                print(
                    f"{source['name']}: collected {len(jobs)} job(s), "
                    f"matched {len(matched)}",
                    file=sys.stderr,
                )
            for job in matched:
                matches[job.stable_id] = job
        except SourceError as exc:
            error = f"{source.get('name', 'unknown source')}: {exc}"
            errors.append(error)
            reports.append(
                SourceReport(
                    name=source.get("name", "unknown source"),
                    airline=source.get("airline", "unknown airline"),
                    error=str(exc),
                )
            )
        except Exception as exc:  # noqa: BLE001 - source failures should not stop all checks.
            error = f"{source.get('name', 'unknown source')}: unexpected error: {exc}"
            errors.append(error)
            reports.append(
                SourceReport(
                    name=source.get("name", "unknown source"),
                    airline=source.get("airline", "unknown airline"),
                    error=f"unexpected error: {exc}",
                )
            )

    return (
        sorted(matches.values(), key=lambda item: (item.airline, item.title, item.url)),
        errors,
        reports,
    )


def format_jobs(
    jobs: list[Job],
    errors: list[str] | None = None,
    reports: list[SourceReport] | None = None,
    *,
    include_source_status: bool = False,
) -> tuple[str, str]:
    subject = f"{len(jobs)} Atlanta flight-attendant opening{'s' if len(jobs) != 1 else ''} found"
    lines = [
        subject,
        "",
        "Matching postings:",
    ]
    if jobs:
        for job in jobs:
            lines.extend(
                [
                    "",
                    f"- {job.airline}: {job.title}",
                    f"  Location/base: {job.location or 'Atlanta/ATL base matched by source settings'}",
                    f"  Posted: {job.posted or 'not listed'}",
                    f"  Apply: {job.url}",
                ]
            )
            if job.source_note:
                lines.append(f"  Note: {job.source_note}")
    else:
        lines.extend(["", "- No matching Atlanta/ATL flight-attendant postings found."])
    if include_source_status and reports:
        lines.extend(["", "Airline source status:"])
        for report in reports:
            if report.error:
                status = f"WARNING: {report.error}"
            elif report.matched:
                status = f"OPEN: {report.matched} matching posting(s)"
            else:
                status = f"No matching posting ({report.collected} job(s) collected)"
            lines.append(f"- {report.airline}: {status}")
    if errors:
        lines.extend(["", "Source warnings:"])
        lines.extend(f"- {error}" for error in errors)
    return subject, "\n".join(lines)


def send_email(subject: str, body: str) -> None:
    host = os.getenv("SMTP_HOST")
    recipients = [part.strip() for part in os.getenv("NOTIFY_EMAIL_TO", "").split(",") if part.strip()]
    if not recipients:
        raise RuntimeError("NOTIFY_EMAIL_TO is required for email notifications")
    if not host:
        raise RuntimeError("SMTP_HOST is required for email notifications")

    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM") or username
    if not sender:
        raise RuntimeError("SMTP_FROM or SMTP_USERNAME is required for email notifications")
    if username and not password:
        raise RuntimeError("SMTP_PASSWORD is required when SMTP_USERNAME is set")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message.set_content(body)

    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=30) as smtp:
        if os.getenv("SMTP_USE_TLS", "1") not in ("0", "false", "False"):
            smtp.starttls(context=context)
        if username and password:
            smtp.login(username, password)
        smtp.send_message(message)


def email_report(subject: str, body: str) -> None:
    print(body)
    send_email(subject, body)


def send_current_availability_report(args: argparse.Namespace) -> int:
    config = load_json(args.config)
    jobs, errors, reports = collect_matches(config, verbose=args.verbose)
    subject, body = format_jobs(jobs, errors, reports, include_source_status=True)
    subject = "Atlanta flight-attendant availability report: " + subject
    if args.dry_run:
        print(body)
        return 0
    email_report(subject, body)
    return 0


def run_once(args: argparse.Namespace) -> int:
    config = load_json(args.config)
    state = load_json(args.state, {"seen": {}})
    state.setdefault("seen", {})

    jobs, errors, reports = collect_matches(config, verbose=args.verbose)
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    new_jobs = [job for job in jobs if job.stable_id not in state["seen"]]

    for job in jobs:
        previous = state["seen"].get(job.stable_id, {})
        state["seen"][job.stable_id] = {
            "airline": job.airline,
            "title": job.title,
            "url": job.url,
            "first_seen": previous.get("first_seen", now),
            "last_seen": now,
        }
    state["last_checked"] = now
    state["last_errors"] = errors

    if args.prime:
        save_json(args.state, state)
        print(f"Primed state with {len(jobs)} matching posting(s); no notifications sent.")
        if errors:
            print("Source warnings:", file=sys.stderr)
            for error in errors:
                print(f"- {error}", file=sys.stderr)
        return 0

    if new_jobs and not args.dry_run:
        subject, body = format_jobs(new_jobs, errors, reports)
        email_report(subject, body)
    elif new_jobs:
        subject, body = format_jobs(new_jobs, errors, reports)
        print(body)
    elif args.notify_on_errors and errors and not args.dry_run:
        subject = "Flight-attendant monitor source warning"
        body = "No new matching jobs were found, but one or more sources had warnings:\n\n"
        body += "\n".join(f"- {error}" for error in errors)
        email_report(subject, body)
    else:
        print(f"No new matching postings. {len(jobs)} matching posting(s) already seen.")
        if errors:
            print("Source warnings:", file=sys.stderr)
            for error in errors:
                print(f"- {error}", file=sys.stderr)

    if not args.dry_run:
        save_json(args.state, state)
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--daemon", action="store_true", help="run forever and check on an interval")
    parser.add_argument(
        "--interval",
        type=int,
        default=int(os.getenv("CHECK_INTERVAL_SECONDS", "3600")),
        help="seconds between checks in daemon mode",
    )
    parser.add_argument("--prime", action="store_true", help="record current matches without notifying")
    parser.add_argument("--dry-run", action="store_true", help="do not write state or send notifications")
    parser.add_argument("--verbose", action="store_true", help="print per-source collection counts")
    parser.add_argument(
        "--notify-on-errors",
        action="store_true",
        default=os.getenv("NOTIFY_ON_ERRORS", "").lower() in ("1", "true", "yes"),
        help="send a notification when sources fail even if there are no new jobs",
    )
    parser.add_argument("--list-sources", action="store_true", help="print enabled sources and exit")
    parser.add_argument(
        "--email-report",
        action="store_true",
        help="email a current availability report and exit without changing seen state",
    )
    parser.add_argument(
        "--test-email",
        action="store_true",
        help="alias for --email-report",
    )
    return parser.parse_args()


def main() -> int:
    load_env_file(Path.cwd() / ".env")
    load_env_file(Path(__file__).with_name(".env"))
    args = parse_args()

    try:
        if args.list_sources:
            config = load_json(args.config)
            for source in config.get("sources", []):
                status = "enabled" if source.get("enabled", True) else "disabled"
                print(f"{source['name']} ({source.get('type', 'html')}, {status}) - {source['url']}")
            return 0

        if args.email_report or args.test_email:
            return send_current_availability_report(args)

        if not args.daemon:
            return run_once(args)

        while True:
            try:
                run_once(args)
            except Exception as exc:  # noqa: BLE001 - keep long-running monitor alive.
                print(f"monitor run failed: {exc}", file=sys.stderr)
            time.sleep(max(args.interval, 60))
    except RuntimeError as exc:
        print(f"Email not sent: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
