"use server"

import { prisma } from "@/lib/db";
import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * Ensures the request is authenticated and retrieves the matching database user.
 * If the user does not exist in the database, it creates a new record automatically.
 *
 * @returns The Prisma `User` linked to the current Clerk session.
 * @throws {Error} When the user details cannot be loaded from Clerk.
 */
export async function requireUser() {
  const { userId } = await auth.protect();

  let user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) {
    const clerkUser = await currentUser();
    if (!clerkUser) {
      throw new Error("Clerk user details not found.");
    }

    const email = clerkUser.emailAddresses[0]?.emailAddress || null;
    const firstName = clerkUser.firstName || null;
    const lastName = clerkUser.lastName || null;
    const imageUrl = clerkUser.imageUrl || null;

    user = await prisma.user.create({
      data: {
        clerkId: userId,
        email,
        firstName,
        lastName,
        imageUrl,
      },
    });
  }

  return user;
}