// ---------- UTILS / HELPERS ----------

export function money(n: number) {
  if (!Number.isFinite(n)) return "$ 0"
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  })
}

export function toNumber(v: string) {
  const x = Number(String(v).replace(",", "."))
  return Number.isFinite(x) ? x : 0
}

export function fullName(first?: string | null, last?: string | null) {
  const s = [first, last].filter(Boolean).join(" ").trim()
  return s || "Sin nombre"
}

export function dateAR(d: string | null | undefined) {
  if (!d) return "—"
  const onlyDate = d.slice(0, 10)
  const [y, m, day] = onlyDate.split("-")
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}

export function dateTimeAR(d: string | null | undefined) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleString("es-AR")
  } catch {
    return "—"
  }
}

export function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function daysLate(dueDateISO: string | null | undefined) {
  if (!dueDateISO) return 0
  // Parsear como fecha LOCAL para evitar desfase UTC en Argentina (UTC-3)
  const parts = dueDateISO.slice(0, 10).split("-")
  if (parts.length !== 3) return 0
  const dueDay = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  if (Number.isNaN(dueDay.getTime())) return 0
  const today = startOfToday()
  const diffMs = today.getTime() - dueDay.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

export function computeLateFee(opts: {
  installmentAmount: number
  daysLate: number
  lateFeeType?: string | null
  lateFeeValue?: number | null
}) {
  const { installmentAmount, daysLate, lateFeeType, lateFeeValue } = opts
  const v = Number(lateFeeValue ?? 0)
  if (daysLate <= 0 || !Number.isFinite(v) || v <= 0) return 0
  if (!lateFeeType || lateFeeType === "fixed_daily") return v * daysLate
  if (lateFeeType === "percent_daily") return installmentAmount * (v / 100) * daysLate
  return v * daysLate
}

export function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}
