// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function scopeName(scopes: { regions: { code: string; name: string }[]; icbs: { code: string; name: string }[]; sicbls: { code: string; name: string }[] }, code?: string) {
  if (!code) return 'All England'
  return (
    scopes.sicbls.find((s) => s.code === code)?.name ??
    scopes.icbs.find((s) => s.code === code)?.name ??
    scopes.regions.find((s) => s.code === code)?.name ??
    code
  )
}
