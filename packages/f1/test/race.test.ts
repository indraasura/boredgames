import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP, TEAMS } from "../src/car";
import { fillGrid, Race, type Entry } from "../src/race";
import { DT } from "../src/physics";

const fmt = (x: number) => `${Math.floor(x / 60)}:${(x % 60).toFixed(2).padStart(5, "0")}`;

function make(track: string, laps: number, n: number, weather: "clear" | "storm" | "variable" | "drizzle", seed = 7) {
  const entries: Entry[] = fillGrid([], n, seed, weather);
  return new Race({ mode: "race", track, laps, weather, difficulty: "hard", entries, seed });
}

describe("races", () => {
  for (const [track, laps, n, weather] of [
    ["gb-1948", 3, 10, "clear"],
    ["mc-1929", 3, 12, "clear"],
    ["be-1925", 2, 8, "storm"],
    ["it-1922", 4, 10, "variable"],
  ] as const) {
    it(`${track} ${laps} laps ${n} cars ${weather}`, () => {
      const race = make(track, laps, n, weather);
      let t = 0;
      let impacts = 0;
      let pits = 0;
      while (race.phase !== "finished" && t < 900) {
        race.step(DT);
        t += DT;
        for (const e of race.drain()) {
          if (e.type === "impact") impacts++;
          if (e.type === "pit" && e.what === "out") pits++;
        }
      }
      const order = [...race.cars].sort((a, b) => a.position - b.position);
      console.log(
        `${track} ${weather}: ended=${race.phase} t=${t.toFixed(0)}s impacts=${impacts} pits=${pits} finished=${race.cars.filter((c) => c.finished).length}/${n} wetness=${race.weather.wetness.toFixed(2)}`,
        order.slice(0, 4).map((c) => `${c.position}.${c.entry.name} ${c.finished ? fmt(c.finishTime) : "-"} best ${c.bestLap ? fmt(c.bestLap) : "-"} ${c.state.compound}`).join(" | "),
      );
      expect(race.phase).toBe("finished");
      expect(race.cars.filter((c) => c.finished).length).toBeGreaterThanOrEqual(1);
    }, 60000);
  }
});
