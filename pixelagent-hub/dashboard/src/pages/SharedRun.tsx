import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

/** `#/s/<payload>`: opens a shared PLAY LIVE run as a read-only replay. */
export default function SharedRun() {
  const { payload = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    void import('../lib/live/studio')
      .then(({ importSharedRun }) => navigate(`/studio/${importSharedRun(payload)}`, { replace: true }))
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [payload, navigate]);
  return (
    <main role="status" className="min-h-screen flex flex-col gap-4 items-center justify-center pixel-font-body">
      {error ? <><p>{error}</p><Link to="/studio" className="pixel-font">OPEN THE DEMO</Link></> : 'OPENING SHARED RUN…'}
    </main>
  );
}
