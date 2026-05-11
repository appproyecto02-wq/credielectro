import type { Operation } from "../../types"
import { fullName } from "../../utils"

type Props = {
  editingOp: Operation | null
  setEditingOp: (op: Operation | null) => void
  editType: Operation["operation_type"]
  setEditType: (v: Operation["operation_type"]) => void
  editFrequency: Operation["frequency"]
  setEditFrequency: (v: Operation["frequency"]) => void
  editBaseAmount: string
  setEditBaseAmount: (v: string) => void
  editInterest: string
  setEditInterest: (v: string) => void
  editInstallments: string
  setEditInstallments: (v: string) => void
  editDetail: string
  setEditDetail: (v: string) => void
  editNotes: string
  setEditNotes: (v: string) => void
  editClientId: string | null
  editClientFirst: string
  setEditClientFirst: (v: string) => void
  editClientLast: string
  setEditClientLast: (v: string) => void
  editClientDni: string
  setEditClientDni: (v: string) => void
  editClientPhone: string
  setEditClientPhone: (v: string) => void
  editClientAddress: string
  setEditClientAddress: (v: string) => void
  loadingClientForEdit: boolean
  savingEdit: boolean
  saveEditOperation: () => void
}

export function EditOperationModal({
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
  saveEditOperation,
}: Props) {
  if (!editingOp) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-lg font-semibold">Editar operación + cliente</div>
            <div className="text-xs text-zinc-400">
              Cliente: {loadingClientForEdit ? "Cargando..." : fullName(editClientFirst || null, editClientLast || null)}
            </div>
          </div>
          <button type="button" className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800" onClick={() => setEditingOp(null)}>Cerrar</button>
        </div>

        {/* CLIENTE */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 mb-4">
          <div className="text-sm font-semibold mb-3">Datos del cliente</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Nombre" value={editClientFirst} onChange={(e) => setEditClientFirst(e.target.value)} disabled={loadingClientForEdit || !editClientId} />
            <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Apellido" value={editClientLast} onChange={(e) => setEditClientLast(e.target.value)} disabled={loadingClientForEdit || !editClientId} />
            <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="DNI" value={editClientDni} onChange={(e) => setEditClientDni(e.target.value)} inputMode="numeric" disabled={loadingClientForEdit || !editClientId} />
            <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Celular" value={editClientPhone} onChange={(e) => setEditClientPhone(e.target.value)} inputMode="tel" disabled={loadingClientForEdit || !editClientId} />
            <input className="sm:col-span-2 w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" placeholder="Dirección" value={editClientAddress} onChange={(e) => setEditClientAddress(e.target.value)} disabled={loadingClientForEdit || !editClientId} />
          </div>
          {!editClientId && <div className="text-xs text-zinc-500 mt-2">Esta operación no tiene cliente asignado.</div>}
        </div>

        {/* OPERACIÓN */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-sm font-semibold mb-3">Datos de la operación</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-sm text-zinc-300 mb-2">Tipo</div>
              <select className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" value={editType} onChange={(e) => setEditType(e.target.value as any)}>
                <option value="sale">Venta</option>
                <option value="loan">Préstamo</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-zinc-300 mb-2">Frecuencia</div>
              <select className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" value={editFrequency} onChange={(e) => setEditFrequency(e.target.value as any)}>
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quincenal</option>
                <option value="three_weeks">Cada 3 semanas</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <div className="text-sm text-zinc-300 mb-2">{editType === "sale" ? "Qué se vendió" : "Motivo del préstamo"}</div>
            <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" value={editDetail} onChange={(e) => setEditDetail(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-sm text-zinc-300 mb-2">Monto base</div>
              <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" value={editBaseAmount} onChange={(e) => setEditBaseAmount(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="text-sm text-zinc-300 mb-2">Interés (%)</div>
              <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" value={editInterest} onChange={(e) => setEditInterest(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="text-sm text-zinc-300 mb-2">Cuotas</div>
              <input className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800" value={editInstallments} onChange={(e) => setEditInstallments(e.target.value)} inputMode="numeric" />
            </div>
          </div>
          <div className="mb-4">
            <div className="text-sm text-zinc-300 mb-2">Notas</div>
            <textarea className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-800 min-h-[90px]" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={saveEditOperation} disabled={savingEdit || loadingClientForEdit} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 font-semibold">
              {savingEdit ? "Guardando..." : "Guardar cambios"}
            </button>
            <button type="button" onClick={() => setEditingOp(null)} className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
