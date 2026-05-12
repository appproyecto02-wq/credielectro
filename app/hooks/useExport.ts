"use client"

import { useState } from "react"
import type { Operation, InstallmentRow } from "../types"
import { dateAR, fullName, daysLate, computeLateFee } from "../utils"

// Nota: freqLabel se importa de utils pero está definido en types.
// Si da error de import, mové freqLabel a utils.ts también.
import { freqLabel as freq } from "../types"

function downloadCSV(rows: string[][], filename: string) {
  const bom = "\uFEFF"
  const sepHint = "sep=;\r\n"
  const csv =
    bom +
    sepHint +
    rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function getDateRange(filterType: "month" | "week", filterValue: string) {
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
    const endLabel = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`
    fileLabel = `${filterValue}_al_${endLabel}`
  }
  return { startDate, endDate, fileLabel }
}

export function useExport(operations: Operation[], installmentsData: InstallmentRow[]) {
  const [exportMonth, setExportMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })

  const [exportWeek, setExportWeek] = useState(() => {
    const now = new Date()
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`
  })

  function exportOperaciones(filterType: "month" | "week", filterValue: string) {
    const { startDate, endDate, fileLabel } = getDateRange(filterType, filterValue)
    const rows: string[][] = [
      ["Cliente", "Fecha creacion", "Tipo", "Frecuencia", "Monto base", "Total", "Cuotas", "Monto cuota"],
    ]
    for (const op of operations) {
      const created = new Date(op.created_at)
      if (created < startDate || created > endDate) continue
      rows.push([
        (op as any).client_name ?? "—",
        dateAR(op.created_at.slice(0, 10)),
        op.operation_type === "sale" ? "Venta" : "Prestamo",
        freq[op.frequency] ?? "—",
        String(Math.round(op.base_amount)),
        String(Math.round(op.total_amount)),
        String(op.installments_count),
        String(Math.round(op.installment_amount)),
      ])
    }
    downloadCSV(rows, `operaciones_${fileLabel}.csv`)
  }

  function exportCobranza(filterType: "month" | "week", filterValue: string) {
    const { startDate, endDate, fileLabel } = getDateRange(filterType, filterValue)
    const rows: string[][] = [
      ["Cliente", "Telefono", "Direccion", "Vencimiento", "Cuota #", "Frecuencia", "Monto", "Estado", "Dias atraso", "Mora", "Total a cobrar"],
    ]
    for (const inst of installmentsData) {
      if (!inst.due_date) continue
      const [iy, im, id2] = inst.due_date.slice(0, 10).split("-").map(Number)
      const dueDate = new Date(iy, im - 1, id2)
      if (dueDate < startDate || dueDate > endDate) continue
      const op = inst.operation
      const client = inst.client
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
        fullName(client?.first_name, client?.last_name),
        client?.phone ?? "—",
        client?.address ?? "—",
        dateAR(inst.due_date),
        String(inst.installment_number),
        freq[op?.frequency ?? "weekly"] ?? "—",
        String(Math.round(amount)),
        status,
        String(late),
        String(Math.round(fee)),
        String(Math.round(amount + fee)),
      ])
    }
    downloadCSV(rows, `cobranza_${fileLabel}.csv`)
  }

  return {
    exportMonth, setExportMonth,
    exportWeek, setExportWeek,
    exportOperaciones,
    exportCobranza,
  }
}
