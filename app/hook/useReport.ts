"use client"

import { useState, useMemo } from "react"
import type { Operation, InstallmentRow } from "../types"

export function useReport(operations: Operation[], installmentsData: InstallmentRow[]) {
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })

  const reportMonthRange = useMemo(() => {
    const [year, month] = reportMonth.split("-").map(Number)
    if (!year || !month) return { start: null as Date | null, end: null as Date | null }
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 0, 23, 59, 59, 999),
    }
  }, [reportMonth])

  const reportMonthLabel = useMemo(() => {
    if (!reportMonthRange.start) return "—"
    return reportMonthRange.start.toLocaleDateString("es-AR", { year: "numeric", month: "long" })
  }, [reportMonthRange])

  const reportOpsSummary = useMemo(() => {
    const [year, month] = reportMonth.split("-").map(Number)
    if (!year || !month) return { closedOps: [] as Operation[], openOps: [] as Operation[] }

    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)

    const installmentsByOp = new Map<string, InstallmentRow[]>()
    for (const row of installmentsData) {
      if (!installmentsByOp.has(row.operation_id)) installmentsByOp.set(row.operation_id, [])
      installmentsByOp.get(row.operation_id)!.push(row)
    }

    const closedOps: Operation[] = []
    const openOps: Operation[] = []

    for (const op of operations) {
      const rows = installmentsByOp.get(op.id) ?? []
      if (rows.length === 0 || !rows.every((r) => r.status === "paid")) {
        openOps.push(op)
        continue
      }

      const paidDates = rows
        .map((r) => r.paid_at)
        .filter(Boolean)
        .map((d) => new Date(d as string).getTime())
        .filter((n) => Number.isFinite(n))

      if (paidDates.length === 0) { openOps.push(op); continue }

      const closedAt = new Date(Math.max(...paidDates))
      if (closedAt >= monthStart && closedAt <= monthEnd) closedOps.push(op)
      else openOps.push(op)
    }

    return { closedOps, openOps }
  }, [reportMonth, operations, installmentsData])

  const reportEconomicSummary = useMemo(() => {
    const closedCapital = reportOpsSummary.closedOps.reduce(
      (acc, op) => acc + Number(op.base_amount ?? 0), 0
    )
    const openCapital = reportOpsSummary.openOps.reduce(
      (acc, op) => acc + Number(op.base_amount ?? 0), 0
    )
    const interestEarned = reportOpsSummary.closedOps.reduce(
      (acc, op) => acc + Math.max(0, Number(op.total_amount ?? 0) - Number(op.base_amount ?? 0)), 0
    )

    const paidByOperation = new Map<string, number>()
    for (const row of installmentsData) {
      const current = paidByOperation.get(row.operation_id) ?? 0
      const amount = Number(row.amount ?? row.operation?.installment_amount ?? 0)
      if (row.status === "paid") paidByOperation.set(row.operation_id, current + amount)
    }

    const pendingToCollect = reportOpsSummary.openOps.reduce((acc, op) => {
      const paid = paidByOperation.get(op.id) ?? 0
      return acc + Math.max(0, Number(op.total_amount ?? 0) - paid)
    }, 0)

    return { closedCapital, openCapital, pendingToCollect, interestEarned }
  }, [reportOpsSummary, installmentsData])

  return {
    reportMonth, setReportMonth,
    reportMonthLabel,
    reportOpsSummary,
    reportEconomicSummary,
  }
}
