export default function ImportStats({ counts }) {
  const items = [
    { label: "Total Discovered", value: counts.total_discovered, testid: "stat-discovered" },
    { label: "Total Imported", value: counts.total_imported, testid: "stat-imported" },
    { label: "Verified", value: counts.verified, testid: "stat-verified", cls: "text-emerald-600" },
    { label: "Needs Review", value: counts.needs_review, testid: "stat-needs-review", cls: "text-amber-600" },
    { label: "Duplicates", value: counts.duplicates, testid: "stat-duplicates", cls: "text-orange-600" },
    { label: "Failed", value: counts.failed, testid: "stat-failed", cls: "text-red-600" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="import-stats">
      {items.map((s) => (
        <div key={s.label} className="bg-white border border-slate-200/80 rounded-2xl p-4" data-testid={s.testid}>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</div>
          <div className={`text-2xl font-semibold font-heading mt-1 ${s.cls || "text-slate-900"}`}>{s.value ?? 0}</div>
        </div>
      ))}
    </div>
  );
}
