"use client"

import { useEffect, useMemo, useState } from "react"
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

  // joined / computed
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

const freqLabel: Record<Operation["frequency"], string> = {
  daily: "Diaria",
  weekly: "Semanal",
  biweekly: "Quincenal",
  three_weeks: "Cada 3 semanas",
  monthly: "Mensual",
}

function money(n: number) {
  if (!Number.isFinite(n)) return "$ 0"
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  })
}

function toNumber(v: string) {
  const x = Number(String(v).replace(",", "."))
  return Number.isFinite(x) ? x : 0
}

function fullName(first?: string | null, last?: string | null) {
  const s = [first, last].filter(Boolean).join(" ").trim()
  return s || "Sin nombre"
}

function dateAR(d: string | null | undefined) {
  if (!d) return "—"

  const onlyDate = d.slice(0, 10)
  const [y, m, day] = onlyDate.split("-")

  if (!y || !m || !day) return d

  return `${day}/${m}/${y}`
}


function dateTimeAR(d: string | null | undefined) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleString("es-AR")
  } catch {
    return "—"
  }
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function daysLate(dueDateISO: string | null | undefined) {
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

function computeLateFee(opts: {
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

// ---------- PAGE ----------
export default function Page() {
  const router = useRouter()

  // auth / profile
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<Role>("seller")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // view mode (admin y seller)
  const [view, setView] = useState<"ops" | "cobranza" | "daily-loans">("ops")

  const [reportMonth, setReportMonth] = useState(() => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
})
  // export filters
  const [exportMonth, setExportMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [exportWeek, setExportWeek] = useState(() => {
    const now = new Date()
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
    return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,"0")}-${String(monday.getDate()).padStart(2,"0")}`
  })

  // seller data
  const [clients, setClients] = useState<Client[]>([])
  const [operations, setOperations] = useState<Operation[]>([])

  // cobranza data
  const [installmentsData, setInstallmentsData] = useState<InstallmentRow[]>([])
  const [loadingCobranza, setLoadingCobranza] = useState(false)
  const [savingCobranzaId, setSavingCobranzaId] = useState<string | null>(null)

  // form (solo seller)
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing")
  const [selectedClientId, setSelectedClientId] = useState<string>("")

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [dni, setDni] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")

  const DAILY_PLANS = {
    12: 20,
    17: 35,
    24: 45,
    36: 75,
    48: 100,
  } as const

  const [dailyClientMode, setDailyClientMode] = useState<"existing" | "new">("existing")
  const [dailySelectedClientId, setDailySelectedClientId] = useState<string>("")

  const [dailyFirstName, setDailyFirstName] = useState("")
  const [dailyLastName, setDailyLastName] = useState("")
  const [dailyDni, setDailyDni] = useState("")
  const [dailyPhone, setDailyPhone] = useState("")
  const [dailyAddress, setDailyAddress] = useState("")

  const [dailyLoanAmount, setDailyLoanAmount] = useState("")
  const [dailyLoanPlan, setDailyLoanPlan] = useState<12 | 17 | 24 | 36 | 48>(12)
  const [dailyLoanInterest, setDailyLoanInterest] = useState("20")
  const [dailyLoanFirstDueDate, setDailyLoanFirstDueDate] = useState("")
  const [savingDailyLoan, setSavingDailyLoan] = useState(false)

  const [operationType, setOperationType] = useState<Operation["operation_type"]>("sale")
  const [saleItem, setSaleItem] = useState("")
  const [loanPurpose, setLoanPurpose] = useState("")

  const [frequency, setFrequency] = useState<Operation["frequency"]>("weekly")
  const [baseAmount, setBaseAmount] = useState("")
  const [interestPercent, setInterestPercent] = useState("")
  const [installments, setInstallments] = useState("1")
  const [notes, setNotes] = useState("")
  const [lateFeeType, setLateFeeType] = useState<"fixed_daily" | "percent_daily">("fixed_daily")
  const [lateFeeValue, setLateFeeValue] = useState("")

  const [saving, setSaving] = useState(false)

  const baseAmountNum = useMemo(() => toNumber(baseAmount), [baseAmount])
  const interestPercentNum = useMemo(() => toNumber(interestPercent), [interestPercent])
  const installmentsNum = useMemo(() => {
    const n = Math.max(1, Math.min(60, Math.trunc(toNumber(installments))))
    return n || 1
  }, [installments])

  // preview total/cuota (solo UI)
  const previewTotal = useMemo(() => {
    const total = baseAmountNum * (1 + interestPercentNum / 100)
    return Math.max(0, total)
  }, [baseAmountNum, interestPercentNum])

  const previewInstallment = useMemo(() => {
    if (installmentsNum <= 0) return 0
    return previewTotal / installmentsNum
  }, [previewTotal, installmentsNum])

  // ---------- ADMIN EDIT MODAL ----------
  const [editingOp, setEditingOp] = useState<Operation | null>(null)

  const [editType, setEditType] = useState<Operation["operation_type"]>("sale")
  const [editFrequency, setEditFrequency] = useState<Operation["frequency"]>("weekly")
  const [editBaseAmount, setEditBaseAmount] = useState("")
  const [editInterest, setEditInterest] = useState("")
  const [editInstallments, setEditInstallments] = useState("")
  const [editDetail, setEditDetail] = useState("")
  const [editNotes, setEditNotes] = useState("")

  const [editClientId, setEditClientId] = useState<string | null>(null)
  const [editClientFirst, setEditClientFirst] = useState("")
  const [editClientLast, setEditClientLast] = useState("")
  const [editClientDni, setEditClientDni] = useState("")
  const [editClientPhone, setEditClientPhone] = useState("")
  const [editClientAddress, setEditClientAddress] = useState("")
  const [loadingClientForEdit, setLoadingClientForEdit] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    setDailyLoanInterest(String(DAILY_PLANS[dailyLoanPlan]))
  }, [dailyLoanPlan])

  useEffect(() => {
    if (dailyLoanFirstDueDate) return

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    const yyyy = tomorrow.getFullYear()
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0")
    const dd = String(tomorrow.getDate()).padStart(2, "0")

    setDailyLoanFirstDueDate(`${yyyy}-${mm}-${dd}`)
  }, [dailyLoanFirstDueDate])

  // ---------- AUTH ----------
  useEffect(() => {
    let mounted = true

    async function init() {
      setLoading(true)
      setErrorMsg(null)

      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return

      if (error) {
        setErrorMsg(error.message)
        setLoading(false)
        return
      }

      const user = data.session?.user
      if (!user) {
        router.replace("/login")
        return
      }

      setUserId(user.id)

      const profRes = await supabase.from("profiles").select("id, name, role").eq("id", user.id).maybeSingle()
      if (!mounted) return

      const r = ((profRes.data as any)?.role as Role) ?? "seller"
      setRole(r)
      setProfile({
        id: user.id,
        role: r,
        name: (profRes.data as any)?.name ?? null,
      })

      await fetchOperations(user.id, r)
      if (r !== "admin") {
        await fetchClients(user.id)
      }
      await fetchCobranza(user.id, r)

      setLoading(false)
    }

    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/login")
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [router])

  // ---------- DATA ----------
  async function fetchClients(sellerId: string) {
    setErrorMsg(null)

    const res = await supabase
      .from("clients")
      .select("id, first_name, last_name, dni, phone, address, created_by, created_at")
      .eq("created_by", sellerId)
      .order("created_at", { ascending: false })

    if (res.error) {
      console.error("fetchClients error:", res.error)
      setErrorMsg(res.error.message)
      setClients([])
      return
    }

    setClients((res.data as any) ?? [])
  }

  async function fetchOperations(currentUserId: string, currentRole: Role) {
    setErrorMsg(null)

    const baseSelect =
      "id, created_at, first_due_date, seller_id, operation_type, frequency, client_id, base_amount, interest_percent, installments_count, total_amount, installment_amount, notes, sale_item, loan_purpose, late_fee_type, late_fee_value, clients:client_id(first_name, last_name)"

    let q = supabase.from("operations").select(baseSelect).order("created_at", { ascending: false })
    if (currentRole !== "admin") q = q.eq("seller_id", currentUserId)

    const res = await q
    if (res.error) {
      console.error(res.error)
      setErrorMsg(res.error.message)
      setOperations([])
      return
    }

    const rawOps: any[] = (res.data as any) ?? []

    // Normalizar y agregar client_name
    const ops: Operation[] = rawOps.map((o) => ({
      ...o,
      client_name: fullName(o.clients?.first_name ?? null, o.clients?.last_name ?? null),
    }))

    // Traer nombres de vendedores (admin)
    const sellerIds = Array.from(new Set(ops.map((o) => o.seller_id).filter(Boolean)))
    if (sellerIds.length) {
      const sellersRes = await supabase.from("profiles").select("id, name").in("id", sellerIds)
      const map = new Map<string, string>()
      if (!sellersRes.error) {
        for (const p of (sellersRes.data as any[]) ?? []) {
          map.set(p.id, String(p.name ?? "").trim() || "Vendedor")
        }
      }
      setOperations(ops.map((o) => ({ ...o, seller_name: map.get(o.seller_id) ?? "Vendedor" })))
      return
    }

    setOperations(ops)
  }

  function todayISO() {
    const d = new Date()

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")

    return `${yyyy}-${mm}-${dd}`
  }

  // ---------- EXPORTAR EXCEL ----------
  function exportToCSV(filterType: "month" | "week", filterValue: string) {
    let startDate: Date
    let endDate: Date
    let fileLabel: string

    if (filterType === "month") {
      const [y, m] = filterValue.split("-").map(Number)
      startDate = new Date(y, m - 1, 1)
      endDate = new Date(y, m, 0, 23, 59, 59, 999)
      fileLabel = filterValue
    } else {
      const [y, m, d] = filterValue.split("-").map(Number)
      startDate = new Date(y, m - 1, d)
      endDate = new Date(y, m - 1, d + 6, 23, 59, 59, 999)
      const endLabel = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,"0")}-${String(endDate.getDate()).padStart(2,"0")}`
      fileLabel = `${filterValue}_al_${endLabel}`
    }

    const rows: string[][] = []
    rows.push(["CUOTAS DEL PERÍODO"])
    rows.push(["Cliente", "Fecha vencimiento", "Frecuencia", "Monto cuota", "Estado", "Días atraso", "Mora", "Total a cobrar"])

    for (const inst of installmentsData) {
      if (!inst.due_date) continue
      const [iy, im, id2] = inst.due_date.slice(0, 10).split("-").map(Number)
      const dueDate = new Date(iy, im - 1, id2)
      if (dueDate < startDate || dueDate > endDate) continue

      const op = inst.operation
      const client = inst.client
      const clientName = fullName(client?.first_name, client?.last_name)
      const amount = Number(inst.amount ?? op?.installment_amount ?? 0)
      const status = inst.status === "paid" ? "Pagada" : inst.status === "late" ? "Atrasada" : "Pendiente"
      const late = daysLate(inst.due_date)
      const fee = computeLateFee({
        installmentAmount: amount,
        daysLate: late,
        lateFeeType: op?.late_fee_type ?? null,
        lateFeeValue: op?.late_fee_value ?? 0,
      })

      rows.push([
        clientName,
        dateAR(inst.due_date),
        freqLabel[op?.frequency ?? "weekly"] ?? "—",
        String(Math.round(amount)),
        status,
        String(late),
        String(Math.round(fee)),
        String(Math.round(amount + fee)),
      ])
    }

    rows.push([])
    rows.push(["OPERACIONES CREADAS EN EL PERÍODO"])
    rows.push(["Cliente", "Fecha creación", "Tipo", "Frecuencia", "Monto base", "Total", "Cuotas", "Monto cuota"])

    for (const op of operations) {
      const created = new Date(op.created_at)
      if (created < startDate || created > endDate) continue
      const inst = installmentsData.find((r) => r.operation_id === op.id)
      const clientName = fullName(inst?.client?.first_name, inst?.client?.last_name)

      rows.push([
        clientName,
        dateAR(op.created_at.slice(0, 10)),
        op.operation_type === "sale" ? "Venta" : "Préstamo",
        freqLabel[op.frequency] ?? "—",
        String(Math.round(op.base_amount)),
        String(Math.round(op.total_amount)),
        String(op.installments_count),
        String(Math.round(op.installment_amount)),
      ])
    }

    // "sep=;" le indica a Excel que el separador es punto y coma (estándar Argentina/España)
    const bom = "\uFEFF"
    const sepHint = "sep=;\r\n"
    const csv = bom + sepHint + rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `reporte_${fileLabel}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }


  async function fetchCobranza(currentUserId: string, currentRole: Role) {
    setLoadingCobranza(true)
    setErrorMsg(null)

    try {
      const today = todayISO()

      let q = supabase.from("installments").select(`
        id,
        operation_id,
        installment_number,
        due_date,
        amount,
        status,
        paid_at,
        operations:operation_id (
          id,
          seller_id,
          client_id,
          frequency,
          installment_amount,
          late_fee_type,
          late_fee_value,
          clients:client_id (
            id,
            first_name,
            last_name,
            phone,
            address
          )
        )
      `)

      // Si NO es admin (seller/cobrador): solo lo suyo + hoy y atrasadas + NO pagadas
      if (currentRole !== "admin") {
        q = q.eq("operations.seller_id", currentUserId).neq("status", "paid").lte("due_date", today)
      }

      q = q.order("due_date", { ascending: true })

      const res = await q
      if (res.error) {
        console.error("fetchCobranza error:", res.error)
        setErrorMsg(res.error.message)
        setInstallmentsData([])
        return
      }

      const rows = ((res.data as any[]) ?? []) as any[]

      const normalized: InstallmentRow[] = rows.map((r) => {
        const op = r?.operations ?? null
        const c = op?.clients ?? null

        return {
          id: String(r.id),
          operation_id: String(r.operation_id),
          installment_number: Number(r.installment_number ?? 0),
          due_date: r.due_date ?? null,
          amount: r.amount ?? null,
          status: (r.status ?? "pending") as InstallmentStatus,
          paid_at: r.paid_at ?? null,

          operation: op
            ? {
                id: String(op.id),
                seller_id: String(op.seller_id),
                client_id: op.client_id ?? null,
                frequency: op.frequency,
                installment_amount: Number(op.installment_amount ?? 0),
                late_fee_type: op.late_fee_type ?? "fixed_daily",
                late_fee_value: op.late_fee_value ?? 0,
              }
            : null,

          client: c
            ? {
                id: String(c.id),
                first_name: c.first_name ?? null,
                last_name: c.last_name ?? null,
                phone: c.phone ?? null,
                address: c.address ?? null,
              }
            : null,
        }
      })

      setInstallmentsData(normalized)
    } catch (e: any) {
      console.error("fetchCobranza exception:", e)
      setErrorMsg(e?.message ?? "Error inesperado")
      setInstallmentsData([])
    } finally {
      setLoadingCobranza(false)
    }
  }

  async function payInstallment(id: string) {
    const { error } = await supabase
      .from("installments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) {
      alert("Error al registrar pago")
      console.error(error)
      return
    }

    fetchCobranza(userId as string, role)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace("/login")
  }

  // ---------- CRUD ----------
  async function createClientIfNeeded(): Promise<string | null> {
    if (clientMode === "existing") return selectedClientId || null
    if (!userId) return null

    const fn = firstName.trim()
    const ln = lastName.trim()
    const d = dni.trim()
    const ph = phone.trim()
    const addr = address.trim()

    if (!fn && !ln) {
      alert("Completá nombre o apellido del cliente.")
      return null
    }

    const res = await supabase
      .from("clients")
      .insert({
        first_name: fn || null,
        last_name: ln || null,
        dni: d || null,
        phone: ph || null,
        address: addr || null,
        created_by: userId,
      })
      .select("id")
      .single()

    if (res.error) {
      alert(res.error.message)
      return null
    }

    const newId = (res.data as any)?.id as string

    await fetchClients(userId)
    setSelectedClientId(newId)

    setFirstName("")
    setLastName("")
    setDni("")
    setPhone("")
    setAddress("")

    return newId
  }

  async function saveOperation() {
    if (!userId) return

    setSaving(true)
    try {
      const clientId = await createClientIfNeeded()
      if (!clientId) return

      // Calcular primera cuota según frecuencia, partiendo de HOY (fecha local, sin desfase UTC)
      const baseDate = new Date()
      const todayY = baseDate.getFullYear()
      const todayM = baseDate.getMonth()
      const todayD = baseDate.getDate()
      let firstDueDateObj: Date
      if (frequency === "weekly") {
        firstDueDateObj = new Date(todayY, todayM, todayD + 7)
      } else if (frequency === "biweekly") {
        firstDueDateObj = new Date(todayY, todayM, todayD + 15)
      } else if (frequency === "three_weeks") {
        firstDueDateObj = new Date(todayY, todayM, todayD + 21)
      } else {
        // monthly: mismo día del mes siguiente
        firstDueDateObj = new Date(todayY, todayM + 1, todayD)
      }
      const fdY = firstDueDateObj.getFullYear()
      const fdM = String(firstDueDateObj.getMonth() + 1).padStart(2, "0")
      const fdD = String(firstDueDateObj.getDate()).padStart(2, "0")
      const firstDueDate = `${fdY}-${fdM}-${fdD}`

      const payload: any = {
        seller_id: userId,
        operation_type: operationType,
        frequency,
        client_id: clientId,
        base_amount: baseAmountNum,
        interest_percent: interestPercentNum,
        installments_count: installmentsNum,
        total_amount: previewTotal,
        installment_amount: previewInstallment,
        first_due_date: firstDueDate,
        notes: notes.trim() || null,
        sale_item: operationType === "sale" ? saleItem.trim() || null : null,
        loan_purpose: operationType === "loan" ? loanPurpose.trim() || null : null,
        late_fee_type: lateFeeType,
        late_fee_value: toNumber(lateFeeValue) || null,
      }

      const res = await supabase.from("operations").insert(payload).select("id").single()
      if (res.error) {
        alert(res.error.message)
        return
      }

      const operationId = (res.data as any)?.id as string


      setSaleItem("")
      setLoanPurpose("")
      setBaseAmount("")
      setInterestPercent("")
      setInstallments("1")
      setNotes("")
      setLateFeeType("fixed_daily")
      setLateFeeValue("")

      await fetchOperations(userId, role)
      await fetchCobranza(userId!, role)
      alert("Operación guardada")
    } finally {
      setSaving(false)
    }
  }

  async function deleteOperation(opId: string) {
    if (role !== "admin") return
    if (!confirm("¿Borrar operación?")) return

    // Buscar el client_id de esta operación
    const opData = operations.find((o) => o.id === opId)
    const clientId = opData?.client_id ?? null

    // Borrar la operación
    const res = await supabase.from("operations").delete().eq("id", opId)
    if (res.error) {
      alert(res.error.message)
      return
    }

    // Si tenía cliente, verificar si tiene otras operaciones
    if (clientId) {
      const { data: otherOps } = await supabase
        .from("operations")
        .select("id")
        .eq("client_id", clientId)
        .limit(1)

      // Si no tiene más operaciones, borrar el cliente también
      if (!otherOps || otherOps.length === 0) {
        await supabase.from("clients").delete().eq("id", clientId)
      }
    }

    await fetchOperations(userId!, role)
    await fetchCobranza(userId!, role)
    if (role !== "admin") await fetchClients(userId!)
  }

  async function startEditOperation(op: Operation) {
    if (role !== "admin") return

    setEditingOp(op)

    setEditType(op.operation_type)
    setEditFrequency(op.frequency)
    setEditBaseAmount(String(op.base_amount ?? ""))
    setEditInterest(String(op.interest_percent ?? ""))
    setEditInstallments(String(op.installments_count ?? "1"))
    setEditDetail(op.operation_type === "sale" ? String(op.sale_item ?? "") : String(op.loan_purpose ?? ""))
    setEditNotes(String(op.notes ?? ""))

    const cid = op.client_id
    setEditClientId(cid)
    if (!cid) {
      setEditClientFirst("")
      setEditClientLast("")
      setEditClientDni("")
      setEditClientPhone("")
      setEditClientAddress("")
      return
    }

    setLoadingClientForEdit(true)
    try {
      const cRes = await supabase
        .from("clients")
        .select("id, first_name, last_name, dni, phone, address")
        .eq("id", cid)
        .maybeSingle()

      if (cRes.error) {
        alert(cRes.error.message)
        return
      }

      const c = cRes.data as any
      setEditClientFirst(String(c?.first_name ?? ""))
      setEditClientLast(String(c?.last_name ?? ""))
      setEditClientDni(String(c?.dni ?? ""))
      setEditClientPhone(String(c?.phone ?? ""))
      setEditClientAddress(String(c?.address ?? ""))
    } finally {
      setLoadingClientForEdit(false)
    }
  }

  async function saveEditOperation() {
    if (role !== "admin") return
    if (!editingOp) return

    const base = toNumber(editBaseAmount)
    const interest = toNumber(editInterest)
    const inst = Math.max(1, Math.min(60, Math.trunc(toNumber(editInstallments)) || 1))

    const total = Math.max(0, base * (1 + interest / 100))
    const installmentAmount = inst > 0 ? total / inst : 0

    setSavingEdit(true)
    try {
      const opPayload: any = {
        operation_type: editType,
        frequency: editFrequency,
        base_amount: base,
        interest_percent: interest,
        installments_count: inst,
        total_amount: total,
        installment_amount: installmentAmount,
        notes: editNotes.trim() || null,
        sale_item: editType === "sale" ? editDetail.trim() || null : null,
        loan_purpose: editType === "loan" ? editDetail.trim() || null : null,
      }

      const opRes = await supabase.from("operations").update(opPayload).eq("id", editingOp.id)
      if (opRes.error) {
        alert(opRes.error.message)
        return
      }

      if (editClientId) {
        const cPayload: any = {
          first_name: editClientFirst.trim() || null,
          last_name: editClientLast.trim() || null,
          dni: editClientDni.trim() || null,
          phone: editClientPhone.trim() || null,
          address: editClientAddress.trim() || null,
        }

        const cRes = await supabase.from("clients").update(cPayload).eq("id", editClientId)
        if (cRes.error) {
          alert("Operación guardada, pero cliente NO se pudo actualizar: " + cRes.error.message)
        }
      }

      setEditingOp(null)
      await fetchOperations(userId!, role)
      await fetchCobranza(userId!, role)
      alert("Operación y cliente actualizados")
    } finally {
      setSavingEdit(false)
    }
  }

  // ---------- COBRANZA: DERIVADOS ----------
  const cobranzaRows = useMemo(() => {
    const rows = installmentsData
      .filter((r) => (r.status ?? "pending") !== "paid")
      .map((r) => {
        const op = r.operation
        const client = r.client
        const amount = Number(r.amount ?? op?.installment_amount ?? 0)
        const late = daysLate(r.due_date)
        const fee = computeLateFee({
          installmentAmount: amount,
          daysLate: late,
          lateFeeType: op?.late_fee_type ?? "fixed_daily",
          lateFeeValue: op?.late_fee_value ?? 0,
        })
        return {
          ...r,
          _amount: amount,
          _daysLate: late,
          _lateFee: fee,
          _totalToPay: amount + fee,
          _clientName: fullName(client?.first_name ?? null, client?.last_name ?? null),
          _clientPhone: client?.phone ?? null,
          _clientAddress: client?.address ?? null,
          _frequency: op?.frequency ?? "weekly",
        }
      })
      .sort((a, b) => {
        const da = a.due_date ? new Date(a.due_date).getTime() : 0
        const db = b.due_date ? new Date(b.due_date).getTime() : 0
        return da - db
      })

    return rows
  }, [installmentsData])

const d = new Date()
const yyyy = d.getFullYear()
const mm = String(d.getMonth() + 1).padStart(2, "0")
const dd = String(d.getDate()).padStart(2, "0")

const hoyISO = `${yyyy}-${mm}-${dd}`

  const cuotasParaHoy = useMemo(() => {
    return cobranzaRows.filter((r) => (r.due_date ?? "").slice(0, 10) === hoyISO)
  }, [cobranzaRows, hoyISO])

  const atrasadas = useMemo(() => {
    return cobranzaRows.filter((r) => (r as any)._daysLate > 0)
  }, [cobranzaRows])

  const cobradasHoy = useMemo(() => {
    return installmentsData.filter((r) => (r.paid_at ?? "").slice(0, 10) === hoyISO)
  }, [installmentsData, hoyISO])

  const totalCobradoHoy = useMemo(() => {
    return cobradasHoy.reduce((acc, r) => acc + Number(r.amount ?? r.operation?.installment_amount ?? 0), 0)
  }, [cobradasHoy])

  // ---------- COBRANZA ACTIONS (solo seller/cobrador) ----------
  async function markInstallmentPaid(installmentId: string) {
    if (!userId) return
    if (role === "admin") return

    setSavingCobranzaId(installmentId)
    try {
      const res = await supabase
        .from("installments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", installmentId)

      if (res.error) {
        alert(res.error.message)
        return
      }
      await fetchCobranza(userId!, role)
    } finally {
      setSavingCobranzaId(null)
    }
  }

  async function markInstallmentNoPay(installmentId: string) {
    if (!userId) return
    if (role === "admin") return

    setSavingCobranzaId(installmentId)
    try {
      const res = await supabase.from("installments").update({ status: "late", paid_at: null }).eq("id", installmentId)
      if (res.error) {
        alert(res.error.message)
        return
      }
      await fetchCobranza(userId!, role)
    } finally {
      setSavingCobranzaId(null)
    }
  }

  async function createDailyClientIfNeeded(): Promise<string | null> {
    if (dailyClientMode === "existing") return dailySelectedClientId || null
    if (!userId) return null

    const fn = dailyFirstName.trim()
    const ln = dailyLastName.trim()
    const d = dailyDni.trim()
    const ph = dailyPhone.trim()
    const addr = dailyAddress.trim()

    if (!fn || !ln) {
      alert("Completá nombre y apellido del cliente.")
      return null
    }

    const res = await supabase
      .from("clients")
      .insert({
        first_name: fn || null,
        last_name: ln || null,
        dni: d || null,
        phone: ph || null,
        address: addr || null,
        created_by: userId,
      })
      .select("id")
      .single()

    if (res.error) {
      alert(res.error.message)
      return null
    }

    await fetchClients(userId)
    return (res.data as any)?.id ?? null
  }

  async function createDailyLoan() {
    if (!userId || savingDailyLoan) return

    setSavingDailyLoan(true)
    try {
      const clientId = await createDailyClientIfNeeded()
      if (!clientId) {
        alert("Seleccioná o creá un cliente.")
        return
      }

      const baseAmountValue = toNumber(dailyLoanAmount)
      if (baseAmountValue <= 0) {
        alert("Ingresá un monto válido.")
        return
      }

      const interestPercentValue = toNumber(dailyLoanInterest)
      const installmentsCountValue = Number(dailyLoanPlan)

      const totalAmount = baseAmountValue * (1 + interestPercentValue / 100)
      const installmentAmount = installmentsCountValue > 0 ? totalAmount / installmentsCountValue : 0

      // Usar la fecha que el usuario eligió en el campo, no forzar mañana
      if (!dailyLoanFirstDueDate) {
        alert("Ingresá la fecha del primer vencimiento.")
        return
      }

      const opRes = await supabase
        .from("operations")
        .insert({
          seller_id: userId,
          client_id: clientId,
          operation_type: "loan",
          frequency: "daily",
          base_amount: baseAmountValue,
          interest_percent: interestPercentValue,
          installments_count: installmentsCountValue,
          total_amount: totalAmount,
          installment_amount: installmentAmount,
          notes: notes.trim() || null,
          first_due_date: dailyLoanFirstDueDate,
        })
        .select("id")
        .single()

      if (opRes.error) {
        alert(opRes.error.message)
        return
      }

      const operationId = (opRes.data as any)?.id as string

      // Generar cuotas diarias con parse de fecha LOCAL (evita desfase UTC en Argentina)
      const [fdY, fdM, fdD] = dailyLoanFirstDueDate.split("-").map(Number)
      const installmentsToInsert = Array.from({ length: installmentsCountValue }, (_, i) => {
        const due = new Date(fdY, fdM - 1, fdD + i) // fecha local, sin UTC
        const dYear = due.getFullYear()
        const dMonth = String(due.getMonth() + 1).padStart(2, "0")
        const dDay = String(due.getDate()).padStart(2, "0")
        return {
          operation_id: operationId,
          installment_number: i + 1,
          due_date: `${dYear}-${dMonth}-${dDay}`,
          amount: installmentAmount,
          status: "pending",
          paid_at: null,
        }
      })

      const insRes = await supabase.from("installments").insert(installmentsToInsert)
      if (insRes.error) {
        alert("Operación creada pero error al generar cuotas: " + insRes.error.message)
        return
      }
      await fetchCobranza(userId, role)

      setDailyClientMode("existing")
      setDailySelectedClientId("")
      setDailyFirstName("")
      setDailyLastName("")
      setDailyDni("")
      setDailyPhone("")
      setDailyAddress("")
      setDailyLoanAmount("")
      setDailyLoanPlan(12)
      setDailyLoanInterest("20")

      await fetchOperations(userId, role)
      await fetchCobranza(userId, role)

      setDailyClientMode("existing")
      setDailySelectedClientId("")
      setDailyFirstName("")
      setDailyLastName("")
      setDailyDni("")
      setDailyPhone("")
      setDailyAddress("")
      setDailyLoanAmount("")
      setDailyLoanPlan(12)
      setDailyLoanInterest("20")

      // Resetear fecha al día siguiente (local)
      const nextDay = new Date()
      nextDay.setDate(nextDay.getDate() + 1)
      const nY = nextDay.getFullYear()
      const nM = String(nextDay.getMonth() + 1).padStart(2, "0")
      const nD = String(nextDay.getDate()).padStart(2, "0")
      setDailyLoanFirstDueDate(`${nY}-${nM}-${nD}`)

      alert("Préstamo diario creado correctamente.")
    } finally {
      setSavingDailyLoan(false)
    }
  }

const reportMonthRange = useMemo(() => {
  const [year, month] = reportMonth.split("-").map(Number)

  if (!year || !month) {
    return {
      start: null as Date | null,
      end: null as Date | null,
    }
  }

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59, 999)

  return { start, end }
}, [reportMonth])

const reportMonthLabel = useMemo(() => {
  if (!reportMonthRange.start) return "—"

  return reportMonthRange.start.toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
  })
}, [reportMonthRange])

const reportOpsSummary = useMemo(() => {
  const [year, month] = reportMonth.split("-").map(Number)

  if (!year || !month) {
    return {
      closedOps: [] as Operation[],
      openOps: [] as Operation[],
    }
  }

  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)
  const installmentsByOp = new Map<string, InstallmentRow[]>()

  for (const row of installmentsData) {
    if (!installmentsByOp.has(row.operation_id)) {
      installmentsByOp.set(row.operation_id, [])
    }
    installmentsByOp.get(row.operation_id)!.push(row)
  }

  const closedOps: Operation[] = []
  const openOps: Operation[] = []

  for (const op of operations) {
    const rows = installmentsByOp.get(op.id) ?? []

    if (rows.length === 0) {
      openOps.push(op)
      continue
    }

    const allPaid = rows.every((r) => r.status === "paid")
    if (!allPaid) {
      openOps.push(op)
      continue
    }

    const paidDates = rows
      .map((r) => r.paid_at)
      .filter(Boolean)
      .map((d) => new Date(d as string).getTime())
      .filter((n) => Number.isFinite(n))

    if (paidDates.length === 0) {
      openOps.push(op)
      continue
    }

    const closedAt = new Date(Math.max(...paidDates))

    if (closedAt >= monthStart && closedAt <= monthEnd) {
      closedOps.push(op)
    } else {
      openOps.push(op)
    }
  }

  return { closedOps, openOps }
}, [reportMonth, operations, installmentsData])

const reportEconomicSummary = useMemo(() => {
  const closedCapital = reportOpsSummary.closedOps.reduce((acc, op) => acc + Number(op.base_amount ?? 0), 0)
  const openCapital = reportOpsSummary.openOps.reduce((acc, op) => acc + Number(op.base_amount ?? 0), 0)
  const interestEarned = reportOpsSummary.closedOps.reduce(
    (acc, op) => acc + Math.max(0, Number(op.total_amount ?? 0) - Number(op.base_amount ?? 0)),
    0
  )

  const paidByOperation = new Map<string, number>()

  for (const row of installmentsData) {
    const current = paidByOperation.get(row.operation_id) ?? 0
    const amount = Number(row.amount ?? row.operation?.installment_amount ?? 0)

    if (row.status === "paid") {
      paidByOperation.set(row.operation_id, current + amount)
    }
  }

  const pendingToCollect = reportOpsSummary.openOps.reduce((acc, op) => {
    const paid = paidByOperation.get(op.id) ?? 0
    const total = Number(op.total_amount ?? 0)
    return acc + Math.max(0, total - paid)
  }, 0)

  return {
    closedCapital,
    openCapital,
    pendingToCollect,
    interestEarned,
  }
}, [reportOpsSummary, installmentsData])

// ---------- UI ----------
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-300">Cargando...</div>
      </div>
    )
  }

  const dailyBaseAmount = Number(dailyLoanAmount || 0)
  const dailyInterestPercent = Number(dailyLoanInterest || 0)
  const dailyInstallmentsCount = Number(dailyLoanPlan || 0)

  const dailyTotalAmount = dailyBaseAmount + dailyBaseAmount * (dailyInterestPercent / 100)

  const dailyInstallmentAmount =
    dailyInstallmentsCount > 0 ? dailyTotalAmount / dailyInstallmentsCount : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-zinc-100">
      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div>
            <div className="text-2xl font-semibold tracking-tight">CrediElectro Dyn</div>
            <div className="text-sm text-zinc-400">
              Rol: <span className="text-zinc-200">{role === "admin" ? "Administrador" : "Vendedor"}</span>
              {profile?.name ? <span className="text-zinc-400"> • {profile.name}</span> : null}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={async () => {
                await fetchOperations(userId!, role)
                await fetchCobranza(userId!, role)
                if (role !== "admin") await fetchClients(userId!)
              }}
              className="px-3 py-2 rounded-xl bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 backdrop-blur"
            >
              Actualizar
            </button>
            <button type="button" onClick={signOut} className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500">
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* NAV (admin + seller) */}
        <div className="mb-6 overflow-x-auto pb-1">
          <div className="inline-flex min-w-full sm:min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-1 gap-1">
            <button
              type="button"
              onClick={() => setView("ops")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                view === "ops" ? "bg-sky-600 text-white" : "text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              Operaciones
            </button>

            <button
              type="button"
              onClick={async () => {
                setView("cobranza")
                await fetchCobranza(userId!, role)
              }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                view === "cobranza" ? "bg-emerald-600 text-white" : "text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              Cobranza
            </button>

            {role !== "admin" && (
              <button
                type="button"
                onClick={() => setView("daily-loans")}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                  view === "daily-loans" ? "bg-purple-600 text-white" : "text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                Préstamos diarios
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl border border-red-900 bg-red-950 text-red-200">{errorMsg}</div>
        )}

        {/* KPI (para ambos) */}
        {view === "cobranza" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-emerald-600 text-white p-3 rounded-xl border border-emerald-700/60">
              <div className="text-sm opacity-80">Cobrado hoy</div>
              <div className="text-xl font-bold">{money(totalCobradoHoy)}</div>
            </div>

            <div className="bg-sky-600 text-white p-3 rounded-xl border border-sky-700/60">
              <div className="text-sm opacity-80">Cuotas para hoy</div>
              <div className="text-xl font-bold">{cuotasParaHoy.length}</div>
            </div>

            <div className="bg-rose-600 text-white p-3 rounded-xl border border-rose-700/60">
              <div className="text-sm opacity-80">Atrasadas</div>
              <div className="text-xl font-bold">{atrasadas.length}</div>
            </div>
          </div>
        )}

        {/* SELLER OPS */}
        {role !== "admin" && view === "ops" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
              <div className="text-lg font-semibold mb-4">Nueva operación</div>

              {/* Cliente */}
              <div className="mb-4">
                <div className="text-sm text-zinc-300 mb-2">Cliente</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={clientMode === "existing"} onChange={() => setClientMode("existing")} />
                    Existente
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={clientMode === "new"} onChange={() => setClientMode("new")} />
                    Nuevo
                  </label>
                </div>

                {clientMode === "existing" ? (
                  <select
                    className="mt-3 w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-700"
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                  >
                    <option value="" className="bg-zinc-950 text-zinc-100">
                      — Elegí un cliente —
                    </option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id} className="bg-zinc-950 text-zinc-100">
                        {fullName(c.first_name, c.last_name)}
                        {c.dni ? ` — DNI ${c.dni}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                        placeholder="Nombre"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                      <input
                        className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                        placeholder="Apellido"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    placeholder="DNI"
                    value={dni}
                    onChange={(e) => setDni(e.target.value)}
                    inputMode="numeric"
                  />
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    placeholder="Celular"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                  />
                </div>

                <div className="mt-3">
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    placeholder="Dirección"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>

              {/* Tipo */}
              <div className="mb-4">
                <div className="text-sm text-zinc-300 mb-2">Tipo</div>
                <select
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-700"
                  value={operationType}
                  onChange={(e) => setOperationType(e.target.value as any)}
                >
                  <option value="sale" className="bg-zinc-950 text-zinc-100">
                    Venta
                  </option>
                  <option value="loan" className="bg-zinc-950 text-zinc-100">
                    Préstamo
                  </option>
                </select>
              </div>

              {/* Detalle */}
              <div className="mb-4">
                <div className="text-sm text-zinc-300 mb-2">
                  {operationType === "sale" ? "Qué se vendió" : "Motivo del préstamo"}
                </div>
                <input
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                  placeholder={operationType === "sale" ? 'Ej: "Heladera", "Moto"...' : 'Ej: "Efectivo", "Compra"...'}
                  value={operationType === "sale" ? saleItem : loanPurpose}
                  onChange={(e) =>
                    operationType === "sale" ? setSaleItem(e.target.value) : setLoanPurpose(e.target.value)
                  }
                />
              </div>

              {/* Frecuencia */}
              <div className="mb-4">
                <div className="text-sm text-zinc-300 mb-2">Frecuencia</div>
                <select
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-700"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as any)}
                >
                  <option value="weekly" className="bg-zinc-950 text-zinc-100">
                    Semanal
                  </option>
                  <option value="biweekly" className="bg-zinc-950 text-zinc-100">
                    Quincenal
                  </option>
                  <option value="three_weeks" className="bg-zinc-950 text-zinc-100">
                    Cada 3 semanas
                  </option>
                  <option value="monthly" className="bg-zinc-950 text-zinc-100">
                    Mensual
                  </option>
                </select>
              </div>

              {/* Números */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Base de monto</div>
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    placeholder="Ej: 50000"
                    value={baseAmount}
                    onChange={(e) => setBaseAmount(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Interés (%)</div>
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    placeholder="Ej: 25"
                    value={interestPercent}
                    onChange={(e) => setInterestPercent(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Cuotas</div>
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    placeholder="Ej: 8"
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>

              {/* Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/60">
                  <div className="text-xs text-zinc-400">Total (vista previa)</div>
                  <div className="text-lg font-semibold text-sky-300">{money(previewTotal)}</div>
                </div>
                <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/60">
                  <div className="text-xs text-zinc-400">Cuota (vista previa)</div>
                  <div className="text-lg font-semibold text-emerald-300">{money(previewInstallment)}</div>
                </div>
              </div>

              {/* Notas */}
              <div className="mb-4">
                <div className="text-sm text-zinc-300 mb-2">Notas (opcional)</div>
                <textarea
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 min-h-[90px]"
                  placeholder="Notas..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Mora por atraso */}
              <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="text-sm text-zinc-300 mb-3 font-semibold">Interés por mora (opcional)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Tipo de mora</div>
                    <select
                      value={lateFeeType}
                      onChange={(e) => setLateFeeType(e.target.value as "fixed_daily" | "percent_daily")}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    >
                      <option value="fixed_daily">Monto fijo por día</option>
                      <option value="percent_daily">% diario sobre la cuota</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">
                      {lateFeeType === "fixed_daily" ? "$ por día de atraso" : "% diario"}
                    </div>
                    <input
                      type="number"
                      min="0"
                      placeholder={lateFeeType === "fixed_daily" ? "Ej: 500" : "Ej: 2"}
                      value={lateFeeValue}
                      onChange={(e) => setLateFeeValue(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    />
                  </div>
                </div>
                {lateFeeValue && toNumber(lateFeeValue) > 0 && (
                  <div className="text-xs text-amber-300 mt-2">
                    {lateFeeType === "fixed_daily"
                      ? `Mora: ${money(toNumber(lateFeeValue))} por cada día de atraso`
                      : `Mora: ${lateFeeValue}% de la cuota por cada día de atraso`}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={saveOperation}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 font-semibold shadow-lg"
              >
                {saving ? "Guardando..." : "Guardar operación"}
              </button>
            </div>

            {/* tabla seller */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
              <OperationsTable role={role} operations={operations} />
            </div>

          </div>
        )}

        {/* ADMIN OPS */}
        {role === "admin" && view === "ops" && (
          <div className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
            <OperationsTable role={role} operations={operations} onEdit={startEditOperation} onDelete={deleteOperation} />

            {/* Exportar Excel - Operaciones */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
              <div className="text-base font-semibold mb-4">📥 Exportar a Excel</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-zinc-900/60 p-4">
                  <div className="text-sm text-zinc-400 mb-2">Por mes</div>
                  <input
                    type="month"
                    value={exportMonth}
                    onChange={(e) => setExportMonth(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 mb-3"
                  />
                  <button
                    type="button"
                    onClick={() => exportToCSV("month", exportMonth)}
                    className="w-full px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 font-semibold text-sm"
                  >
                    Descargar mes
                  </button>
                </div>
                <div className="rounded-xl bg-zinc-900/60 p-4">
                  <div className="text-sm text-zinc-400 mb-2">Por semana (elegí el lunes)</div>
                  <input
                    type="date"
                    value={exportWeek}
                    onChange={(e) => setExportWeek(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 mb-3"
                  />
                  <button
                    type="button"
                    onClick={() => exportToCSV("week", exportWeek)}
                    className="w-full px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 font-semibold text-sm"
                  >
                    Descargar semana
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {role === "admin" && view === "ops" && (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-lg font-semibold mb-1">Reporte mensual</div>
                <div className="text-xs text-zinc-400">
                  Operaciones cerradas, abiertas y resumen económico del mes elegido.
                </div>
              </div>

              <div className="w-full sm:w-auto">
                <div className="text-sm text-zinc-300 mb-2">Seleccionar mes</div>
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600"
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
              Mes seleccionado: <span className="text-zinc-200 font-medium capitalize">{reportMonthLabel}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
              <ReportCard label="Operaciones cerradas del mes" value={String(reportOpsSummary.closedOps.length)} tone="emerald" />
              <ReportCard label="Operaciones abiertas" value={String(reportOpsSummary.openOps.length)} tone="amber" />
              <ReportCard label="Capital recuperado" value={money(reportEconomicSummary.closedCapital)} tone="emerald" />
              <ReportCard label="Capital en la calle" value={money(reportEconomicSummary.openCapital)} tone="amber" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <ReportCard label="Pendiente por cobrar" value={money(reportEconomicSummary.pendingToCollect)} tone="sky" />
              <ReportCard label="Interés ganado en cerradas" value={money(reportEconomicSummary.interestEarned)} tone="violet" />
            </div>
          </div>
        )}

        {role === "admin" && (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-lg font-semibold">Cobranza (vista admin)</div>
                <div className="text-xs text-zinc-400">Pendientes + Pagadas (control general)</div>
              </div>
              <button
                type="button"
                onClick={() => fetchCobranza(userId!, role)}
                className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800"
                disabled={loadingCobranza}
              >
                {loadingCobranza ? "Cargando..." : "Refrescar"}
              </button>
            </div>

            <div className="overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950/40 backdrop-blur">
              <table className="min-w-[1200px] w-full text-sm table-auto border-collapse">
                <thead className="bg-zinc-900">
                  <tr>
                    <th className="text-left p-2 border-b border-zinc-800">Cliente</th>
                    <th className="text-left p-2 border-b border-zinc-800">Vence</th>
                    <th className="text-left p-2 border-b border-zinc-800">Cuota #</th>
                    <th className="text-left p-2 border-b border-zinc-800">Estado</th>
                    <th className="text-left p-2 border-b border-zinc-800">Monto</th>
                    <th className="text-left p-2 border-b border-zinc-800">Pagado el</th>
                  </tr>
                </thead>
                <tbody>
                  {installmentsData.length === 0 ? (
                    <tr>
                      <td className="p-3 text-zinc-400" colSpan={6}>
                        No hay datos de cobranza
                      </td>
                    </tr>
                  ) : (
                    installmentsData.map((r) => (
                      <tr key={r.id} className="odd:bg-zinc-950/40 hover:bg-zinc-900/40">
                        <td className="p-2 border-b border-zinc-900">
                          <div className="font-semibold">{fullName(r.client?.first_name, r.client?.last_name)}</div>
                          <div className="text-xs text-zinc-400">
                            {r.client?.phone ?? ""}
                            {r.client?.address ?? ""}
                          </div>
                        </td>

                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{dateAR(r.due_date)}</td>

                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{r.installment_number}</td>

                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{String(r.status)}</td>

                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                          {money(Number(r.amount ?? r.operation?.installment_amount ?? 0))}
                        </td>

                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                          {r.status !== "paid" && (
                            <button
                              onClick={() => payInstallment(r.id)}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white text-xs"
                            >
                              Pagado
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* COBRANZA (integrada) */}
        {view === "cobranza" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-lg font-semibold">
                  Cobranza {role === "admin" ? "(Solo lectura)" : ""}
                </div>
                <div className="text-xs text-zinc-400">Pendientes + Atrasadas (ordenadas por vencimiento)</div>
              </div>
              <button
                type="button"
                onClick={() => fetchCobranza(userId!, role)}
                className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800"
                disabled={loadingCobranza}
              >
                {loadingCobranza ? "Cargando..." : "Refrescar"}
              </button>
            </div>

            {/* Pendientes / Atrasadas */}
            <div className="md:hidden space-y-3 mb-4">
              {cobranzaRows.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-400">
                  No hay cuotas pendientes 🎉
                </div>
              ) : (
                cobranzaRows.map((r: any) => (
                  <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-zinc-100">{r._clientName}</div>
                        <div className="text-xs text-zinc-400 mt-1">Vence: {dateAR(r.due_date)} · Cuota #{r.installment_number}</div>
                      </div>
                      {role === "admin" && (
                        <span className="text-[11px] rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">
                          {r.seller_name ?? "Vendedor"}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                      <div className="rounded-xl bg-zinc-900/60 p-3">
                        <div className="text-xs text-zinc-400">Monto</div>
                        <div className="font-semibold text-sky-300">{money(r._amount)}</div>
                      </div>
                      <div className="rounded-xl bg-zinc-900/60 p-3">
                        <div className="text-xs text-zinc-400">Total a cobrar</div>
                        <div className="font-semibold text-emerald-300">{money(r._totalToPay)}</div>
                      </div>
                      <div className="rounded-xl bg-zinc-900/60 p-3">
                        <div className="text-xs text-zinc-400">Atraso</div>
                        <div className="font-semibold text-amber-300">{r._daysLate > 0 ? `${r._daysLate} días` : '0 días'}</div>
                      </div>
                      <div className="rounded-xl bg-zinc-900/60 p-3">
                        <div className="text-xs text-zinc-400">Mora</div>
                        <div className="font-semibold text-amber-300">{r._lateFee > 0 ? money(r._lateFee) : '—'}</div>
                      </div>
                    </div>

                    {(r._clientPhone || r._clientAddress) && (
                      <div className="text-xs text-zinc-400 mt-3">
                        {r._clientPhone ? `📞 ${r._clientPhone}` : ''}
                        {r._clientPhone && r._clientAddress ? ' · ' : ''}
                        {r._clientAddress ? `📍 ${r._clientAddress}` : ''}
                      </div>
                    )}

                    {role !== "admin" && (
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <button
                          type="button"
                          onClick={() => markInstallmentPaid(r.id)}
                          disabled={savingCobranzaId === r.id}
                          className="w-full px-3 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 font-semibold"
                        >
                          {savingCobranzaId === r.id ? 'Guardando...' : 'Pagó'}
                        </button>
                        <button
                          type="button"
                          onClick={() => markInstallmentNoPay(r.id)}
                          disabled={savingCobranzaId === r.id}
                          className="w-full px-3 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 font-semibold"
                        >
                          No pagó
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950/40 backdrop-blur">
              <table className="min-w-[1300px] w-full text-sm table-auto border-collapse">
                <thead className="bg-zinc-900">
                  <tr>
                    {role === "admin" && (
                      <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Vendedor</th>
                    )}
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Cliente</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Vence</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Cuota #</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Frecuencia</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Monto</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Atraso</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Mora</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Total a cobrar</th>
                    {role !== "admin" && (
                      <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {cobranzaRows.length === 0 ? (
                    <tr>
                      <td className="p-3 text-zinc-400" colSpan={9}>
                        No hay cuotas pendientes 🎉
                      </td>
                    </tr>
                  ) : (
                    cobranzaRows.map((r: any) => (
                      <tr key={r.id} className="odd:bg-zinc-950/40 hover:bg-zinc-900/40 transition">
                        {role === "admin" && (
                          <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{r.seller_name ?? "Vendedor"}</td>
                        )}
                        <td className="p-2 border-b border-zinc-900">
                          <div className="font-semibold">{r._clientName}</div>
                          <div className="text-xs text-zinc-400">
                            {r._clientPhone ? "📞 " + r._clientPhone : ""}
                            {r._clientAddress ? ` • 📍 ${r._clientAddress}` : ""}
                          </div>
                        </td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{dateAR(r.due_date)}</td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{r.installment_number}</td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                          {freqLabel[r._frequency as keyof typeof freqLabel] ?? "—"}
                        </td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-sky-200 font-semibold">
                          {money(r._amount)}
                        </td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                          {r._daysLate > 0 ? (
                            <span className="text-amber-300 font-semibold">{r._daysLate} días</span>
                          ) : (
                            <span className="text-zinc-400">0</span>
                          )}
                        </td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                          {r._lateFee > 0 ? (
                            <span className="text-amber-300 font-semibold">{money(r._lateFee)}</span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-emerald-300 font-semibold">
                          {money(r._totalToPay)}
                        </td>

                        {role !== "admin" && (
                          <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => markInstallmentPaid(r.id)}
                                disabled={savingCobranzaId === r.id}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60"
                              >
                                {savingCobranzaId === r.id ? "..." : "Pagó"}
                              </button>
                              <button
                                type="button"
                                onClick={() => markInstallmentNoPay(r.id)}
                                disabled={savingCobranzaId === r.id}
                                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60"
                              >
                                No pagó
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          
            {/* ADMIN: Cobrado hoy (solo lectura) */}
            {role === "admin" && (
              <div className="mt-6">
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <div className="text-base font-semibold">Cobrado hoy</div>
                    <div className="text-xs text-zinc-400">Movimientos con paid_at = hoy</div>
                  </div>
                  <div className="text-sm text-zinc-200">
                    Total: <span className="font-semibold text-emerald-300">{money(totalCobradoHoy)}</span>
                  </div>
                </div>

                <div className="overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950/40 backdrop-blur">
                  <table className="min-w-[1100px] w-full text-sm table-auto border-collapse">
                    <thead className="bg-zinc-900">
                      <tr>
                        <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Hora</th>
                        <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Vendedor</th>
                        <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Cliente</th>
                        <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Cuota #</th>
                        <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cobradasHoy.length === 0 ? (
                        <tr>
                          <td className="p-3 text-zinc-400" colSpan={5}>
                            Hoy todavía no hay cobranzas registradas.
                          </td>
                        </tr>
                      ) : (
                        cobradasHoy
                          .slice()
                          .sort((a, b) => {
                            const da = a.paid_at ? new Date(a.paid_at).getTime() : 0
                            const db = b.paid_at ? new Date(b.paid_at).getTime() : 0
                            return db - da
                          })
                          .map((r) => {
                            const clientName = fullName(r.client?.first_name ?? null, r.client?.last_name ?? null)
                            const amt = Number(r.amount ?? r.operation?.installment_amount ?? 0)
                            return (
                              <tr key={r.id} className="odd:bg-zinc-950/40 hover:bg-zinc-900/40 transition">
                                <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{dateTimeAR(r.paid_at)}</td>
                                <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                                  {r.seller_name ?? "Vendedor"}
                                </td>
                                <td className="p-2 border-b border-zinc-900">{clientName}</td>
                                <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{r.installment_number}</td>
                                <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-emerald-300 font-semibold">
                                  {money(amt)}
                                </td>
                              </tr>
                            )
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-3 text-xs text-zinc-500">
              Nota: la mora se calcula con <b>late_fee_type</b> y <b>late_fee_value</b> de la operación (fijo diario o % diario).
            </div>

            {/* Exportar Excel - Cobranza (solo admin) */}
            {role === "admin" && (
            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
              <div className="text-base font-semibold mb-4">📥 Exportar cobranza a Excel</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-zinc-950/60 p-4">
                  <div className="text-sm text-zinc-400 mb-2">Por mes</div>
                  <input
                    type="month"
                    value={exportMonth}
                    onChange={(e) => setExportMonth(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 mb-3"
                  />
                  <button
                    type="button"
                    onClick={() => exportToCSV("month", exportMonth)}
                    className="w-full px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 font-semibold text-sm"
                  >
                    Descargar mes
                  </button>
                </div>
                <div className="rounded-xl bg-zinc-950/60 p-4">
                  <div className="text-sm text-zinc-400 mb-2">Por semana (elegí el lunes)</div>
                  <input
                    type="date"
                    value={exportWeek}
                    onChange={(e) => setExportWeek(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 mb-3"
                  />
                  <button
                    type="button"
                    onClick={() => exportToCSV("week", exportWeek)}
                    className="w-full px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 font-semibold text-sm"
                  >
                    Descargar semana
                  </button>
                </div>
              </div>
            </div>
            )}
          </div>
        )}

        {view === "daily-loans" && role !== "admin" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl mt-6">
            <div className="text-lg font-semibold mb-1">Préstamos diarios</div>
            <div className="text-xs text-zinc-400 mb-4">Crear préstamos con cuotas diarias</div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Cliente</div>
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setDailyClientMode("existing")}
                      className={`px-3 py-2 rounded-xl text-sm border ${
                        dailyClientMode === "existing"
                          ? "bg-emerald-600 text-white border-emerald-500"
                          : "bg-zinc-950 text-zinc-200 border-zinc-800"
                      }`}
                    >
                      Existente
                    </button>

                    <button
                      type="button"
                      onClick={() => setDailyClientMode("new")}
                      className={`px-3 py-2 rounded-xl text-sm border ${
                        dailyClientMode === "new"
                          ? "bg-emerald-600 text-white border-emerald-500"
                          : "bg-zinc-950 text-zinc-200 border-zinc-800"
                      }`}
                    >
                      Nuevo
                    </button>
                  </div>

                  {dailyClientMode === "existing" ? (
                    <select
                      value={dailySelectedClientId}
                      onChange={(e) => setDailySelectedClientId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    >
                      <option value="">Seleccionar cliente</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {fullName(c.first_name, c.last_name)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Nombre"
                        value={dailyFirstName}
                        onChange={(e) => setDailyFirstName(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                      />
                      <input
                        type="text"
                        placeholder="Apellido"
                        value={dailyLastName}
                        onChange={(e) => setDailyLastName(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                      />
                      <input
                        type="text"
                        placeholder="DNI"
                        value={dailyDni}
                        onChange={(e) => setDailyDni(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                      />
                      <input
                        type="text"
                        placeholder="Teléfono"
                        value={dailyPhone}
                        onChange={(e) => setDailyPhone(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                      />
                      <input
                        type="text"
                        placeholder="Dirección"
                        value={dailyAddress}
                        onChange={(e) => setDailyAddress(e.target.value)}
                        className="sm:col-span-2 px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm text-zinc-300 mb-2">Monto prestado</div>
                  <input
                    type="number"
                    value={dailyLoanAmount}
                    onChange={(e) => setDailyLoanAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    placeholder="Ej: 100000"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm text-zinc-300 mb-2">Plan</div>
                    <select
                      value={dailyLoanPlan}
                      onChange={(e) => setDailyLoanPlan(Number(e.target.value) as 12 | 17 | 24 | 36 | 48)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    >
                      <option value={12}>12 cuotas</option>
                      <option value={17}>17 cuotas</option>
                      <option value={24}>24 cuotas</option>
                      <option value={36}>36 cuotas</option>
                      <option value={48}>48 cuotas</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-sm text-zinc-300 mb-2">Interés (%)</div>
                    <input
                      type="number"
                      value={dailyLoanInterest}
                      onChange={(e) => setDailyLoanInterest(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-sm text-zinc-300 mb-2">Primer vencimiento</div>
                  <input
                    type="date"
                    value={dailyLoanFirstDueDate}
                    onChange={(e) => setDailyLoanFirstDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="text-xs text-zinc-400">Monto base</div>
                  <div className="text-xl font-semibold text-zinc-100">{money(dailyBaseAmount)}</div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="text-xs text-zinc-400">Total con interés</div>
                  <div className="text-xl font-semibold text-emerald-300">{money(dailyTotalAmount)}</div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="text-xs text-zinc-400">Cuota diaria</div>
                  <div className="text-xl font-semibold text-sky-300">{money(dailyInstallmentAmount)}</div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="text-xs text-zinc-400">Cantidad de cuotas</div>
                  <div className="text-xl font-semibold text-zinc-100">{dailyLoanPlan}</div>
                </div>

                <div className="text-xs text-zinc-500">Sugeridos: 12→20%, 17→35%, 24→45%, 36→75%, 48→100%.</div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={createDailyLoan}
                disabled={savingDailyLoan}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold"
              >
                {savingDailyLoan ? "Guardando..." : "Crear préstamo diario"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL EDIT (solo admin) */}
      {role === "admin" && editingOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-lg font-semibold">Editar operación + cliente</div>
                <div className="text-xs text-zinc-400">
                  Cliente: {loadingClientForEdit ? "Cargando..." : fullName(editClientFirst || null, editClientLast || null)}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800"
                onClick={() => setEditingOp(null)}
              >
                Cerrar
              </button>
            </div>

            {/* CLIENTE */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 mb-4">
              <div className="text-sm font-semibold mb-3">Datos del cliente</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                  placeholder="Nombre"
                  value={editClientFirst}
                  onChange={(e) => setEditClientFirst(e.target.value)}
                  disabled={loadingClientForEdit || !editClientId}
                />
                <input
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                  placeholder="Apellido"
                  value={editClientLast}
                  onChange={(e) => setEditClientLast(e.target.value)}
                  disabled={loadingClientForEdit || !editClientId}
                />
                <input
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                  placeholder="DNI"
                  value={editClientDni}
                  onChange={(e) => setEditClientDni(e.target.value)}
                  inputMode="numeric"
                  disabled={loadingClientForEdit || !editClientId}
                />
                <input
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                  placeholder="Celular"
                  value={editClientPhone}
                  onChange={(e) => setEditClientPhone(e.target.value)}
                  inputMode="tel"
                  disabled={loadingClientForEdit || !editClientId}
                />
                <input
                  className="sm:col-span-2 w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                  placeholder="Dirección"
                  value={editClientAddress}
                  onChange={(e) => setEditClientAddress(e.target.value)}
                  disabled={loadingClientForEdit || !editClientId}
                />
              </div>
              {!editClientId && <div className="text-xs text-zinc-500 mt-2">Esta operación no tiene cliente asignado.</div>}
            </div>

            {/* OPERACIÓN */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-sm font-semibold mb-3">Datos de la operación</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Tipo</div>
                  <select
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as any)}
                  >
                    <option value="sale">Venta</option>
                    <option value="loan">Préstamo</option>
                  </select>
                </div>

                <div>
                  <div className="text-sm text-zinc-300 mb-2">Frecuencia</div>
                  <select
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    value={editFrequency}
                    onChange={(e) => setEditFrequency(e.target.value as any)}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="three_weeks">Cada 3 semanas</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </div>
              </div>

              <div className="mb-3">
                <div className="text-sm text-zinc-300 mb-2">{editType === "sale" ? "Qué se vendió" : "Motivo del préstamo"}</div>
                <input
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                  value={editDetail}
                  onChange={(e) => setEditDetail(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Monto base</div>
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    value={editBaseAmount}
                    onChange={(e) => setEditBaseAmount(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Interés (%)</div>
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    value={editInterest}
                    onChange={(e) => setEditInterest(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Cuotas</div>
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                    value={editInstallments}
                    onChange={(e) => setEditInstallments(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm text-zinc-300 mb-2">Notas</div>
                <textarea
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 min-h-[90px]"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveEditOperation}
                  disabled={savingEdit || loadingClientForEdit}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 font-semibold"
                >
                  {savingEdit ? "Guardando..." : "Guardar cambios"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingOp(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- TABLE ----------
function OperationsTable({
  role,
  operations,
  onDelete,
  onEdit,
}: {
  role: Role
  operations: Operation[]
  onDelete?: (id: string) => void
  onEdit?: (op: Operation) => void
}) {
  const canAdminActions = role === "admin"

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">Operaciones</div>
      </div>

      <div className="md:hidden space-y-3">
        {operations.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-400">No hay operaciones.</div>
        ) : (
          operations.map((op) => {
            const detail = op.operation_type === "sale" ? op.sale_item : op.loan_purpose
            return (
              <div key={op.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-zinc-100">{detail || "Sin detalle"}</div>
                    <div className="text-xs text-zinc-400 mt-1">{op.operation_type === "sale" ? "Venta" : "Préstamo"} · {freqLabel[op.frequency]}</div>
                  </div>
                  <div className="text-sm font-semibold text-zinc-100">{(op as any).client_name ?? "—"}</div>
                  {role === "admin" && (
                    <span className="text-[11px] rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">
                      {op.seller_name ?? "Vendedor"}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div className="rounded-xl bg-zinc-900/60 p-3">
                    <div className="text-xs text-zinc-400">Fecha</div>
                    <div>{new Date(op.created_at).toLocaleDateString("es-AR")}</div>
                  </div>
                  <div className="rounded-xl bg-zinc-900/60 p-3">
                    <div className="text-xs text-zinc-400">1ra cuota</div>
                    <div className="text-emerald-300 font-semibold">{dateAR(op.first_due_date)}</div>
                  </div>
                  <div className="rounded-xl bg-zinc-900/60 p-3">
                    <div className="text-xs text-zinc-400">Total</div>
                    <div className="text-sky-300 font-semibold">{money(op.total_amount)}</div>
                  </div>
                  <div className="rounded-xl bg-zinc-900/60 p-3">
                    <div className="text-xs text-zinc-400">Cuota</div>
                    <div>{money(op.installment_amount)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                  <div>
                    <div className="text-xs text-zinc-500">Base</div>
                    <div>{money(op.base_amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Interés</div>
                    <div>{op.interest_percent}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Cuotas</div>
                    <div>{op.installments_count}</div>
                  </div>
                </div>

                {canAdminActions && (
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button className="w-full px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700" onClick={() => onEdit?.(op)} type="button">
                      Editar
                    </button>
                    <button className="w-full px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500" onClick={() => onDelete?.(op.id)} type="button">
                      Borrar
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="hidden md:block overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950/40 backdrop-blur">
        <table className="min-w-[1200px] w-full text-sm table-auto border-collapse">
          <thead className="bg-zinc-900">
            <tr>
              {role === "admin" && <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Vendedor</th>}
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Cliente</th>
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Fecha</th>
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">1ra cuota</th>
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Tipo</th>
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Detalle</th>
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Frecuencia</th>
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Base</th>
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">%</th>
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Total</th>
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Cuotas</th>
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Cuota</th>
              {canAdminActions && <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Acciones</th>}
            </tr>
          </thead>

          <tbody>
            {operations.length === 0 ? (
              <tr>
                <td className="p-3 text-zinc-400" colSpan={canAdminActions ? 13 : 12}>
                  No hay operaciones.
                </td>
              </tr>
            ) : (
              operations.map((op) => {
                const detail = op.operation_type === "sale" ? op.sale_item : op.loan_purpose
                return (
                  <tr key={op.id} className="odd:bg-zinc-950/40 hover:bg-zinc-900/40 transition">
                    {role === "admin" && (
                      <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{op.seller_name ?? "Vendedor"}</td>
                    )}
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap font-semibold">{(op as any).client_name ?? "—"}</td>

                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{new Date(op.created_at).toLocaleString("es-AR")}</td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-emerald-300 font-semibold">{dateAR(op.first_due_date)}</td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{op.operation_type === "sale" ? "Venta" : "Préstamo"}</td>
                    <td className="p-2 border-b border-zinc-900 min-w-[220px]">{detail || <span className="text-zinc-500">—</span>}</td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{freqLabel[op.frequency]}</td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{money(op.base_amount)}</td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{op.interest_percent}%</td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-sky-300 font-semibold">{money(op.total_amount)}</td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{op.installments_count}</td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{money(op.installment_amount)}</td>

                    {canAdminActions && (
                      <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700" onClick={() => onEdit?.(op)} type="button">
                            Editar
                          </button>
                          <button className="px-2 py-1 rounded bg-red-600 hover:bg-red-500" onClick={() => onDelete?.(op.id)} type="button">
                            Borrar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReportCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "emerald" | "amber" | "sky" | "violet"
}) {
  const toneClass = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    sky: "text-sky-300",
    violet: "text-violet-300",
  }[tone]

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  )
}
