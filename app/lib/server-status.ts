export type ServerState = "online" | "offline" | "pending";

export type PublicServerStatus = {
  slug: string;
  name: string;
  game: string;
  status: ServerState;
  region: string;
  connectAddress: string | null;
  players: { current: number | null; maximum: number };
  playerNames: string[];
  lastUpdated: string | null;
  lastUpdatedLabel: string;
  sourceLabel: string;
};

export const palworldServer: PublicServerStatus = {
  slug: "palworld-home",
  name: "Home Server",
  game: "Palworld",
  status: "pending",
  region: "US West",
  connectAddress: null,
  players: { current: null, maximum: 32 },
  playerNames: [],
  lastUpdated: null,
  lastUpdatedLabel: "Awaiting first check",
  sourceLabel: "Integration ready",
};

export function getPublicServerStatuses(): PublicServerStatus[] {
  return [palworldServer];
}
