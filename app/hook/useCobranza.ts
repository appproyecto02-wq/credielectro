"use client"

import { useState, useMemo } from "react"
import { supabase } from "../../lib/supabaseClient"
import type { InstallmentRow, Role } from "../types"
import { daysLate, computeLateFee, fullName, todayISO } from "../utils"

export function useCobranza(
  userId: string | null,
  role: Role,
  setErrorMsg: (msg: string | null) => void
) {
  const [installmentsData, setInstallmentsData] = useState<InstallmentRow[]>([])
  const [loadingCobranza, setLoadingCobranza] = useState(false)
  const [savingCobranzaId, setSavingCobranzaId] = useState<string | null>(null)

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
          status: (r.status ?? "pending") as any,
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

  async function markInstallmentPaid(installmentId: string) {
    if (!userId) return
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
      await fetchCobranza(userId, role)
    } finally {
      setSavingCobranzaId(null)
    }
  }

  async function markInstallmentNoPay(installmentId: string) {
    if (!userId) return
    setSavingCobranzaId(installmentId)
    try {
      const res = await supabase
        .from("installments")
        .update({ status: "late", paid_at: null })
        .eq("id", installmentId)
      if (res.error) {
        alert(res.error.message)
        return
      }
      await fetchCobranza(userId, role)
    } finally {
      setSavingCobranzaId(null)
    }
  }

  async function payInstallment(id: string) {
    const { error } = await supabase
      .from("installments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", id)
    if (error) {
      alert("Error al registrar pago")
      console.error(error)
      return
    }
    if (userId) fetchCobranza(userId, role)
  }

  const hoyISO = todayISO()

  const cobranzaRows = useMemo(() => {
    return installmentsData
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
  }, [installmentsData])

  const cuotasParaHoy = useMemo(
    () => cobranzaRows.filter((r) => (r.due_date ?? "").slice(0, 10) === hoyISO),
    [cobranzaRows, hoyISO]
  )

  const atrasadas = useMemo(
    () => cobranzaRows.filter((r) => (r as any)._daysLate > 0),
    [cobranzaRows]
  )

  const cobradasHoy = useMemo(
    () => installmentsData.filter((r) => (r.paid_at ?? "").slice(0, 10) === hoyISO),
    [installmentsData, hoyISO]
  )

  const totalCobradoHoy = useMemo(
    () =>
      cobradasHoy.reduce(
        (acc, r) => acc + Number(r.amount ?? r.operation?.installment_amount ?? 0),
        0
      ),
    [cobradasHoy]
  )

  return {
    installmentsData,
    loadingCobranza,
    savingCobranzaId,
    fetchCobranza,
    markInstallmentPaid,
    markInstallmentNoPay,
    payInstallment,
    cobranzaRows,
    cuotasParaHoy,
    atrasadas,
    cobradasHoy,
    totalCobradoHoy,
  }
}
