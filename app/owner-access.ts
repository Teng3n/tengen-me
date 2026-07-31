import { headers } from "next/headers";

const OWNER_AUTHORIZATION_HEADER = "x-tengen-owner-authorized";

export async function getOwnerNetworkUser(): Promise<{ label: string } | null> {
  const requestHeaders = await headers();
  return requestHeaders.get(OWNER_AUTHORIZATION_HEADER) === "1"
    ? { label: "Home network" }
    : null;
}
