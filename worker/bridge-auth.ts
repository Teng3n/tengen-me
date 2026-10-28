export interface BridgeTokenEnv {
  ENSHROUDED_BRIDGE_TOKEN?: string;
  PALWORLD_BRIDGE_TOKEN?: string;
}

function safeTokenEqual(provided: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(provided);
  const right = encoder.encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export function isAuthorizedBridgeRequest(request: Request, env: BridgeTokenEnv): boolean {
  // Keep the former binding as a fallback so the host can migrate without rotating its secret.
  const expectedToken = env.ENSHROUDED_BRIDGE_TOKEN ?? env.PALWORLD_BRIDGE_TOKEN;
  const authorization = request.headers.get("authorization") ?? "";
  const providedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return Boolean(expectedToken && providedToken && safeTokenEqual(providedToken, expectedToken));
}
