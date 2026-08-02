import bcrypt from "bcryptjs"
import { supabase } from "./apiClient"

/**
 * Hashes a plain text password or PIN using bcrypt (salt rounds = 10)
 */
export function hashPassword(plainText: string): string {
  if (!plainText) return ""
  if (isBcryptHash(plainText)) return plainText
  return bcrypt.hashSync(plainText, 10)
}

/**
 * Checks if a string is already a bcrypt hash
 */
export function isBcryptHash(str: string): boolean {
  if (!str) return false
  return /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str)
}

/**
 * Verifies an input password against a stored password string.
 * Supports automatic inline migration from plain text to bcrypt hash.
 */
export async function verifyAndMigratePassword(
  inputPassword: string,
  storedValue: string,
  operatorId?: number | string
): Promise<boolean> {
  if (!inputPassword || !storedValue) return false

  const cleanInput = inputPassword.trim()
  const cleanStored = storedValue.trim()

  // 1. If stored value is already a bcrypt hash
  if (isBcryptHash(cleanStored)) {
    try {
      return bcrypt.compareSync(cleanInput, cleanStored)
    } catch (e) {
      console.error("bcrypt compare error:", e)
      return false
    }
  }

  // 2. Backward Compatibility for Legacy Plain Text Passwords
  const isMatch = cleanInput === cleanStored

  // 3. Automatic Migration: If plain text matched, upgrade to bcrypt hash in Supabase
  if (isMatch && operatorId) {
    try {
      const newHash = hashPassword(cleanInput)
      await supabase
        .from("operator_profiles")
        .update({ password_hash: newHash })
        .eq("id", operatorId)
    } catch (e) {
      console.error("Failed auto-upgrading legacy password to bcrypt:", e)
    }
  }

  return isMatch
}
