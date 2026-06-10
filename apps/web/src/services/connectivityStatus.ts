import { useSyncExternalStore } from 'react';

export type ConnectivityStatus = 'connected' | 'disconnected';

let currentStatus: ConnectivityStatus = 'connected';

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setConnectivityStatus(nextStatus: ConnectivityStatus) {
  if (currentStatus === nextStatus) return;
  currentStatus = nextStatus;
  emitChange();
}

export function markConnected() {
  setConnectivityStatus('connected');
}

export function markDisconnected() {
  setConnectivityStatus('disconnected');
}

export function getConnectivityStatus(): ConnectivityStatus {
  return currentStatus;
}

export function subscribeConnectivityStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConnectivityStatus(): ConnectivityStatus {
  return useSyncExternalStore(subscribeConnectivityStatus, getConnectivityStatus, getConnectivityStatus);
}

export function resetConnectivityStatusForTests() {
  currentStatus = 'connected';
  listeners.clear();
}
