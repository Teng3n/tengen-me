export type ServerState = "online" | "offline" | "pending";

export type PublicServerStatus = {
  slug: string;
  name: string;
  game: string;
  status: ServerState;
  region: string;
  connectAddress: string | null;
  players: { current: number | null; maximum: number | null };
  playerNames: string[];
  lastUpdated: string | null;
  lastUpdatedLabel: string;
  sourceLabel: string;
};

export type PublicServerHistoryDay = {
  date: string;
  onlineSamples: number;
  totalSamples: number;
  peakPlayers: number;
  maximumPlayers: number;
};

export const enshroudedServer: PublicServerStatus = {
  slug: "enshrouded-home",
  name: "Home Server",
  game: "Enshrouded",
  status: "pending",
  region: "US West",
  connectAddress: null,
  players: { current: null, maximum: 16 },
  playerNames: [],
  lastUpdated: null,
  lastUpdatedLabel: "Awaiting first check",
  sourceLabel: "Bridge pending",
};

export const defaultServer = enshroudedServer;

export function getPublicServerStatuses(): PublicServerStatus[] {
  return [enshroudedServer];
}
