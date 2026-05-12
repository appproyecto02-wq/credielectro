"use client"

import { useEffect, useState } from "react"
import { useAuth } from "./hooks/useAuth"
import { useOperations } from "./hooks/useOperations"
import { useCobranza } from "./hooks/useCobranza"
import { useDailyLoan } from "./hooks/useDailyLoan"
import { useExport } from "./hooks/useExport"
import { useReport } from "./hooks/useReport"
import { OperationsTable } from "./components/OperationsTable"
import { ReportCard } from "./components/ReportCard"
import { EditOperationModal } from "./components/EditOperationModal"
import { money, fullName, dateAR, dateTimeAR, toNumber } from "./utils"
import { freqLabel } from "./types"

// ---------- PAGE ----------
export default function Page() {
  const { loading, userId, role, profile, errorMsg, setErrorMsg, signOut } = useAuth()

  const [view, setView] = useState<"ops" | "cobranza" | "daily-loans">("ops")

  const {
    installmentsData, loadingCobranza, savingCobranzaId,
    fetchCobranza,
    markInstallmentPaid, markInstallmentNoPay, payInstallment,
    cobranzaRows, cuotasParaHoy, atrasadas, cobradasHoy, totalCobradoHoy,
  } = useCobranza(userId, role, setErrorMsg)

  const {
    clients, operations,
    fetchClients, fetchOperations,
    clientMode, setClientMode, selectedClientId, setSelectedClientId,
    firstName, setFirstName, lastName, setLastName, dni, setDni, phone, setPhone, address, setAddress,
    operationType, setOperationType, saleItem, setSaleItem, loanPurpose, setLoanPurpose,
    frequency, setFrequency, baseAmount, setBaseAmount, interestPercent, setInterestPercent,
    installments, setInstallments, notes, setNotes, lateFeeType, setLateFeeType, lateFeeValue, setLateFeeValue,
    saving, saveOperation, previewTotal, previewInstallment,
    editingOp, setEditingOp,
    editType, setEditType, editFrequency, setEditFrequency,
    editBaseAmount, setEditBaseAmount, editInterest, setEditInterest, editInstallments, setEditInstallments,
    editDetail, setEditDetail, editNotes, setEditNotes,
    editClientId, editClientFirst, setEditClientFirst, editClientLast, setEditClientLast,
    editClientDni, setEditClientDni, editClientPhone, setEditClientPhone, editClientAddress, setEditClientAddress,
    loadingClientForEdit, savingEdit,
    deleteOperation, startEditOperation, saveEditOperation,
  } = useOperations(userId, role, setErrorMsg, fetchCobranza)

  const {
    dailyClientMode, setDailyClientMode, dailySelectedClientId, setDailySelectedClientId,
    dailyFirstName, setDailyFirstName, dailyLastName, setDailyLastName,
    dailyDni, setDailyDni, dailyPhone, setDailyPhone, dailyAddress, setDailyAddress,
    dailyLoanAmount, setDailyLoanAmount, dailyLoanPlan, setDailyLoanPlan,
    dailyLoanInterest, setDailyLoanInterest, dailyLoanFirstDueDate, setDailyLoanFirstDueDate,
    savingDailyLoan, createDailyLoan,
    dailyBaseAmount, dailyTotalAmount, dailyInstallmentAmount,
  } = useDailyLoan(userId, role, clients, fetchClients, fetchCobranza)

  const {
    exportMonth, setExportMonth, exportWeek, setExportWeek,
    exportOperaciones, exportCobranza,
  } = useExport(operations, installmentsData)

  const { reportMonth, setReportMonth, reportMonthLabel, reportOpsSummary, reportEconomicSummary } =
    useReport(operations, installmentsData)

  // Cargar datos tras auth
  useEffect(() => {
    if (!userId) return
    fetchOperations(userId, role)
    fetchCobranza(userId, role)
    if (role !== "admin") fetchClients(userId)
  }, [userId, role])

  // ---------- LOADING ----------
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

        {/* NAV */}
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
              onClick={async () => { setView("cobranza"); await fetchCobranza(userId!, role) }}
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

        {/* KPI cobranza */}
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

        {/* ====== SELLER: NUEVA OPERACIÓN + TABLA ====== */}
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
                    <option value="" className="bg-zinc-950 text-zinc-100">— Elegí un cliente —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id} className="bg-zinc-950 text-zinc-100">
                        {fullName(c.first_name, c.last_name)}{c.dni ? ` — DNI ${c.dni}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Nombre" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Apellido" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="DNI" value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" />
                  <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Celular" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
                  <input className="sm:col-span-2 w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              </div>

              {/* Tipo */}
              <div className="mb-4">
                <div className="text-sm text-zinc-300 mb-2">Tipo</div>
                <select className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-700" value={operationType} onChange={(e) => setOperationType(e.target.value as any)}>
                  <option value="sale" className="bg-zinc-950 text-zinc-100">Venta</option>
                  <option value="loan" className="bg-zinc-950 text-zinc-100">Préstamo</option>
                </select>
              </div>

              {/* Detalle */}
              <div className="mb-4">
                <div className="text-sm text-zinc-300 mb-2">{operationType === "sale" ? "Qué se vendió" : "Motivo del préstamo"}</div>
                <input
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800"
                  placeholder={operationType === "sale" ? 'Ej: "Heladera", "Moto"...' : 'Ej: "Efectivo", "Compra"...'}
                  value={operationType === "sale" ? saleItem : loanPurpose}
                  onChange={(e) => operationType === "sale" ? setSaleItem(e.target.value) : setLoanPurpose(e.target.value)}
                />
              </div>

              {/* Frecuencia */}
              <div className="mb-4">
                <div className="text-sm text-zinc-300 mb-2">Frecuencia</div>
                <select className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-700" value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
                  <option value="weekly" className="bg-zinc-950 text-zinc-100">Semanal</option>
                  <option value="biweekly" className="bg-zinc-950 text-zinc-100">Quincenal</option>
                  <option value="three_weeks" className="bg-zinc-950 text-zinc-100">Cada 3 semanas</option>
                  <option value="monthly" className="bg-zinc-950 text-zinc-100">Mensual</option>
                </select>
              </div>

              {/* Números */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Base de monto</div>
                  <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Ej: 50000" value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Interés (%)</div>
                  <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Ej: 25" value={interestPercent} onChange={(e) => setInterestPercent(e.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Cuotas</div>
                  <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Ej: 8" value={installments} onChange={(e) => setInstallments(e.target.value)} inputMode="numeric" />
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
                <textarea className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 min-h-[90px]" placeholder="Notas..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {/* Mora */}
              <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="text-sm text-zinc-300 mb-3 font-semibold">Interés por mora (opcional)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Tipo de mora</div>
                    <select value={lateFeeType} onChange={(e) => setLateFeeType(e.target.value as any)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800">
                      <option value="fixed_daily">Monto fijo por día</option>
                      <option value="percent_daily">% diario sobre la cuota</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">{lateFeeType === "fixed_daily" ? "$ por día de atraso" : "% diario"}</div>
                    <input type="number" min="0" placeholder={lateFeeType === "fixed_daily" ? "Ej: 500" : "Ej: 2"} value={lateFeeValue} onChange={(e) => setLateFeeValue(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" />
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

              <button type="button" onClick={saveOperation} disabled={saving} className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 font-semibold shadow-lg">
                {saving ? "Guardando..." : "Guardar operación"}
              </button>
            </div>

            {/* Tabla seller */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
              <OperationsTable role={role} operations={operations} />
            </div>
          </div>
        )}

        {/* ====== ADMIN: TABLA + EXPORT + REPORTE ====== */}
        {role === "admin" && view === "ops" && (
          <div className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
            <OperationsTable role={role} operations={operations} onEdit={startEditOperation} onDelete={deleteOperation} />

            {/* Export operaciones */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
              <div className="text-base font-semibold mb-4">📥 Exportar operaciones</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-zinc-950/60 p-4">
                  <div className="text-sm text-zinc-400 mb-2">Por mes</div>
                  <input type="month" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 mb-3" />
                  <button type="button" onClick={() => exportOperaciones("month", exportMonth)} className="w-full px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 font-semibold text-sm">
                    Descargar operaciones del mes
                  </button>
                </div>
                <div className="rounded-xl bg-zinc-950/60 p-4">
                  <div className="text-sm text-zinc-400 mb-2">Por semana (elegí el lunes)</div>
                  <input type="date" value={exportWeek} onChange={(e) => setExportWeek(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 mb-3" />
                  <button type="button" onClick={() => exportOperaciones("week", exportWeek)} className="w-full px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 font-semibold text-sm">
                    Descargar operaciones de la semana
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reporte mensual (admin) */}
        {role === "admin" && view === "ops" && (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-lg font-semibold mb-1">Reporte mensual</div>
                <div className="text-xs text-zinc-400">Operaciones cerradas, abiertas y resumen económico del mes elegido.</div>
              </div>
              <div className="w-full sm:w-auto">
                <div className="text-sm text-zinc-300 mb-2">Seleccionar mes</div>
                <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="w-full sm:w-auto px-3 py-2 rounded-xl bg-zinc-800 text-white border border-zinc-600" />
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

        {/* Vista admin cobranza (panel extra siempre visible) */}
        {role === "admin" && (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-lg font-semibold">Cobranza (vista admin)</div>
                <div className="text-xs text-zinc-400">Pendientes + Pagadas (control general)</div>
              </div>
              <button type="button" onClick={() => fetchCobranza(userId!, role)} className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800" disabled={loadingCobranza}>
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
                    <tr><td className="p-3 text-zinc-400" colSpan={6}>No hay datos de cobranza</td></tr>
                  ) : (
                    installmentsData.map((r) => (
                      <tr key={r.id} className="odd:bg-zinc-950/40 hover:bg-zinc-900/40">
                        <td className="p-2 border-b border-zinc-900">
                          <div className="font-semibold">{fullName(r.client?.first_name, r.client?.last_name)}</div>
                          <div className="text-xs text-zinc-400">{r.client?.phone ?? ""}{r.client?.address ?? ""}</div>
                        </td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{dateAR(r.due_date)}</td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{r.installment_number}</td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{String(r.status)}</td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{money(Number(r.amount ?? r.operation?.installment_amount ?? 0))}</td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                          {r.status !== "paid" && (
                            <button onClick={() => payInstallment(r.id)} className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white text-xs">
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

        {/* ====== COBRANZA (seller + admin) ====== */}
        {view === "cobranza" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-lg font-semibold">Cobranza {role === "admin" ? "(Solo lectura)" : ""}</div>
                <div className="text-xs text-zinc-400">Pendientes + Atrasadas (ordenadas por vencimiento)</div>
              </div>
              <button type="button" onClick={() => fetchCobranza(userId!, role)} className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800" disabled={loadingCobranza}>
                {loadingCobranza ? "Cargando..." : "Refrescar"}
              </button>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3 mb-4">
              {cobranzaRows.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-400">No hay cuotas pendientes 🎉</div>
              ) : (
                cobranzaRows.map((r: any) => (
                  <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-zinc-100">{r._clientName}</div>
                        <div className="text-xs text-zinc-400 mt-1">Vence: {dateAR(r.due_date)} · Cuota #{r.installment_number}</div>
                      </div>
                      {role === "admin" && (
                        <span className="text-[11px] rounded-full border border-zinc-700 px-2 py-1 text-zinc-300">{r.seller_name ?? "Vendedor"}</span>
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
                        <div className="font-semibold text-amber-300">{r._daysLate > 0 ? `${r._daysLate} días` : "0 días"}</div>
                      </div>
                      <div className="rounded-xl bg-zinc-900/60 p-3">
                        <div className="text-xs text-zinc-400">Mora</div>
                        <div className="font-semibold text-amber-300">{r._lateFee > 0 ? money(r._lateFee) : "—"}</div>
                      </div>
                    </div>

                    {(r._clientPhone || r._clientAddress) && (
                      <div className="text-xs text-zinc-400 mt-3">
                        {r._clientPhone ? `📞 ${r._clientPhone}` : ""}
                        {r._clientPhone && r._clientAddress ? " · " : ""}
                        {r._clientAddress ? `📍 ${r._clientAddress}` : ""}
                      </div>
                    )}

                    {role !== "admin" && (
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <button type="button" onClick={() => markInstallmentPaid(r.id)} disabled={savingCobranzaId === r.id} className="w-full px-3 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 font-semibold">
                          {savingCobranzaId === r.id ? "Guardando..." : "Pagó"}
                        </button>
                        <button type="button" onClick={() => markInstallmentNoPay(r.id)} disabled={savingCobranzaId === r.id} className="w-full px-3 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 font-semibold">
                          No pagó
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950/40 backdrop-blur">
              <table className="min-w-[1300px] w-full text-sm table-auto border-collapse">
                <thead className="bg-zinc-900">
                  <tr>
                    {role === "admin" && <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Vendedor</th>}
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Cliente</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Vence</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Cuota #</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Frecuencia</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Monto</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Atraso</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Mora</th>
                    <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Total a cobrar</th>
                    {role !== "admin" && <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {cobranzaRows.length === 0 ? (
                    <tr><td className="p-3 text-zinc-400" colSpan={9}>No hay cuotas pendientes 🎉</td></tr>
                  ) : (
                    cobranzaRows.map((r: any) => (
                      <tr key={r.id} className="odd:bg-zinc-950/40 hover:bg-zinc-900/40 transition">
                        {role === "admin" && <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{r.seller_name ?? "Vendedor"}</td>}
                        <td className="p-2 border-b border-zinc-900">
                          <div className="font-semibold">{r._clientName}</div>
                          <div className="text-xs text-zinc-400">
                            {r._clientPhone ? "📞 " + r._clientPhone : ""}
                            {r._clientAddress ? ` • 📍 ${r._clientAddress}` : ""}
                          </div>
                        </td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{dateAR(r.due_date)}</td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{r.installment_number}</td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{freqLabel[r._frequency as keyof typeof freqLabel] ?? "—"}</td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-sky-200 font-semibold">{money(r._amount)}</td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                          {r._daysLate > 0 ? <span className="text-amber-300 font-semibold">{r._daysLate} días</span> : <span className="text-zinc-400">0</span>}
                        </td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                          {r._lateFee > 0 ? <span className="text-amber-300 font-semibold">{money(r._lateFee)}</span> : <span className="text-zinc-400">—</span>}
                        </td>
                        <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-emerald-300 font-semibold">{money(r._totalToPay)}</td>
                        {role !== "admin" && (
                          <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => markInstallmentPaid(r.id)} disabled={savingCobranzaId === r.id} className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60">
                                {savingCobranzaId === r.id ? "..." : "Pagó"}
                              </button>
                              <button type="button" onClick={() => markInstallmentNoPay(r.id)} disabled={savingCobranzaId === r.id} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60">
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

            {/* Cobrado hoy (admin) */}
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
                        <tr><td className="p-3 text-zinc-400" colSpan={5}>Hoy todavía no hay cobranzas registradas.</td></tr>
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
                                <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{r.seller_name ?? "Vendedor"}</td>
                                <td className="p-2 border-b border-zinc-900">{clientName}</td>
                                <td className="p-2 border-b border-zinc-900 whitespace-nowrap">{r.installment_number}</td>
                                <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-emerald-300 font-semibold">{money(amt)}</td>
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

            {/* Export cobranza (admin) */}
            {role === "admin" && (
              <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
                <div className="text-base font-semibold mb-4">📥 Exportar cobranza a Excel</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-zinc-950/60 p-4">
                    <div className="text-sm text-zinc-400 mb-2">Por mes</div>
                    <input type="month" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 mb-3" />
                    <button type="button" onClick={() => exportCobranza("month", exportMonth)} className="w-full px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 font-semibold text-sm">
                      Descargar cobranza del mes
                    </button>
                  </div>
                  <div className="rounded-xl bg-zinc-950/60 p-4">
                    <div className="text-sm text-zinc-400 mb-2">Por semana (elegí el lunes)</div>
                    <input type="date" value={exportWeek} onChange={(e) => setExportWeek(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 mb-3" />
                    <button type="button" onClick={() => exportCobranza("week", exportWeek)} className="w-full px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 font-semibold text-sm">
                      Descargar cobranza de la semana
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== PRÉSTAMOS DIARIOS (seller) ====== */}
        {view === "daily-loans" && role !== "admin" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur p-4 sm:p-6 shadow-xl mt-6">
            <div className="text-lg font-semibold mb-1">Préstamos diarios</div>
            <div className="text-xs text-zinc-400 mb-4">Crear préstamos con cuotas diarias</div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                {/* Cliente */}
                <div>
                  <div className="text-sm text-zinc-300 mb-2">Cliente</div>
                  <div className="flex gap-2 mb-3">
                    <button type="button" onClick={() => setDailyClientMode("existing")} className={`px-3 py-2 rounded-xl text-sm border ${dailyClientMode === "existing" ? "bg-emerald-600 text-white border-emerald-500" : "bg-zinc-950 text-zinc-200 border-zinc-800"}`}>Existente</button>
                    <button type="button" onClick={() => setDailyClientMode("new")} className={`px-3 py-2 rounded-xl text-sm border ${dailyClientMode === "new" ? "bg-emerald-600 text-white border-emerald-500" : "bg-zinc-950 text-zinc-200 border-zinc-800"}`}>Nuevo</button>
                  </div>

                  {dailyClientMode === "existing" ? (
                    <select value={dailySelectedClientId} onChange={(e) => setDailySelectedClientId(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800">
                      <option value="">Seleccionar cliente</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{fullName(c.first_name, c.last_name)}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input type="text" placeholder="Nombre" value={dailyFirstName} onChange={(e) => setDailyFirstName(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" />
                      <input type="text" placeholder="Apellido" value={dailyLastName} onChange={(e) => setDailyLastName(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" />
                      <input type="text" placeholder="DNI" value={dailyDni} onChange={(e) => setDailyDni(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" />
                      <input type="text" placeholder="Teléfono" value={dailyPhone} onChange={(e) => setDailyPhone(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" />
                      <input type="text" placeholder="Dirección" value={dailyAddress} onChange={(e) => setDailyAddress(e.target.value)} className="sm:col-span-2 px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" />
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm text-zinc-300 mb-2">Monto prestado</div>
                  <input type="number" value={dailyLoanAmount} onChange={(e) => setDailyLoanAmount(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Ej: 100000" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm text-zinc-300 mb-2">Plan</div>
                    <select value={dailyLoanPlan} onChange={(e) => setDailyLoanPlan(Number(e.target.value) as 12 | 17 | 24 | 36 | 48)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800">
                      <option value={12}>12 cuotas</option>
                      <option value={17}>17 cuotas</option>
                      <option value={24}>24 cuotas</option>
                      <option value={36}>36 cuotas</option>
                      <option value={48}>48 cuotas</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-sm text-zinc-300 mb-2">Interés (%)</div>
                    <input type="number" value={dailyLoanInterest} onChange={(e) => setDailyLoanInterest(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" />
                  </div>
                </div>

                <div>
                  <div className="text-sm text-zinc-300 mb-2">Primer vencimiento</div>
                  <input type="date" value={dailyLoanFirstDueDate} onChange={(e) => setDailyLoanFirstDueDate(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" />
                </div>
              </div>

              {/* Preview */}
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
              <button type="button" onClick={createDailyLoan} disabled={savingDailyLoan} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold">
                {savingDailyLoan ? "Guardando..." : "Crear préstamo diario"}
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ====== EDIT MODAL ====== */}
      {role === "admin" && editingOp && (
        <EditOperationModal
          editingOp={editingOp}
          setEditingOp={setEditingOp}
          editType={editType} setEditType={setEditType}
          editFrequency={editFrequency} setEditFrequency={setEditFrequency}
          editBaseAmount={editBaseAmount} setEditBaseAmount={setEditBaseAmount}
          editInterest={editInterest} setEditInterest={setEditInterest}
          editInstallments={editInstallments} setEditInstallments={setEditInstallments}
          editDetail={editDetail} setEditDetail={setEditDetail}
          editNotes={editNotes} setEditNotes={setEditNotes}
          editClientId={editClientId}
          editClientFirst={editClientFirst} setEditClientFirst={setEditClientFirst}
          editClientLast={editClientLast} setEditClientLast={setEditClientLast}
          editClientDni={editClientDni} setEditClientDni={setEditClientDni}
          editClientPhone={editClientPhone} setEditClientPhone={setEditClientPhone}
          editClientAddress={editClientAddress} setEditClientAddress={setEditClientAddress}
          loadingClientForEdit={loadingClientForEdit}
          savingEdit={savingEdit}
          saveEditOperation={saveEditOperation}
        />
      )}
    </div>
  )
}
