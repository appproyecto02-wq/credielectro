export function ReportCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "emerald" | "amber" | "sky" | "violet"
}) {
  const toneClass = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    sky: "text-sky-300",
    violet: "text-violet-300",
  }[tone]

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  )
}
