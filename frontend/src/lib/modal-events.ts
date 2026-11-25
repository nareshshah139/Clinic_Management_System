/** Fired when a modal dialog opens, so open toasts, which a modal makes unclickable, can clear. */
export const MODAL_OPENED = 'linae:modal-opened';

export const announceModalOpened = () => window.dispatchEvent(new Event(MODAL_OPENED));
