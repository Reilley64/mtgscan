import { execFileSync } from "node:child_process";

const expo = process.platform === "win32" ? "expo.cmd" : "expo";
const output = execFileSync(expo, ["config", "--type", "public", "--json"], {
  encoding: "utf8",
  env: { ...process.env, EXPO_NO_DOTENV: "1" },
});
const config = JSON.parse(output);

if (config.sdkVersion !== "54.0.0") {
  throw new Error(
    `Expected Expo SDK 54.0.0, received ${config.sdkVersion ?? "none"}.`,
  );
}

console.log(JSON.stringify({ sdkVersion: config.sdkVersion }));
