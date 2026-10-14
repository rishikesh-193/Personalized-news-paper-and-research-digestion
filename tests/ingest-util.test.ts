import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeHtmlEntities, normalizeTitle, normalizeUrl } from "../scripts/ingest/util";

test("numeric entities are decoded, decimal and hex", () => {
  assert.equal(decodeHtmlEntities("Apple&#8217;s HomeView"), "Apple’s HomeView");
  assert.equal(decodeHtmlEntities("Apple&#x2019;s HomeView"), "Apple’s HomeView");
  assert.equal(decodeHtmlEntities("1 &lt; 2 &gt; 0"), "1 < 2 > 0");
});

test("named entities are decoded, case-insensitively", () => {
  assert.equal(decodeHtmlEntities("Tom &amp; Jerry"), "Tom & Jerry");
  assert.equal(decodeHtmlEntities("Wait&hellip;"), "Wait…");
  assert.equal(decodeHtmlEntities("a&MDASH;b"), "a—b");
  assert.equal(decodeHtmlEntities("&quot;quoted&quot;"), '"quoted"');
});

test("unknown or malformed entities are left exactly as they are", () => {
  assert.equal(decodeHtmlEntities("&notarealentity;"), "&notarealentity;");
  assert.equal(decodeHtmlEntities("&#notanumber;"), "&#notanumber;");
  assert.equal(decodeHtmlEntities("AT&T & R&D"), "AT&T & R&D");
  assert.equal(decodeHtmlEntities("100% &"), "100% &");
  assert.equal(decodeHtmlEntities(""), "");
});

test("decoding is idempotent for realistic feed text", () => {
  const once = decodeHtmlEntities("Apple&#8217;s &amp; Microsoft&#39;s deal");
  assert.equal(once, "Apple’s & Microsoft's deal");
  assert.equal(decodeHtmlEntities(once), once);
});

test("title normalization is entity-insensitive for dedupe", () => {
  assert.equal(
    normalizeTitle(decodeHtmlEntities("Apple&#8217;s HomeView")),
    normalizeTitle("Apple’s HomeView"),
  );
});

test("url normalization strips tracking parameters and fragments", () => {
  assert.equal(
    normalizeUrl("https://example.org/story?utm_source=x&id=7#top"),
    "https://example.org/story?id=7",
  );
  assert.equal(normalizeUrl("not a url"), null);
});

test("click-tracking parameters do not create duplicate articles", () => {
  // The same story must normalize identically however it was shared, or the
  // pipeline re-summarizes and re-stores it as if it were new.
  const canonical = "https://example.org/story";
  const shared = [
    "https://example.org/story?fbclid=abc123",
    "https://example.org/story?gclid=xyz",
    "https://example.org/story?utm_campaign=x&mc_cid=9",
    "https://example.org/story?_hsenc=p2ANqtz",
    "https://example.org/story?igshid=1a2b3c",
  ];
  for (const url of shared) {
    assert.equal(normalizeUrl(url), canonical, url);
  }
});

test("a decorative trailing slash is not a different article", () => {
  assert.equal(normalizeUrl("https://example.org/story/"), "https://example.org/story");
  assert.equal(normalizeUrl("https://example.org/"), "https://example.org/");
  assert.equal(
    normalizeUrl("https://example.org/story/?utm_source=x"),
    "https://example.org/story",
  );
});

test("meaningful query strings survive normalization", () => {
  // Only known tracking keys are removed — `id` and friends identify content.
  assert.equal(
    normalizeUrl("https://example.org/read?id=42&page=2"),
    "https://example.org/read?id=42&page=2",
  );
  assert.equal(
    normalizeUrl("https://news.example.com/rss/articles/CBMiUk?oc=5"),
    "https://news.example.com/rss/articles/CBMiUk?oc=5",
  );
});
