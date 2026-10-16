import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function useWorkspace() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const alive = useRef(true);
  const loading = useRef(false);
  const dirty = useRef(false);
  const refresh = useCallback(async () => {
    if (loading.current) { dirty.current = true; return; }
    loading.current = true;
    try {
      const next = await api('/state');
      if (alive.current) { setState(next); setError(''); }
    } catch (problem) { if (alive.current) setError(problem.message); }
    finally {
      loading.current = false;
      if (dirty.current && alive.current) { dirty.current = false; setTimeout(refresh, 100); }
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    refresh();
    const source = new EventSource('/api/events');
    let timer;
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener('change', () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 80);
    });
    const fallback = setInterval(refresh, 12000);
    return () => { alive.current = false; clearTimeout(timer); clearInterval(fallback); source.close(); };
  }, [refresh]);
  return { state, error, connected, refresh };
}
