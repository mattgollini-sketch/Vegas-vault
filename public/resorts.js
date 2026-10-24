"use strict";

// Shared by the browser and the Node tests.
// Links only. This file does not copy, host, or embed resort map images or PDFs.
// Map and homepage URLs were checked on Oct 24, 2026. A map URL is used only when
// the page or PDF loaded and the final host was the resort or its brand. A PDF
// that redirects onto a third-party CDN is not used. If no official map loaded,
// the link is the resort homepage when that loaded, otherwise a Google Maps search.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VegasResorts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const OFFICIAL_SUFFIXES = [
    "mgmresorts.com",
    "venetianlasvegas.com",
    "wynnlasvegas.com",
    "wynnresorts.com",
    "caesars.com",
    "rwlasvegas.com",
    "fontainebleaulasvegas.com",
    "treasureisland.com",
    "circuscircus.com",
  ];

  const BLOCKED_HOST_MARKERS = [
    "contentstack.io",
    "giecdn",
    "blob.core.windows.net",
    "mappedin.com",
    "cloudinary.com",
  ];

  // mapUrl: official property map page or PDF that loaded on a brand domain.
  // homeUrl: official homepage that loaded, used only when mapUrl is absent.
  const RESORTS = [
    {
      id: "bellagio",
      name: "Bellagio",
      aliases: ["bellagio"],
      mapUrl: "https://bellagio.mgmresorts.com/content/dam/MGM/bellagio/meetings/bellagio-meetings-property-map.pdf",
    },
    {
      id: "aria",
      name: "ARIA",
      aliases: ["aria"],
      homeUrl: "https://aria.mgmresorts.com/",
    },
    {
      id: "mgm-grand",
      name: "MGM Grand",
      aliases: ["mgm grand"],
      homeUrl: "https://mgmgrand.mgmresorts.com/",
    },
    {
      id: "mandalay-bay",
      name: "Mandalay Bay",
      aliases: ["mandalay bay", "mandalay"],
      homeUrl: "https://mandalaybay.mgmresorts.com/",
    },
    {
      id: "luxor",
      name: "Luxor",
      aliases: ["luxor"],
      homeUrl: "https://luxor.mgmresorts.com/",
    },
    {
      id: "excalibur",
      name: "Excalibur",
      aliases: ["excalibur"],
      homeUrl: "https://excalibur.mgmresorts.com/",
    },
    {
      id: "park-mgm",
      name: "Park MGM",
      aliases: ["park mgm"],
      homeUrl: "https://parkmgm.mgmresorts.com/",
    },
    {
      id: "new-york-new-york",
      name: "New York-New York",
      aliases: ["new york new york", "new york-new york"],
      homeUrl: "https://newyorknewyork.mgmresorts.com/",
    },
    {
      id: "vdara",
      name: "Vdara",
      aliases: ["vdara"],
      homeUrl: "https://vdara.mgmresorts.com/",
    },
    {
      id: "cosmopolitan",
      name: "The Cosmopolitan",
      aliases: ["cosmopolitan", "cosmo"],
      mapUrl: "https://cosmopolitanlasvegas.mgmresorts.com/en/resort-maps.html",
    },
    {
      id: "venetian",
      name: "The Venetian and The Palazzo",
      aliases: ["the palazzo", "palazzo", "the venetian", "venetian"],
      mapUrl: "https://www.venetianlasvegas.com/content/dam/vlv/resort/map.pdf",
    },
    {
      id: "wynn",
      name: "Wynn and Encore",
      aliases: ["encore", "wynn"],
      mapUrl: "https://www.wynnlasvegas.com/meetings/resort-maps",
    },
    {
      id: "caesars-palace",
      name: "Caesars Palace",
      aliases: ["caesars palace", "caesars"],
      // The indexed property-map PDF on caesars.com did not return the file
      // (bot wall / error). No other official map URL could be confirmed.
    },
    {
      id: "paris",
      name: "Paris Las Vegas",
      aliases: ["paris las vegas", "paris hotel", "paris"],
      mapUrl: "https://assets.caesars.com/m/1fbb575399575a44/original/Paris-Las-Vegas-Meeting-Facilities-Map-and-Capacities.pdf",
      mapNote: "Official meeting-facilities map",
    },
    {
      id: "planet-hollywood",
      name: "Planet Hollywood",
      aliases: ["planet hollywood"],
    },
    {
      id: "flamingo",
      name: "Flamingo",
      aliases: ["flamingo las vegas", "the flamingo", "flamingo"],
    },
    {
      id: "horseshoe",
      name: "Horseshoe Las Vegas",
      aliases: ["horseshoe", "ballys"],
    },
    {
      id: "resorts-world",
      name: "Resorts World",
      aliases: ["resorts world", "rw las vegas"],
      mapUrl: "https://www.rwlasvegas.com/map/",
    },
    {
      id: "fontainebleau",
      name: "Fontainebleau",
      aliases: ["fontainebleau"],
      mapUrl: "https://www.fontainebleaulasvegas.com/resort-map/",
    },
    {
      id: "treasure-island",
      name: "Treasure Island",
      aliases: ["treasure island", "ti las vegas"],
      mapUrl: "https://treasureisland.com/hotel/property-map",
    },
    {
      id: "circus-circus",
      name: "Circus Circus",
      aliases: ["circus circus"],
      homeUrl: "https://www.circuscircus.com/",
    },
  ];

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokensOf(value) {
    const text = normalize(value);
    return text ? text.split(" ") : [];
  }

  function phraseAt(textTokens, phraseTokens) {
    if (!phraseTokens.length || phraseTokens.length > textTokens.length) return -1;
    for (let i = 0; i <= textTokens.length - phraseTokens.length; i += 1) {
      let matches = true;
      for (let j = 0; j < phraseTokens.length; j += 1) {
        if (textTokens[i + j] !== phraseTokens[j]) {
          matches = false;
          break;
        }
      }
      if (matches) return i;
    }
    return -1;
  }

  // Flamingo Road is the street in front of Caesars Palace, not the Flamingo resort.
  function cleanAddress(address) {
    return normalize(address).replace(/\bflamingo rd\b/g, " ").replace(/\bflamingo road\b/g, " ").replace(/\s+/g, " ").trim();
  }

  function matchResort(text) {
    const textTokens = tokensOf(text);
    if (!textTokens.length) return null;
    let best = null;
    RESORTS.forEach((resort) => {
      resort.aliases.forEach((alias) => {
        const phrase = tokensOf(alias);
        const index = phraseAt(textTokens, phrase);
        if (index < 0) return;
        if (!best || phrase.length > best.score || (phrase.length === best.score && index < best.index)) {
          best = { resort, score: phrase.length, index };
        }
      });
    });
    return best ? best.resort : null;
  }

  function matchPlace(name, address) {
    return matchResort(name) || matchResort(cleanAddress(address));
  }

  function hostnameOf(href) {
    try {
      const url = new URL(href);
      if (url.protocol !== "https:") return "";
      return url.hostname.toLowerCase().replace(/\.$/, "");
    } catch (e) {
      return "";
    }
  }

  function hostMatches(hostname, suffix) {
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }

  function isOfficialHost(hostname) {
    return OFFICIAL_SUFFIXES.some((suffix) => hostMatches(hostname, suffix));
  }

  function isBlockedHost(hostname) {
    return BLOCKED_HOST_MARKERS.some((marker) => hostname === marker || hostname.endsWith(`.${marker}`) || hostname.includes(marker));
  }

  function isMapsSearch(href) {
    const host = hostnameOf(href);
    if (host !== "www.google.com" && host !== "maps.google.com") return false;
    try {
      return new URL(href).pathname.startsWith("/maps/search");
    } catch (e) {
      return false;
    }
  }

  function propertyMapLink(resort) {
    if (!resort) return null;
    if (resort.mapUrl && isOfficialHost(hostnameOf(resort.mapUrl)) && !isBlockedHost(hostnameOf(resort.mapUrl))) {
      return {
        href: resort.mapUrl,
        label: "Property map",
        kind: "map",
        note: resort.mapNote || "Official property map",
        resortId: resort.id,
        resortName: resort.name,
      };
    }
    if (resort.homeUrl && isOfficialHost(hostnameOf(resort.homeUrl)) && !isBlockedHost(hostnameOf(resort.homeUrl))) {
      return {
        href: resort.homeUrl,
        label: "Property map",
        kind: "home",
        note: "Official resort website. No public floor map was found.",
        resortId: resort.id,
        resortName: resort.name,
      };
    }
    const query = encodeURIComponent(`${resort.name} Las Vegas`);
    return {
      href: `https://www.google.com/maps/search/?api=1&query=${query}`,
      label: "Property map",
      kind: "search",
      note: "Google Maps search. No official map page was found.",
      resortId: resort.id,
      resortName: resort.name,
    };
  }

  function linkForPlace(name, address) {
    return propertyMapLink(matchPlace(name, address));
  }

  function resortsForTrip(hotel, reservations) {
    const found = [];
    const seen = new Set();
    function add(name, address) {
      const resort = matchPlace(name, address);
      if (!resort || seen.has(resort.id)) return;
      seen.add(resort.id);
      found.push(resort);
    }
    if (hotel) add(hotel.name, hotel.address);
    (reservations || []).forEach((item) => add(item && item.name, item && item.address));
    return found;
  }

  function linkIsAllowed(link) {
    if (!link || !link.href) return false;
    const host = hostnameOf(link.href);
    if (!host || isBlockedHost(host)) return false;
    if (link.kind === "search") return isMapsSearch(link.href);
    return isOfficialHost(host);
  }

  return {
    RESORTS,
    OFFICIAL_SUFFIXES,
    normalize,
    matchResort,
    matchPlace,
    propertyMapLink,
    linkForPlace,
    resortsForTrip,
    linkIsAllowed,
    isOfficialHost,
    isBlockedHost,
  };
});
