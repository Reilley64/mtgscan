import fs from "node:fs";

const marker = "NATIVE_PREVIEW_EVENT ";

function events(logPath, afterLine) {
  const lines = fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .slice(Number(afterLine));
  const found = [];
  for (const raw of lines) {
    const line = raw.replace(/\u001b\[[0-9;]*m/g, "");
    const index = line.indexOf(marker);
    if (index < 0) continue;
    try {
      found.push(JSON.parse(line.slice(index + marker.length).trim()));
    } catch {}
  }
  return found;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  ];
}

function judge(truth, event) {
  if (!event) return { status: "no-result" };
  if (event.event === "recognition-failure")
    return { status: "failed", detail: event.message };
  const top = event.candidates?.[0];
  const identity =
    top !== undefined && top.name.toLowerCase() === truth.name.toLowerCase();
  const printing = top !== undefined && top.scryfallId === truth.scryfallId;
  let status = "abstained";
  if (event.accepted)
    status =
      event.acceptedScryfallId === truth.scryfallId
        ? "correct-accept"
        : "false-accept";
  return {
    status,
    identity,
    printing,
    top: top
      ? `${top.name} ${top.set.toUpperCase()} #${top.collectorNumber}`
      : "none",
    endToEndMs: event.endToEndMs,
    serviceLatencyMs: event.serviceLatencyMs,
  };
}

function summarize(results) {
  const judged = results.filter((result) => result.status !== "skipped");
  const answered = judged.filter((result) => "identity" in result);
  const count = (predicate) => judged.filter(predicate).length;
  const latencies = answered.map((result) => result.endToEndMs);
  return {
    presented: judged.length,
    identityTop1: count((result) => result.identity),
    printingTop1: count((result) => result.printing),
    correctAccepts: count((result) => result.status === "correct-accept"),
    falseAccepts: count((result) => result.status === "false-accept"),
    abstentions: count((result) => result.status === "abstained"),
    failures: count(
      (result) => result.status === "failed" || result.status === "no-result",
    ),
    endToEndP50Ms: percentile(latencies, 0.5),
    endToEndP95Ms: percentile(latencies, 0.95),
  };
}

function colourGroup(card) {
  const cost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? "";
  const symbols = [...cost.matchAll(/\{([^}]*)\}/g)].map((match) => match[1]);
  for (const symbol of symbols.reverse())
    for (const letter of symbol) if ("WUBRG".includes(letter)) return letter;
  return "C";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) rows.push([...row, field]);
  const [header, ...body] = rows;
  return body
    .filter((values) => values.length === header.length)
    .map((values) =>
      Object.fromEntries(header.map((name, index) => [name, values[index]])),
    );
}

const [command, ...args] = process.argv.slice(2);

if (command === "cards") {
  const manifest = JSON.parse(fs.readFileSync(args[0], "utf8"));
  for (const entry of manifest.entries)
    console.log(
      [
        entry.scryfallId,
        entry.name,
        entry.set.toUpperCase(),
        entry.collectorNumber,
        entry.groundTruthFinish,
      ].join("\t"),
    );
} else if (command === "judge-next") {
  const [logPath, afterLine, scryfallId, name] = args;
  const event = events(logPath, afterLine).find(
    (entry) =>
      entry.event === "recognition-result" ||
      entry.event === "recognition-failure",
  );
  console.log(
    JSON.stringify({ scryfallId, name, ...judge({ scryfallId, name }, event) }),
  );
} else if (command === "summarize") {
  const results = fs
    .readFileSync(args[0], "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  console.log(JSON.stringify(summarize(results)));
} else if (command === "speed") {
  const [logPath, afterLine, cardsPath] = args;
  const truths = fs
    .readFileSync(cardsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [scryfallId, name] = line.split("\t");
      return { scryfallId, name };
    });
  const found = events(logPath, afterLine);
  const starts = found.filter((entry) => entry.event === "capture-js-start");
  const results = found.filter(
    (entry) =>
      entry.event === "recognition-result" ||
      entry.event === "recognition-failure",
  );
  const judged = truths.map((truth, index) => judge(truth, results[index]));
  const summary = summarize(judged);
  const first = starts[0]?.atMs;
  const last = results[results.length - 1]?.atMs;
  const minutes = first && last && last > first ? (last - first) / 60000 : null;
  console.log(
    JSON.stringify({
      ...summary,
      photos: starts.length,
      results: results.length,
      elapsedSeconds: minutes === null ? null : Math.round(minutes * 600) / 10,
      cardsPerMinute:
        minutes === null
          ? null
          : Math.round((results.length / minutes) * 10) / 10,
      correctCardsPerMinute:
        minutes === null
          ? null
          : Math.round((summary.printingTop1 / minutes) * 10) / 10,
    }),
  );
} else if (command === "bin-cards") {
  const [csvPath, metadataDirectory, ledgerPath] = args;
  const metadata = new Map();
  for (const file of fs.readdirSync(metadataDirectory))
    if (/^rectified-collection-\d+\.json$/.test(file))
      for (const card of JSON.parse(
        fs.readFileSync(`${metadataDirectory}/${file}`, "utf8"),
      ).data)
        metadata.set(card.id, card);
  const scanned = new Set(
    fs.existsSync(ledgerPath)
      ? fs.readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean)
      : [],
  );
  const order = "WUBRGC";
  const seen = new Set();
  const cards = [];
  for (const row of parseCsv(fs.readFileSync(csvPath, "utf8"))) {
    const scryfallId = row["Scryfall ID"];
    const card = metadata.get(scryfallId);
    const key = `${scryfallId}:${row.Foil}`;
    if (!card || scanned.has(scryfallId) || scanned.has(key) || seen.has(key))
      continue;
    seen.add(key);
    cards.push({
      scryfallId,
      name: card.name,
      set: card.set.toUpperCase(),
      collectorNumber: card.collector_number,
      finish: row.Foil,
      group: colourGroup(card),
    });
  }
  cards.sort(
    (left, right) =>
      order.indexOf(left.group) - order.indexOf(right.group) ||
      left.name.localeCompare(right.name) ||
      left.set.localeCompare(right.set),
  );
  for (const card of cards)
    console.log(
      [
        card.scryfallId,
        card.name,
        card.set,
        card.collectorNumber,
        card.finish,
        card.group,
      ].join("\t"),
    );
} else if (command === "bin-score") {
  const [logPath, afterLine, batchPath, detailPath] = args;
  const truths = fs
    .readFileSync(batchPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [scryfallId, name, set, collectorNumber] = line.split("\t");
      return {
        scryfallId,
        name,
        label: `${name} ${set} #${collectorNumber}`,
        result: null,
      };
    });
  const found = events(logPath, afterLine);
  const starts = found.filter((entry) => entry.event === "capture-js-start");
  const results = found.filter(
    (entry) =>
      entry.event === "recognition-result" ||
      entry.event === "recognition-failure",
  );
  const unmatched = [];
  for (const result of results) {
    const top = result.candidates?.[0];
    const exact =
      top &&
      truths.find(
        (truth) => !truth.result && truth.scryfallId === top.scryfallId,
      );
    const named =
      !exact &&
      top &&
      truths.find(
        (truth) =>
          !truth.result && truth.name.toLowerCase() === top.name.toLowerCase(),
      );
    const target = exact || named;
    if (target) target.result = result;
    else unmatched.push(result);
  }
  const judged = truths.map((truth) =>
    truth.result ? judge(truth, truth.result) : { status: "no-result" },
  );
  const summary = summarize(judged);
  const first = starts[0]?.atMs;
  const last = results[results.length - 1]?.atMs;
  const minutes = first && last && last > first ? (last - first) / 60000 : null;
  const unmatchedAccepts = unmatched.filter((result) => result.accepted).length;
  fs.writeFileSync(
    detailPath,
    [
      ...truths.map((truth, index) =>
        JSON.stringify({ card: truth.label, ...judged[index] }),
      ),
      ...unmatched.map((result) =>
        JSON.stringify({
          card: "unmatched",
          status: result.accepted
            ? "false-accept"
            : result.event === "recognition-failure"
              ? "failed"
              : "abstained",
          top: result.candidates?.[0]
            ? `${result.candidates[0].name} ${result.candidates[0].set.toUpperCase()} #${result.candidates[0].collectorNumber}`
            : "none",
        }),
      ),
    ].join("\n") + "\n",
  );
  console.log(
    JSON.stringify({
      ...summary,
      falseAccepts: summary.falseAccepts + unmatchedAccepts,
      photos: starts.length,
      results: results.length,
      unmatchedResults: unmatched.length,
      missedCards: judged.filter((result) => result.status === "no-result")
        .length,
      elapsedSeconds: minutes === null ? null : Math.round(minutes * 600) / 10,
      cardsPerMinute:
        minutes === null
          ? null
          : Math.round((results.length / minutes) * 10) / 10,
      correctCardsPerMinute:
        minutes === null
          ? null
          : Math.round((summary.printingTop1 / minutes) * 10) / 10,
    }),
  );
} else {
  console.error(
    "usage: recognition-score.mjs cards|judge-next|summarize|speed|bin-cards|bin-score ...",
  );
  process.exit(2);
}
