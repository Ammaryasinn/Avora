import { auth, currentUser } from "@clerk/nextjs/server";

import { getDatabase } from "@/lib/db/database";

export async function requireClerkUserId() {
  const { userId } = await auth.protect();

  return userId;
}

export async function ensureCurrentUser() {
  const clerkUserId = await requireClerkUserId();
  const database = getDatabase();
  const existingUser = await database.user.findUnique({
    where: { clerkUserId },
  });

  if (existingUser) {
    return existingUser;
  }

  const identity = await currentUser();
  const email =
    identity?.primaryEmailAddress?.emailAddress ??
    identity?.emailAddresses.at(0)?.emailAddress;

  if (!identity || !email) {
    throw new Error("A verified Clerk identity with an email is required.");
  }

  return database.user.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email,
      firstName: identity.firstName,
      lastName: identity.lastName,
    },
    update: {},
  });
}
