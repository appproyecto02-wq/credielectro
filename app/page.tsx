"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabaseClient"

// ---------- TYPES ----------
type Role = "admin" | "seller"
type Profile = { id: string; role: Role; name?: string | null }
type Client = { id: string; first_name: string|null; last_name: string|null; dni: string|null; phone: string|null; address: string|null; created_by?: string|null; created_at?: string|null }
type Operation = {
  id: string; created_at: string; first_due_date: string|null; seller_id: string; client_id: string|null
  operation_type: "sale"|"loan"; frequency: "daily"|"weekly"|"biweekly"|"three_weeks"|"monthly"
  base_amount: number; interest_percent: number; installments_count: number; total_amount: number; installment_amount: number
  sale_item: string|null; loan_purpose: string|null; notes: string|null
  late_fee_type?: "fixed_daily"|"percent_daily"|string|null; late_fee_value?: number|null
  seller_name?: string; client_name?: string
}
type InstallmentStatus = "pending"|"paid"|"late"|string
type InstallmentRow = {
  id: string; operation_id: string; installment_number: number; due_date: string|null; amount: number|null; status: InstallmentStatus; paid_at: string|null
  operation?: { id: string; seller_id: string; client_id: string|null; frequency: Operation["frequency"]; installment_amount: number; late_fee_type?: Operation["late_fee_type"]; late_fee_value?: Operation["late_fee_value"] } | null
  client?: { id: string; first_name: string|null; last_name: string|null; phone: string|null; address: string|null } | null
  seller_name?: string|null
}

// ---------- TOAST ----------
type ToastType = "success"|"error"|"warning"|"info"
type Toast = { id: number; message: string; type: ToastType }
let _tid = 0
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const add = useCallback((message: string, type: ToastType = "info") => {
    const id = ++_tid
    setToasts((p) => [...p, { id, message, type }])
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4200)
  }, [])
  const remove = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), [])
  return { toasts, add, remove }
}
function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const sty: Record<ToastType, string> = { success:"bg-emerald-950 border-emerald-600 text-emerald-200", error:"bg-red-950 border-red-600 text-red-200", warning:"bg-amber-950 border-amber-500 text-amber-200", info:"bg-sky-950 border-sky-600 text-sky-200" }
  const ico: Record<ToastType, string> = { success:"✓", error:"✕", warning:"⚠", info:"ℹ" }
  if (!toasts.length) return null
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <style>{`@keyframes tin{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
      {toasts.map((t) => (
        <div key={t.id} style={{animation:"tin .22s ease-out"}} className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl pointer-events-auto ${sty[t.type]}`}>
          <span className="font-bold shrink-0 mt-0.5">{ico[t.type]}</span>
          <span className="text-sm flex-1 leading-snug">{t.message}</span>
          <button onClick={() => onRemove(t.id)} className="opacity-50 hover:opacity-100 shrink-0">✕</button>
        </div>
      ))}
    </div>
  )
}

// ---------- UTILS ----------
const freqLabel: Record<Operation["frequency"], string> = { daily:"Diaria", weekly:"Semanal", biweekly:"Quincenal", three_weeks:"Cada 3 semanas", monthly:"Mensual" }
function money(n: number) { if (!Number.isFinite(n)) return "$ 0"; return n.toLocaleString("es-AR", { style:"currency", currency:"ARS", maximumFractionDigits:0 }) }
function toNumber(v: string) { const x = Number(String(v).replace(",",".")); return Number.isFinite(x) ? x : 0 }
function fullName(first?: string|null, last?: string|null) { return [first,last].filter(Boolean).join(" ").trim() || "Sin nombre" }
function dateAR(d: string|null|undefined) { if (!d) return "—"; const [y,m,day] = d.slice(0,10).split("-"); return y&&m&&day ? `${day}/${m}/${y}` : d }
function dateTimeAR(d: string|null|undefined) { if (!d) return "—"; try { return new Date(d).toLocaleString("es-AR") } catch { return "—" } }
function startOfToday() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()) }
function daysLate(iso: string|null|undefined) {
  if (!iso) return 0
  const p = iso.slice(0,10).split("-"); if (p.length!==3) return 0
  const due = new Date(Number(p[0]), Number(p[1])-1, Number(p[2]))
  if (Number.isNaN(due.getTime())) return 0
  return Math.max(0, Math.floor((startOfToday().getTime()-due.getTime())/86400000))
}
function computeLateFee(o: { installmentAmount: number; daysLate: number; lateFeeType?: string|null; lateFeeValue?: number|null }) {
  const v = Number(o.lateFeeValue ?? 0)
  if (o.daysLate<=0||!Number.isFinite(v)||v<=0) return 0
  if (!o.lateFeeType||o.lateFeeType==="fixed_daily") return v*o.daysLate
  if (o.lateFeeType==="percent_daily") return o.installmentAmount*(v/100)*o.daysLate
  return v*o.daysLate
}
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }

// ---------- UI ATOMS ----------
function Lbl({ c }: { c: string }) { return <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">{c}</div> }
function Inp(p: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={`w-full px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 placeholder:text-zinc-600 transition text-sm disabled:opacity-50 ${p.className??""}`} /> }
function Sel({ children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>&{children:React.ReactNode}) { return <select {...p} className={`w-full px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition text-sm ${p.className??""}`}>{children}</select> }
function Txt(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={`w-full px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 placeholder:text-zinc-600 transition min-h-[80px] resize-none text-sm ${p.className??""}`} /> }
function Btn({ children, v="default", s="md", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>&{v?:"default"|"primary"|"success"|"danger"|"ghost"; s?:"sm"|"md"|"lg"}) {
  const vs = { default:"bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100", primary:"bg-sky-600 hover:bg-sky-500 text-white", success:"bg-emerald-600 hover:bg-emerald-500 text-white", danger:"bg-red-600 hover:bg-red-500 text-white", ghost:"bg-transparent hover:bg-zinc-800 border border-zinc-700 text-zinc-400" }[v]
  const sz = { sm:"px-3 py-1.5 text-xs", md:"px-4 py-2 text-sm", lg:"px-5 py-2.5 text-sm" }[s]
  return <button type="button" {...p} className={`rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${vs} ${sz} ${p.className??""}`}>{children}</button>
}
function Pill({ on, click, lbl }: { on: boolean; click: ()=>void; lbl: string }) {
  return <button type="button" onClick={click} className={`px-4 py-2 rounded-xl text-sm font-semibold transition border ${on?"bg-sky-600 border-sky-500 text-white":"bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>{lbl}</button>
}
function Card({ title, sub, children }: { title?:string; sub?:string; children:React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 backdrop-blur shadow-xl overflow-hidden">
      {(title||sub)&&<div className="px-5 py-4 border-b border-zinc-800/60">{title&&<div className="font-bold text-zinc-100">{title}</div>}{sub&&<div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}</div>}
      <div className="p-5">{children}</div>
    </div>
  )
}
function KpiCard({ label, value, sub, color }: { label:string; value:string; sub?:string; color:string }) {
  return <div className={`rounded-2xl border p-4 ${color}`}><div className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-1">{label}</div><div className="text-2xl font-bold">{value}</div>{sub&&<div className="text-xs opacity-50 mt-1">{sub}</div>}</div>
}
function Spin() { return <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin align-middle" /> }
function Badge({ c, ch }: { c:string; ch:React.ReactNode }) { return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${c}`}>{ch}</span> }

// ---------- PAGE ----------
export default function Page() {
  const router = useRouter()
  const toast = useToasts()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string|null>(null)
  const [role, setRole] = useState<Role>("seller")
  const [profile, setProfile] = useState<Profile|null>(null)
  const [errorMsg, setErrorMsg] = useState<string|null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState<"ops"|"cobranza"|"daily-loans"|"reportes">("ops")

  const mkMonth = () => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}` }
  const [reportMonth, setReportMonth] = useState(mkMonth)
  const [exportMonth, setExportMonth] = useState(mkMonth)
  const [exportWeek, setExportWeek] = useState(() => {
    const n=new Date(); const day=n.getDay()===0?6:n.getDay()-1
    const mon=new Date(n.getFullYear(),n.getMonth(),n.getDate()-day)
    return `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,"0")}-${String(mon.getDate()).padStart(2,"0")}`
  })

  const [clients, setClients] = useState<Client[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  const [installmentsData, setInstallmentsData] = useState<InstallmentRow[]>([])
  const [loadingCobranza, setLoadingCobranza] = useState(false)
  const [savingCobranzaId, setSavingCobranzaId] = useState<string|null>(null)

  // form
  const [clientMode, setClientMode] = useState<"existing"|"new">("existing")
  const [selectedClientId, setSelectedClientId] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [dni, setDni] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")

  const DAILY_PLANS = { 12:20, 17:35, 24:45, 36:75, 48:100 } as const
  const [dailyClientMode, setDailyClientMode] = useState<"existing"|"new">("existing")
  const [dailySelectedClientId, setDailySelectedClientId] = useState("")
  const [dailyFirstName, setDailyFirstName] = useState("")
  const [dailyLastName, setDailyLastName] = useState("")
  const [dailyDni, setDailyDni] = useState("")
  const [dailyPhone, setDailyPhone] = useState("")
  const [dailyAddress, setDailyAddress] = useState("")
  const [dailyLoanAmount, setDailyLoanAmount] = useState("")
  const [dailyLoanPlan, setDailyLoanPlan] = useState<12|17|24|36|48>(12)
  const [dailyLoanInterest, setDailyLoanInterest] = useState("20")
  const [dailyLoanFirstDueDate, setDailyLoanFirstDueDate] = useState("")
  const [savingDailyLoan, setSavingDailyLoan] = useState(false)

  const [operationType, setOperationType] = useState<Operation["operation_type"]>("sale")
  const [saleItem, setSaleItem] = useState("")
  const [loanPurpose, setLoanPurpose] = useState("")
  const [frequency, setFrequency] = useState<Operation["frequency"]>("weekly")
  const [baseAmount, setBaseAmount] = useState("")
  const [interestPercent, setInterestPercent] = useState("")
  const [installments, setInstallments] = useState("1")
  const [notes, setNotes] = useState("")
  const [lateFeeType, setLateFeeType] = useState<"fixed_daily"|"percent_daily">("fixed_daily")
  const [lateFeeValue, setLateFeeValue] = useState("")
  const [saving, setSaving] = useState(false)

  const baseAmountNum      = useMemo(() => toNumber(baseAmount), [baseAmount])
  const interestPercentNum = useMemo(() => toNumber(interestPercent), [interestPercent])
  const installmentsNum    = useMemo(() => Math.max(1, Math.min(60, Math.trunc(toNumber(installments))||1)), [installments])
  const previewTotal       = useMemo(() => Math.max(0, baseAmountNum*(1+interestPercentNum/100)), [baseAmountNum, interestPercentNum])
  const previewInstallment = useMemo(() => installmentsNum>0 ? previewTotal/installmentsNum : 0, [previewTotal, installmentsNum])

  const [editingOp, setEditingOp] = useState<Operation|null>(null)
  const [editType, setEditType] = useState<Operation["operation_type"]>("sale")
  const [editFrequency, setEditFrequency] = useState<Operation["frequency"]>("weekly")
  const [editBaseAmount, setEditBaseAmount] = useState("")
  const [editInterest, setEditInterest] = useState("")
  const [editInstallments, setEditInstallments] = useState("")
  const [editDetail, setEditDetail] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editClientId, setEditClientId] = useState<string|null>(null)
  const [editClientFirst, setEditClientFirst] = useState("")
  const [editClientLast, setEditClientLast] = useState("")
  const [editClientDni, setEditClientDni] = useState("")
  const [editClientPhone, setEditClientPhone] = useState("")
  const [editClientAddress, setEditClientAddress] = useState("")
  const [loadingClientForEdit, setLoadingClientForEdit] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  const [opSearch, setOpSearch] = useState("")
  const [opTypeFilter, setOpTypeFilter] = useState<"all"|"sale"|"loan">("all")

  useEffect(() => { setDailyLoanInterest(String(DAILY_PLANS[dailyLoanPlan])) }, [dailyLoanPlan])
  useEffect(() => {
    if (dailyLoanFirstDueDate) return
    const t=new Date(); t.setDate(t.getDate()+1)
    setDailyLoanFirstDueDate(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`)
  }, [dailyLoanFirstDueDate])

  useEffect(() => {
    let mounted=true
    async function init() {
      setLoading(true); setErrorMsg(null)
      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return
      if (error) { setErrorMsg(error.message); setLoading(false); return }
      const user = data.session?.user
      if (!user) { router.replace("/login"); return }
      setUserId(user.id)
      const profRes = await supabase.from("profiles").select("id, name, role").eq("id", user.id).maybeSingle()
      if (!mounted) return
      const r = ((profRes.data as any)?.role as Role)??"seller"
      setRole(r); setProfile({ id:user.id, role:r, name:(profRes.data as any)?.name??null })
      await fetchOperations(user.id, r)
      if (r!=="admin") await fetchClients(user.id)
      await fetchCobranza(user.id, r)
      setLoading(false)
    }
    init()
    const { data:sub } = supabase.auth.onAuthStateChange((_e,s) => { if (!s?.user) router.replace("/login") })
    return () => { mounted=false; sub.subscription.unsubscribe() }
  }, [router])

  async function fetchClients(sellerId: string) {
    setErrorMsg(null)
    const res = await supabase.from("clients").select("id, first_name, last_name, dni, phone, address, created_by, created_at").eq("created_by", sellerId).order("created_at",{ascending:false})
    if (res.error) { setErrorMsg(res.error.message); setClients([]); return }
    setClients((res.data as any)??[])
  }

  async function fetchOperations(uid: string, r: Role) {
    setErrorMsg(null)
    const sel = "id, created_at, first_due_date, seller_id, operation_type, frequency, client_id, base_amount, interest_percent, installments_count, total_amount, installment_amount, notes, sale_item, loan_purpose, late_fee_type, late_fee_value, clients:client_id(first_name, last_name)"
    let q = supabase.from("operations").select(sel).order("created_at",{ascending:false})
    if (r!=="admin") q = q.eq("seller_id", uid)
    const res = await q
    if (res.error) { setErrorMsg(res.error.message); setOperations([]); return }
    const raw: any[] = (res.data as any)??[]
    const ops: Operation[] = raw.map((o) => ({ ...o, client_name: fullName(o.clients?.first_name??null, o.clients?.last_name??null) }))
    const sellerIds = Array.from(new Set(ops.map((o) => o.seller_id).filter(Boolean)))
    if (sellerIds.length) {
      const sr = await supabase.from("profiles").select("id, name").in("id", sellerIds)
      const map = new Map<string,string>()
      if (!sr.error) for (const p of (sr.data as any[])??[]) map.set(p.id, String(p.name??"").trim()||"Vendedor")
      setOperations(ops.map((o) => ({ ...o, seller_name: map.get(o.seller_id)??"Vendedor" })))
      return
    }
    setOperations(ops)
  }

  async function fetchCobranza(uid: string, r: Role) {
    setLoadingCobranza(true); setErrorMsg(null)
    try {
      const today = todayISO()
      let q = supabase.from("installments").select(`id, operation_id, installment_number, due_date, amount, status, paid_at, operations:operation_id ( id, seller_id, client_id, frequency, installment_amount, late_fee_type, late_fee_value, clients:client_id ( id, first_name, last_name, phone, address ) )`)
      if (r!=="admin") q = q.eq("operations.seller_id", uid).neq("status","paid").lte("due_date", today)
      q = q.order("due_date",{ascending:true})
      const res = await q
      if (res.error) { setErrorMsg(res.error.message); setInstallmentsData([]); return }
      const rows = ((res.data as any[])??[]) as any[]
      setInstallmentsData(rows.map((row) => {
        const op = row?.operations??null; const c = op?.clients??null
        return {
          id:String(row.id), operation_id:String(row.operation_id), installment_number:Number(row.installment_number??0),
          due_date:row.due_date??null, amount:row.amount??null, status:(row.status??"pending") as InstallmentStatus, paid_at:row.paid_at??null,
          operation: op ? { id:String(op.id), seller_id:String(op.seller_id), client_id:op.client_id??null, frequency:op.frequency, installment_amount:Number(op.installment_amount??0), late_fee_type:op.late_fee_type??"fixed_daily", late_fee_value:op.late_fee_value??0 } : null,
          client: c ? { id:String(c.id), first_name:c.first_name??null, last_name:c.last_name??null, phone:c.phone??null, address:c.address??null } : null,
        }
      }))
    } catch(e:any) { setErrorMsg(e?.message??"Error inesperado"); setInstallmentsData([]) }
    finally { setLoadingCobranza(false) }
  }

  async function handleRefresh() {
    if (!userId||refreshing) return
    setRefreshing(true)
    await fetchOperations(userId, role); await fetchCobranza(userId, role)
    if (role!=="admin") await fetchClients(userId)
    setRefreshing(false); toast.add("Datos actualizados","success")
  }

  async function signOut() { await supabase.auth.signOut(); router.replace("/login") }

  // EXPORT
  function getDateRange(t: "month"|"week", v: string) {
    let startDate:Date, endDate:Date, fileLabel:string
    if (t==="month") { const [y,m]=v.split("-").map(Number); startDate=new Date(y,m-1,1); endDate=new Date(y,m,0,23,59,59,999); fileLabel=v }
    else { const [y,m,d]=v.split("-").map(Number); startDate=new Date(y,m-1,d); endDate=new Date(y,m-1,d+6,23,59,59,999); const el=`${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,"0")}-${String(endDate.getDate()).padStart(2,"0")}`; fileLabel=`${v}_al_${el}` }
    return { startDate, endDate, fileLabel }
  }
  function downloadCSV(rows: string[][], filename: string) {
    const csv="\uFEFF"+"sep=;\r\n"+rows.map((r)=>r.map((c)=>`"${String(c).replace(/"/g,'""')}"`).join(";")).join("\r\n")
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}))
    const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url)
    toast.add("Archivo exportado","success")
  }
  function exportOperaciones(t: "month"|"week", v: string) {
    const { startDate, endDate, fileLabel } = getDateRange(t, v)
    const rows: string[][] = [["Cliente","Fecha creacion","Tipo","Frecuencia","Monto base","Total","Cuotas","Monto cuota"]]
    for (const op of operations) {
      const created=new Date(op.created_at)
      if (created<startDate||created>endDate) continue
      rows.push([(op as any).client_name??"—", dateAR(op.created_at.slice(0,10)), op.operation_type==="sale"?"Venta":"Prestamo", freqLabel[op.frequency]??"—", String(Math.round(op.base_amount)), String(Math.round(op.total_amount)), String(op.installments_count), String(Math.round(op.installment_amount))])
    }
    downloadCSV(rows, `operaciones_${fileLabel}.csv`)
  }
  function exportCobranza(t: "month"|"week", v: string) {
    const { startDate, endDate, fileLabel } = getDateRange(t, v)
    const rows: string[][] = [["Cliente","Telefono","Direccion","Vencimiento","Cuota #","Frecuencia","Monto","Estado","Dias atraso","Mora","Total a cobrar"]]
    for (const inst of installmentsData) {
      if (!inst.due_date) continue
      const [iy,im,id2]=inst.due_date.slice(0,10).split("-").map(Number)
      const due=new Date(iy,im-1,id2)
      if (due<startDate||due>endDate) continue
      const op=inst.operation; const cl=inst.client
      const amt=Number(inst.amount??op?.installment_amount??0)
      const st=inst.status==="paid"?"Pagada":inst.status==="late"?"Atrasada":"Pendiente"
      const late=daysLate(inst.due_date)
      const fee=computeLateFee({ installmentAmount:amt, daysLate:late, lateFeeType:op?.late_fee_type??null, lateFeeValue:op?.late_fee_value??0 })
      rows.push([fullName(cl?.first_name,cl?.last_name), cl?.phone??"—", cl?.address??"—", dateAR(inst.due_date), String(inst.installment_number), freqLabel[op?.frequency??"weekly"]??"—", String(Math.round(amt)), st, String(late), String(Math.round(fee)), String(Math.round(amt+fee))])
    }
    downloadCSV(rows, `cobranza_${fileLabel}.csv`)
  }

  // CRUD
  async function createClientIfNeeded(): Promise<string|null> {
    if (clientMode==="existing") return selectedClientId||null
    if (!userId) return null
    const fn=firstName.trim(); const ln=lastName.trim()
    if (!fn&&!ln) { toast.add("Completá nombre o apellido del cliente.","warning"); return null }
    const res = await supabase.from("clients").insert({ first_name:fn||null, last_name:ln||null, dni:dni.trim()||null, phone:phone.trim()||null, address:address.trim()||null, created_by:userId }).select("id").single()
    if (res.error) { toast.add(res.error.message,"error"); return null }
    const newId=(res.data as any)?.id as string
    await fetchClients(userId); setSelectedClientId(newId)
    setFirstName(""); setLastName(""); setDni(""); setPhone(""); setAddress("")
    return newId
  }

  async function saveOperation() {
    if (!userId) return
    setSaving(true)
    try {
      const clientId = await createClientIfNeeded()
      if (!clientId) return
      const bd=new Date(); const ty=bd.getFullYear(); const tm=bd.getMonth(); const td=bd.getDate()
      let fdo: Date
      if (frequency==="weekly") fdo=new Date(ty,tm,td+7)
      else if (frequency==="biweekly") fdo=new Date(ty,tm,td+15)
      else if (frequency==="three_weeks") fdo=new Date(ty,tm,td+21)
      else fdo=new Date(ty,tm+1,td)
      const firstDueDate=`${fdo.getFullYear()}-${String(fdo.getMonth()+1).padStart(2,"0")}-${String(fdo.getDate()).padStart(2,"0")}`
      const payload: any = { seller_id:userId, operation_type:operationType, frequency, client_id:clientId, base_amount:baseAmountNum, interest_percent:interestPercentNum, installments_count:installmentsNum, total_amount:previewTotal, installment_amount:previewInstallment, first_due_date:firstDueDate, notes:notes.trim()||null, sale_item:operationType==="sale"?saleItem.trim()||null:null, loan_purpose:operationType==="loan"?loanPurpose.trim()||null:null, late_fee_type:lateFeeType, late_fee_value:toNumber(lateFeeValue)||null }
      const res = await supabase.from("operations").insert(payload).select("id").single()
      if (res.error) { toast.add(res.error.message,"error"); return }
      setSaleItem(""); setLoanPurpose(""); setBaseAmount(""); setInterestPercent(""); setInstallments("1"); setNotes(""); setLateFeeType("fixed_daily"); setLateFeeValue("")
      await fetchOperations(userId, role); await fetchCobranza(userId!, role)
      toast.add("¡Operación guardada correctamente!","success")
    } finally { setSaving(false) }
  }

  async function deleteOperation(opId: string) {
    if (role!=="admin") return
    if (!confirm("¿Confirmás borrar esta operación? Si es la única del cliente, se borrará también el cliente.")) return
    const opData=operations.find((o)=>o.id===opId)
    const clientId=opData?.client_id??null
    const res = await supabase.from("operations").delete().eq("id", opId)
    if (res.error) { toast.add(res.error.message,"error"); return }
    if (clientId) {
      const { data:otherOps } = await supabase.from("operations").select("id").eq("client_id", clientId).limit(1)
      if (!otherOps||otherOps.length===0) await supabase.from("clients").delete().eq("id", clientId)
    }
    await fetchOperations(userId!, role); await fetchCobranza(userId!, role)
    if (role!=="admin") await fetchClients(userId!)
    toast.add("Operación eliminada","info")
  }

  async function startEditOperation(op: Operation) {
    if (role!=="admin") return
    setEditingOp(op); setEditType(op.operation_type); setEditFrequency(op.frequency)
    setEditBaseAmount(String(op.base_amount??"")); setEditInterest(String(op.interest_percent??"")); setEditInstallments(String(op.installments_count??"1"))
    setEditDetail(op.operation_type==="sale"?String(op.sale_item??""):String(op.loan_purpose??"")); setEditNotes(String(op.notes??""))
    const cid=op.client_id; setEditClientId(cid)
    if (!cid) { setEditClientFirst(""); setEditClientLast(""); setEditClientDni(""); setEditClientPhone(""); setEditClientAddress(""); return }
    setLoadingClientForEdit(true)
    try {
      const cRes = await supabase.from("clients").select("id, first_name, last_name, dni, phone, address").eq("id", cid).maybeSingle()
      if (cRes.error) { toast.add(cRes.error.message,"error"); return }
      const c=cRes.data as any
      setEditClientFirst(String(c?.first_name??"")); setEditClientLast(String(c?.last_name??"")); setEditClientDni(String(c?.dni??"")); setEditClientPhone(String(c?.phone??"")); setEditClientAddress(String(c?.address??""))
    } finally { setLoadingClientForEdit(false) }
  }

  async function saveEditOperation() {
    if (role!=="admin"||!editingOp) return
    const base=toNumber(editBaseAmount); const interest=toNumber(editInterest)
    const inst=Math.max(1,Math.min(60,Math.trunc(toNumber(editInstallments))||1))
    const total=Math.max(0,base*(1+interest/100)); const instAmt=inst>0?total/inst:0
    setSavingEdit(true)
    try {
      const opPayload: any = { operation_type:editType, frequency:editFrequency, base_amount:base, interest_percent:interest, installments_count:inst, total_amount:total, installment_amount:instAmt, notes:editNotes.trim()||null, sale_item:editType==="sale"?editDetail.trim()||null:null, loan_purpose:editType==="loan"?editDetail.trim()||null:null }
      const opRes = await supabase.from("operations").update(opPayload).eq("id", editingOp.id)
      if (opRes.error) { toast.add(opRes.error.message,"error"); return }
      if (editClientId) {
        const cRes = await supabase.from("clients").update({ first_name:editClientFirst.trim()||null, last_name:editClientLast.trim()||null, dni:editClientDni.trim()||null, phone:editClientPhone.trim()||null, address:editClientAddress.trim()||null }).eq("id", editClientId)
        if (cRes.error) toast.add("Operación guardada, pero cliente NO actualizado: "+cRes.error.message,"warning")
      }
      setEditingOp(null)
      await fetchOperations(userId!, role); await fetchCobranza(userId!, role)
      toast.add("Operación y cliente actualizados","success")
    } finally { setSavingEdit(false) }
  }

  async function markInstallmentPaid(id: string) {
    if (!userId||role==="admin") return
    setSavingCobranzaId(id)
    try {
      const res = await supabase.from("installments").update({ status:"paid", paid_at:new Date().toISOString() }).eq("id", id)
      if (res.error) { toast.add(res.error.message,"error"); return }
      await fetchCobranza(userId!, role); toast.add("Pago registrado ✓","success")
    } finally { setSavingCobranzaId(null) }
  }

  async function markInstallmentNoPay(id: string) {
    if (!userId||role==="admin") return
    setSavingCobranzaId(id)
    try {
      const res = await supabase.from("installments").update({ status:"late", paid_at:null }).eq("id", id)
      if (res.error) { toast.add(res.error.message,"error"); return }
      await fetchCobranza(userId!, role)
    } finally { setSavingCobranzaId(null) }
  }

  async function createDailyClientIfNeeded(): Promise<string|null> {
    if (dailyClientMode==="existing") return dailySelectedClientId||null
    if (!userId) return null
    const fn=dailyFirstName.trim(); const ln=dailyLastName.trim()
    if (!fn||!ln) { toast.add("Completá nombre y apellido del cliente.","warning"); return null }
    const res = await supabase.from("clients").insert({ first_name:fn||null, last_name:ln||null, dni:dailyDni.trim()||null, phone:dailyPhone.trim()||null, address:dailyAddress.trim()||null, created_by:userId }).select("id").single()
    if (res.error) { toast.add(res.error.message,"error"); return null }
    await fetchClients(userId)
    return (res.data as any)?.id??null
  }

  async function createDailyLoan() {
    if (!userId||savingDailyLoan) return
    setSavingDailyLoan(true)
    try {
      const clientId = await createDailyClientIfNeeded()
      if (!clientId) { toast.add("Seleccioná o creá un cliente.","warning"); return }
      const bav=toNumber(dailyLoanAmount)
      if (bav<=0) { toast.add("Ingresá un monto válido.","warning"); return }
      if (!dailyLoanFirstDueDate) { toast.add("Ingresá la fecha del primer vencimiento.","warning"); return }
      const ipv=toNumber(dailyLoanInterest); const icv=Number(dailyLoanPlan)
      const totalAmt=bav*(1+ipv/100); const instAmt=icv>0?totalAmt/icv:0
      const opRes = await supabase.from("operations").insert({ seller_id:userId, client_id:clientId, operation_type:"loan", frequency:"daily", base_amount:bav, interest_percent:ipv, installments_count:icv, total_amount:totalAmt, installment_amount:instAmt, notes:null, first_due_date:dailyLoanFirstDueDate }).select("id").single()
      if (opRes.error) { toast.add(opRes.error.message,"error"); return }
      const operationId=(opRes.data as any)?.id as string
      const [fdY,fdM,fdD]=dailyLoanFirstDueDate.split("-").map(Number)
      const instRows = Array.from({ length:icv }, (_,i) => { const due=new Date(fdY,fdM-1,fdD+i); return { operation_id:operationId, installment_number:i+1, due_date:`${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,"0")}-${String(due.getDate()).padStart(2,"0")}`, amount:instAmt, status:"pending", paid_at:null } })
      const insRes = await supabase.from("installments").insert(instRows)
      if (insRes.error) { toast.add("Error al generar cuotas: "+insRes.error.message,"error"); return }
      await fetchCobranza(userId, role)
      setDailyClientMode("existing"); setDailyFirstName(""); setDailyLastName(""); setDailyDni(""); setDailyPhone(""); setDailyAddress(""); setDailyLoanAmount(""); setDailyLoanPlan(12); setDailyLoanInterest("20")
      const nd=new Date(); nd.setDate(nd.getDate()+1)
      setDailyLoanFirstDueDate(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}-${String(nd.getDate()).padStart(2,"0")}`)
      toast.add("¡Préstamo diario creado correctamente!","success")
    } finally { setSavingDailyLoan(false) }
  }

  // COBRANZA DERIVADOS
  const hoyISO = todayISO()
  const cobranzaRows = useMemo(() => installmentsData
    .filter((r) => (r.status??"pending")!=="paid")
    .map((r) => {
      const op=r.operation; const cl=r.client
      const amt=Number(r.amount??op?.installment_amount??0); const late=daysLate(r.due_date)
      const fee=computeLateFee({ installmentAmount:amt, daysLate:late, lateFeeType:op?.late_fee_type??"fixed_daily", lateFeeValue:op?.late_fee_value??0 })
      return { ...r, _amount:amt, _daysLate:late, _lateFee:fee, _totalToPay:amt+fee, _clientName:fullName(cl?.first_name??null, cl?.last_name??null), _clientPhone:cl?.phone??null, _clientAddress:cl?.address??null, _frequency:op?.frequency??"weekly" }
    })
    .sort((a,b) => { const da=a.due_date?new Date(a.due_date).getTime():0; const db=b.due_date?new Date(b.due_date).getTime():0; return da-db }), [installmentsData])

  const cuotasParaHoy   = useMemo(() => cobranzaRows.filter((r) => (r.due_date??"").slice(0,10)===hoyISO), [cobranzaRows, hoyISO])
  const atrasadas       = useMemo(() => cobranzaRows.filter((r) => (r as any)._daysLate>0), [cobranzaRows])
  const cobradasHoy     = useMemo(() => installmentsData.filter((r) => (r.paid_at??"").slice(0,10)===hoyISO), [installmentsData, hoyISO])
  const totalCobradoHoy = useMemo(() => cobradasHoy.reduce((a,r) => a+Number(r.amount??r.operation?.installment_amount??0), 0), [cobradasHoy])

  const reportMonthRange = useMemo(() => { const [yr,mo]=reportMonth.split("-").map(Number); if (!yr||!mo) return { start:null as Date|null, end:null as Date|null }; return { start:new Date(yr,mo-1,1), end:new Date(yr,mo,0,23,59,59,999) } }, [reportMonth])
  const reportMonthLabel = useMemo(() => { if (!reportMonthRange.start) return "—"; return reportMonthRange.start.toLocaleDateString("es-AR",{ year:"numeric", month:"long" }) }, [reportMonthRange])
  const reportOpsSummary = useMemo(() => {
    const [yr,mo]=reportMonth.split("-").map(Number)
    if (!yr||!mo) return { closedOps:[] as Operation[], openOps:[] as Operation[] }
    const ms=new Date(yr,mo-1,1); const me=new Date(yr,mo,0,23,59,59,999)
    const byOp=new Map<string,InstallmentRow[]>()
    for (const row of installmentsData) { if (!byOp.has(row.operation_id)) byOp.set(row.operation_id,[]); byOp.get(row.operation_id)!.push(row) }
    const closedOps:Operation[]=[]; const openOps:Operation[]=[]
    for (const op of operations) {
      const rows=byOp.get(op.id)??[]
      if (!rows.length||!rows.every((r)=>r.status==="paid")) { openOps.push(op); continue }
      const pds=rows.map((r)=>r.paid_at).filter(Boolean).map((d)=>new Date(d as string).getTime()).filter((n)=>Number.isFinite(n))
      if (!pds.length) { openOps.push(op); continue }
      const ca=new Date(Math.max(...pds))
      if (ca>=ms&&ca<=me) closedOps.push(op); else openOps.push(op)
    }
    return { closedOps, openOps }
  }, [reportMonth, operations, installmentsData])
  const reportEconomicSummary = useMemo(() => {
    const cc=reportOpsSummary.closedOps.reduce((a,o)=>a+Number(o.base_amount??0),0)
    const oc=reportOpsSummary.openOps.reduce((a,o)=>a+Number(o.base_amount??0),0)
    const ie=reportOpsSummary.closedOps.reduce((a,o)=>a+Math.max(0,Number(o.total_amount??0)-Number(o.base_amount??0)),0)
    const pbo=new Map<string,number>()
    for (const row of installmentsData) { if (row.status==="paid") pbo.set(row.operation_id,(pbo.get(row.operation_id)??0)+Number(row.amount??row.operation?.installment_amount??0)) }
    const ptc=reportOpsSummary.openOps.reduce((a,o)=>a+Math.max(0,Number(o.total_amount??0)-(pbo.get(o.id)??0)),0)
    return { closedCapital:cc, openCapital:oc, pendingToCollect:ptc, interestEarned:ie }
  }, [reportOpsSummary, installmentsData])

  const filteredOps = useMemo(() => operations.filter((op) => {
    if (opTypeFilter!=="all"&&op.operation_type!==opTypeFilter) return false
    if (!opSearch.trim()) return true
    const s=opSearch.toLowerCase()
    const det=(op.operation_type==="sale"?op.sale_item:op.loan_purpose)??""
    return det.toLowerCase().includes(s)||(op.seller_name??"").toLowerCase().includes(s)||(op.client_name??"").toLowerCase().includes(s)
  }), [operations, opSearch, opTypeFilter])

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center text-2xl font-black text-white">C</div>
      <div className="flex items-center gap-2 text-zinc-400 text-sm"><Spin /> Iniciando sesión...</div>
    </div>
  )

  const dBase=Number(dailyLoanAmount||0); const dInt=Number(dailyLoanInterest||0)
  const dTotal=dBase+dBase*(dInt/100); const dInstAmt=Number(dailyLoanPlan)>0?dTotal/Number(dailyLoanPlan):0

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />

      {/* HEADER */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center text-sm font-black shrink-0">C</div>
            <div>
              <div className="font-bold text-sm leading-tight">CrediElectro Dyn</div>
              <div className="text-[10px] text-zinc-500 hidden sm:block">{role==="admin"?"Administrador":"Vendedor"}{profile?.name?` · ${profile.name}`:""}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Btn v="ghost" s="sm" onClick={handleRefresh} disabled={refreshing}>{refreshing?<Spin/>:"↻"}<span className="hidden sm:inline ml-1">Actualizar</span></Btn>
            <Btn v="danger" s="sm" onClick={signOut}>Salir</Btn>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* NAV */}
        <nav className="mb-6 overflow-x-auto pb-1">
          <div className="inline-flex min-w-full sm:min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-1 gap-1">
            {[{ id:"ops",label:"Operaciones",icon:"📋" },{ id:"cobranza",label:"Cobranza",icon:"💰" },...(role!=="admin"?[{ id:"daily-loans",label:"Diarios",icon:"⚡" }]:[]),...(role==="admin"?[{ id:"reportes",label:"Reportes",icon:"📊" }]:[])].map((tab) => (
              <button key={tab.id} type="button" onClick={async()=>{ setView(tab.id as any); if(tab.id==="cobranza") await fetchCobranza(userId!,role) }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap flex items-center gap-1.5 ${view===tab.id
                  ?tab.id==="ops"?"bg-sky-600 text-white":tab.id==="cobranza"?"bg-emerald-600 text-white":tab.id==="daily-loans"?"bg-violet-600 text-white":"bg-amber-600 text-white"
                  :"text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"}`}>
                <span>{tab.icon}</span><span>{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {errorMsg&&(
          <div className="mb-5 p-3 rounded-xl border border-red-800 bg-red-950/50 text-red-300 text-sm flex items-center justify-between">
            <span>⚠ {errorMsg}</span><button onClick={()=>setErrorMsg(null)} className="opacity-60 hover:opacity-100 ml-3">✕</button>
          </div>
        )}

        {/* OPS */}
        {view==="ops"&&(
          role!=="admin"?(
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <Card title="Nueva operación" sub="Registrá una venta o préstamo">
                  <div className="space-y-5">
                    <div>
                      <Lbl c="Cliente"/>
                      <div className="flex gap-2 mb-3"><Pill on={clientMode==="existing"} click={()=>setClientMode("existing")} lbl="Existente"/><Pill on={clientMode==="new"} click={()=>setClientMode("new")} lbl="Nuevo"/></div>
                      {clientMode==="existing"
                        ?<Sel value={selectedClientId} onChange={(e)=>setSelectedClientId(e.target.value)}><option value="">— Elegí un cliente —</option>{clients.map((c)=><option key={c.id} value={c.id}>{fullName(c.first_name,c.last_name)}{c.dni?` — DNI ${c.dni}`:""}</option>)}</Sel>
                        :<div className="space-y-2"><div className="grid grid-cols-2 gap-2"><Inp placeholder="Nombre" value={firstName} onChange={(e)=>setFirstName(e.target.value)}/><Inp placeholder="Apellido" value={lastName} onChange={(e)=>setLastName(e.target.value)}/></div><div className="grid grid-cols-2 gap-2"><Inp placeholder="DNI" value={dni} onChange={(e)=>setDni(e.target.value)} inputMode="numeric"/><Inp placeholder="Celular" value={phone} onChange={(e)=>setPhone(e.target.value)} inputMode="tel"/></div><Inp placeholder="Dirección" value={address} onChange={(e)=>setAddress(e.target.value)}/></div>
                      }
                    </div>
                    <div>
                      <Lbl c="Tipo"/>
                      <div className="flex gap-2"><Pill on={operationType==="sale"} click={()=>setOperationType("sale")} lbl="🛒 Venta"/><Pill on={operationType==="loan"} click={()=>setOperationType("loan")} lbl="💳 Préstamo"/></div>
                    </div>
                    <div><Lbl c={operationType==="sale"?"¿Qué se vendió?":"Motivo del préstamo"}/><Inp placeholder={operationType==="sale"?'"Heladera","TV"...':'"Efectivo","Compra"...'} value={operationType==="sale"?saleItem:loanPurpose} onChange={(e)=>operationType==="sale"?setSaleItem(e.target.value):setLoanPurpose(e.target.value)}/></div>
                    <div><Lbl c="Frecuencia"/><Sel value={frequency} onChange={(e)=>setFrequency(e.target.value as any)}><option value="weekly">Semanal</option><option value="biweekly">Quincenal</option><option value="three_weeks">Cada 3 semanas</option><option value="monthly">Mensual</option></Sel></div>
                    <div>
                      <Lbl c="Montos"/>
                      <div className="grid grid-cols-3 gap-2">
                        <div><div className="text-[11px] text-zinc-500 mb-1">Base</div><Inp placeholder="50000" value={baseAmount} onChange={(e)=>setBaseAmount(e.target.value)} inputMode="decimal"/></div>
                        <div><div className="text-[11px] text-zinc-500 mb-1">Interés %</div><Inp placeholder="20" value={interestPercent} onChange={(e)=>setInterestPercent(e.target.value)} inputMode="decimal"/></div>
                        <div><div className="text-[11px] text-zinc-500 mb-1">Cuotas</div><Inp placeholder="12" value={installments} onChange={(e)=>setInstallments(e.target.value)} inputMode="numeric"/></div>
                      </div>
                    </div>
                    <div>
                      <Lbl c="Mora por atraso"/>
                      <div className="grid grid-cols-2 gap-2">
                        <Sel value={lateFeeType} onChange={(e)=>setLateFeeType(e.target.value as any)}><option value="fixed_daily">Fijo diario ($)</option><option value="percent_daily">% diario</option></Sel>
                        <Inp placeholder={lateFeeType==="fixed_daily"?"Ej: 500":"Ej: 1.5"} value={lateFeeValue} onChange={(e)=>setLateFeeValue(e.target.value)} inputMode="decimal"/>
                      </div>
                    </div>
                    {baseAmountNum>0&&(
                      <div className="rounded-xl bg-zinc-900 border border-zinc-700/50 p-4 grid grid-cols-2 gap-3">
                        <div><div className="text-[11px] text-zinc-500 mb-0.5">Total a cobrar</div><div className="text-lg font-bold text-sky-300">{money(previewTotal)}</div></div>
                        <div><div className="text-[11px] text-zinc-500 mb-0.5">Valor de cuota</div><div className="text-lg font-bold text-emerald-300">{money(previewInstallment)}</div></div>
                      </div>
                    )}
                    <div><Lbl c="Notas (opcional)"/><Txt placeholder="Observaciones..." value={notes} onChange={(e)=>setNotes(e.target.value)}/></div>
                    <Btn v="primary" s="lg" onClick={saveOperation} disabled={saving} className="w-full">{saving?<><Spin/><span className="ml-2">Guardando...</span></>:"✓ Guardar operación"}</Btn>
                  </div>
                </Card>
              </div>
              <div className="lg:col-span-3">
                <Card title="Mis operaciones" sub={`${operations.length} registradas`}>
                  <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <Inp placeholder="Buscar cliente o detalle..." value={opSearch} onChange={(e)=>setOpSearch(e.target.value)} className="sm:flex-1"/>
                    <div className="flex gap-1">{(["all","sale","loan"] as const).map((t)=><Btn key={t} s="sm" v={opTypeFilter===t?"primary":"ghost"} onClick={()=>setOpTypeFilter(t)}>{t==="all"?"Todos":t==="sale"?"Ventas":"Préstamos"}</Btn>)}</div>
                  </div>
                  <div className="md:hidden space-y-3">{filteredOps.length===0?<div className="text-center text-zinc-500 py-8 text-sm">Sin operaciones</div>:filteredOps.map((op)=><OpCard key={op.id} op={op} role={role}/>)}</div>
                  <div className="hidden md:block"><OpsTable role={role} operations={filteredOps}/></div>
                </Card>
              </div>
            </div>
          ):(
            <Card title="Todas las operaciones" sub={`${operations.length} registradas`}>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <Inp placeholder="Buscar cliente, detalle o vendedor..." value={opSearch} onChange={(e)=>setOpSearch(e.target.value)} className="sm:flex-1"/>
                <div className="flex gap-1">{(["all","sale","loan"] as const).map((t)=><Btn key={t} s="sm" v={opTypeFilter===t?"primary":"ghost"} onClick={()=>setOpTypeFilter(t)}>{t==="all"?"Todos":t==="sale"?"Ventas":"Préstamos"}</Btn>)}</div>
              </div>
              <div className="md:hidden space-y-3">{filteredOps.map((op)=><OpCard key={op.id} op={op} role={role} onEdit={startEditOperation} onDelete={deleteOperation}/>)}</div>
              <div className="hidden md:block"><OpsTable role={role} operations={filteredOps} onEdit={startEditOperation} onDelete={deleteOperation}/></div>
            </Card>
          )
        )}

        {/* COBRANZA */}
        {view==="cobranza"&&(
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiCard label="Cobrado hoy" value={money(totalCobradoHoy)} sub={`${cobradasHoy.length} cobros`} color="border-emerald-800 bg-emerald-950/30 text-emerald-100"/>
              <KpiCard label="Para hoy"    value={String(cuotasParaHoy.length)} sub="vencen hoy" color="border-sky-800 bg-sky-950/30 text-sky-100"/>
              <KpiCard label="Atrasadas"   value={String(atrasadas.length)} sub="con mora" color="border-rose-800 bg-rose-950/30 text-rose-100"/>
            </div>
            <Card title="Cuotas pendientes" sub={loadingCobranza?"Cargando...":`${cobranzaRows.length} pendientes`}>
              {loadingCobranza
                ?<div className="flex items-center justify-center py-12 gap-2 text-zinc-400"><Spin/> Cargando cobranza...</div>
                :<>
                  <div className="md:hidden space-y-3">
                    {cobranzaRows.length===0
                      ?<div className="text-center text-zinc-500 py-10 text-sm">🎉 No hay cuotas pendientes</div>
                      :(cobranzaRows as any[]).map((r)=>(
                        <div key={r.id} className={`rounded-2xl border p-4 space-y-3 ${r._daysLate>0?"border-rose-800/50 bg-rose-950/10":"border-zinc-800 bg-zinc-900/30"}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-semibold">{r._clientName}</div>
                              <div className="text-xs text-zinc-500 mt-0.5">Vence: {dateAR(r.due_date)} · Cuota #{r.installment_number}</div>
                              {(r._clientPhone||r._clientAddress)&&<div className="text-xs text-zinc-500">{r._clientPhone?`📞 ${r._clientPhone}`:""}{r._clientPhone&&r._clientAddress?" · ":""}{r._clientAddress?`📍 ${r._clientAddress}`:""}</div>}
                            </div>
                            {r._daysLate>0&&<Badge c="bg-rose-900 text-rose-300" ch={`${r._daysLate}d atraso`}/>}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div className="rounded-lg bg-zinc-900 p-2"><div className="text-zinc-500 mb-0.5">Monto</div><div className="font-bold text-sky-300">{money(r._amount)}</div></div>
                            <div className="rounded-lg bg-zinc-900 p-2"><div className="text-zinc-500 mb-0.5">Mora</div><div className="font-bold text-amber-300">{r._lateFee>0?money(r._lateFee):"—"}</div></div>
                            <div className="rounded-lg bg-zinc-900 p-2"><div className="text-zinc-500 mb-0.5">Total</div><div className="font-bold text-emerald-300">{money(r._totalToPay)}</div></div>
                          </div>
                          {role!=="admin"&&(
                            <div className="grid grid-cols-2 gap-2">
                              <Btn v="success" onClick={()=>markInstallmentPaid(r.id)} disabled={savingCobranzaId===r.id}>{savingCobranzaId===r.id?<Spin/>:"✓ Pagó"}</Btn>
                              <Btn v="default" onClick={()=>markInstallmentNoPay(r.id)} disabled={savingCobranzaId===r.id}>No pagó</Btn>
                            </div>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-800">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-zinc-900/80 text-[11px] uppercase tracking-wider text-zinc-500"><tr>
                        {role==="admin"&&<th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Vendedor</th>}
                        <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Cliente</th>
                        <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Vence</th>
                        <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Cuota #</th>
                        <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Frec.</th>
                        <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Monto</th>
                        <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Atraso</th>
                        <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Mora</th>
                        <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Total</th>
                        {role!=="admin"&&<th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Acciones</th>}
                      </tr></thead>
                      <tbody>
                        {cobranzaRows.length===0
                          ?<tr><td colSpan={role==="admin"?9:10} className="px-3 py-8 text-center text-zinc-500">🎉 No hay cuotas pendientes</td></tr>
                          :(cobranzaRows as any[]).map((r)=>(
                            <tr key={r.id} className={`hover:bg-zinc-800/30 transition ${r._daysLate>0?"bg-rose-950/10":""}`}>
                              {role==="admin"&&<td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap text-xs text-zinc-400">{r.seller_name??"Vendedor"}</td>}
                              <td className="px-3 py-3 border-b border-zinc-900/60"><div className="font-semibold">{r._clientName}</div><div className="text-xs text-zinc-500">{r._clientPhone?"📞 "+r._clientPhone:""}{r._clientAddress?` · ${r._clientAddress}`:""}</div></td>
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap">{dateAR(r.due_date)}</td>
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap">#{r.installment_number}</td>
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap text-xs text-zinc-400">{freqLabel[r._frequency as keyof typeof freqLabel]??"—"}</td>
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap font-semibold text-sky-300">{money(r._amount)}</td>
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap">{r._daysLate>0?<Badge c="bg-rose-900 text-rose-300" ch={`${r._daysLate}d`}/>:<span className="text-zinc-600">—</span>}</td>
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap">{r._lateFee>0?<span className="text-amber-300 font-semibold">{money(r._lateFee)}</span>:<span className="text-zinc-600">—</span>}</td>
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap font-bold text-emerald-300">{money(r._totalToPay)}</td>
                              {role!=="admin"&&<td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap"><div className="flex gap-1.5"><Btn s="sm" v="success" onClick={()=>markInstallmentPaid(r.id)} disabled={savingCobranzaId===r.id}>{savingCobranzaId===r.id?<Spin/>:"Pagó"}</Btn><Btn s="sm" v="ghost" onClick={()=>markInstallmentNoPay(r.id)} disabled={savingCobranzaId===r.id}>No pagó</Btn></div></td>}
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                </>
              }
            </Card>
            {role==="admin"&&(
              <>
                <Card title="Cobrado hoy" sub={`Total: ${money(totalCobradoHoy)}`}>
                  <div className="overflow-x-auto rounded-xl border border-zinc-800">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-zinc-900/80 text-[11px] uppercase tracking-wider text-zinc-500"><tr><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Hora</th><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Vendedor</th><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Cliente</th><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Cuota #</th><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Monto</th></tr></thead>
                      <tbody>
                        {cobradasHoy.length===0
                          ?<tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">Hoy no hay cobranzas registradas</td></tr>
                          :cobradasHoy.slice().sort((a,b)=>(b.paid_at?new Date(b.paid_at).getTime():0)-(a.paid_at?new Date(a.paid_at).getTime():0)).map((r)=>(
                            <tr key={r.id} className="hover:bg-zinc-800/30 transition">
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap text-xs text-zinc-400">{dateTimeAR(r.paid_at)}</td>
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap">{r.seller_name??"Vendedor"}</td>
                              <td className="px-3 py-3 border-b border-zinc-900/60">{fullName(r.client?.first_name??null, r.client?.last_name??null)}</td>
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap">#{r.installment_number}</td>
                              <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap font-bold text-emerald-300">{money(Number(r.amount??r.operation?.installment_amount??0))}</td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card title="Exportar cobranza" sub="Descargá cuotas filtradas por período">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
                      <div className="text-sm font-semibold text-zinc-300">📅 Por mes</div>
                      <input type="month" value={exportMonth} onChange={(e)=>setExportMonth(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-700 focus:outline-none text-sm"/>
                      <Btn v="success" onClick={()=>exportCobranza("month",exportMonth)} className="w-full">Descargar cobranza del mes</Btn>
                    </div>
                    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
                      <div className="text-sm font-semibold text-zinc-300">📆 Por semana</div>
                      <div className="text-xs text-zinc-500">Elegí el lunes de la semana</div>
                      <input type="date" value={exportWeek} onChange={(e)=>setExportWeek(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-700 focus:outline-none text-sm"/>
                      <Btn v="primary" onClick={()=>exportCobranza("week",exportWeek)} className="w-full">Descargar cobranza de la semana</Btn>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* DAILY LOANS */}
        {view==="daily-loans"&&role!=="admin"&&(
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="⚡ Préstamos diarios" sub="Cuotas diarias con planes fijos">
              <div className="space-y-5">
                <div>
                  <Lbl c="Cliente"/>
                  <div className="flex gap-2 mb-3"><Pill on={dailyClientMode==="existing"} click={()=>setDailyClientMode("existing")} lbl="Existente"/><Pill on={dailyClientMode==="new"} click={()=>setDailyClientMode("new")} lbl="Nuevo"/></div>
                  {dailyClientMode==="existing"
                    ?<Sel value={dailySelectedClientId} onChange={(e)=>setDailySelectedClientId(e.target.value)}><option value="">Seleccionar cliente</option>{clients.map((c)=><option key={c.id} value={c.id}>{fullName(c.first_name,c.last_name)}</option>)}</Sel>
                    :<div className="grid grid-cols-2 gap-2"><Inp placeholder="Nombre *" value={dailyFirstName} onChange={(e)=>setDailyFirstName(e.target.value)}/><Inp placeholder="Apellido *" value={dailyLastName} onChange={(e)=>setDailyLastName(e.target.value)}/><Inp placeholder="DNI" value={dailyDni} onChange={(e)=>setDailyDni(e.target.value)}/><Inp placeholder="Teléfono" value={dailyPhone} onChange={(e)=>setDailyPhone(e.target.value)}/><Inp placeholder="Dirección" value={dailyAddress} onChange={(e)=>setDailyAddress(e.target.value)} className="col-span-2"/></div>
                  }
                </div>
                <div>
                  <Lbl c="Plan de cuotas"/>
                  <div className="grid grid-cols-5 gap-1.5">
                    {([12,17,24,36,48] as const).map((p)=>(
                      <button key={p} type="button" onClick={()=>setDailyLoanPlan(p)} className={`py-2.5 rounded-xl text-sm font-bold transition border ${dailyLoanPlan===p?"bg-violet-600 border-violet-500 text-white":"bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>{p}</button>
                    ))}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1.5">12→20% · 17→35% · 24→45% · 36→75% · 48→100%</div>
                </div>
                <div><Lbl c="Monto del préstamo"/><Inp placeholder="Ej: 50000" value={dailyLoanAmount} onChange={(e)=>setDailyLoanAmount(e.target.value)} inputMode="decimal"/></div>
                <div><Lbl c="Interés (%)"/><Inp value={dailyLoanInterest} onChange={(e)=>setDailyLoanInterest(e.target.value)} inputMode="decimal"/></div>
                <div><Lbl c="Primera cuota"/><input type="date" value={dailyLoanFirstDueDate} onChange={(e)=>setDailyLoanFirstDueDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 text-sm"/></div>
                <Btn v="success" s="lg" onClick={createDailyLoan} disabled={savingDailyLoan} className="w-full">{savingDailyLoan?<><Spin/><span className="ml-2">Creando...</span></>:"⚡ Crear préstamo diario"}</Btn>
              </div>
            </Card>
            {dBase>0&&(
              <Card title="Vista previa">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-zinc-900 border border-zinc-700/50 p-4"><div className="text-[11px] text-zinc-500 mb-1">Monto prestado</div><div className="text-xl font-bold">{money(dBase)}</div></div>
                  <div className="rounded-xl bg-zinc-900 border border-zinc-700/50 p-4"><div className="text-[11px] text-zinc-500 mb-1">Plan</div><div className="text-xl font-bold text-violet-300">{dailyLoanPlan} cuotas</div></div>
                  <div className="rounded-xl bg-zinc-900 border border-zinc-700/50 p-4"><div className="text-[11px] text-zinc-500 mb-1">Total a cobrar</div><div className="text-xl font-bold text-sky-300">{money(dTotal)}</div></div>
                  <div className="rounded-xl bg-zinc-900 border border-zinc-700/50 p-4"><div className="text-[11px] text-zinc-500 mb-1">Cuota diaria</div><div className="text-xl font-bold text-emerald-300">{money(dInstAmt)}</div></div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* REPORTES */}
        {view==="reportes"&&role==="admin"&&(
          <div className="space-y-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div><Lbl c="Mes del reporte"/><input type="month" value={reportMonth} onChange={(e)=>setReportMonth(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-900 text-zinc-100 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-500/40 text-sm"/></div>
              <div className="pt-3 text-sm text-zinc-400">Período: <span className="text-zinc-200 font-semibold capitalize">{reportMonthLabel}</span></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Capital recuperado" value={money(reportEconomicSummary.closedCapital)} sub={`${reportOpsSummary.closedOps.length} ops`} color="border-emerald-800 bg-emerald-950/30 text-emerald-100"/>
              <KpiCard label="Interés ganado"     value={money(reportEconomicSummary.interestEarned)} sub="en ops cerradas" color="border-amber-800 bg-amber-950/30 text-amber-100"/>
              <KpiCard label="Capital en calle"   value={money(reportEconomicSummary.openCapital)} sub={`${reportOpsSummary.openOps.length} ops`} color="border-sky-800 bg-sky-950/30 text-sky-100"/>
              <KpiCard label="Por cobrar"         value={money(reportEconomicSummary.pendingToCollect)} sub="en ops activas" color="border-violet-800 bg-violet-950/30 text-violet-100"/>
            </div>
            <Card title="Operaciones cerradas" sub={`${reportOpsSummary.closedOps.length} finalizadas en el período`}>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-zinc-900/80 text-[11px] uppercase tracking-wider text-zinc-500"><tr><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Cliente</th><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Tipo</th><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Detalle</th><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Base</th><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Total</th><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Cuotas</th><th className="text-left px-3 py-3 border-b border-zinc-800 font-bold">Interés</th></tr></thead>
                  <tbody>
                    {reportOpsSummary.closedOps.length===0
                      ?<tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">Sin operaciones cerradas en este período</td></tr>
                      :reportOpsSummary.closedOps.map((op)=>(
                        <tr key={op.id} className="hover:bg-zinc-800/30 transition">
                          <td className="px-3 py-3 border-b border-zinc-900/60 font-semibold">{(op as any).client_name??"—"}</td>
                          <td className="px-3 py-3 border-b border-zinc-900/60"><Badge c={op.operation_type==="sale"?"bg-sky-900 text-sky-300":"bg-violet-900 text-violet-300"} ch={op.operation_type==="sale"?"Venta":"Préstamo"}/></td>
                          <td className="px-3 py-3 border-b border-zinc-900/60">{(op.operation_type==="sale"?op.sale_item:op.loan_purpose)||<span className="text-zinc-600">—</span>}</td>
                          <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap font-semibold">{money(op.base_amount)}</td>
                          <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap font-semibold text-sky-300">{money(op.total_amount)}</td>
                          <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap">{op.installments_count}</td>
                          <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap text-emerald-300">{money(op.total_amount-op.base_amount)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Exportar datos" sub="Descargá operaciones y cobranza por período">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
                  <div className="text-sm font-semibold text-zinc-300">📋 Operaciones por mes</div>
                  <input type="month" value={exportMonth} onChange={(e)=>setExportMonth(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-700 focus:outline-none text-sm"/>
                  <Btn v="success" onClick={()=>exportOperaciones("month",exportMonth)} className="w-full">Descargar operaciones</Btn>
                </div>
                <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
                  <div className="text-sm font-semibold text-zinc-300">💰 Cobranza por mes</div>
                  <input type="month" value={exportMonth} onChange={(e)=>setExportMonth(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-zinc-950 text-zinc-100 border border-zinc-700 focus:outline-none text-sm"/>
                  <Btn v="primary" onClick={()=>exportCobranza("month",exportMonth)} className="w-full">Descargar cobranza</Btn>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* MODAL EDIT */}
      {role==="admin"&&editingOp&&(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
              <div><div className="font-bold">Editar operación</div><div className="text-xs text-zinc-500">{loadingClientForEdit?"Cargando...":fullName(editClientFirst||null,editClientLast||null)}</div></div>
              <Btn v="ghost" s="sm" onClick={()=>setEditingOp(null)}>✕ Cerrar</Btn>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <div className="text-sm font-bold text-zinc-300 mb-3">👤 Datos del cliente</div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  {!editClientId
                    ?<div className="text-sm text-zinc-500">Esta operación no tiene cliente asignado.</div>
                    :<div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2"><Inp placeholder="Nombre" value={editClientFirst} onChange={(e)=>setEditClientFirst(e.target.value)} disabled={loadingClientForEdit}/><Inp placeholder="Apellido" value={editClientLast} onChange={(e)=>setEditClientLast(e.target.value)} disabled={loadingClientForEdit}/></div>
                      <div className="grid grid-cols-2 gap-2"><Inp placeholder="DNI" value={editClientDni} onChange={(e)=>setEditClientDni(e.target.value)} inputMode="numeric" disabled={loadingClientForEdit}/><Inp placeholder="Celular" value={editClientPhone} onChange={(e)=>setEditClientPhone(e.target.value)} inputMode="tel" disabled={loadingClientForEdit}/></div>
                      <Inp placeholder="Dirección" value={editClientAddress} onChange={(e)=>setEditClientAddress(e.target.value)} disabled={loadingClientForEdit}/>
                    </div>
                  }
                </div>
              </div>
              <div>
                <div className="text-sm font-bold text-zinc-300 mb-3">📋 Datos de la operación</div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Lbl c="Tipo"/><Sel value={editType} onChange={(e)=>setEditType(e.target.value as any)}><option value="sale">Venta</option><option value="loan">Préstamo</option></Sel></div>
                    <div><Lbl c="Frecuencia"/><Sel value={editFrequency} onChange={(e)=>setEditFrequency(e.target.value as any)}><option value="weekly">Semanal</option><option value="biweekly">Quincenal</option><option value="three_weeks">Cada 3 semanas</option><option value="monthly">Mensual</option></Sel></div>
                  </div>
                  <div><Lbl c={editType==="sale"?"¿Qué se vendió?":"Motivo"}/><Inp value={editDetail} onChange={(e)=>setEditDetail(e.target.value)}/></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Lbl c="Base"/><Inp value={editBaseAmount} onChange={(e)=>setEditBaseAmount(e.target.value)} inputMode="decimal"/></div>
                    <div><Lbl c="Interés %"/><Inp value={editInterest} onChange={(e)=>setEditInterest(e.target.value)} inputMode="decimal"/></div>
                    <div><Lbl c="Cuotas"/><Inp value={editInstallments} onChange={(e)=>setEditInstallments(e.target.value)} inputMode="numeric"/></div>
                  </div>
                  <div><Lbl c="Notas"/><Txt value={editNotes} onChange={(e)=>setEditNotes(e.target.value)}/></div>
                </div>
              </div>
              <div className="flex gap-3">
                <Btn v="primary" s="lg" onClick={saveEditOperation} disabled={savingEdit||loadingClientForEdit} className="flex-1">{savingEdit?<><Spin/><span className="ml-2">Guardando...</span></>:"✓ Guardar cambios"}</Btn>
                <Btn v="ghost" s="lg" onClick={()=>setEditingOp(null)}>Cancelar</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- MOBILE CARD ----------
function OpCard({ op, role, onEdit, onDelete }: { op:Operation; role:Role; onEdit?:(op:Operation)=>void; onDelete?:(id:string)=>void }) {
  const detail = op.operation_type==="sale"?op.sale_item:op.loan_purpose
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{(op as any).client_name||<span className="text-zinc-500">Sin cliente</span>}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{detail||<span className="text-zinc-600">Sin detalle</span>}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${op.operation_type==="sale"?"bg-sky-900 text-sky-300":"bg-violet-900 text-violet-300"}`}>{op.operation_type==="sale"?"Venta":"Préstamo"}</span>
            <span className="text-xs text-zinc-500">{freqLabel[op.frequency]}</span>
          </div>
        </div>
        {role==="admin"&&op.seller_name&&<span className="text-[11px] rounded-full border border-zinc-700 px-2 py-1 text-zinc-300 shrink-0">{op.seller_name}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-zinc-950/50 p-2.5 text-xs"><div className="text-zinc-500 mb-0.5">Total</div><div className="font-bold text-sky-300">{money(op.total_amount)}</div></div>
        <div className="rounded-xl bg-zinc-950/50 p-2.5 text-xs"><div className="text-zinc-500 mb-0.5">Cuota</div><div className="font-semibold">{money(op.installment_amount)}</div></div>
        <div className="rounded-xl bg-zinc-950/50 p-2.5 text-xs"><div className="text-zinc-500 mb-0.5">1ra cuota</div><div className="font-semibold text-emerald-300">{dateAR(op.first_due_date)}</div></div>
        <div className="rounded-xl bg-zinc-950/50 p-2.5 text-xs"><div className="text-zinc-500 mb-0.5">Cuotas</div><div className="font-semibold">{op.installments_count} × {op.interest_percent}%</div></div>
      </div>
      {role==="admin"&&(onEdit||onDelete)&&(
        <div className="grid grid-cols-2 gap-2 pt-1">
          {onEdit&&<button type="button" onClick={()=>onEdit(op)} className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold transition">✏ Editar</button>}
          {onDelete&&<button type="button" onClick={()=>onDelete(op.id)} className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-semibold transition">✕ Borrar</button>}
        </div>
      )}
    </div>
  )
}

// ---------- DESKTOP TABLE ----------
function OpsTable({ role, operations, onEdit, onDelete }: { role:Role; operations:Operation[]; onEdit?:(op:Operation)=>void; onDelete?:(id:string)=>void }) {
  const hasActions = role==="admin"&&(!!onEdit||!!onDelete)
  const cols = (role==="admin"?1:0)+12+(hasActions?1:0)
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-zinc-900/80 text-[11px] uppercase tracking-wider text-zinc-500"><tr>
          {role==="admin"&&<th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Vendedor</th>}
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Cliente</th>
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Fecha</th>
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">1ra cuota</th>
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Tipo</th>
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Detalle</th>
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Frec.</th>
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Base</th>
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">%</th>
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Total</th>
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Cuotas</th>
          <th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Cuota</th>
          {hasActions&&<th className="text-left px-3 py-3 border-b border-zinc-800 font-bold whitespace-nowrap">Acciones</th>}
        </tr></thead>
        <tbody>
          {operations.length===0
            ?<tr><td colSpan={cols} className="px-3 py-8 text-center text-zinc-500">No hay operaciones</td></tr>
            :operations.map((op)=>{
              const detail=op.operation_type==="sale"?op.sale_item:op.loan_purpose
              return (
                <tr key={op.id} className="hover:bg-zinc-800/30 transition">
                  {role==="admin"&&<td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap text-xs text-zinc-400">{op.seller_name??"Vendedor"}</td>}
                  <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap font-semibold">{(op as any).client_name??"—"}</td>
                  <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap text-xs text-zinc-400">{new Date(op.created_at).toLocaleDateString("es-AR")}</td>
                  <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap font-semibold text-emerald-300">{dateAR(op.first_due_date)}</td>
                  <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${op.operation_type==="sale"?"bg-sky-900 text-sky-300":"bg-violet-900 text-violet-300"}`}>{op.operation_type==="sale"?"Venta":"Préstamo"}</span></td>
                  <td className="px-3 py-3 border-b border-zinc-900/60 max-w-[180px] truncate">{detail||<span className="text-zinc-600">—</span>}</td>
                  <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap text-xs text-zinc-400">{freqLabel[op.frequency]}</td>
                  <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap">{money(op.base_amount)}</td>
                  <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap text-zinc-400">{op.interest_percent}%</td>
                  <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap font-bold text-sky-300">{money(op.total_amount)}</td>
                  <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap text-center">{op.installments_count}</td>
                  <td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap">{money(op.installment_amount)}</td>
                  {hasActions&&<td className="px-3 py-3 border-b border-zinc-900/60 whitespace-nowrap"><div className="flex gap-1.5">{onEdit&&<button type="button" onClick={()=>onEdit(op)} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold transition">✏</button>}{onDelete&&<button type="button" onClick={()=>onDelete(op.id)} className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold transition">✕</button>}</div></td>}
                </tr>
              )
            })
          }
        </tbody>
      </table>
    </div>
  )
}
