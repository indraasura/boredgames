export type WeatherKind = "clear" | "cloudy" | "drizzle" | "rain" | "storm";

export interface WeatherDef {
  kind: WeatherKind;
  name: string;
  icon: string;
  /** Air and track temperature, °C. */
  air: number;
  track: number;
  /** Rain intensity 0..1. */
  rain: number;
  /** Cloud cover 0..1. */
  cloud: number;
}

export const WEATHERS: Record<WeatherKind, WeatherDef> = {
  clear: { kind: "clear", name: "Sunny", icon: "☀️", air: 27, track: 44, rain: 0, cloud: 0.1 },
  cloudy: { kind: "cloudy", name: "Overcast", icon: "☁️", air: 19, track: 27, rain: 0, cloud: 0.8 },
  drizzle: { kind: "drizzle", name: "Light rain", icon: "🌦️", air: 15, track: 20, rain: 0.28, cloud: 0.9 },
  rain: { kind: "rain", name: "Heavy rain", icon: "🌧️", air: 13, track: 17, rain: 0.65, cloud: 1 },
  storm: { kind: "storm", name: "Storm", icon: "⛈️", air: 12, track: 15, rain: 1, cloud: 1 },
};

export const WEATHER_LIST: readonly WeatherKind[] = ["clear", "cloudy", "drizzle", "rain", "storm"];

/** Weather choices for a race. "variable" starts dry and changes during the race. */
export type WeatherChoice = WeatherKind | "variable";

export interface WeatherState {
  kind: WeatherKind;
  air: number;
  track: number;
  rain: number;
  cloud: number;
  /** How wet the road surface is, 0 dry .. 1 flooded. */
  wetness: number;
  /** Future changes: at race time t seconds the sky turns into `kind`. */
  schedule: { t: number; kind: WeatherKind }[];
}

export function startingWeather(choice: WeatherChoice, rand: () => number): WeatherState {
  const kind: WeatherKind = choice === "variable" ? (rand() < 0.5 ? "clear" : "cloudy") : choice;
  const def = WEATHERS[kind];
  const schedule: WeatherState["schedule"] = [];
  if (choice === "variable") {
    // Rain arrives after a minute or two, may get heavier, then often fades.
    let t = 50 + rand() * 90;
    schedule.push({ t, kind: rand() < 0.5 ? "drizzle" : "rain" });
    t += 90 + rand() * 120;
    schedule.push({ t, kind: rand() < 0.5 ? "storm" : "rain" });
    t += 120 + rand() * 150;
    schedule.push({ t, kind: rand() < 0.6 ? "cloudy" : "drizzle" });
  }
  const wet = def.rain > 0 ? Math.min(1, def.rain * 0.9 + 0.1) : 0;
  return { kind, air: def.air, track: def.track, rain: def.rain, cloud: def.cloud, wetness: wet, schedule };
}

/** Advance the weather. The sky changes on schedule; the track dries and soaks slowly. */
export function stepWeather(w: WeatherState, time: number, dt: number) {
  const next = w.schedule[0];
  if (next && time >= next.t) {
    w.schedule.shift();
    w.kind = next.kind;
  }
  const def = WEATHERS[w.kind];
  // The sky eases to the new state over about 20 seconds.
  const k = Math.min(1, dt / 20);
  w.rain += (def.rain - w.rain) * k;
  w.cloud += (def.cloud - w.cloud) * k;
  w.air += (def.air - w.air) * k * 0.2;
  // Wetness rises while it rains and falls as the road dries (faster when hot).
  const soak = w.rain * (1 - w.wetness) * 0.04;
  const dry = (1 - Math.min(1, w.rain * 2)) * w.wetness * (0.004 + Math.max(0, w.track - 20) * 0.0004);
  w.wetness = Math.min(1, Math.max(0, w.wetness + (soak - dry) * dt));
  // A wet road is cooler.
  const trackTarget = def.track - w.wetness * 6;
  w.track += (trackTarget - w.track) * Math.min(1, dt / 60);
}

/** Air density, kg/m³, from altitude and temperature. */
export function airDensity(altitude: number, airTemp: number): number {
  const pressure = 101325 * Math.exp(-altitude / 8400);
  return pressure / (287.05 * (airTemp + 273.15));
}
