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
  frequency: "weekly" | "biweekly" | "three_weeks" | "monthly"

  base_amount: number
  interest_percent: number
  installments_count: number
  total_amount: number
  installment_amount: number

  sale_item: string | null
  loan_purpose: string | null
  notes: string | null

  // UI only
  seller_name?: string
}

const freqLabel: Record<Operation["frequency"], string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  three_weeks: "Cada 3 semanas",
  monthly: "Mensual",
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
  const s = [first, last].filter(Boolean).join(" ").trim()
  return s || "Sin nombre"
}

function dateAR(d: string | null | undefined) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("es-AR")
  } catch {
    return "—"
  }
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

  // seller data
  const [clients, setClients] = useState<Client[]>([])
  const [operations, setOperations] = useState<Operation[]>([])

  // form (solo seller)
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing")
  const [selectedClientId, setSelectedClientId] = useState<string>("")

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [dni, setDni] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")

  const [operationType, setOperationType] = useState<Operation["operation_type"]>("sale")
  const [saleItem, setSaleItem] = useState("")
  const [loanPurpose, setLoanPurpose] = useState("")

  const [frequency, setFrequency] = useState<Operation["frequency"]>("weekly")
  const [baseAmount, setBaseAmount] = useState("")
  const [interestPercent, setInterestPercent] = useState("")
  const [installments, setInstallments] = useState("1")
  const [notes, setNotes] = useState("")

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

  // operation edit fields
  const [editType, setEditType] = useState<Operation["operation_type"]>("sale")
  const [editFrequency, setEditFrequency] = useState<Operation["frequency"]>("weekly")
  const [editBaseAmount, setEditBaseAmount] = useState("")
  const [editInterest, setEditInterest] = useState("")
  const [editInstallments, setEditInstallments] = useState("")
  const [editDetail, setEditDetail] = useState("")
  const [editNotes, setEditNotes] = useState("")

  // client edit fields (admin)
  const [editClientId, setEditClientId] = useState<string | null>(null)
  const [editClientFirst, setEditClientFirst] = useState("")
  const [editClientLast, setEditClientLast] = useState("")
  const [editClientDni, setEditClientDni] = useState("")
  const [editClientPhone, setEditClientPhone] = useState("")
  const [editClientAddress, setEditClientAddress] = useState("")
  const [loadingClientForEdit, setLoadingClientForEdit] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

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

    // ✅ agregado first_due_date
    const baseSelect =
      "id, created_at, first_due_date, seller_id, operation_type, frequency, client_id, base_amount, interest_percent, installments_count, total_amount, installment_amount, notes, sale_item, loan_purpose"

    let q = supabase.from("operations").select(baseSelect).order("created_at", { ascending: false })
    if (currentRole !== "admin") q = q.eq("seller_id", currentUserId)

    const res = await q
    if (res.error) {
      console.error(res.error)
      setErrorMsg(res.error.message)
      setOperations([])
      return
    }

    const ops: Operation[] = (res.data as any) ?? []

    // Admin: mapear seller_id -> nombre vendedor
    if (currentRole === "admin") {
      const sellerIds = Array.from(new Set(ops.map((o) => o.seller_id).filter(Boolean)))

      if (sellerIds.length) {
        const sellersRes = await supabase.from("profiles").select("id, name").in("id", sellerIds)

        const map = new Map<string, string>()
        if (!sellersRes.error) {
          for (const p of (sellersRes.data as any[]) ?? []) {
            map.set(p.id, String(p.name ?? "").trim() || "Vendedor")
          }
        }

        setOperations(
          ops.map((o) => ({
            ...o,
            seller_name: map.get(o.seller_id) ?? "Vendedor",
          }))
        )
        return
      }
    }

    setOperations(ops)
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

    // limpiar form cliente
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

      const payload: any = {
        seller_id: userId,
        operation_type: operationType,
        frequency,
        client_id: clientId,
        base_amount: baseAmountNum,
        interest_percent: interestPercentNum,
        installments_count: installmentsNum,
        notes: notes.trim() || null,
        sale_item: operationType === "sale" ? (saleItem.trim() || null) : null,
        loan_purpose: operationType === "loan" ? (loanPurpose.trim() || null) : null,
        // first_due_date lo calcula el trigger en Supabase ✅
      }

      const res = await supabase.from("operations").insert(payload).select("id").single()
      if (res.error) {
        alert(res.error.message)
        return
      }

      // reset form mínimo
      setSaleItem("")
      setLoanPurpose("")
      setBaseAmount("")
      setInterestPercent("")
      setInstallments("1")
      setNotes("")

      await fetchOperations(userId, role)
      alert("Operación guardada")
    } finally {
      setSaving(false)
    }
  }

  async function deleteOperation(opId: string) {
    // ✅ SOLO ADMIN
    if (role !== "admin") return

    if (!confirm("¿Borrar operación?")) return
    const res = await supabase.from("operations").delete().eq("id", opId)
    if (res.error) {
      alert(res.error.message)
      return
    }
    await fetchOperations(userId!, role)
  }

  async function startEditOperation(op: Operation) {
    // ✅ SOLO ADMIN
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
    // ✅ SOLO ADMIN
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
        sale_item: editType === "sale" ? (editDetail.trim() || null) : null,
        loan_purpose: editType === "loan" ? (editDetail.trim() || null) : null,
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
      alert("Operación y cliente actualizados")
    } finally {
      setSavingEdit(false)
    }
  }

  // ---------- UI ----------
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-300">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-zinc-100">
      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <div className="text-2xl font-semibold tracking-tight">CrediElectro Dyn</div>
            <div className="text-sm text-zinc-400">
              Rol: <span className="text-zinc-200">{role === "admin" ? "Administrador" : "Vendedor"}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fetchOperations(userId!, role)}
              className="px-3 py-2 rounded-xl bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 backdrop-blur"
            >
              Refrescar
            </button>
            <button type="button" onClick={signOut} className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500">
              Cerrar sesión
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl border border-red-900 bg-red-950 text-red-200">{errorMsg}</div>
        )}

        {/* SELLER FORM */}
        {role !== "admin" && (
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
                  </>
                )}
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
                  placeholder={operationType === "sale" ? `Ej: "Heladera", "Moto"...` : `Ej: "Efectivo", "Compra"...`}
                  value={operationType === "sale" ? saleItem : loanPurpose}
                  onChange={(e) => (operationType === "sale" ? setSaleItem(e.target.value) : setLoanPurpose(e.target.value))}
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
                  <div className="text-sm text-zinc-300 mb-2">Monto base</div>
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

        {/* ADMIN: solo operaciones */}
        {role === "admin" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
            <OperationsTable role={role} operations={operations} onEdit={startEditOperation} onDelete={deleteOperation} />
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
                  Cliente:{" "}
                  {loadingClientForEdit
                    ? "Cargando..."
                    : fullName(editClientFirst || null, editClientLast || null)}
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

      <div className="overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950/40 backdrop-blur">
        <table className="min-w-[1200px] w-full text-sm table-auto border-collapse">
          <thead className="bg-zinc-900">
            <tr>
              {role === "admin" && <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Vendedor</th>}
              <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Fecha</th>
              {/* ✅ NUEVA COLUMNA */}
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
                <td className="p-3 text-zinc-400" colSpan={canAdminActions ? 12 : 11}>
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

                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                      {new Date(op.created_at).toLocaleString("es-AR")}
                    </td>

                    {/* ✅ 1RA CUOTA */}
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-emerald-300 font-semibold">
                      {dateAR(op.first_due_date)}
                    </td>

                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                      {op.operation_type === "sale" ? "Venta" : "Préstamo"}
                    </td>

                    <td className="p-2 border-b border-zinc-900 min-w-[220px]">
                      {detail || <span className="text-zinc-500">—</span>}
                    </td>

                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{freqLabel[op.frequency]}</td>

                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{money(op.base_amount)}</td>

                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{op.interest_percent}%</td>

                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-sky-300 font-semibold">
                      {money(op.total_amount)}
                    </td>

                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{op.installments_count}</td>

                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{money(op.installment_amount)}</td>

                    {canAdminActions && (
                      <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
                            onClick={() => onEdit?.(op)}
                            type="button"
                          >
                            Editar
                          </button>
                          <button
                            className="px-2 py-1 rounded bg-red-600 hover:bg-red-500"
                            onClick={() => onDelete?.(op.id)}
                            type="button"
                          >
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