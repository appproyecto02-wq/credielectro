"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  id: string;
  installment_number: number;
  due_date: string; // date
  amount: number;
  status: string;
  paid_at: string | null;
  operation: {
    id: string;
    operation_type: "sale" | "loan";
    client: { id: string; name: string; phone: string | null } | null;
  } | null;
};

function isoDate(d: Date) {
  // YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CobranzaPage() {
  const [selectedDate, setSelectedDate] = useState<string>(isoDate(new Date()));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows
      .filter((r) => (onlyPending ? r.status === "pending" : true))
      .filter((r) => {
        if (!qq) return true;
        const name = r.operation?.client?.name?.toLowerCase() ?? "";
        const phone = r.operation?.client?.phone?.toLowerCase() ?? "";
        return name.includes(qq) || phone.includes(qq);
      });
  }, [rows, onlyPending, q]);

  async function load() {
    setLoading(true);

    // trae cuotas del día + data relacionada (operation + client)
    const { data, error } = await supabase
      .from("installments")
      .select(
        `
        id,
        installment_number,
        due_date,
        amount,
        status,
        paid_at,
        operation:operations (
          id,
          operation_type,
          client:clients ( id, name, phone )
        )
      `
      )
      .eq("due_date", selectedDate)
      .order("due_date", { ascending: true })
      .order("installment_number", { ascending: true });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    setRows((data as any) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  async function markPaid(id: string) {
    setSavingId(id);
    const { error } = await supabase
      .from("installments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", id);
    setSavingId(null);

    if (error) return alert(error.message);
    await load();
  }

  async function markMissed(id: string) {
    setSavingId(id);
    const { error } = await supabase
      .from("installments")
      .update({ status: "missed", paid_at: null })
      .eq("id", id);
    setSavingId(null);

    if (error) return alert(error.message);
    await load();
  }

  const total = filtered.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Cobranza</h1>
            <p className="text-slate-300 text-sm">
              Filtrá por día y marcá Pagó / No pagó.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-300">Día</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
              />
            </div>

            <input
              placeholder="Buscar cliente o teléfono…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full sm:w-64 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
            />

            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
              />
              Solo pendientes
            </label>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-300">
              {loading ? "Cargando…" : `${filtered.length} cuota(s)`}
            </div>
            <div className="text-sm">
              Total del día:{" "}
              <span className="font-semibold">
                ${total.toLocaleString("es-AR")}
              </span>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-300">
                <tr className="border-b border-slate-800">
                  <th className="py-2 text-left">Cliente</th>
                  <th className="py-2 text-left">Tel.</th>
                  <th className="py-2 text-left">Tipo</th>
                  <th className="py-2 text-right">Cuota</th>
                  <th className="py-2 text-right">Monto</th>
                  <th className="py-2 text-left">Estado</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const client = r.operation?.client;
                  return (
                    <tr key={r.id} className="border-b border-slate-900">
                      <td className="py-3">
                        <div className="font-medium">
                          {client?.name ?? "Sin cliente"}
                        </div>
                        <div className="text-xs text-slate-400">
                          Op: {r.operation?.id ?? "-"}
                        </div>
                      </td>
                      <td className="py-3">{client?.phone ?? "-"}</td>
                      <td className="py-3 capitalize">
                        {r.operation?.operation_type ?? "-"}
                      </td>
                      <td className="py-3 text-right">#{r.installment_number}</td>
                      <td className="py-3 text-right">
                        ${Number(r.amount || 0).toLocaleString("es-AR")}
                      </td>
                      <td className="py-3">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs border",
                            r.status === "paid"
                              ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                              : r.status === "missed"
                              ? "border-rose-700 bg-rose-950/40 text-rose-200"
                              : "border-slate-700 bg-slate-900 text-slate-200",
                          ].join(" ")}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            disabled={savingId === r.id}
                            onClick={() => markPaid(r.id)}
                            className="rounded-lg bg-emerald-600/90 hover:bg-emerald-600 px-3 py-2 text-xs font-semibold disabled:opacity-60"
                          >
                            Pagó
                          </button>
                          <button
                            disabled={savingId === r.id}
                            onClick={() => markMissed(r.id)}
                            className="rounded-lg bg-rose-600/90 hover:bg-rose-600 px-3 py-2 text-xs font-semibold disabled:opacity-60"
                          >
                            No pagó
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">
                      No hay cuotas para ese día.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              onClick={load}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs hover:bg-slate-800"
            >
              Refrescar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}