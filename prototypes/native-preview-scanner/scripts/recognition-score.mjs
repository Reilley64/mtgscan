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
} else {
  console.error(
    "usage: recognition-score.mjs cards|judge-next|summarize|speed ...",
  );
  process.exit(2);
}
