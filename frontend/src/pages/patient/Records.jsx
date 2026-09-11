import { useEffect, useState } from "react";
import api from "../../lib/api";
import { PageHeader, PageLoading, EmptyState, formatDate } from "../../components/common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { FileText, Pill, FlaskConical, Stethoscope } from "lucide-react";

export default function Records() {
  const [data, setData] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/medical-records").then((r) => r.data.records),
      api.get("/prescriptions").then((r) => r.data.prescriptions),
      api.get("/lab-tests").then((r) => r.data.lab_tests),
    ]).then(([records, prescriptions, labTests]) => setData({ records, prescriptions, labTests }))
      .catch(() => setData({ records: [], prescriptions: [], labTests: [] }));
  }, []);

  if (!data) return <PageLoading />;

  return (
    <div data-testid="records-page">
      <PageHeader title="Medical Records" description="Your complete health timeline, prescriptions and lab tests." testid="records-title" />
      <Tabs defaultValue="timeline">
        <TabsList className="mb-6">
          <TabsTrigger value="timeline" data-testid="tab-timeline">Timeline ({data.records.length})</TabsTrigger>
          <TabsTrigger value="prescriptions" data-testid="tab-prescriptions">Prescriptions ({data.prescriptions.length})</TabsTrigger>
          <TabsTrigger value="labtests" data-testid="tab-labtests">Lab Tests ({data.labTests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          {data.records.length === 0 ? (
            <EmptyState title="No medical records yet" description="Records added by your doctors will appear here." testid="no-records" />
          ) : (
            <div className="relative pl-6 border-l-2 border-sky-100 space-y-6" data-testid="records-timeline">
              {data.records.map((r) => (
                <div key={r.record_id} className="relative" data-testid={`record-${r.record_id}`}>
                  <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-sky-600 border-4 border-sky-100" />
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-semibold text-sky-700">{formatDate(r.visit_date)}</span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 capitalize">{r.record_type}</span>
                    </div>
                    {r.diagnosis && <p className="text-sm text-slate-800"><span className="font-medium">Diagnosis:</span> {r.diagnosis}</p>}
                    {r.symptoms && <p className="text-sm text-slate-600 mt-1"><span className="font-medium">Symptoms:</span> {r.symptoms}</p>}
                    {r.notes && <p className="text-sm text-slate-600 mt-1"><span className="font-medium">Notes:</span> {r.notes}</p>}
                    <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Stethoscope className="h-3 w-3" />Dr. {r.doctor?.name} · {r.hospital?.name}</p>
                    {r.follow_up_date && <p className="text-xs text-sky-700 mt-1">Follow-up: {formatDate(r.follow_up_date)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="prescriptions">
          {data.prescriptions.length === 0 ? (
            <EmptyState title="No prescriptions yet" description="Prescriptions from your doctors will appear here." testid="no-prescriptions" />
          ) : (
            <div className="space-y-4" data-testid="prescriptions-list">
              {data.prescriptions.map((p) => (
                <div key={p.prescription_id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm" data-testid={`prescription-${p.prescription_id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-slate-900 flex items-center gap-2"><Pill className="h-4 w-4 text-teal-600" />Dr. {p.doctor?.name}</div>
                    <span className="text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                          <th className="pb-2 pr-4">Medicine</th><th className="pb-2 pr-4">Dosage</th><th className="pb-2 pr-4">Frequency</th><th className="pb-2 pr-4">Duration</th><th className="pb-2">Instructions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.medicines.map((m, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="py-2 pr-4 font-medium text-slate-800">{m.name}</td>
                            <td className="py-2 pr-4 text-slate-600">{m.dosage}</td>
                            <td className="py-2 pr-4 text-slate-600">{m.frequency}</td>
                            <td className="py-2 pr-4 text-slate-600">{m.duration}</td>
                            <td className="py-2 text-slate-600">{m.instructions || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {p.notes && <p className="text-xs text-slate-500 mt-2">Note: {p.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="labtests">
          {data.labTests.length === 0 ? (
            <EmptyState title="No lab tests" description="Lab tests requested by your doctors will appear here." testid="no-labtests" />
          ) : (
            <div className="space-y-3" data-testid="labtests-list">
              {data.labTests.map((t) => (
                <div key={t.test_id} className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between" data-testid={`labtest-${t.test_id}`}>
                  <div className="flex items-center gap-3">
                    <FlaskConical className="h-5 w-5 text-sky-600" />
                    <div>
                      <div className="font-medium text-slate-800">{t.test_name}</div>
                      {t.notes && <div className="text-xs text-slate-500">{t.notes}</div>}
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200/60 capitalize">{t.status}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
