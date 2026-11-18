/**
 * Generate an ADMIN_PASSWORD_HASH value for .env.
 *
 * Usage: bun run admin:hash
 *
 * The password is read from standard input so that it does not end up in the
 * shell history. The resulting hash uses scrypt with a random salt.
 */

import { hashPassword } from "../src/lib/auth/password";

const password = prompt("Teacher password (input is visible in this terminal):");
if (!password || password.length < 10) {
  console.error("Choose a password with at least 10 characters.");
  process.exit(1);
}

const confirmation = prompt("Confirm the password:");
if (confirmation !== password) {
  console.error("The two passwords do not match.");
  process.exit(1);
}

console.log("\nReplace the ADMIN_PASSWORD_HASH line in .env with:\n");
console.log(`ADMIN_PASSWORD_HASH="${hashPassword(password)}"`);
console.log("\nThen restart the development or production server so it reloads .env.");
