import { headers } from "next/headers";

const ACCESS_EMAIL_HEADER = "cf-access-authenticated-user-email";

export async function getCloudflareAccessUser(): Promise<{ email: string } | null> {
  const requestHeaders = await headers();
  const email = requestHeaders.get(ACCESS_EMAIL_HEADER);
  return email ? { email } : null;
}
