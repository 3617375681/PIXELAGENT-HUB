import { useEffect, useState } from 'react';
import { studioApi } from '../lib/recordsApi';
import type { StudioDiagnostic, StudioProject, StudioReview } from '../types/studio';

export default function StudioReviewPanel({ project, reports, onSaved }: { project: StudioProject; reports: StudioDiagnostic[]; onSaved: () => void }) {
  const [reviews, setReviews] = useState<StudioReview[]>([]);
  const [diagnosticId, setDiagnosticId] = useState('');
  const [operator, setOperator] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void studioApi.reviews(project.projectId, controller.signal).then(({ reviews }) => {
      if (!controller.signal.aborted) setReviews(reviews);
    }).catch((error) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : String(error)); });
    return () => controller.abort();
  }, [project.projectId]);
  const evidence = reports.filter((report) => report.previewFile === project.previewFile);
  const report = evidence.find((report) => report.id === diagnosticId);
  const canApprove = report?.loaded && report.id === evidence[0]?.id && !report.errors.length && !report.checks?.some((check) => check.status === 'failed');
  const canSubmit = !busy && confirmed && operator.trim().length > 0 && note.trim().length > 0 && Boolean(report);
  const save = async (decision: StudioReview['decision']) => {
    if (!project.previewFile || !canSubmit) return;
    setBusy(true); setError('');
    try {
      const { review } = await studioApi.saveReview(project.projectId, { previewFile: project.previewFile, diagnosticId, decision, operator, note, manuallyReviewed: true });
      setReviews((reviews) => [review, ...reviews]); setConfirmed(false); setNote(''); onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <section className="studio-review" aria-label="Human review">
    <h3>HUMAN REVIEW</h3>
    <p className="studio-hint">Play it, compare with the request, then record a decision. New versions or new diagnostics need a fresh approval.</p>
    <label htmlFor="review-evidence">Evidence</label>
    <select id="review-evidence" value={diagnosticId} onChange={(event) => setDiagnosticId(event.target.value)} disabled={busy}>
      <option value="">Pick a saved observation of this version</option>
      {evidence.map((report) => <option key={report.id} value={report.id}>{new Date(report.savedAt).toLocaleString()} · {report.errors.length} errors{report.checks ? ` · ${report.checks.filter((check) => check.status === 'passed').length}/${report.checks.length} checks passed` : ''}</option>)}
    </select>
    {!evidence.length && <p>Play the app and save an observation (or Tester results) first.</p>}
    {report && !canApprove && <p>Approval needs the latest clean observation; you can still request changes.</p>}
    <label htmlFor="review-operator">Reviewer</label><input id="review-operator" value={operator} onChange={(event) => setOperator(event.target.value)} maxLength={80} disabled={busy} />
    <label htmlFor="review-note">Notes / what is missing</label><textarea id="review-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} disabled={busy} />
    <label className="studio-review-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />I played this version and checked it against the request.</label>
    <div><button disabled={!canSubmit || !canApprove} onClick={() => void save('approved')}>Approve</button><button disabled={!canSubmit} onClick={() => void save('changes_requested')}>Request changes</button></div>
    {error && <p role="alert">{error}</p>}
    <details><summary>Review history · {reviews.length}</summary>{reviews.length === 0 && <p>No decisions yet.</p>}{reviews.map((review) => <article key={review.id}><p>{review.decision === 'approved' ? 'Approved' : 'Changes requested'} · {review.operator} · {new Date(review.savedAt).toLocaleString()}</p><p>{review.note}</p><small>Observation {review.diagnosticId} · {review.previewFile}</small></article>)}</details>
  </section>;
}
