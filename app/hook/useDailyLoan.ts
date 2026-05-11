"use client"

import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabaseClient"
import type { Client, Role } from "../types"
import { toNumber } from "../utils"

const DAILY_PLANS = { 12: 20, 17: 35, 24: 45, 36: 75, 48: 100 } as const

export function useDailyLoan(
  userId: string | null,
  role: Role,
  fetchClients: (sellerId: string) => Promise<void>,
  fetchCobranza: (uid: string, r: Role) => Promise<void>,
  fetchOperations: (uid: string, r: Role) => Promise<void>
) {
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

  async function createDailyClientIfNeeded(): Promise<string | null> {
    if (dailyClientMode === "existing") return dailySelectedClientId || null
    if (!userId) return null
    const fn = dailyFirstName.trim()
    const ln = dailyLastName.trim()
    if (!fn || !ln) {
      alert("Completá nombre y apellido del cliente.")
      return null
    }
    const res = await supabase
      .from("clients")
      .insert({
        first_name: fn || null,
        last_name: ln || null,
        dni: dailyDni.trim() || null,
        phone: dailyPhone.trim() || null,
        address: dailyAddress.trim() || null,
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

  function resetForm() {
    setDailyClientMode("existing")
    setDailySelectedClientId("")
    setDailyFirstName(""); setDailyLastName("")
    setDailyDni(""); setDailyPhone(""); setDailyAddress("")
    setDailyLoanAmount("")
    setDailyLoanPlan(12)
    setDailyLoanInterest("20")
    const nextDay = new Date()
    nextDay.setDate(nextDay.getDate() + 1)
    const nY = nextDay.getFullYear()
    const nM = String(nextDay.getMonth() + 1).padStart(2, "0")
    const nD = String(nextDay.getDate()).padStart(2, "0")
    setDailyLoanFirstDueDate(`${nY}-${nM}-${nD}`)
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
      if (!dailyLoanFirstDueDate) {
        alert("Ingresá la fecha del primer vencimiento.")
        return
      }
      const interestPercentValue = toNumber(dailyLoanInterest)
      const installmentsCountValue = Number(dailyLoanPlan)
      const totalAmount = baseAmountValue * (1 + interestPercentValue / 100)
      const installmentAmount = installmentsCountValue > 0 ? totalAmount / installmentsCountValue : 0

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
          notes: null,
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
        const due = new Date(fdY, fdM - 1, fdD + i)
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

      await fetchOperations(userId, role)
      await fetchCobranza(userId, role)
      resetForm()
      alert("Préstamo diario creado correctamente.")
    } finally {
      setSavingDailyLoan(false)
    }
  }

  const dailyBaseAmount = Number(dailyLoanAmount || 0)
  const dailyInterestPercent = Number(dailyLoanInterest || 0)
  const dailyInstallmentsCount = Number(dailyLoanPlan || 0)
  const dailyTotalAmount = dailyBaseAmount + dailyBaseAmount * (dailyInterestPercent / 100)
  const dailyInstallmentAmount = dailyInstallmentsCount > 0 ? dailyTotalAmount / dailyInstallmentsCount : 0

  return {
    dailyClientMode, setDailyClientMode,
    dailySelectedClientId, setDailySelectedClientId,
    dailyFirstName, setDailyFirstName,
    dailyLastName, setDailyLastName,
    dailyDni, setDailyDni,
    dailyPhone, setDailyPhone,
    dailyAddress, setDailyAddress,
    dailyLoanAmount, setDailyLoanAmount,
    dailyLoanPlan, setDailyLoanPlan,
    dailyLoanInterest, setDailyLoanInterest,
    dailyLoanFirstDueDate, setDailyLoanFirstDueDate,
    savingDailyLoan,
    createDailyLoan,
    dailyBaseAmount,
    dailyTotalAmount,
    dailyInstallmentAmount,
  }
}
