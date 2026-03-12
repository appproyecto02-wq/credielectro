"use client"

type Role = "admin" | "seller"

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
  seller_name?: string
}

function money(n: number) {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  })
}

function dateAR(d: string | null) {
  if (!d) return ""

  const date = d.split("T")[0]   // saca la hora si viene
  const [y, m, day] = date.split("-")

  return ${day}/${m}/${y}
}

export default function OperationsTable({
  role,
  operations,
}: {
  role: Role
  operations: Operation[]
}) {
  return (
    <div className="border border-zinc-800 rounded-xl bg-zinc-950/40 p-4 mt-6">
      <h2 className="text-lg font-semibold mb-4">Operaciones</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-400 border-b border-zinc-800">
            <tr>
              <th className="text-left p-2">Fecha</th>
              <th className="text-left p-2">Tipo</th>
              <th className="text-left p-2">Monto</th>
              <th className="text-left p-2">Cuota</th>
              <th className="text-left p-2">Vencimiento</th>
            </tr>
          </thead>

          <tbody>
            {operations.map((op) => (
              <tr key={op.id} className="border-b border-zinc-800">
                <td className="p-2">{dateAR(op.created_at)}</td>

                <td className="p-2">
                  {op.operation_type === "sale" ? "Venta" : "Préstamo"}
                </td>

                <td className="p-2">{money(op.total_amount)}</td>

                <td className="p-2">{money(op.installment_amount)}</td>

                <td className="p-2">{dateAR(op.first_due_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}