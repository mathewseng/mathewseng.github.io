import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScoreControl } from "../src/components/ScoreControl";
import type { Scale0To6 } from "../src/lib/types";
import { HashRouter, Link, useLocation } from "../src/router";

function ScoreHarness() {
  const [score, setScore] = useState<Scale0To6>(2);
  return (
    <ScoreControl
      id="test-illness"
      label="Illness impact"
      value={score}
      onChange={setScore}
      lowLabel="none"
      highLabel="severe"
      direction="negative"
    />
  );
}

function RouterHarness() {
  const location = useLocation();
  return (
    <>
      <p data-testid="path">{location.pathname}</p>
      <Link to="/workouts?date=2026-07-28">Calendar</Link>
    </>
  );
}

describe("interactive UI", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("records workout context only as one of the seven numeric 0–6 choices", async () => {
    const user = userEvent.setup();
    render(<ScoreHarness />);

    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("2");
    await user.click(screen.getByRole("radio", { name: "6" }));
    expect(screen.getByRole("radio", { checked: true })).toHaveTextContent("6");
    expect(screen.getByText("6 · severe")).toBeVisible();
  });

  it("navigates through a static-safe hash URL", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/";
    render(
      <HashRouter>
        <RouterHarness />
      </HashRouter>,
    );

    await user.click(screen.getByRole("link", { name: "Calendar" }));
    expect(await screen.findByTestId("path")).toHaveTextContent("/workouts");
    expect(window.location.hash).toBe("#/workouts?date=2026-07-28");
  });
});
