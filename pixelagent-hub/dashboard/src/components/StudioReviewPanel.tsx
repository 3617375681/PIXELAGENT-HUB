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
  return <section className="studio-review" aria-label="人工验收">
    <h3>人工验收 / 当前版本</h3>
    <p className="studio-hint">实际试玩并审阅需求后记录决定。新版本或新保存的诊断需要重新确认通过；审阅者名称由填写者提供。</p>
    <label htmlFor="review-evidence">参考诊断记录</label>
    <select id="review-evidence" value={diagnosticId} onChange={(event) => setDiagnosticId(event.target.value)} disabled={busy}>
      <option value="">选择已保存的当前版本诊断</option>
      {evidence.map((report) => <option key={report.id} value={report.id}>{new Date(report.savedAt).toLocaleString()} · {report.errors.length} 条错误{report.checks ? ` · ${report.checks.filter((check) => check.status === 'passed').length}/${report.checks.length} 检查通过` : ''}</option>)}
    </select>
    {!evidence.length && <p>先实际试玩，再在验证记录中保存诊断；也可保存 Tester 检查结果。</p>}
    {report && !canApprove && <p>通过需选择最新、已加载且无错误或失败检查的记录；当前可以记录需返修。</p>}
    <label htmlFor="review-operator">审阅者名称</label><input id="review-operator" value={operator} onChange={(event) => setOperator(event.target.value)} maxLength={80} disabled={busy} />
    <label htmlFor="review-note">验收说明 / 未满足的需求</label><textarea id="review-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} disabled={busy} />
    <label className="studio-review-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />我已实际试玩此版本并审阅需求，下面是我的验收决定。</label>
    <div><button disabled={!canSubmit || !canApprove} onClick={() => void save('approved')}>记录人工通过</button><button disabled={!canSubmit} onClick={() => void save('changes_requested')}>记录需返修</button></div>
    {error && <p role="alert">{error}</p>}
    <details><summary>验收历史 · {reviews.length} 条</summary>{reviews.length === 0 && <p>尚无人工验收决定。</p>}{reviews.map((review) => <article key={review.id}><p>{review.decision === 'approved' ? '人工通过' : '需返修'} · {review.operator} · {new Date(review.savedAt).toLocaleString()}</p><p>{review.note}</p><small>诊断 {review.diagnosticId} · {review.previewFile}</small></article>)}</details>
  </section>;
}
