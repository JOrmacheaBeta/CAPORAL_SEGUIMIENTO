import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalizes a DNI to 8 digits by padding with leading zeros.
 * @param dni The DNI string to normalize.
 * @returns A string of exactly 8 digits.
 */
export function normalizeDni(dni: string | null | undefined): string {
  if (!dni) return "";
  const cleanDni = dni.toString().trim();
  if (!cleanDni) return "";
  return cleanDni.padStart(8, '0');
}
