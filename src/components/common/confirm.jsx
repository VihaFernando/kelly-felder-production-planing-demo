import { useState } from 'react';
import { create } from 'zustand';
import { Button, Modal, Textarea, Field } from './ui';

/** Promise-based confirmation dialog usable from any component: `await confirm({...})`. */
const useConfirmStore = create((set) => ({ req: null, set: (req) => set({ req }) }));

export function confirm({ title, message, confirmLabel = 'Confirm', danger = false, requireReason = false, reasonLabel = 'Reason' }) {
  return new Promise((resolve) => {
    useConfirmStore.getState().set({ title, message, confirmLabel, danger, requireReason, reasonLabel, resolve });
  });
}

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req);
  const setReq = useConfirmStore((s) => s.set);
  const [reason, setReason] = useState('');
  if (!req) return null;
  const close = (result) => {
    req.resolve(result);
    setReq(null);
    setReason('');
  };
  return (
    <Modal
      open
      size="sm"
      title={req.title}
      onClose={() => close(false)}
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button data-autofocus variant={req.danger ? 'danger' : 'primary'} disabled={req.requireReason && !reason.trim()} onClick={() => close(req.requireReason ? reason.trim() : true)}>
            {req.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13px] text-slate-600">{req.message}</div>
      {req.requireReason && (
        <Field label={req.reasonLabel} className="mt-3" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}
