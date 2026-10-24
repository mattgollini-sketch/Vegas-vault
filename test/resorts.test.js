const test = require("node:test");
const assert = require("node:assert/strict");
const resorts = require("../public/resorts");

test("fuzzy names match the resort, including hotel and casino wording", () => {
  assert.equal(resorts.matchResort("Bellagio Hotel & Casino").id, "bellagio");
  assert.equal(resorts.matchResort("the venetian resort").id, "venetian");
  assert.equal(resorts.matchResort("Palazzo").id, "venetian");
  assert.equal(resorts.matchResort("Encore Beach Club").id, "wynn");
  assert.equal(resorts.matchResort("Wynn Las Vegas").id, "wynn");
  assert.equal(resorts.matchResort("Planet Hollywood Resort & Casino").id, "planet-hollywood");
  assert.equal(resorts.matchResort("MGM Grand Hotel").id, "mgm-grand");
  assert.equal(resorts.matchResort("Park MGM").id, "park-mgm");
  assert.equal(resorts.matchResort("New York-New York").id, "new-york-new-york");
  assert.equal(resorts.matchResort("Fontainebleau Las Vegas").id, "fontainebleau");
  assert.equal(resorts.matchResort("Resorts World Las Vegas").id, "resorts-world");
  assert.equal(resorts.matchResort("the cosmo").id, "cosmopolitan");
  assert.equal(resorts.matchResort("Bally's Las Vegas").id, "horseshoe");
});

test("unrelated places are not treated as resorts", () => {
  assert.equal(resorts.matchResort("Carbone"), null);
  assert.equal(resorts.matchResort("Grand Canyon tour"), null);
  assert.equal(resorts.matchResort("Harry Reid International Airport"), null);
  assert.equal(resorts.matchResort(""), null);
  assert.equal(resorts.matchPlace("dinner", "Flamingo Road, Las Vegas"), null);
});

test("the longer resort name wins when two names could overlap", () => {
  assert.equal(resorts.matchResort("Park MGM").id, "park-mgm");
  assert.equal(resorts.matchResort("The Signature at MGM Grand").id, "mgm-grand");
  assert.equal(resorts.matchResort("Caesars Palace").id, "caesars-palace");
  assert.equal(resorts.matchPlace("Vdara Hotel & Spa at ARIA", "").id, "vdara");
});

test("a trip lists each matching resort once", () => {
  const list = resorts.resortsForTrip(
    { name: "Bellagio Hotel & Casino", address: "3600 S Las Vegas Blvd" },
    [
      { name: "O by Cirque at Bellagio", address: "" },
      { name: "Carbone", address: "ARIA Resort" },
      { name: "Dinner at The Palazzo", address: "" },
    ]
  );
  assert.deepEqual(list.map((resort) => resort.id), ["bellagio", "aria", "venetian"]);
});

test("verified map links stay on official domains", () => {
  const bellagio = resorts.propertyMapLink(resorts.matchResort("Bellagio Hotel & Casino"));
  assert.equal(bellagio.kind, "map");
  assert.equal(bellagio.label, "Property map");
  assert.equal(new URL(bellagio.href).hostname, "bellagio.mgmresorts.com");
  assert.match(bellagio.href, /\.pdf$/);

  const venetian = resorts.linkForPlace("The Palazzo", "");
  assert.equal(venetian.resortId, "venetian");
  assert.equal(venetian.kind, "map");
  assert.equal(new URL(venetian.href).hostname, "www.venetianlasvegas.com");

  const wynn = resorts.linkForPlace("Encore", "");
  assert.equal(wynn.kind, "map");
  assert.equal(new URL(wynn.href).hostname, "www.wynnlasvegas.com");

  const paris = resorts.linkForPlace("Paris Las Vegas", "");
  assert.equal(paris.kind, "map");
  assert.equal(new URL(paris.href).hostname, "assets.caesars.com");

  const rw = resorts.linkForPlace("Resorts World", "");
  assert.equal(rw.kind, "map");
  assert.equal(new URL(rw.href).hostname, "www.rwlasvegas.com");

  const fb = resorts.linkForPlace("Fontainebleau", "");
  assert.equal(fb.kind, "map");
  assert.equal(new URL(fb.href).hostname, "www.fontainebleaulasvegas.com");
});

test("resorts without a confirmed map fall back to the homepage or a maps search", () => {
  const aria = resorts.linkForPlace("ARIA Resort & Casino", "");
  assert.equal(aria.kind, "home");
  assert.equal(new URL(aria.href).hostname, "aria.mgmresorts.com");

  const caesars = resorts.linkForPlace("Caesars Palace", "3570 Las Vegas Blvd");
  assert.equal(caesars.kind, "search");
  assert.equal(caesars.label, "Property map");
  const search = new URL(caesars.href);
  assert.equal(search.hostname, "www.google.com");
  assert.ok(search.pathname.startsWith("/maps/search"));
  assert.match(decodeURIComponent(search.search), /Caesars Palace/);

  const flamingo = resorts.linkForPlace("Flamingo Las Vegas", "");
  assert.equal(flamingo.kind, "search");
  const planet = resorts.linkForPlace("Planet Hollywood", "");
  assert.equal(planet.kind, "search");
});

test("every shipped link is an official brand URL or a Google Maps search", () => {
  resorts.RESORTS.forEach((resort) => {
    const link = resorts.propertyMapLink(resort);
    assert.equal(resorts.linkIsAllowed(link), true, `${resort.id} ${link.href}`);
    const host = new URL(link.href).hostname;
    assert.equal(resorts.isBlockedHost(host), false, host);
    assert.doesNotMatch(link.href, /contentstack|giecdn|blob\.core\.windows|mappedin|cloudinary/i);
  });
});
