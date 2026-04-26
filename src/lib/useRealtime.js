import { useEffect } from 'react';
import { on } from './realtime.js';

// Подписка React-компонента на SSE-событие.
// Хук сам отписывается при размонтировании.
//
// useRealtime('orders:changed', () => load());
// useRealtime(['orders:changed', 'hr:incident'], () => load());
export function useRealtime(eventOrEvents, callback) {
  useEffect(() => {
    const events = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    const unsubs = events.map(name => on(name, callback));
    return () => { for (const u of unsubs) u(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback]);
}
