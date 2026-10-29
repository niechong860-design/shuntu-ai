import { authenticateBearer } from "./d1-bearer-auth";

export async function authenticateD1Request(request: Request) {
  const auth = await authenticateBearer(request);
  return { userId: auth.userId, claims: auth.claims };
}
