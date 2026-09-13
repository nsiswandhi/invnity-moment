'use client';

import { useEffect } from 'react';
import { trackClientEventOnce, type ClientEventName } from '../../lib/analytics/client-events';

export function ClientEventTracker({ eventKey, name, properties }: { eventKey: string; name: ClientEventName; properties?: Record<string, unknown> }) {
  useEffect(() => { trackClientEventOnce(eventKey, name, properties); }, [eventKey, name, properties]);
  return null;
}
