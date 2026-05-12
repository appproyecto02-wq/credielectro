import type { Role, Operation } from "../app/types"
import { freqLabel } from "../app/types"
import { money, dateAR } from "../app/utils"

// Re-export from types since freqLabel lives there
import { freqLabel as freqLabelMap } from "../app/types"
import { money as moneyFn, dateAR as dateARFn } from "../app/utils"

export function OperationsTable({
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

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {operations.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-400">
            No hay operaciones.
          </div>
        ) : (
          operations.map((op) => {
            const detail = op.operation_type === "sale" ? op.sale_item : op.loan_purpose
            return (
              <div key={op.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-zinc-100">{detail || "Sin detalle"}</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {op.operation_type === "sale" ? "Venta" : "Préstamo"} · {freqLabelMap[op.frequency]}
                    </div>
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
                    <div className="text-emerald-300 font-semibold">{dateARFn(op.first_due_date)}</div>
                  </div>
                  <div className="rounded-xl bg-zinc-900/60 p-3">
                    <div className="text-xs text-zinc-400">Total</div>
                    <div className="text-sky-300 font-semibold">{moneyFn(op.total_amount)}</div>
                  </div>
                  <div className="rounded-xl bg-zinc-900/60 p-3">
                    <div className="text-xs text-zinc-400">Cuota</div>
                    <div>{moneyFn(op.installment_amount)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                  <div>
                    <div className="text-xs text-zinc-500">Base</div>
                    <div>{moneyFn(op.base_amount)}</div>
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
                    <button
                      className="w-full px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700"
                      onClick={() => onEdit?.(op)}
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      className="w-full px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500"
                      onClick={() => onDelete?.(op.id)}
                      type="button"
                    >
                      Borrar
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950/40 backdrop-blur">
        <table className="min-w-[1200px] w-full text-sm table-auto border-collapse">
          <thead className="bg-zinc-900">
            <tr>
              {role === "admin" && (
                <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Vendedor</th>
              )}
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
              {canAdminActions && (
                <th className="text-left p-2 border-b border-zinc-800 whitespace-nowrap">Acciones</th>
              )}
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
                      <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                        {op.seller_name ?? "Vendedor"}
                      </td>
                    )}
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap font-semibold">
                      {(op as any).client_name ?? "—"}
                    </td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                      {new Date(op.created_at).toLocaleString("es-AR")}
                    </td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-emerald-300 font-semibold">
                      {dateARFn(op.first_due_date)}
                    </td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                      {op.operation_type === "sale" ? "Venta" : "Préstamo"}
                    </td>
                    <td className="p-2 border-b border-zinc-900 min-w-[220px]">
                      {detail || <span className="text-zinc-500">—</span>}
                    </td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                      {freqLabelMap[op.frequency]}
                    </td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                      {moneyFn(op.base_amount)}
                    </td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                      {op.interest_percent}%
                    </td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap text-sky-300 font-semibold">
                      {moneyFn(op.total_amount)}
                    </td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                      {op.installments_count}
                    </td>
                    <td className="p-2 border-b border-zinc-900 whitespace-nowrap">
                      {moneyFn(op.installment_amount)}
                    </td>

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
