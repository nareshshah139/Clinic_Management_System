/**
 * Fired when a modal dialog opens and closes. A modal makes toasts that were already open
 * unclickable, so the Toaster sets them aside while it is open and brings them back after.
 */
export const MODAL_OPENED = 'linae:modal-opened';
export const MODAL_CLOSED = 'linae:modal-closed';

export const announceModalOpened = (): void => {
  window.dispatchEvent(new Event(MODAL_OPENED));
};
export const announceModalClosed = (): void => {
  window.dispatchEvent(new Event(MODAL_CLOSED));
};
