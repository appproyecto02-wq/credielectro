// ---------- TYPES ----------

export type Role = "admin" | "seller"

export type Profile = {
  id: string
  role: Role
  name?: string | null
}

export type Client = {
  id: string
  first_name: string | null
  last_name: string | null
  dni: string | null
  phone: string | null
  address: string | null
  created_by?: string | null
  created_at?: string | null
}

export type Operation = {
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
  late_fee_type?: "fixed_daily" | "percent_daily" | string | null
  late_fee_value?: number | null
  // UI only
  seller_name?: string
  client_name?: string
}

export type InstallmentStatus = "pending" | "paid" | "late" | string

export type InstallmentRow = {
  id: string
  operation_id: string
  installment_number: number
  due_date: string | null
  amount: number | null
  status: InstallmentStatus
  paid_at: string | null
  operation?: {
    id: string
    seller_id: string
    client_id: string | null
    frequency: Operation["frequency"]
    installment_amount: number
    late_fee_type?: Operation["late_fee_type"]
    late_fee_value?: Operation["late_fee_value"]
  } | null
  client?: {
    id: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    address: string | null
  } | null
  seller_name?: string | null
}

export const freqLabel: Record<Operation["frequency"], string> = {
  daily: "Diaria",
  weekly: "Semanal",
  biweekly: "Quincenal",
  three_weeks: "Cada 3 semanas",
  monthly: "Mensual",
}
