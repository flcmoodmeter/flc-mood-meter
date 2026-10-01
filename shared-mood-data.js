/* shared-mood-data.js
 * -----------------------------------------------------------------------
 * CSV parsing / row-building logic shared between dashboard.html and
 * display.html, so "this week" or "Innovation Center" mean exactly the
 * same thing on both screens. This mirrors dashboard.html's own internal
 * parsing (same column names, same quadrant grid, same Los Rios semester
 * calendar) but is kept as its own independent copy — dashboard.html does
 * not load this file and is not touched by it, so nothing here can affect
 * the analyst dashboard. Exposes everything as window.MoodData.
 * ----------------------------------------------------------------------- */
(function (global) {
  "use strict";

  var QUAD_INFO = {
    1: { energy: "High", pleasant: "Pleasant",   name: "High Energy, Pleasant",   color: "#facc15" },
    2: { energy: "Low",  pleasant: "Unpleasant", name: "Low Energy, Unpleasant",  color: "#3b82f6" },
    3: { energy: "High", pleasant: "Unpleasant", name: "High Energy, Unpleasant", color: "#ef4444" },
    4: { energy: "Low",  pleasant: "Pleasant",   name: "Low Energy, Pleasant",    color: "#12d9a0" }
  };

  // Canonical English word grid — matches dashboard.html's own EN_WORDS exactly.
  var EN_WORDS = {
    1: [
      ["Surprised","Upbeat","Festive","Exhilarated","Ecstatic"],
      ["Hyper","Cheerful","Motivated","Inspired","Elated"],
      ["Energized","Lively","Excited","Optimistic","Enthusiastic"],
      ["Pleased","Focused","Happy","Proud","Thrilled"],
      ["Pleasant","Joyful","Hopeful","Playful","Blissful"]
    ],
    2: [
      ["Disgusted","Glum","Disappointed","Down","Apathetic"],
      ["Pessimistic","Morose","Discouraged","Sad","Bored"],
      ["Alienated","Miserable","Lonely","Disheartened","Tired"],
      ["Despondent","Depressed","Sullen","Exhausted","Fatigued"],
      ["Despairing","Hopeless","Desolate","Spent","Drained"]
    ],
    3: [
      ["Enraged","Panicked","Stressed","Jittery","Shocked"],
      ["Livid","Furious","Frustrated","Tense","Stunned"],
      ["Fuming","Frightened","Angry","Nervous","Restless"],
      ["Anxious","Apprehensive","Worried","Irritated","Annoyed"],
      ["Repulsed","Troubled","Concerned","Uneasy","Peeved"]
    ],
    4: [
      ["At Ease","Easygoing","Content","Loving","Fulfilled"],
      ["Calm","Secure","Satisfied","Grateful","Touched"],
      ["Relaxed","Chill","Restful","Blessed","Balanced"],
      ["Mellow","Thoughtful","Peaceful","Comfortable","Carefree"],
      ["Sleepy","Complacent","Tranquil","Cozy","Serene"]
    ]
  };

  function englishLabelFor(quad, row, col) {
    if (!quad || !row || !col) return "";
    var grid = EN_WORDS[quad];
    if (!grid || !grid[row - 1]) return "";
    return grid[row - 1][col - 1] || "";
  }

  // Los Rios Community College District's published academic calendar —
  // identical source/dates to dashboard.html's LOS_RIOS_TERMS. Add a row
  // here (and in dashboard.html) each year as the district publishes the
  // next calendar.
  var LOS_RIOS_TERMS_RAW = [
    { label: "Summer 2023", start: "2023-06-05", end: "2023-08-03" },
    { label: "Fall 2023",   start: "2023-08-19", end: "2023-12-14" },
    { label: "Spring 2024", start: "2024-01-13", end: "2024-05-16" },
    { label: "Summer 2024", start: "2024-06-10", end: "2024-08-08" },
    { label: "Fall 2024",   start: "2024-08-24", end: "2024-12-19" },
    { label: "Spring 2025", start: "2025-01-18", end: "2025-05-22" },
    { label: "Summer 2025", start: "2025-06-09", end: "2025-08-07" },
    { label: "Fall 2025",   start: "2025-08-23", end: "2025-12-18" },
    { label: "Spring 2026", start: "2026-01-17", end: "2026-05-21" },
    { label: "Summer 2026", start: "2026-06-08", end: "2026-08-05" },
    { label: "Fall 2026",   start: "2026-08-22", end: "2026-12-17" }
  ];
  var LOS_RIOS_TERMS = LOS_RIOS_TERMS_RAW.map(function (t) {
    return { label: t.label, start: new Date(t.start + "T00:00:00"), end: new Date(t.end + "T23:59:59") };
  });
  var MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  function termForDate(d) {
    for (var i = 0; i < LOS_RIOS_TERMS.length; i++) {
      var t = LOS_RIOS_TERMS[i];
      if (d >= t.start && d <= t.end) {
        var week = Math.min(16, Math.floor((d.getTime() - t.start.getTime()) / MS_PER_WEEK) + 1);
        return { label: t.label, week: week };
      }
    }
    return null;
  }

  var CANONICAL_COLUMNS = ["timestamp", "session", "respondent", "button_id", "label", "seconds_on_grid"];
  var TIMESTAMP_LIKE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  var QUAD_ID_RE = /^quad([1-4])_r(\d)_c(\d)$/;

  // RFC-4180-ish CSV parser — identical behavior to dashboard.html's parseCsv.
  function parseCsv(text) {
    var rows = [], row = [], cell = "", inQuotes = false, i = 0;
    while (i < text.length) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ",") { row.push(cell); cell = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
      cell += ch; i++;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || (r[0] || "").trim() !== ""; });
  }

  function buildRow(fieldMap, rawRow) {
    function get(name) {
      var idx = fieldMap[name];
      return idx === undefined ? "" : (rawRow[idx] || "").trim();
    }
    var timestampStr = get("timestamp");
    var d = timestampStr ? new Date(timestampStr) : null;
    if (d && isNaN(d.getTime())) d = null;

    var buttonId = get("button_id");
    var m = QUAD_ID_RE.exec(buttonId);
    var quad = m ? Number(m[1]) : null;
    var rowNum = m ? Number(m[2]) : null;
    var colNum = m ? Number(m[3]) : null;
    var info = quad ? QUAD_INFO[quad] : null;

    var secondsRaw = get("seconds_on_grid") || get("seconds_on_screen2");
    var term = d ? termForDate(d) : null;

    return {
      timestamp: timestampStr,
      date: d,
      session: get("session"),
      respondent: get("respondent"),
      button_id: buttonId,
      label: get("label"),
      labelEn: englishLabelFor(quad, rowNum, colNum) || get("label"),
      seconds: secondsRaw === "" ? null : Number(secondsRaw),
      language: get("language"),
      quad: quad,
      rowNum: rowNum,
      colNum: colNum,
      quadName: info ? info.name : "Unknown",
      energy: info ? info.energy : "",
      pleasant: info ? info.pleasant : "",
      quadColor: info ? info.color : "#999",
      semester: term ? term.label : null,
      semesterWeek: term ? term.week : null
    };
  }

  function rowDedupeKey(r) {
    return [r.timestamp, r.session, r.respondent, r.button_id, r.label, r.seconds].join("\u0001");
  }

  // Parses one CSV file's text into row objects. Mirrors dashboard.html's
  // ingestFile header-detection/fallback logic, minus the multi-file UI
  // bookkeeping (file list, per-file counts) that display.html doesn't need.
  function rowsFromCsvText(text) {
    text = text.replace(/^﻿/, "");
    var rows = parseCsv(text);
    if (!rows.length) return { rows: [], error: "File looks empty." };

    var header = rows[0].map(function (h) { return h.trim().replace(/^﻿/, ""); });
    var fieldMap = {};
    header.forEach(function (h, i) { fieldMap[h] = i; });

    var dataStartIndex = 1;
    if (fieldMap.timestamp === undefined || fieldMap.button_id === undefined) {
      if (TIMESTAMP_LIKE_RE.test((rows[0][0] || "").trim())) {
        fieldMap = {};
        CANONICAL_COLUMNS.forEach(function (name, i) { fieldMap[name] = i; });
        dataStartIndex = 0;
      } else {
        return { rows: [], error: 'Expected a "timestamp" and "button_id" column, found [' + header.join(", ") + "]." };
      }
    }

    var parsed = [];
    var seen = {};
    for (var i = dataStartIndex; i < rows.length; i++) {
      var r = buildRow(fieldMap, rows[i]);
      var key = rowDedupeKey(r);
      if (seen[key]) continue;
      seen[key] = true;
      parsed.push(r);
    }
    return { rows: parsed, error: null };
  }

  /* ------------------------------------------------------ time-range helpers */

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function startOfWeek(d) {
    // Week = Sunday-Saturday, matching DOW_NAMES/dashboard's day-of-week convention.
    var s = startOfDay(d);
    s.setDate(s.getDate() - s.getDay());
    return s;
  }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function startOfYear(d) { return new Date(d.getFullYear(), 0, 1); }

  var TIME_RANGES = {
    today: { label: "Today",      since: function (now) { return startOfDay(now); } },
    week:  { label: "This Week",  since: function (now) { return startOfWeek(now); } },
    month: { label: "This Month", since: function (now) { return startOfMonth(now); } },
    year:  { label: "This Year",  since: function (now) { return startOfYear(now); } }
  };
  var TIME_RANGE_ORDER = ["today", "week", "month", "year"];

  function rowsInTimeRange(rows, rangeKey, now) {
    now = now || new Date();
    var since = TIME_RANGES[rangeKey].since(now);
    return rows.filter(function (r) { return r.date && r.date >= since && r.date <= now; });
  }

  function locationsPresent(rows) {
    var set = {};
    rows.forEach(function (r) { if (r.session) set[r.session] = true; });
    return Object.keys(set).sort();
  }

  global.MoodData = {
    QUAD_INFO: QUAD_INFO,
    EN_WORDS: EN_WORDS,
    englishLabelFor: englishLabelFor,
    LOS_RIOS_TERMS: LOS_RIOS_TERMS,
    termForDate: termForDate,
    parseCsv: parseCsv,
    rowsFromCsvText: rowsFromCsvText,
    TIME_RANGES: TIME_RANGES,
    TIME_RANGE_ORDER: TIME_RANGE_ORDER,
    rowsInTimeRange: rowsInTimeRange,
    locationsPresent: locationsPresent
  };
})(window);
