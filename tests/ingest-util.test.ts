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
