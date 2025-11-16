import { useState, useEffect } from 'react';
import { checkPACSHealth } from '../services/dicomService';

const defaultSystemHealth = {
  status: 'online',
  healthy: true,
  message: 'System Online'
};

const defaultPacsHealth = {
  status: 'checking',
  healthy: false,
  message: 'Checking PACS...',
  responseTime: null
};

let sharedState = {
  systemHealth: defaultSystemHealth,
  pacsHealth: defaultPacsHealth
};

const subscribers = new Set();
let pollTimer = null;

const notifySubscribers = () => {
  for (const subscriber of subscribers) {
    subscriber({ ...sharedState });
  }
};

const performHealthCheck = async () => {
  try {
    const health = await checkPACSHealth();
    sharedState = {
      ...sharedState,
      pacsHealth: {
        status: health.healthy ? 'online' : 'offline',
        healthy: Boolean(health.healthy),
        message: health.message || (health.healthy ? 'PACS Online' : 'PACS Offline'),
        responseTime: health.responseTime || null
      }
    };
  } catch (error) {
    console.error('Health check failed:', error);
    sharedState = {
      ...sharedState,
      pacsHealth: {
        status: 'error',
        healthy: false,
        message: 'PACS Check Failed',
        responseTime: null
      }
    };
  } finally {
    notifySubscribers();
  }
};

const startPolling = () => {
  if (pollTimer) return;
  performHealthCheck();
  pollTimer = setInterval(performHealthCheck, 30000);
};

const stopPolling = () => {
  if (!subscribers.size && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

export const useHealthStatus = (enabled = true) => {
  const [localState, setLocalState] = useState(sharedState);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    subscribers.add(setLocalState);
    startPolling();
    return () => {
      subscribers.delete(setLocalState);
      stopPolling();
    };
  }, [enabled]);

  return {
    systemHealth: enabled ? localState.systemHealth : defaultSystemHealth,
    pacsHealth: enabled ? localState.pacsHealth : defaultPacsHealth,
    refreshHealth: enabled ? performHealthCheck : async () => sharedState
  };
};
