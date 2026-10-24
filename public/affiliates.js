"use strict";

// Shared by the browser and the Node tests. Affiliate IDs come from the
// server environment. An empty value keeps the plain search link.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VegasAffiliates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DISCLOSURE =
    "Some Book links are affiliate links. If you book through them, Vegas Vault may earn a commission at no extra cost to you.";

  function cleanId(value) {
    const text = String(value || "").trim();
    if (!text || text.length > 80) return "";
    if (!/^[A-Za-z0-9_-]+$/.test(text)) return "";
    return text;
  }

  function configFromEnv(env) {
    const source = env || {};
    return {
      bookingAid: cleanId(source.BOOKING_AFFILIATE_ID),
      expediaAffcid: cleanId(source.EXPEDIA_AFFILIATE_ID),
      viatorPid: cleanId(source.VIATOR_PARTNER_ID),
      getYourGuidePartnerId: cleanId(source.GETYOURGUIDE_PARTNER_ID),
      ticketmasterPublisherId: cleanId(source.TICKETMASTER_IMPACT_PUBLISHER_ID),
      ticketmasterAdId: cleanId(source.TICKETMASTER_IMPACT_AD_ID),
      openTableRef: cleanId(source.OPENTABLE_REF),
    };
  }

  function hasAny(config) {
    const cfg = config || {};
    const ticketmaster = Boolean(cfg.ticketmasterPublisherId && cfg.ticketmasterAdId);
    return Boolean(
      cfg.bookingAid || cfg.expediaAffcid || cfg.viatorPid || cfg.getYourGuidePartnerId || ticketmaster || cfg.openTableRef
    );
  }

  function placeName(value) {
    const text = String(value || "").trim();
    return text || "Las Vegas";
  }

  function ticketmasterUrl(query, config) {
    const plain = `https://www.ticketmaster.com/search?q=${encodeURIComponent(placeName(query))}`;
    const cfg = config || {};
    if (cfg.ticketmasterPublisherId && cfg.ticketmasterAdId) {
      return `https://ticketmaster.evyy.net/c/${cfg.ticketmasterPublisherId}/${cfg.ticketmasterAdId}/${encodeURIComponent(plain)}`;
    }
    return plain;
  }

  function hotelLinks(place, config) {
    const cfg = config || {};
    const booking = new URL("https://www.booking.com/searchresults.html");
    booking.searchParams.set("ss", placeName(place));
    if (cfg.bookingAid) booking.searchParams.set("aid", cfg.bookingAid);

    const expedia = new URL("https://www.expedia.com/Hotel-Search");
    expedia.searchParams.set("destination", placeName(place));
    if (cfg.expediaAffcid) expedia.searchParams.set("affcid", cfg.expediaAffcid);

    return [
      { href: booking.toString(), label: "Booking.com", kind: "hotel" },
      { href: expedia.toString(), label: "Expedia", kind: "hotel" },
    ];
  }

  function experienceLinks(place, config) {
    const cfg = config || {};
    const name = placeName(place);
    const viator = new URL("https://www.viator.com/searchResults/all");
    viator.searchParams.set("text", name);
    if (cfg.viatorPid) {
      viator.searchParams.set("pid", cfg.viatorPid);
      viator.searchParams.set("medium", "link");
    }

    const guide = new URL("https://www.getyourguide.com/s/");
    guide.searchParams.set("q", name);
    if (cfg.getYourGuidePartnerId) guide.searchParams.set("partner_id", cfg.getYourGuidePartnerId);

    return [
      { href: viator.toString(), label: "Viator", kind: "experience" },
      { href: guide.toString(), label: "GetYourGuide", kind: "experience" },
      { href: ticketmasterUrl(name, cfg), label: "Ticketmaster", kind: "tickets" },
    ];
  }

  function restaurantLinks(place, config) {
    const cfg = config || {};
    const name = placeName(place);
    const openTable = new URL("https://www.opentable.com/s");
    openTable.searchParams.set("term", `${name} Las Vegas`);
    if (cfg.openTableRef) openTable.searchParams.set("ref", cfg.openTableRef);

    const resy = new URL("https://resy.com/cities/las-vegas-nv");
    resy.searchParams.set("query", name);

    return [
      { href: openTable.toString(), label: "OpenTable", kind: "restaurant" },
      { href: resy.toString(), label: "Resy", kind: "restaurant" },
    ];
  }

  function linksForReservation(item, config) {
    const name = placeName(item && item.name);
    const query = `${name} Las Vegas`;
    if (!item) return [];
    if (item.category === "restaurants") return restaurantLinks(name, config);
    if (item.category === "shows" || item.category === "tours") return experienceLinks(query, config);
    if (item.category === "nightclubs") return [{ href: ticketmasterUrl(query, config), label: "Ticketmaster", kind: "tickets" }];
    return [];
  }

  function bookSuggestion(category) {
    if (category === "hotel") return "Book a room";
    if (category === "restaurants") return "Reserve a table";
    if (category === "shows" || category === "nightclubs") return "Book tickets";
    if (category === "tours") return "Book this tour";
    return "";
  }

  return {
    DISCLOSURE,
    configFromEnv,
    hasAny,
    hotelLinks,
    experienceLinks,
    restaurantLinks,
    linksForReservation,
    ticketmasterUrl,
    bookSuggestion,
  };
});
