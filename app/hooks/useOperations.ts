"use client"

import { useState, useMemo } from "react"
import { supabase } from "../../lib/supabaseClient"
import type { Client, Operation, Role } from "../types"
import { toNumber, fullName } from "../utils"

export function useOperations(
  userId: string | null,
  role: Role,
  setErrorMsg: (msg: string | null) => void,
  onRefreshCobranza: (uid: string, r: Role) => Promise<void>
) {
  // ---- Data ----
  const [clients, setClients] = useState<Client[]>([])
  const [operations, setOperations] = useState<Operation[]>([])

  // ---- Nueva operación: form ----
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
  const [lateFeeType, setLateFeeType] = useState<"fixed_daily" | "percent_daily">("fixed_daily")
  const [lateFeeValue, setLateFeeValue] = useState("")
  const [saving, setSaving] = useState(false)

  // ---- Preview ----
  const baseAmountNum = useMemo(() => toNumber(baseAmount), [baseAmount])
  const interestPercentNum = useMemo(() => toNumber(interestPercent), [interestPercent])
  const installmentsNum = useMemo(() => {
    const n = Math.max(1, Math.min(60, Math.trunc(toNumber(installments))))
    return n || 1
  }, [installments])
  const previewTotal = useMemo(
    () => Math.max(0, baseAmountNum * (1 + interestPercentNum / 100)),
    [baseAmountNum, interestPercentNum]
  )
  const previewInstallment = useMemo(
    () => (installmentsNum > 0 ? previewTotal / installmentsNum : 0),
    [previewTotal, installmentsNum]
  )

  // ---- Modal de edición (admin) ----
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

  // ---- Fetch ----
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
    const ops: Operation[] = rawOps.map((o) => ({
      ...o,
      client_name: fullName(o.clients?.first_name ?? null, o.clients?.last_name ?? null),
    }))
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

  // ---- CRUD ----
  async function createClientIfNeeded(): Promise<string | null> {
    if (clientMode === "existing") return selectedClientId || null
    if (!userId) return null
    const fn = firstName.trim()
    const ln = lastName.trim()
    if (!fn && !ln) {
      alert("Completá nombre o apellido del cliente.")
      return null
    }
    const res = await supabase
      .from("clients")
      .insert({
        first_name: fn || null,
        last_name: ln || null,
        dni: dni.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
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
    setFirstName(""); setLastName(""); setDni(""); setPhone(""); setAddress("")
    return newId
  }

  async function saveOperation() {
    if (!userId) return
    setSaving(true)
    try {
      const clientId = await createClientIfNeeded()
      if (!clientId) return

      const baseDate = new Date()
      const todayY = baseDate.getFullYear()
      const todayM = baseDate.getMonth()
      const todayD = baseDate.getDate()

      let firstDueDateObj: Date
      if (frequency === "weekly") firstDueDateObj = new Date(todayY, todayM, todayD + 7)
      else if (frequency === "biweekly") firstDueDateObj = new Date(todayY, todayM, todayD + 15)
      else if (frequency === "three_weeks") firstDueDateObj = new Date(todayY, todayM, todayD + 21)
      else firstDueDateObj = new Date(todayY, todayM + 1, todayD)

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

      setSaleItem(""); setLoanPurpose(""); setBaseAmount(""); setInterestPercent("")
      setInstallments("1"); setNotes(""); setLateFeeType("fixed_daily"); setLateFeeValue("")

      await fetchOperations(userId, role)
      await onRefreshCobranza(userId, role)
      alert("Operación guardada")
    } finally {
      setSaving(false)
    }
  }

  async function deleteOperation(opId: string) {
    if (role !== "admin") return
    if (!confirm("¿Borrar operación?")) return
    const opData = operations.find((o) => o.id === opId)
    const clientId = opData?.client_id ?? null
    const res = await supabase.from("operations").delete().eq("id", opId)
    if (res.error) {
      alert(res.error.message)
      return
    }
    if (clientId) {
      const { data: otherOps } = await supabase
        .from("operations")
        .select("id")
        .eq("client_id", clientId)
        .limit(1)
      if (!otherOps || otherOps.length === 0) {
        await supabase.from("clients").delete().eq("id", clientId)
      }
    }
    if (!userId) return
    await fetchOperations(userId, role)
    await onRefreshCobranza(userId, role)
    if (role !== "admin") await fetchClients(userId)
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
      setEditClientFirst(""); setEditClientLast(""); setEditClientDni("")
      setEditClientPhone(""); setEditClientAddress("")
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
    if (role !== "admin" || !editingOp || !userId) return
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
        if (cRes.error) alert("Operación guardada, pero cliente NO se pudo actualizar: " + cRes.error.message)
      }
      setEditingOp(null)
      await fetchOperations(userId, role)
      await onRefreshCobranza(userId, role)
      alert("Operación y cliente actualizados")
    } finally {
      setSavingEdit(false)
    }
  }

  return {
    // Data
    clients,
    operations,
    // Fetch
    fetchClients,
    fetchOperations,
    // Nueva operación
    clientMode, setClientMode,
    selectedClientId, setSelectedClientId,
    firstName, setFirstName,
    lastName, setLastName,
    dni, setDni,
    phone, setPhone,
    address, setAddress,
    operationType, setOperationType,
    saleItem, setSaleItem,
    loanPurpose, setLoanPurpose,
    frequency, setFrequency,
    baseAmount, setBaseAmount,
    interestPercent, setInterestPercent,
    installments, setInstallments,
    notes, setNotes,
    lateFeeType, setLateFeeType,
    lateFeeValue, setLateFeeValue,
    saving,
    saveOperation,
    // Preview
    previewTotal,
    previewInstallment,
    // Edit modal
    editingOp, setEditingOp,
    editType, setEditType,
    editFrequency, setEditFrequency,
    editBaseAmount, setEditBaseAmount,
    editInterest, setEditInterest,
    editInstallments, setEditInstallments,
    editDetail, setEditDetail,
    editNotes, setEditNotes,
    editClientId,
    editClientFirst, setEditClientFirst,
    editClientLast, setEditClientLast,
    editClientDni, setEditClientDni,
    editClientPhone, setEditClientPhone,
    editClientAddress, setEditClientAddress,
    loadingClientForEdit,
    savingEdit,
    deleteOperation,
    startEditOperation,
    saveEditOperation,
  }
}
