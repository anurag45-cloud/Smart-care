import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import { PageLoading, EmptyState, formatDate } from "../../components/common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { FlaskConical, Pill, FileText, Download, Sparkles } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DoctorPatientDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/patients/${id}`).then((r) => setData(r.data)).catch((e) => setError(e.friendlyMessage));
  }, [id]);

  if (error) return <EmptyState title="Access denied" description={error} testid="patient-access-error" />;
  if (!data) return <PageLoading />;
  const { patient, records, prescriptions, reports, lab_tests } = data;

  return (
    <div data-testid="doctor-patient-detail">
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm mb-6 flex flex-wrap items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-sky-100 overflow-hidden flex items-center justify-center text-sky-700 text-lg font-bold">
          {patient.picture ? <img src={patient.picture} alt="" className="h-full w-full object-cover" /> : patient.name?.[0]}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 font-heading" data-testid="patient-name">{patient.name}</h1>
          <p className="text-sm text-slate-500">{patient.email}{patient.phone ? ` · ${patient.phone}` : ""}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {patient.gender && <span className="capitalize">{patient.gender}</span>}
            {patient.date_of_birth && ` · Born ${patient.date_of_birth}`}
            {patient.blood_group && ` · Blood ${patient.blood_group}`}
            {patient.allergies && <span className="text-red-600"> · Allergies: {patient.allergies}</span>}
          </p>
        </div>
      </div>

      <Tabs defaultValue="records">
        <TabsList className="mb-6">
          <TabsTrigger value="records" data-testid="tab-records">Records ({records.length})</TabsTrigger>
          <TabsTrigger value="prescriptions" data-testid="tab-rx">Prescriptions ({prescriptions.length})</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">Reports ({reports.length})</TabsTrigger>
          <TabsTrigger value="tests" data-testid="tab-tests">Lab Tests ({lab_tests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="records">
          {records.length === 0 ? <EmptyState title="No records" testid="no-patient-records" /> : (
            <div className="space-y-3">
              {records.map((r) => (
                <div key={r.record_id} className="bg-white border border-slate-200/80 rounded-2xl p-5" data-testid={`record-${r.record_id}`}>
                  <div className="text-sm font-semibold text-sky-700">{formatDate(r.visit_date)} <span className="text-slate-400 font-normal capitalize">· {r.record_type}</span></div>
                  {r.diagnosis && <p className="text-sm text-slate-800 mt-1"><span className="font-medium">Diagnosis:</span> {r.diagnosis}</p>}
                  {r.symptoms && <p className="text-sm text-slate-600 mt-1"><span className="font-medium">Symptoms:</span> {r.symptoms}</p>}
                  {r.notes && <p className="text-sm text-slate-600 mt-1"><span className="font-medium">Notes:</span> {r.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="prescriptions">
          {prescriptions.length === 0 ? <EmptyState title="No prescriptions" testid="no-patient-rx" /> : (
            <div className="space-y-3">
              {prescriptions.map((p) => (
                <div key={p.prescription_id} className="bg-white border border-slate-200/80 rounded-2xl p-5" data-testid={`rx-${p.prescription_id}`}>
                  <div className="text-xs text-slate-400 mb-2 flex items-center gap-1"><Pill className="h-3 w-3" />{new Date(p.created_at).toLocaleDateString()}</div>
                  <ul className="text-sm text-slate-700 space-y-1">
                    {p.medicines.map((m, i) => <li key={i}><span className="font-medium">{m.name}</span> — {m.dosage}, {m.frequency}, {m.duration}{m.instructions ? ` (${m.instructions})` : ""}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          {reports.length === 0 ? <EmptyState title="No reports" testid="no-patient-reports" /> : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.report_id} className="bg-white border border-slate-200/80 rounded-2xl p-5" data-testid={`report-${r.report_id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FlaskConical className="h-4 w-4 text-sky-600 flex-shrink-0" />
                      <span className="font-medium text-slate-800 truncate">{r.title}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    <a href={`${API}/reports/${r.report_id}/file`} target="_blank" rel="noreferrer" className="text-xs border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-600 font-medium px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 flex-shrink-0" data-testid={`download-report-${r.report_id}`}>
                      <Download className="h-3 w-3" /> View file
                    </a>
                  </div>
                  {r.ai_summary && (
                    <p className="text-sm text-slate-600 mt-3 bg-teal-50/60 border border-teal-100 rounded-xl p-3 flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" /> {r.ai_summary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tests">
          {lab_tests.length === 0 ? <EmptyState title="No lab tests" testid="no-patient-tests" /> : (
            <div className="space-y-3">
              {lab_tests.map((t) => (
                <div key={t.test_id} className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between" data-testid={`test-${t.test_id}`}>
                  <span className="font-medium text-slate-800 flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400" />{t.test_name}</span>
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
