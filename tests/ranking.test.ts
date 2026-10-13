import { test } from "node:test";
import assert from "node:assert/strict";
import { rankArticles } from "../src/lib/ranking";

const base = { publishedAt: new Date().toISOString() };

test("interest match boosts and explains the card", () => {
  const [top] = rankArticles(
    [
      { id: "tech-1", topic: "Technology", ...base },
      { id: "sport-1", topic: "Sports", ...base },
    ],
    { interests: ["Technology"], likedTopics: {}, negativeTopics: {} },
  );
  assert.equal(top.article.id, "tech-1");
  assert.equal(top.reason, "Because you follow Technology");
});

test("newer article wins within the same topic", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const ranked = rankArticles(
    [
      { id: "old", topic: "AI", publishedAt: "2026-10-10T12:00:00Z" },
      { id: "new", topic: "AI", publishedAt: "2026-10-13T10:00:00Z" },
    ],
    { interests: ["AI"], likedTopics: {}, negativeTopics: {} },
    now,
  );
  assert.equal(ranked[0].article.id, "new");
});

test("negative signals demote a topic and hide the reason", () => {
  const ranked = rankArticles(
    [
      { id: "ai-1", topic: "AI", ...base },
      { id: "sci-1", topic: "Science", ...base },
    ],
    {
      interests: ["AI", "Science"],
      likedTopics: {},
      negativeTopics: { AI: 1 },
    },
  );
  assert.equal(ranked[0].article.id, "sci-1");
  assert.equal(ranked.find((entry) => entry.article.id === "ai-1")?.reason, null);
});

test("a fresh user with no history still gets a useful order", () => {
  const ranked = rankArticles(
    [
      { id: "a", topic: "World", ...base },
      { id: "b", topic: "Culture", ...base },
    ],
    { interests: [], likedTopics: {}, negativeTopics: {} },
  );
  assert.equal(ranked.length, 2);
  assert.ok(ranked[0].score > 0);
});

test("articles the user already engaged with sink", () => {
  const ranked = rankArticles(
    [
      { id: "seen", topic: "AI", ...base },
      { id: "fresh", topic: "AI", ...base },
    ],
    {
      interests: ["AI"],
      likedTopics: {},
      negativeTopics: {},
      seenIds: new Set(["seen"]),
    },
  );
  assert.equal(ranked[0].article.id, "fresh");
});

test("missing dates count as old, not newest", () => {
  const ranked = rankArticles(
    [
      { id: "undated", topic: "AI", publishedAt: null },
      { id: "dated", topic: "AI", ...base },
    ],
    { interests: ["AI"], likedTopics: {}, negativeTopics: {} },
  );
  assert.equal(ranked[0].article.id, "dated");
});
