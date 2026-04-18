"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabaseClient"

// ---------- TYPES ----------
type Role = "admin" | "seller"

type Profile = {
  id: string
  role: Role
  name?: string | null
}

type Client = {
  id: string
  first_name: string | null
  last_name: string | null
  dni: string | null
  phone: string | null
  address: string | null
  created_by?: string | null
  created_at?: string | null
}

type Operation = {
  id: string
  created_at: string
  first_due_date: string | null
  seller_id: string
  client_id: string | null
  operation_type: "sale" | "loan"
  frequency: "daily" | "weekly" | "biweekly" | "three_weeks" | "monthly"
  base_amount: number
  interest_percent: number
  installments_count: number
  total_amount: number
  installment_amount: number
  sale_item: string | null
  loan_purpose: string | null
  notes: string | null
  late_fee_type?: "fixed_daily" | "percent_daily" | string | null
  late_fee_value?: number | null
  // UI only
  seller_name?: string
  client_name?: string
}

type InstallmentStatus = "pending" | "paid" | "late" | string

type InstallmentRow = {
  id: string
  operation_id: string
  installment_number: number
  due_date: string | null
  amount: number | null
  status: InstallmentStatus
  paid_at: string | null
  operation?: {
    id: string
    seller_id: string
    client_id: string | null
    frequency: Operation["frequency"]
    installment_amount: number
    late_fee_type?: Operation["late_fee_type"]
    late_fee_value?: Operation["late_fee_value"]
  } | null
  client?: {
    id: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    address: string | null
  } | null
  seller_name?: string | null
}

// ---------- TOAST ----------
type ToastType = "success" | "error" | "warning" | "info"
type Toast = { id: number; message: string; type: ToastType }
let _tid = 0

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++_tid
    setToasts((p) => [...p, { id, message, type }])
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4500)
  }, [])
  const remove = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), [])
  return { toasts, addToast, remove }
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const colors: Record<ToastType, string> = {
    success: "bg-emerald-950 border-emerald-600 text-emerald-200",
    error:   "bg-red-950 border-red-600 text-red-200",
    warning: "bg-amber-950 border-amber-600 text-amber-200",
    info:    "bg-sky-950 border-sky-600 text-sky-200",
  }
  const icons: Record<ToastType, string> = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" }
  if (!toasts.length) return null
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl pointer-events-auto ${colors[t.type]}`}
          style={{ animation: "toastIn .25s ease-out" }}>
          <span className="font-bold shrink-0 mt-0.5">{icons[t.type]}</span>
          <span className="text-sm leading-snug flex-1">{t.message}</span>
          <button onClick={() => onRemove(t.id)} className="opacity-50 hover:opacity-100 shrink-0">✕</button>
        </div>
      ))}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  )
}

// ---------- UTILS ----------
const freqLabel: Record<Operation["frequency"], string> = {
  daily: "Diaria", weekly: "Semanal", biweekly: "Quincenal",
  three_weeks: "Cada 3 semanas", monthly: "Mensual",
}

function money(n: number) {
  if (!Number.isFinite(n)) return "$ 0"
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}
function toNumber(v: string) {
  const x = Number(String(v).replace(",", "."))
  return Number.isFinite(x) ? x : 0
}
function fullName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(" ").trim() || "Sin nombre"
}
function dateAR(d: string | null | undefined) {
  if (!d) return "—"
  const [y, m, day] = d.slice(0, 10).split("-")
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}
function dateTimeAR(d: string | null | undefined) {
  if (!d) return "—"
  try { return new Date(d).toLocaleString("es-AR") } catch { return "—" }
}
function startOfToday() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
function daysLate(dueDateISO: string | null | undefined) {
  if (!dueDateISO) return 0
  const parts = dueDateISO.slice(0, 10).split("-")
  if (parts.length !== 3) return 0
  const due = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  if (Number.isNaN(due.getTime())) return 0
  return Math.max(0, Math.floor((startOfToday().getTime() - due.getTime()) / 86400000))
}
function computeLateFee(opts: { installmentAmount: number; daysLate: number; lateFeeType?: string | null; lateFeeValue?: number | null }) {
  const { installmentAmount, daysLate, lateFeeType, lateFeeValue } = opts
  const v = Number(lateFeeValue ?? 0)
  if (daysLate <= 0 || !Number.isFinite(v) || v <= 0) return 0
  if (!lateFeeType || lateFeeType === "fixed_daily") return v * daysLate
  if (lateFeeType === "percent_daily") return installmentAmount * (v / 100) * daysLate
  return v * daysLate
}
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ---------- ATOMS ----------
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{children}</p>
}
function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`w-full px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 placeholder:text-zinc-600 transition disabled:opacity-50 ${p.className ?? ""}`} />
}
function Sel(p: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return <select {...p} className={`w-full px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition ${p.className ?? ""}`}>{p.children}</select>
}
function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`w-full px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 placeholder:text-zinc-600 transition min-h-[78px] resize-none ${p.className ?? ""}`} />
}
type BtnV = "primary" | "success" | "danger" | "ghost" | "default"
function Btn({ children, variant = "default", size = "md", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnV; size?: "sm" | "md" | "lg" }) {
  const v: Record<BtnV, string> = { primary: "bg-sky-600 hover:bg-sky-500 text-white", success: "bg-emerald-600 hover:bg-emerald-500 text-white", danger: "bg-red-600 hover:bg-red-500 text-white", ghost: "bg-transparent hover:bg-zinc-800 border border-zinc-700 text-zinc-300", default: "bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100" }
  const s = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-sm" }
  return <button type="button" {...p} className={`rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 ${v[variant]} ${s[size]} ${p.className ?? ""}`}>{children}</button>
}
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${active ? "bg-sky-600 border-sky-500 text-white" : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"}`}>{children}</button>
}
function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{children}</span>
}
function Spinner() {
  return <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
}
function Card({ title, sub, children }: { title?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 backdrop-blur shadow-xl overflow-hidden">
      {(title || sub) && (
        <div className="px-5 py-4 border-b border-zinc-800/70 flex items-baseline gap-3">
          {title && <span className="text-sm font-bold text-zinc-100">{title}</span>}
          {sub && <span className="text-xs text-zinc-500">{sub}</span>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}
function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  )
}
function Tw({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/40"><table className="w-full text-sm border-collapse">{children}</table></div>
}
function TH({ children, cls = "" }: { children?: React.ReactNode; cls?: string }) {
  return <th className={`text-left px-3 py-3 border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap bg-zinc-900/80 ${cls}`}>{children}</th>
}
function TD({ children, cls = "" }: { children?: React.ReactNode; cls?: string }) {
  return <td className={`px-3 py-3 border-b border-zinc-900/60 ${cls}`}>{children}</td>
}
function Empty({ cols, msg }: { cols: number; msg: string }) {
  return <tr><td colSpan={cols} className="px-3 py-8 text-center text-zinc-500 text-sm">{msg}</td></tr>
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function Page() {
  const router = useRouter()
  const { toasts, addToast, remove } = useToasts()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<Role>("seller")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [view, setView] = useState<"ops" | "cobranza" | "daily-loans">("ops")

  const [reportMonth, setReportMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}` })
  const [exportMonth, setExportMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}` })
  const [exportWeek, setExportWeek] = useState(() => {
    const n = new Date(); const day = n.getDay() === 0 ? 6 : n.getDay() - 1
    const mon = new Date(n.getFullYear(), n.getMonth(), n.getDate() - day)
    return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`
  })

  const [clients, setClients] = useState<Client[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  const [installmentsData, setInstallmentsData] = useState<InstallmentRow[]>([])
  const [loadingCobranza, setLoadingCobranza] = useState(false)
  const [savingCobranzaId, setSavingCobranzaId] = useState<string | null>(null)

  // ops form
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing")
  const [selectedClientId, setSelectedClientId] = useState("")
  const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState("")
  const [dni, setDni] = useState(""); const [phone, setPhone] = useState(""); const [address, setAddress] = useState("")
  const [operationType, setOperationType] = useState<Operation["operation_type"]>("sale")
  const [saleItem, setSaleItem] = useState(""); const [loanPurpose, setLoanPurpose] = useState("")
  const [frequency, setFrequency] = useState<Operation["frequency"]>("weekly")
  const [baseAmount, setBaseAmount] = useState(""); const [interestPercent, setInterestPercent] = useState("")
  const [installments, setInstallments] = useState("1"); const [notes, setNotes] = useState("")
  const [lateFeeType, setLateFeeType] = useState<"fixed_daily" | "percent_daily">("fixed_daily")
  const [lateFeeValue, setLateFeeValue] = useState("")
  const [saving, setSaving] = useState(false)

  const baseAmountNum = useMemo(() => toNumber(baseAmount), [baseAmount])
  const interestPercentNum = useMemo(() => toNumber(interestPercent), [interestPercent])
  const installmentsNum = useMemo(() => Math.max(1, Math.min(60, Math.trunc(toNumber(installments)) || 1)), [installments])
  const previewTotal = useMemo(() => Math.max(0, baseAmountNum * (1 + interestPercentNum / 100)), [baseAmountNum, interestPercentNum])
  const previewInstallment = useMemo(() => installmentsNum > 0 ? previewTotal / installmentsNum : 0, [previewTotal, installmentsNum])

  // daily loans
  const DAILY_PLANS = { 12: 20, 17: 35, 24: 45, 36: 75, 48: 100 } as const
  const [dailyClientMode, setDailyClientMode] = useState<"existing" | "new">("existing")
  const [dailySelectedClientId, setDailySelectedClientId] = useState("")
  const [dailyFirstName, setDailyFirstName] = useState(""); const [dailyLastName, setDailyLastName] = useState("")
  const [dailyDni, setDailyDni] = useState(""); const [dailyPhone, setDailyPhone] = useState(""); const [dailyAddress, setDailyAddress] = useState("")
  const [dailyLoanAmount, setDailyLoanAmount] = useState("")
  const [dailyLoanPlan, setDailyLoanPlan] = useState<12 | 17 | 24 | 36 | 48>(12)
  const [dailyLoanInterest, setDailyLoanInterest] = useState("20")
  const [dailyLoanFirstDueDate, setDailyLoanFirstDueDate] = useState("")
  const [savingDailyLoan, setSavingDailyLoan] = useState(false)

  // edit modal
  const [editingOp, setEditingOp] = useState<Operation | null>(null)
  const [editType, setEditType] = useState<Operation["operation_type"]>("sale")
  const [editFrequency, setEditFrequency] = useState<Operation["frequency"]>("weekly")
  const [editBaseAmount, setEditBaseAmount] = useState(""); const [editInterest, setEditInterest] = useState("")
  const [editInstallments, setEditInstallments] = useState(""); const [editDetail, setEditDetail] = useState(""); const [editNotes, setEditNotes] = useState("")
  const [editClientId, setEditClientId] = useState<string | null>(null)
  const [editClientFirst, setEditClientFirst] = useState(""); const [editClientLast, setEditClientLast] = useState("")
  const [editClientDni, setEditClientDni] = useState(""); const [editClientPhone, setEditClientPhone] = useState(""); const [editClientAddress, setEditClientAddress] = useState("")
  const [loadingClientForEdit, setLoadingClientForEdit] = useState(false); const [savingEdit, setSavingEdit] = useState(false)

  // ops filter
  const [opSearch, setOpSearch] = useState(""); const [opTypeFilter, setOpTypeFilter] = useState<"all" | "sale" | "loan">("all")

  useEffect(() => { setDailyLoanInterest(String(DAILY_PLANS[dailyLoanPlan])) }, [dailyLoanPlan])
  useEffect(() => {
    if (dailyLoanFirstDueDate) return
    const t = new Date(); t.setDate(t.getDate() + 1)
    setDailyLoanFirstDueDate(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`)
  }, [dailyLoanFirstDueDate])

  // ── AUTH ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    async function init() {
      setLoading(true); setErrorMsg(null)
      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return
      if (error) { setErrorMsg(error.message); setLoading(false); return }
      const user = data.session?.user
      if (!user) { router.replace("/login"); return }
      setUserId(user.id)
      const profRes = await supabase.from("profiles").select("id, name, role").eq("id", user.id).maybeSingle()
      if (!mounted) return
      const r = ((profRes.data as any)?.role as Role) ?? "seller"
      setRole(r); setProfile({ id: user.id, role: r, name: (profRes.data as any)?.name ?? null })
      await fetchOperations(user.id, r)
      if (r !== "admin") await fetchClients(user.id)
      await fetchCobranza(user.id, r)
      setLoading(false)
    }
    init()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (!session?.user) router.replace("/login") })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [router])

  // ── DATA ──────────────────────────────────────────────────────────────────
  async function fetchClients(sellerId: string) {
    setErrorMsg(null)
    const res = await supabase.from("clients").select("id, first_name, last_name, dni, phone, address, created_by, created_at").eq("created_by", sellerId).order("created_at", { ascending: false })
    if (res.error) { setErrorMsg(res.error.message); setClients([]); return }
    setClients((res.data as any) ?? [])
  }

  async function fetchOperations(currentUserId: string, currentRole: Role) {
    setErrorMsg(null)
    const sel = "id, created_at, first_due_date, seller_id, operation_type, frequency, client_id, base_amount, interest_percent, installments_count, total_amount, installment_amount, notes, sale_item, loan_purpose, late_fee_type, late_fee_value, clients:client_id(first_name, last_name)"
    let q = supabase.from("operations").select(sel).order("created_at", { ascending: false })
    if (currentRole !== "admin") q = q.eq("seller_id", currentUserId)
    const res = await q
    if (res.error) { setErrorMsg(res.error.message); setOperations([]); return }
    const rawOps: any[] = (res.data as any) ?? []
    const ops: Operation[] = rawOps.map((o) => ({ ...o, client_name: fullName(o.clients?.first_name ?? null, o.clients?.last_name ?? null) }))
    const sellerIds = Array.from(new Set(ops.map((o) => o.seller_id).filter(Boolean)))
    if (sellerIds.length) {
      const sRes = await supabase.from("profiles").select("id, name").in("id", sellerIds)
      const map = new Map<string, string>()
      if (!sRes.error) for (const p of (sRes.data as any[]) ?? []) map.set(p.id, String(p.name ?? "").trim() || "Vendedor")
      setOperations(ops.map((o) => ({ ...o, seller_name: map.get(o.seller_id) ?? "Vendedor" }))); return
    }
    setOperations(ops)
  }

  async function fetchCobranza(currentUserId: string, currentRole: Role) {
    setLoadingCobranza(true); setErrorMsg(null)
    try {
      const today = todayISO()
      let q = supabase.from("installments").select(`id,operation_id,installment_number,due_date,amount,status,paid_at,operations:operation_id(id,seller_id,client_id,frequency,installment_amount,late_fee_type,late_fee_value,clients:client_id(id,first_name,last_name,phone,address))`)
      if (currentRole !== "admin") q = q.eq("operations.seller_id", currentUserId).neq("status", "paid").lte("due_date", today)
      q = q.order("due_date", { ascending: true })
      const res = await q
      if (res.error) { setErrorMsg(res.error.message); setInstallmentsData([]); return }
      const normalized: InstallmentRow[] = ((res.data as any[]) ?? []).map((r) => {
        const op = r?.operations ?? null; const c = op?.clients ?? null
        return {
          id: String(r.id), operation_id: String(r.operation_id), installment_number: Number(r.installment_number ?? 0),
          due_date: r.due_date ?? null, amount: r.amount ?? null, status: (r.status ?? "pending") as InstallmentStatus, paid_at: r.paid_at ?? null,
          operation: op ? { id: String(op.id), seller_id: String(op.seller_id), client_id: op.client_id ?? null, frequency: op.frequency, installment_amount: Number(op.installment_amount ?? 0), late_fee_type: op.late_fee_type ?? "fixed_daily", late_fee_value: op.late_fee_value ?? 0 } : null,
          client: c ? { id: String(c.id), first_name: c.first_name ?? null, last_name: c.last_name ?? null, phone: c.phone ?? null, address: c.address ?? null } : null,
        }
      })
      setInstallmentsData(normalized)
    } catch (e: any) { setErrorMsg(e?.message ?? "Error inesperado"); setInstallmentsData([])
    } finally { setLoadingCobranza(false) }
  }

  async function handleRefresh() {
    if (!userId || refreshing) return
    setRefreshing(true)
    await fetchOperations(userId, role); await fetchCobranza(userId, role)
    if (role !== "admin") await fetchClients(userId)
    setRefreshing(false); addToast("Datos actualizados", "success")
  }

  async function signOut() { await supabase.auth.signOut(); router.replace("/login") }

  // ── EXPORT ────────────────────────────────────────────────────────────────
  function getDateRange(filterType: "month" | "week", filterValue: string) {
    let startDate: Date, endDate: Date, fileLabel: string
    if (filterType === "month") {
      const [y, m] = filterValue.split("-").map(Number)
      startDate = new Date(y, m - 1, 1); endDate = new Date(y, m, 0, 23, 59, 59, 999); fileLabel = filterValue
    } else {
      const [y, m, d] = filterValue.split("-").map(Number)
      startDate = new Date(y, m - 1, d); endDate = new Date(y, m - 1, d + 6, 23, 59, 59, 999)
      const el = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`
      fileLabel = `${filterValue}_al_${el}`
    }
    return { startDate, endDate, fileLabel }
  }
  function downloadCSV(rows: string[][], filename: string) {
    const csv = "\uFEFF" + "sep=;\r\n" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url); addToast("Archivo descargado", "success")
  }
  function exportOperaciones(filterType: "month" | "week", filterValue: string) {
    const { startDate, endDate, fileLabel } = getDateRange(filterType, filterValue)
    const rows: string[][] = [["Cliente", "Fecha creacion", "Tipo", "Frecuencia", "Monto base", "Total", "Cuotas", "Monto cuota"]]
    for (const op of operations) {
      const created = new Date(op.created_at)
      if (created < startDate || created > endDate) continue
      rows.push([(op as any).client_name ?? "—", dateAR(op.created_at.slice(0, 10)), op.operation_type === "sale" ? "Venta" : "Prestamo", freqLabel[op.frequency] ?? "—", String(Math.round(op.base_amount)), String(Math.round(op.total_amount)), String(op.installments_count), String(Math.round(op.installment_amount))])
    }
    downloadCSV(rows, `operaciones_${fileLabel}.csv`)
  }
  function exportCobranza(filterType: "month" | "week", filterValue: string) {
    const { startDate, endDate, fileLabel } = getDateRange(filterType, filterValue)
    const rows: string[][] = [["Cliente", "Telefono", "Direccion", "Vencimiento", "Cuota #", "Frecuencia", "Monto", "Estado", "Dias atraso", "Mora", "Total a cobrar"]]
    for (const inst of installmentsData) {
      if (!inst.due_date) continue
      const [iy, im, id2] = inst.due_date.slice(0, 10).split("-").map(Number)
      const dd = new Date(iy, im - 1, id2)
      if (dd < startDate || dd > endDate) continue
      const op = inst.operation; const client = inst.client
      const amount = Number(inst.amount ?? op?.installment_amount ?? 0)
      const late = daysLate(inst.due_date)
      const fee = computeLateFee({ installmentAmount: amount, daysLate: late, lateFeeType: op?.late_fee_type ?? null, lateFeeValue: op?.late_fee_value ?? 0 })
      rows.push([fullName(client?.first_name, client?.last_name), client?.phone ?? "—", client?.address ?? "—", dateAR(inst.due_date), String(inst.installment_number), freqLabel[op?.frequency ?? "weekly"] ?? "—", String(Math.round(amount)), inst.status === "paid" ? "Pagada" : inst.status === "late" ? "Atrasada" : "Pendiente", String(late), String(Math.round(fee)), String(Math.round(amount + fee))])
    }
    downloadCSV(rows, `cobranza_${fileLabel}.csv`)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function createClientIfNeeded(): Promise<string | null> {
    if (clientMode === "existing") return selectedClientId || null
    if (!userId) return null
    const fn = firstName.trim(); const ln = lastName.trim()
    if (!fn && !ln) { addToast("Completá nombre o apellido del cliente.", "warning"); return null }
    const res = await supabase.from("clients").insert({ first_name: fn || null, last_name: ln || null, dni: dni.trim() || null, phone: phone.trim() || null, address: address.trim() || null, created_by: userId }).select("id").single()
    if (res.error) { addToast(res.error.message, "error"); return null }
    const newId = (res.data as any)?.id as string
    await fetchClients(userId); setSelectedClientId(newId)
    setFirstName(""); setLastName(""); setDni(""); setPhone(""); setAddress("")
    return newId
  }

  async function saveOperation() {
    if (!userId) return
    setSaving(true)
    try {
      const clientId = await createClientIfNeeded()
      if (!clientId) return
      const bd = new Date(); const todayY = bd.getFullYear(); const todayM = bd.getMonth(); const todayD = bd.getDate()
      let fdo: Date
      if (frequency === "weekly") fdo = new Date(todayY, todayM, todayD + 7)
      else if (frequency === "biweekly") fdo = new Date(todayY, todayM, todayD + 15)
      else if (frequency === "three_weeks") fdo = new Date(todayY, todayM, todayD + 21)
      else fdo = new Date(todayY, todayM + 1, todayD)
      const firstDueDate = `${fdo.getFullYear()}-${String(fdo.getMonth() + 1).padStart(2, "0")}-${String(fdo.getDate()).padStart(2, "0")}`
      const payload: any = { seller_id: userId, operation_type: operationType, frequency, client_id: clientId, base_amount: baseAmountNum, interest_percent: interestPercentNum, installments_count: installmentsNum, total_amount: previewTotal, installment_amount: previewInstallment, first_due_date: firstDueDate, notes: notes.trim() || null, sale_item: operationType === "sale" ? saleItem.trim() || null : null, loan_purpose: operationType === "loan" ? loanPurpose.trim() || null : null, late_fee_type: lateFeeType, late_fee_value: toNumber(lateFeeValue) || null }
      const res = await supabase.from("operations").insert(payload).select("id").single()
      if (res.error) { addToast(res.error.message, "error"); return }
      setSaleItem(""); setLoanPurpose(""); setBaseAmount(""); setInterestPercent(""); setInstallments("1"); setNotes(""); setLateFeeType("fixed_daily"); setLateFeeValue("")
      await fetchOperations(userId, role); await fetchCobranza(userId!, role)
      addToast("¡Operación guardada correctamente!", "success")
    } finally { setSaving(false) }
  }

  async function deleteOperation(opId: string) {
    if (role !== "admin") return
    if (!confirm("¿Confirmás borrar esta operación? No se puede deshacer.")) return
    const opData = operations.find((o) => o.id === opId); const clientId = opData?.client_id ?? null
    const res = await supabase.from("operations").delete().eq("id", opId)
    if (res.error) { addToast(res.error.message, "error"); return }
    if (clientId) {
      const { data: other } = await supabase.from("operations").select("id").eq("client_id", clientId).limit(1)
      if (!other || other.length === 0) await supabase.from("clients").delete().eq("id", clientId)
    }
    await fetchOperations(userId!, role); await fetchCobranza(userId!, role)
    if (role !== "admin") await fetchClients(userId!)
    addToast("Operación eliminada", "info")
  }

  async function startEditOperation(op: Operation) {
    if (role !== "admin") return
    setEditingOp(op); setEditType(op.operation_type); setEditFrequency(op.frequency)
    setEditBaseAmount(String(op.base_amount ?? "")); setEditInterest(String(op.interest_percent ?? ""))
    setEditInstallments(String(op.installments_count ?? "1"))
    setEditDetail(op.operation_type === "sale" ? String(op.sale_item ?? "") : String(op.loan_purpose ?? ""))
    setEditNotes(String(op.notes ?? ""))
    const cid = op.client_id; setEditClientId(cid)
    if (!cid) { setEditClientFirst(""); setEditClientLast(""); setEditClientDni(""); setEditClientPhone(""); setEditClientAddress(""); return }
    setLoadingClientForEdit(true)
    try {
      const cRes = await supabase.from("clients").select("id, first_name, last_name, dni, phone, address").eq("id", cid).maybeSingle()
      if (cRes.error) { addToast(cRes.error.message, "error"); return }
      const c = cRes.data as any
      setEditClientFirst(String(c?.first_name ?? "")); setEditClientLast(String(c?.last_name ?? ""))
      setEditClientDni(String(c?.dni ?? "")); setEditClientPhone(String(c?.phone ?? "")); setEditClientAddress(String(c?.address ?? ""))
    } finally { setLoadingClientForEdit(false) }
  }

  async function saveEditOperation() {
    if (role !== "admin" || !editingOp) return
    const base = toNumber(editBaseAmount); const interest = toNumber(editInterest)
    const inst = Math.max(1, Math.min(60, Math.trunc(toNumber(editInstallments)) || 1))
    const total = Math.max(0, base * (1 + interest / 100))
    setSavingEdit(true)
    try {
      const opRes = await supabase.from("operations").update({ operation_type: editType, frequency: editFrequency, base_amount: base, interest_percent: interest, installments_count: inst, total_amount: total, installment_amount: inst > 0 ? total / inst : 0, notes: editNotes.trim() || null, sale_item: editType === "sale" ? editDetail.trim() || null : null, loan_purpose: editType === "loan" ? editDetail.trim() || null : null }).eq("id", editingOp.id)
      if (opRes.error) { addToast(opRes.error.message, "error"); return }
      if (editClientId) {
        const cRes = await supabase.from("clients").update({ first_name: editClientFirst.trim() || null, last_name: editClientLast.trim() || null, dni: editClientDni.trim() || null, phone: editClientPhone.trim() || null, address: editClientAddress.trim() || null }).eq("id", editClientId)
        if (cRes.error) addToast("Operación guardada, pero cliente NO actualizado: " + cRes.error.message, "warning")
      }
      setEditingOp(null); await fetchOperations(userId!, role); await fetchCobranza(userId!, role)
      addToast("Operación y cliente actualizados correctamente", "success")
    } finally { setSavingEdit(false) }
  }

  async function markInstallmentPaid(installmentId: string) {
    if (!userId || role === "admin") return
    setSavingCobranzaId(installmentId)
    try {
      const res = await supabase.from("installments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", installmentId)
      if (res.error) { addToast(res.error.message, "error"); return }
      await fetchCobranza(userId!, role); addToast("Pago registrado ✓", "success")
    } finally { setSavingCobranzaId(null) }
  }

  async function markInstallmentNoPay(installmentId: string) {
    if (!userId || role === "admin") return
    setSavingCobranzaId(installmentId)
    try {
      const res = await supabase.from("installments").update({ status: "late", paid_at: null }).eq("id", installmentId)
      if (res.error) { addToast(res.error.message, "error"); return }
      await fetchCobranza(userId!, role)
    } finally { setSavingCobranzaId(null) }
  }

  async function createDailyClientIfNeeded(): Promise<string | null> {
    if (dailyClientMode === "existing") return dailySelectedClientId || null
    if (!userId) return null
    const fn = dailyFirstName.trim(); const ln = dailyLastName.trim()
    if (!fn || !ln) { addToast("Completá nombre y apellido del cliente.", "warning"); return null }
    const res = await supabase.from("clients").insert({ first_name: fn || null, last_name: ln || null, dni: dailyDni.trim() || null, phone: dailyPhone.trim() || null, address: dailyAddress.trim() || null, created_by: userId }).select("id").single()
    if (res.error) { addToast(res.error.message, "error"); return null }
    await fetchClients(userId)
    return (res.data as any)?.id ?? null
  }

  async function createDailyLoan() {
    if (!userId || savingDailyLoan) return
    setSavingDailyLoan(true)
    try {
      const clientId = await createDailyClientIfNeeded()
      if (!clientId) { addToast("Seleccioná o creá un cliente.", "warning"); return }
      const baseAmountValue = toNumber(dailyLoanAmount)
      if (baseAmountValue <= 0) { addToast("Ingresá un monto válido.", "warning"); return }
      if (!dailyLoanFirstDueDate) { addToast("Ingresá la fecha del primer vencimiento.", "warning"); return }
      const interestPercentValue = toNumber(dailyLoanInterest)
      const installmentsCountValue = Number(dailyLoanPlan)
      const totalAmount = baseAmountValue * (1 + interestPercentValue / 100)
      const installmentAmount = installmentsCountValue > 0 ? totalAmount / installmentsCountValue : 0
      const opRes = await supabase.from("operations").insert({ seller_id: userId, client_id: clientId, operation_type: "loan", frequency: "daily", base_amount: baseAmountValue, interest_percent: interestPercentValue, installments_count: installmentsCountValue, total_amount: totalAmount, installment_amount: installmentAmount, notes: notes.trim() || null, first_due_date: dailyLoanFirstDueDate }).select("id").single()
      if (opRes.error) { addToast(opRes.error.message, "error"); return }
      const operationId = (opRes.data as any)?.id as string
      const [fdY, fdM, fdD] = dailyLoanFirstDueDate.split("-").map(Number)
      const insRes = await supabase.from("installments").insert(
        Array.from({ length: installmentsCountValue }, (_, i) => {
          const due = new Date(fdY, fdM - 1, fdD + i)
          return { operation_id: operationId, installment_number: i + 1, due_date: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`, amount: installmentAmount, status: "pending", paid_at: null }
        })
      )
      if (insRes.error) { addToast("Operación creada pero error al generar cuotas: " + insRes.error.message, "warning"); return }
      setDailyClientMode("existing"); setDailySelectedClientId(""); setDailyFirstName(""); setDailyLastName(""); setDailyDni(""); setDailyPhone(""); setDailyAddress(""); setDailyLoanAmount(""); setDailyLoanPlan(12); setDailyLoanInterest("20")
      const nextDay = new Date(); nextDay.setDate(nextDay.getDate() + 1)
      setDailyLoanFirstDueDate(`${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`)
      await fetchOperations(userId, role); await fetchCobranza(userId, role)
      addToast("¡Préstamo diario creado correctamente!", "success")
    } finally { setSavingDailyLoan(false) }
  }

  // ── COBRANZA DERIVADOS ────────────────────────────────────────────────────
  const hoyISO = useMemo(() => todayISO(), [])

  const cobranzaRows = useMemo(() => {
    return installmentsData
      .filter((r) => (r.status ?? "pending") !== "paid")
      .map((r) => {
        const op = r.operation; const client = r.client
        const amount = Number(r.amount ?? op?.installment_amount ?? 0)
        const late = daysLate(r.due_date)
        const fee = computeLateFee({ installmentAmount: amount, daysLate: late, lateFeeType: op?.late_fee_type ?? "fixed_daily", lateFeeValue: op?.late_fee_value ?? 0 })
        return { ...r, _amount: amount, _daysLate: late, _lateFee: fee, _totalToPay: amount + fee, _clientName: fullName(client?.first_name ?? null, client?.last_name ?? null), _clientPhone: client?.phone ?? null, _clientAddress: client?.address ?? null, _frequency: op?.frequency ?? "weekly" }
      })
      .sort((a, b) => { const da = a.due_date ? new Date(a.due_date).getTime() : 0; const db = b.due_date ? new Date(b.due_date).getTime() : 0; return da - db })
  }, [installmentsData])

  const cuotasParaHoy = useMemo(() => cobranzaRows.filter((r) => (r.due_date ?? "").slice(0, 10) === hoyISO), [cobranzaRows, hoyISO])
  const atrasadas = useMemo(() => cobranzaRows.filter((r) => (r as any)._daysLate > 0), [cobranzaRows])
  const cobradasHoy = useMemo(() => installmentsData.filter((r) => (r.paid_at ?? "").slice(0, 10) === hoyISO), [installmentsData, hoyISO])
  const totalCobradoHoy = useMemo(() => cobradasHoy.reduce((acc, r) => acc + Number(r.amount ?? r.operation?.installment_amount ?? 0), 0), [cobradasHoy])

  // ── REPORT ────────────────────────────────────────────────────────────────
  const reportMonthRange = useMemo(() => {
    const [year, month] = reportMonth.split("-").map(Number)
    if (!year || !month) return { start: null as Date | null, end: null as Date | null }
    return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0, 23, 59, 59, 999) }
  }, [reportMonth])
  const reportMonthLabel = useMemo(() => !reportMonthRange.start ? "—" : reportMonthRange.start.toLocaleDateString("es-AR", { year: "numeric", month: "long" }), [reportMonthRange])

  const reportOpsSummary = useMemo(() => {
    const [year, month] = reportMonth.split("-").map(Number)
    if (!year || !month) return { closedOps: [] as Operation[], openOps: [] as Operation[] }
    const monthStart = new Date(year, month - 1, 1); const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)
    const byOp = new Map<string, InstallmentRow[]>()
    for (const row of installmentsData) { if (!byOp.has(row.operation_id)) byOp.set(row.operation_id, []); byOp.get(row.operation_id)!.push(row) }
    const closedOps: Operation[] = []; const openOps: Operation[] = []
    for (const op of operations) {
      const rows = byOp.get(op.id) ?? []
      if (!rows.length || !rows.every((r) => r.status === "paid")) { openOps.push(op); continue }
      const paidDates = rows.map((r) => r.paid_at).filter(Boolean).map((d) => new Date(d as string).getTime()).filter(Number.isFinite)
      if (!paidDates.length) { openOps.push(op); continue }
      const closedAt = new Date(Math.max(...paidDates))
      if (closedAt >= monthStart && closedAt <= monthEnd) closedOps.push(op); else openOps.push(op)
    }
    return { closedOps, openOps }
  }, [reportMonth, operations, installmentsData])

  const reportEconomicSummary = useMemo(() => {
    const closedCapital = reportOpsSummary.closedOps.reduce((a, o) => a + Number(o.base_amount ?? 0), 0)
    const openCapital = reportOpsSummary.openOps.reduce((a, o) => a + Number(o.base_amount ?? 0), 0)
    const interestEarned = reportOpsSummary.closedOps.reduce((a, o) => a + Math.max(0, Number(o.total_amount ?? 0) - Number(o.base_amount ?? 0)), 0)
    const paidByOp = new Map<string, number>()
    for (const row of installmentsData) if (row.status === "paid") paidByOp.set(row.operation_id, (paidByOp.get(row.operation_id) ?? 0) + Number(row.amount ?? row.operation?.installment_amount ?? 0))
    const pendingToCollect = reportOpsSummary.openOps.reduce((a, o) => a + Math.max(0, Number(o.total_amount ?? 0) - (paidByOp.get(o.id) ?? 0)), 0)
    return { closedCapital, openCapital, pendingToCollect, interestEarned }
  }, [reportOpsSummary, installmentsData])

  // ── FILTER OPS ────────────────────────────────────────────────────────────
  const filteredOps = useMemo(() => operations.filter((op) => {
    if (opTypeFilter !== "all" && op.operation_type !== opTypeFilter) return false
    if (!opSearch.trim()) return true
    const s = opSearch.toLowerCase()
    return (op.client_name ?? "").toLowerCase().includes(s) || ((op.operation_type === "sale" ? op.sale_item : op.loan_purpose) ?? "").toLowerCase().includes(s) || (op.seller_name ?? "").toLowerCase().includes(s)
  }), [operations, opSearch, opTypeFilter])

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center text-xl font-black text-white">C</div>
        <div className="flex items-center gap-2 text-zinc-400 text-sm"><Spinner /> Iniciando sesión...</div>
      </div>
    )
  }

  const dailyBase = Number(dailyLoanAmount || 0)
  const dailyInt = Number(dailyLoanInterest || 0)
  const dailyTotal = dailyBase * (1 + dailyInt / 100)
  const dailyInstAmt = Number(dailyLoanPlan) > 0 ? dailyTotal / Number(dailyLoanPlan) : 0

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ToastContainer toasts={toasts} onRemove={remove} />

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center text-sm font-black text-white shrink-0">C</div>
            <div className="leading-tight">
              <div className="text-sm font-bold">CrediElectro Dyn</div>
              <div className="text-[10px] text-zinc-500 hidden sm:block">{role === "admin" ? "Administrador" : "Vendedor"}{profile?.name ? ` · ${profile.name}` : ""}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>{refreshing ? <Spinner /> : "↻"}<span className="hidden sm:inline">Actualizar</span></Btn>
            <Btn variant="danger" size="sm" onClick={signOut}>Salir</Btn>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* NAV */}
        <nav className="overflow-x-auto pb-1">
          <div className="inline-flex min-w-full sm:min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-1 gap-1">
            {[
              { id: "ops", label: "📋 Operaciones", active: "bg-sky-600 text-white" },
              { id: "cobranza", label: "💰 Cobranza", active: "bg-emerald-600 text-white" },
              ...(role !== "admin" ? [{ id: "daily-loans", label: "⚡ Diarios", active: "bg-violet-600 text-white" }] : []),
            ].map((tab) => (
              <button key={tab.id} type="button"
                onClick={async () => { setView(tab.id as any); if (tab.id === "cobranza") await fetchCobranza(userId!, role) }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap ${view === tab.id ? tab.active : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"}`}
              >{tab.label}</button>
            ))}
          </div>
        </nav>

        {/* ERROR */}
        {errorMsg && (
          <div className="p-3 rounded-xl border border-red-800 bg-red-950/60 text-red-300 text-sm flex items-center justify-between gap-3">
            <span>⚠ {errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* KPI COBRANZA */}
        {view === "cobranza" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Cobrado hoy" value={money(totalCobradoHoy)} sub={`${cobradasHoy.length} cobros`} accent="border-emerald-800 bg-emerald-950/30 text-emerald-100" />
            <KpiCard label="Cuotas para hoy" value={String(cuotasParaHoy.length)} sub="vencen hoy" accent="border-sky-800 bg-sky-950/30 text-sky-100" />
            <KpiCard label="Cuotas atrasadas" value={String(atrasadas.length)} sub="con mora" accent="border-rose-800 bg-rose-950/30 text-rose-100" />
          </div>
        )}

        {/* ══════════════════════════════════════════════
            OPERACIONES - SELLER
        ══════════════════════════════════════════════ */}
        {role !== "admin" && view === "ops" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* FORM */}
            <div className="lg:col-span-2">
              <Card title="Nueva operación" sub="Registrá una venta o préstamo">
                <div className="space-y-5">
                  {/* Cliente */}
                  <div>
                    <Label>Cliente</Label>
                    <div className="flex gap-2 mb-3"><Pill active={clientMode === "existing"} onClick={() => setClientMode("existing")}>Existente</Pill><Pill active={clientMode === "new"} onClick={() => setClientMode("new")}>Nuevo</Pill></div>
                    {clientMode === "existing" ? (
                      <Sel value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
                        <option value="">— Elegí un cliente —</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{fullName(c.first_name, c.last_name)}{c.dni ? ` — DNI ${c.dni}` : ""}</option>)}
                      </Sel>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2"><Input placeholder="Nombre" value={firstName} onChange={(e) => setFirstName(e.target.value)} /><Input placeholder="Apellido" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
                        <div className="grid grid-cols-2 gap-2"><Input placeholder="DNI" value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" /><Input placeholder="Celular" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></div>
                        <Input placeholder="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} />
                      </div>
                    )}
                  </div>
                  {/* Tipo */}
                  <div>
                    <Label>Tipo de operación</Label>
                    <div className="flex gap-2"><Pill active={operationType === "sale"} onClick={() => setOperationType("sale")}>🛒 Venta</Pill><Pill active={operationType === "loan"} onClick={() => setOperationType("loan")}>💳 Préstamo</Pill></div>
                  </div>
                  {/* Detalle */}
                  <div>
                    <Label>{operationType === "sale" ? "¿Qué se vendió?" : "Motivo del préstamo"}</Label>
                    <Input placeholder={operationType === "sale" ? '"Heladera", "TV"...' : '"Efectivo", "Compra"...'} value={operationType === "sale" ? saleItem : loanPurpose} onChange={(e) => operationType === "sale" ? setSaleItem(e.target.value) : setLoanPurpose(e.target.value)} />
                  </div>
                  {/* Frecuencia */}
                  <div>
                    <Label>Frecuencia</Label>
                    <Sel value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
                      <option value="weekly">Semanal</option><option value="biweekly">Quincenal</option><option value="three_weeks">Cada 3 semanas</option><option value="monthly">Mensual</option>
                    </Sel>
                  </div>
                  {/* Montos */}
                  <div>
                    <Label>Montos</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <div><div className="text-[11px] text-zinc-500 mb-1">Monto base</div><Input placeholder="50000" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} inputMode="decimal" /></div>
                      <div><div className="text-[11px] text-zinc-500 mb-1">Interés %</div><Input placeholder="25" value={interestPercent} onChange={(e) => setInterestPercent(e.target.value)} inputMode="decimal" /></div>
                      <div><div className="text-[11px] text-zinc-500 mb-1">Cuotas</div><Input placeholder="8" value={installments} onChange={(e) => setInstallments(e.target.value)} inputMode="numeric" /></div>
                    </div>
                  </div>
                  {/* Preview */}
                  {baseAmountNum > 0 && (
                    <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 p-4 grid grid-cols-2 gap-3">
                      <div><div className="text-[11px] text-zinc-500 mb-0.5">Total a cobrar</div><div className="text-lg font-bold text-sky-300">{money(previewTotal)}</div></div>
                      <div><div className="text-[11px] text-zinc-500 mb-0.5">Valor de cuota</div><div className="text-lg font-bold text-emerald-300">{money(previewInstallment)}</div></div>
                    </div>
                  )}
                  {/* Notas */}
                  <div><Label>Notas (opcional)</Label><Textarea placeholder="Observaciones..." value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                  {/* Mora */}
                  <div className="rounded-xl border border-amber-800/30 bg-amber-950/10 p-4">
                    <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">⚠ Mora por atraso (opcional)</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] text-zinc-500 mb-1">Tipo de mora</div>
                        <Sel value={lateFeeType} onChange={(e) => setLateFeeType(e.target.value as any)}>
                          <option value="fixed_daily">Monto fijo por día</option>
                          <option value="percent_daily">% diario sobre la cuota</option>
                        </Sel>
                      </div>
                      <div>
                        <div className="text-[11px] text-zinc-500 mb-1">{lateFeeType === "fixed_daily" ? "$ por día" : "% diario"}</div>
                        <Input type="number" min="0" placeholder={lateFeeType === "fixed_daily" ? "Ej: 500" : "Ej: 2"} value={lateFeeValue} onChange={(e) => setLateFeeValue(e.target.value)} />
                      </div>
                    </div>
                    {lateFeeValue && toNumber(lateFeeValue) > 0 && (
                      <div className="text-xs text-amber-300 mt-2">
                        {lateFeeType === "fixed_daily" ? `${money(toNumber(lateFeeValue))} por cada día de atraso` : `${lateFeeValue}% de la cuota por cada día de atraso`}
                      </div>
                    )}
                  </div>
                  <Btn variant="primary" size="lg" onClick={saveOperation} disabled={saving} className="w-full">{saving ? <><Spinner /> Guardando...</> : "✓ Guardar operación"}</Btn>
                </div>
              </Card>
            </div>
            {/* TABLE */}
            <div className="lg:col-span-3">
              <Card title="Mis operaciones" sub={`${operations.length} registradas`}>
                <OpsFilters opSearch={opSearch} setOpSearch={setOpSearch} opTypeFilter={opTypeFilter} setOpTypeFilter={setOpTypeFilter} />
                <div className="md:hidden space-y-3 mt-4">{filteredOps.length === 0 ? <div className="text-center text-zinc-500 py-8 text-sm">Sin operaciones</div> : filteredOps.map((op) => <OpCard key={op.id} op={op} role={role} />)}</div>
                <div className="hidden md:block mt-4"><OpsTable role={role} operations={filteredOps} /></div>
              </Card>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            OPERACIONES - ADMIN
        ══════════════════════════════════════════════ */}
        {role === "admin" && view === "ops" && (
          <div className="space-y-6">
            <Card title="Todas las operaciones" sub={`${operations.length} registradas`}>
              <OpsFilters opSearch={opSearch} setOpSearch={setOpSearch} opTypeFilter={opTypeFilter} setOpTypeFilter={setOpTypeFilter} />
              <div className="md:hidden space-y-3 mt-4">{filteredOps.map((op) => <OpCard key={op.id} op={op} role={role} onEdit={startEditOperation} onDelete={deleteOperation} />)}</div>
              <div className="hidden md:block mt-4"><OpsTable role={role} operations={filteredOps} onEdit={startEditOperation} onDelete={deleteOperation} /></div>
            </Card>

            <Card title="📥 Exportar operaciones">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ExportBlock label="Por mes" type="month" value={exportMonth} onChange={setExportMonth} onExport={() => exportOperaciones("month", exportMonth)} btnLabel="Descargar operaciones del mes" btnVariant="success" />
                <ExportBlock label="Por semana (elegí el lunes)" type="date" value={exportWeek} onChange={setExportWeek} onExport={() => exportOperaciones("week", exportWeek)} btnLabel="Descargar operaciones de la semana" btnVariant="primary" />
              </div>
            </Card>

            <Card title="Reporte mensual" sub="Operaciones cerradas, abiertas y resumen económico">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-5">
                <div>
                  <Label>Mes del reporte</Label>
                  <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
                </div>
                <div className="text-sm text-zinc-400">Período: <span className="text-zinc-200 font-semibold capitalize">{reportMonthLabel}</span></div>
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Cerradas del mes" value={String(reportOpsSummary.closedOps.length)} accent="border-emerald-800 bg-emerald-950/30 text-emerald-100" />
                <KpiCard label="Ops abiertas" value={String(reportOpsSummary.openOps.length)} accent="border-amber-800 bg-amber-950/30 text-amber-100" />
                <KpiCard label="Capital recuperado" value={money(reportEconomicSummary.closedCapital)} accent="border-emerald-800 bg-emerald-950/30 text-emerald-100" />
                <KpiCard label="Capital en la calle" value={money(reportEconomicSummary.openCapital)} accent="border-amber-800 bg-amber-950/30 text-amber-100" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <KpiCard label="Pendiente por cobrar" value={money(reportEconomicSummary.pendingToCollect)} accent="border-sky-800 bg-sky-950/30 text-sky-100" />
                <KpiCard label="Interés ganado (cerradas)" value={money(reportEconomicSummary.interestEarned)} accent="border-violet-800 bg-violet-950/30 text-violet-100" />
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            COBRANZA
        ══════════════════════════════════════════════ */}
        {view === "cobranza" && (
          <div className="space-y-6">
            <Card title="Cuotas pendientes" sub={loadingCobranza ? "Cargando..." : `${cobranzaRows.length} pendientes`}>
              {loadingCobranza ? (
                <div className="flex items-center justify-center py-12 gap-2 text-zinc-400"><Spinner /> Cargando cobranza...</div>
              ) : (
                <>
                  <div className="md:hidden space-y-3">
                    {cobranzaRows.length === 0 ? <div className="text-center text-zinc-500 py-10">🎉 No hay cuotas pendientes</div> :
                      (cobranzaRows as any[]).map((r) => (
                        <div key={r.id} className={`rounded-2xl border p-4 space-y-3 ${r._daysLate > 0 ? "border-rose-800/50 bg-rose-950/10" : "border-zinc-800 bg-zinc-900/30"}`}>
                          <div className="flex items-start justify-between">
                            <div><div className="font-semibold">{r._clientName}</div>{r._clientPhone && <div className="text-xs text-zinc-500 mt-0.5">📞 {r._clientPhone}</div>}{r._clientAddress && <div className="text-xs text-zinc-500">📍 {r._clientAddress}</div>}</div>
                            {r._daysLate > 0 && <Badge color="bg-rose-900 text-rose-300">{r._daysLate}d atraso</Badge>}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="rounded-lg bg-zinc-900 p-2 text-center"><div className="text-[10px] text-zinc-500">Vence</div><div className="font-semibold text-xs">{dateAR(r.due_date)}</div></div>
                            <div className="rounded-lg bg-zinc-900 p-2 text-center"><div className="text-[10px] text-zinc-500">Monto</div><div className="font-semibold text-sky-300 text-xs">{money(r._amount)}</div></div>
                            <div className="rounded-lg bg-zinc-900 p-2 text-center"><div className="text-[10px] text-zinc-500">Total</div><div className="font-bold text-emerald-300 text-xs">{money(r._totalToPay)}</div></div>
                          </div>
                          {role !== "admin" && (
                            <div className="grid grid-cols-2 gap-2">
                              <Btn variant="success" onClick={() => markInstallmentPaid(r.id)} disabled={savingCobranzaId === r.id}>{savingCobranzaId === r.id ? <Spinner /> : "✓ Pagó"}</Btn>
                              <Btn variant="default" onClick={() => markInstallmentNoPay(r.id)} disabled={savingCobranzaId === r.id}>No pagó</Btn>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                  <div className="hidden md:block">
                    <Tw>
                      <thead><tr>
                        {role === "admin" && <TH>Vendedor</TH>}
                        <TH>Cliente</TH><TH>Vence</TH><TH>Cuota #</TH><TH>Frecuencia</TH><TH>Monto</TH><TH>Atraso</TH><TH>Mora</TH><TH>Total</TH>
                        {role !== "admin" && <TH>Acciones</TH>}
                      </tr></thead>
                      <tbody>
                        {cobranzaRows.length === 0 ? <Empty cols={role === "admin" ? 9 : 10} msg="🎉 No hay cuotas pendientes" /> :
                          (cobranzaRows as any[]).map((r) => (
                            <tr key={r.id} className={`hover:bg-zinc-800/30 transition ${r._daysLate > 0 ? "bg-rose-950/10" : ""}`}>
                              {role === "admin" && <TD>{r.seller_name ?? "Vendedor"}</TD>}
                              <TD><div className="font-semibold">{r._clientName}</div><div className="text-xs text-zinc-500">{r._clientPhone ? "📞 " + r._clientPhone : ""}{r._clientAddress ? " · " + r._clientAddress : ""}</div></TD>
                              <TD cls="whitespace-nowrap">{dateAR(r.due_date)}</TD>
                              <TD cls="whitespace-nowrap">#{r.installment_number}</TD>
                              <TD cls="whitespace-nowrap text-xs text-zinc-400">{freqLabel[r._frequency as keyof typeof freqLabel] ?? "—"}</TD>
                              <TD cls="whitespace-nowrap font-semibold text-sky-300">{money(r._amount)}</TD>
                              <TD cls="whitespace-nowrap">{r._daysLate > 0 ? <Badge color="bg-rose-900 text-rose-300">{r._daysLate} días</Badge> : <span className="text-zinc-600">—</span>}</TD>
                              <TD cls="whitespace-nowrap">{r._lateFee > 0 ? <span className="text-amber-300 font-semibold">{money(r._lateFee)}</span> : <span className="text-zinc-600">—</span>}</TD>
                              <TD cls="whitespace-nowrap font-bold text-emerald-300">{money(r._totalToPay)}</TD>
                              {role !== "admin" && <TD cls="whitespace-nowrap"><div className="flex gap-1.5"><Btn size="sm" variant="success" onClick={() => markInstallmentPaid(r.id)} disabled={savingCobranzaId === r.id}>{savingCobranzaId === r.id ? <Spinner /> : "Pagó"}</Btn><Btn size="sm" variant="ghost" onClick={() => markInstallmentNoPay(r.id)} disabled={savingCobranzaId === r.id}>No pagó</Btn></div></TD>}
                            </tr>
                          ))}
                      </tbody>
                    </Tw>
                  </div>
                </>
              )}
            </Card>

            {role === "admin" && (
              <Card title="Cobrado hoy" sub={`Total: ${money(totalCobradoHoy)}`}>
                <Tw>
                  <thead><tr><TH>Hora</TH><TH>Vendedor</TH><TH>Cliente</TH><TH>Cuota #</TH><TH>Monto</TH></tr></thead>
                  <tbody>
                    {cobradasHoy.length === 0 ? <Empty cols={5} msg="Hoy todavía no hay cobranzas registradas" /> :
                      cobradasHoy.slice().sort((a, b) => (b.paid_at ? new Date(b.paid_at).getTime() : 0) - (a.paid_at ? new Date(a.paid_at).getTime() : 0)).map((r) => (
                        <tr key={r.id} className="hover:bg-zinc-800/30 transition">
                          <TD cls="whitespace-nowrap text-xs text-zinc-400">{dateTimeAR(r.paid_at)}</TD>
                          <TD cls="whitespace-nowrap">{r.seller_name ?? "Vendedor"}</TD>
                          <TD>{fullName(r.client?.first_name, r.client?.last_name)}</TD>
                          <TD cls="whitespace-nowrap">#{r.installment_number}</TD>
                          <TD cls="whitespace-nowrap font-bold text-emerald-300">{money(Number(r.amount ?? r.operation?.installment_amount ?? 0))}</TD>
                        </tr>
                      ))}
                  </tbody>
                </Tw>
                <div className="mt-3 text-xs text-zinc-600">Mora calculada con late_fee_type y late_fee_value de la operación.</div>
              </Card>
            )}

            {role === "admin" && (
              <Card title="📥 Exportar cobranza">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ExportBlock label="Por mes" type="month" value={exportMonth} onChange={setExportMonth} onExport={() => exportCobranza("month", exportMonth)} btnLabel="Descargar cobranza del mes" btnVariant="success" />
                  <ExportBlock label="Por semana (elegí el lunes)" type="date" value={exportWeek} onChange={setExportWeek} onExport={() => exportCobranza("week", exportWeek)} btnLabel="Descargar cobranza de la semana" btnVariant="primary" />
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            PRÉSTAMOS DIARIOS
        ══════════════════════════════════════════════ */}
        {view === "daily-loans" && role !== "admin" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="⚡ Préstamos diarios" sub="Cuotas diarias con planes fijos">
              <div className="space-y-5">
                <div>
                  <Label>Cliente</Label>
                  <div className="flex gap-2 mb-3"><Pill active={dailyClientMode === "existing"} onClick={() => setDailyClientMode("existing")}>Existente</Pill><Pill active={dailyClientMode === "new"} onClick={() => setDailyClientMode("new")}>Nuevo</Pill></div>
                  {dailyClientMode === "existing" ? (
                    <Sel value={dailySelectedClientId} onChange={(e) => setDailySelectedClientId(e.target.value)}>
                      <option value="">Seleccionar cliente</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{fullName(c.first_name, c.last_name)}</option>)}
                    </Sel>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Nombre *" value={dailyFirstName} onChange={(e) => setDailyFirstName(e.target.value)} />
                      <Input placeholder="Apellido *" value={dailyLastName} onChange={(e) => setDailyLastName(e.target.value)} />
                      <Input placeholder="DNI" value={dailyDni} onChange={(e) => setDailyDni(e.target.value)} />
                      <Input placeholder="Teléfono" value={dailyPhone} onChange={(e) => setDailyPhone(e.target.value)} />
                      <Input placeholder="Dirección" value={dailyAddress} onChange={(e) => setDailyAddress(e.target.value)} className="col-span-2" />
                    </div>
                  )}
                </div>
                <div>
                  <Label>Plan de cuotas</Label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {([12, 17, 24, 36, 48] as const).map((p) => (
                      <button key={p} type="button" onClick={() => setDailyLoanPlan(p)} className={`py-2.5 rounded-xl text-sm font-bold border transition ${dailyLoanPlan === p ? "bg-violet-600 border-violet-500 text-white" : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>{p}</button>
                    ))}
                  </div>
                  <div className="text-xs text-zinc-600 mt-1.5">12→20% · 17→35% · 24→45% · 36→75% · 48→100%</div>
                </div>
                <div><Label>Monto del préstamo</Label><Input placeholder="Ej: 50000" value={dailyLoanAmount} onChange={(e) => setDailyLoanAmount(e.target.value)} inputMode="decimal" /></div>
                <div><Label>Interés (%)</Label><Input value={dailyLoanInterest} onChange={(e) => setDailyLoanInterest(e.target.value)} inputMode="decimal" /></div>
                <div>
                  <Label>Primera cuota</Label>
                  <input type="date" value={dailyLoanFirstDueDate} onChange={(e) => setDailyLoanFirstDueDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                </div>
                <Btn variant="success" size="lg" onClick={createDailyLoan} disabled={savingDailyLoan} className="w-full">{savingDailyLoan ? <><Spinner /> Creando...</> : "⚡ Crear préstamo diario"}</Btn>
              </div>
            </Card>

            {dailyBase > 0 && (
              <Card title="Vista previa">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-zinc-900 border border-zinc-700/50 p-4"><div className="text-xs text-zinc-500 mb-1">Prestado</div><div className="text-xl font-bold">{money(dailyBase)}</div></div>
                  <div className="rounded-xl bg-zinc-900 border border-zinc-700/50 p-4"><div className="text-xs text-zinc-500 mb-1">Plan</div><div className="text-xl font-bold text-violet-300">{dailyLoanPlan} cuotas</div></div>
                  <div className="rounded-xl bg-zinc-900 border border-zinc-700/50 p-4"><div className="text-xs text-zinc-500 mb-1">Total</div><div className="text-xl font-bold text-sky-300">{money(dailyTotal)}</div></div>
                  <div className="rounded-xl bg-zinc-900 border border-zinc-700/50 p-4"><div className="text-xs text-zinc-500 mb-1">Cuota/día</div><div className="text-xl font-bold text-emerald-300">{money(dailyInstAmt)}</div></div>
                </div>
                <div className="text-xs text-zinc-600 text-center mt-3">Interés: {dailyInt}% sobre {money(dailyBase)}</div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* MODAL EDIT */}
      {role === "admin" && editingOp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
              <div><div className="font-bold">Editar operación</div><div className="text-xs text-zinc-500">{loadingClientForEdit ? "Cargando..." : fullName(editClientFirst || null, editClientLast || null)}</div></div>
              <Btn variant="ghost" size="sm" onClick={() => setEditingOp(null)}>✕ Cerrar</Btn>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3">👤 Datos del cliente</div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-2">
                  {!editClientId ? <div className="text-sm text-zinc-500">Sin cliente asignado.</div> : (
                    <>
                      <div className="grid grid-cols-2 gap-2"><Input placeholder="Nombre" value={editClientFirst} onChange={(e) => setEditClientFirst(e.target.value)} disabled={loadingClientForEdit} /><Input placeholder="Apellido" value={editClientLast} onChange={(e) => setEditClientLast(e.target.value)} disabled={loadingClientForEdit} /></div>
                      <div className="grid grid-cols-2 gap-2"><Input placeholder="DNI" value={editClientDni} onChange={(e) => setEditClientDni(e.target.value)} inputMode="numeric" disabled={loadingClientForEdit} /><Input placeholder="Celular" value={editClientPhone} onChange={(e) => setEditClientPhone(e.target.value)} inputMode="tel" disabled={loadingClientForEdit} /></div>
                      <Input placeholder="Dirección" value={editClientAddress} onChange={(e) => setEditClientAddress(e.target.value)} disabled={loadingClientForEdit} />
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3">📋 Datos de la operación</div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Tipo</Label><Sel value={editType} onChange={(e) => setEditType(e.target.value as any)}><option value="sale">Venta</option><option value="loan">Préstamo</option></Sel></div>
                    <div><Label>Frecuencia</Label><Sel value={editFrequency} onChange={(e) => setEditFrequency(e.target.value as any)}><option value="weekly">Semanal</option><option value="biweekly">Quincenal</option><option value="three_weeks">Cada 3 semanas</option><option value="monthly">Mensual</option></Sel></div>
                  </div>
                  <div><Label>{editType === "sale" ? "¿Qué se vendió?" : "Motivo del préstamo"}</Label><Input value={editDetail} onChange={(e) => setEditDetail(e.target.value)} /></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label>Monto base</Label><Input value={editBaseAmount} onChange={(e) => setEditBaseAmount(e.target.value)} inputMode="decimal" /></div>
                    <div><Label>Interés %</Label><Input value={editInterest} onChange={(e) => setEditInterest(e.target.value)} inputMode="decimal" /></div>
                    <div><Label>Cuotas</Label><Input value={editInstallments} onChange={(e) => setEditInstallments(e.target.value)} inputMode="numeric" /></div>
                  </div>
                  <div><Label>Notas</Label><Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /></div>
                </div>
              </div>
              <div className="flex gap-3">
                <Btn variant="primary" size="lg" onClick={saveEditOperation} disabled={savingEdit || loadingClientForEdit} className="flex-1">{savingEdit ? <><Spinner /> Guardando...</> : "✓ Guardar cambios"}</Btn>
                <Btn variant="ghost" size="lg" onClick={() => setEditingOp(null)}>Cancelar</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function OpsFilters({ opSearch, setOpSearch, opTypeFilter, setOpTypeFilter }: { opSearch: string; setOpSearch: (v: string) => void; opTypeFilter: "all" | "sale" | "loan"; setOpTypeFilter: (v: "all" | "sale" | "loan") => void }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input placeholder="Buscar por cliente, detalle o vendedor..." value={opSearch} onChange={(e) => setOpSearch(e.target.value)}
        className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 placeholder:text-zinc-600" />
      <div className="flex gap-1.5">
        {(["all", "sale", "loan"] as const).map((t) => (
          <Btn key={t} size="sm" variant={opTypeFilter === t ? "primary" : "ghost"} onClick={() => setOpTypeFilter(t)}>
            {t === "all" ? "Todos" : t === "sale" ? "Ventas" : "Préstamos"}
          </Btn>
        ))}
      </div>
    </div>
  )
}

function OpCard({ op, role, onEdit, onDelete }: { op: Operation; role: Role; onEdit?: (op: Operation) => void; onDelete?: (id: string) => void }) {
  const detail = op.operation_type === "sale" ? op.sale_item : op.loan_purpose
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{op.client_name || "Sin nombre"}</div>
          <div className="text-xs text-zinc-500 mt-0.5">{detail || "Sin detalle"}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge color={op.operation_type === "sale" ? "bg-sky-900 text-sky-300" : "bg-violet-900 text-violet-300"}>{op.operation_type === "sale" ? "Venta" : "Préstamo"}</Badge>
            <span className="text-xs text-zinc-500">{freqLabel[op.frequency]}</span>
          </div>
        </div>
        {role === "admin" && op.seller_name && <Badge color="bg-zinc-800 text-zinc-300">{op.seller_name}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-zinc-950/60 p-2.5"><div className="text-[10px] text-zinc-500">Total</div><div className="font-bold text-sky-300 text-sm">{money(op.total_amount)}</div></div>
        <div className="rounded-xl bg-zinc-950/60 p-2.5"><div className="text-[10px] text-zinc-500">Cuota</div><div className="font-semibold text-sm">{money(op.installment_amount)}</div></div>
        <div className="rounded-xl bg-zinc-950/60 p-2.5"><div className="text-[10px] text-zinc-500">1ra cuota</div><div className="font-semibold text-emerald-300 text-sm">{dateAR(op.first_due_date)}</div></div>
        <div className="rounded-xl bg-zinc-950/60 p-2.5"><div className="text-[10px] text-zinc-500">Cuotas / %</div><div className="font-semibold text-sm">{op.installments_count} × {op.interest_percent}%</div></div>
      </div>
      {role === "admin" && (onEdit || onDelete) && (
        <div className="grid grid-cols-2 gap-2">
          {onEdit && <Btn size="sm" variant="default" onClick={() => onEdit(op)}>✏ Editar</Btn>}
          {onDelete && <Btn size="sm" variant="danger" onClick={() => onDelete(op.id)}>✕ Borrar</Btn>}
        </div>
      )}
    </div>
  )
}

function OpsTable({ role, operations, onEdit, onDelete }: { role: Role; operations: Operation[]; onEdit?: (op: Operation) => void; onDelete?: (id: string) => void }) {
  const isAdmin = role === "admin"
  return (
    <Tw>
      <thead><tr>
        {isAdmin && <TH>Vendedor</TH>}
        <TH>Cliente</TH><TH>Fecha</TH><TH>1ra cuota</TH><TH>Tipo</TH><TH>Detalle</TH><TH>Frec.</TH><TH>Base</TH><TH>%</TH><TH>Total</TH><TH>Cuotas</TH><TH>Cuota</TH>
        {isAdmin && (onEdit || onDelete) && <TH>Acciones</TH>}
      </tr></thead>
      <tbody>
        {operations.length === 0 ? <Empty cols={isAdmin ? 13 : 12} msg="No hay operaciones" /> :
          operations.map((op) => {
            const detail = op.operation_type === "sale" ? op.sale_item : op.loan_purpose
            return (
              <tr key={op.id} className="hover:bg-zinc-800/30 transition">
                {isAdmin && <TD cls="whitespace-nowrap text-xs text-zinc-400">{op.seller_name ?? "Vendedor"}</TD>}
                <TD cls="whitespace-nowrap font-semibold">{op.client_name || "—"}</TD>
                <TD cls="whitespace-nowrap text-xs text-zinc-400">{new Date(op.created_at).toLocaleDateString("es-AR")}</TD>
                <TD cls="whitespace-nowrap font-semibold text-emerald-300">{dateAR(op.first_due_date)}</TD>
                <TD cls="whitespace-nowrap"><Badge color={op.operation_type === "sale" ? "bg-sky-900 text-sky-300" : "bg-violet-900 text-violet-300"}>{op.operation_type === "sale" ? "Venta" : "Préstamo"}</Badge></TD>
                <TD cls="max-w-[180px] truncate">{detail || <span className="text-zinc-600">—</span>}</TD>
                <TD cls="whitespace-nowrap text-xs text-zinc-400">{freqLabel[op.frequency]}</TD>
                <TD cls="whitespace-nowrap">{money(op.base_amount)}</TD>
                <TD cls="whitespace-nowrap text-zinc-400">{op.interest_percent}%</TD>
                <TD cls="whitespace-nowrap font-bold text-sky-300">{money(op.total_amount)}</TD>
                <TD cls="whitespace-nowrap text-center">{op.installments_count}</TD>
                <TD cls="whitespace-nowrap">{money(op.installment_amount)}</TD>
                {isAdmin && (onEdit || onDelete) && (
                  <TD cls="whitespace-nowrap"><div className="flex gap-1.5">
                    {onEdit && <Btn size="sm" variant="default" onClick={() => onEdit(op)}>✏</Btn>}
                    {onDelete && <Btn size="sm" variant="danger" onClick={() => onDelete(op.id)}>✕</Btn>}
                  </div></TD>
                )}
              </tr>
            )
          })}
      </tbody>
    </Tw>
  )
}

function ExportBlock({ label, type, value, onChange, onExport, btnLabel, btnVariant }: { label: string; type: "month" | "date"; value: string; onChange: (v: string) => void; onExport: () => void; btnLabel: string; btnVariant: "success" | "primary" }) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-semibold text-zinc-300">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40" />
      <Btn variant={btnVariant} onClick={onExport} className="w-full">{btnLabel}</Btn>
    </div>
  )
}
