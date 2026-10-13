import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations, summaryOutputText } from "../scripts/ingest/guard";

const summarize = (bullets: string[], why: string) =>
  summaryOutputText(bullets, why);

test("an invented multi-word name is flagged", () => {
  const violations = findViolations(
    summarize(["Quantum Dynamics acquired ACME Corp for $5 billion."], "Big news."),
    "Nothing unusual was reported about the acquisition. ACME Corp was mentioned once in passing.",
  );
  assert.ok(violations.some((violation) => violation.token === "Quantum Dynamics"));
});

test("a name present in the source passes", () => {
  const violations = findViolations(
    summarize(["Apple unveiled the HomeView at its October event."], "Smart home push."),
    "Apple unveiled the HomeView during its October event in Cupertino.",
  );
  assert.deepEqual(violations, []);
});

test("numbers match by value across notations", () => {
  // "$10M" in output vs "10 million" in source must pass.
  const violations = findViolations(
    summarize(["The deal was worth $10M in total."], "A costly acquisition."),
    "Sources say the deal was worth 10 million dollars in total.",
  );
  assert.deepEqual(violations, []);
});

test("an unsupported number is flagged", () => {
  const violations = findViolations(
    summarize(["The stadium holds 92,000 fans."], "A big venue."),
    "The stadium cost a lot to build and opened last year.",
  );
  assert.ok(violations.some((violation) => violation.kind === "number"));
});

test("possessive and hyphen variants match the source", () => {
  const violations = findViolations(
    summarize(["Apple's high-speed chip powers the device."], "Fast."),
    "The device runs on an Apple high speed chip built in Austin.",
  );
  assert.deepEqual(violations, []);
});

test("a same-sentence non-contiguous join is accepted", () => {
  // "SimpleClosure ... Its Asset Hub" in source vs "SimpleClosure's Asset Hub".
  const violations = findViolations(
    summarize(["SimpleClosure's Asset Hub closed 150 deals."], "Startup wind-downs."),
    "The sale was brokered by SimpleClosure. Its Asset Hub has handled over 150 deals and expects to return over $10 million.",
  );
  assert.deepEqual(violations, []);
});

test("names on separate lines cannot merge into a fake name", () => {
  const violations = findViolations(
    "Startup Battlefield\nAttendees got free coffee.",
    "Startup Battlefield finals happened today. Attendees got free coffee.",
  );
  assert.deepEqual(violations, []);
});
