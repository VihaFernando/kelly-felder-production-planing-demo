import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '../common/ui';
import { useAppStore } from '../../store/appStore';
import { addDaysISO, isValidISO, todayISO } from '../../utils/dateUtils';
import { uid } from '../../utils/formatters';
import { generateFromTemplate } from '../../services/milestoneService';

const schema = z.object({
  poNo: z.string().trim().min(3, 'Production order number is required').max(20),
  soNo: z.string().trim().min(2, 'Sales order is required').max(20),
  lineItem: z.string().trim().min(1, 'Required').max(6),
  styleId: z.string().min(1, 'Select a style'),
  qty: z.coerce.number({ message: 'Enter a quantity' }).int('Whole pieces only').min(1, 'Must be at least 1').max(500000, 'Too large'),
  deliveryDate: z.string().refine(isValidISO, 'Enter a valid date'),
  status: z.enum(['open', 'cancelled']),
  notes: z.string().max(500).optional(),
});

export function OrderFormModal({ open, onClose, order }) {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const isEdit = !!order;

  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) reset(order ? { ...order, notes: order.notes || '' } : { poNo: '', soNo: '', lineItem: '10', styleId: '', qty: 1000, deliveryDate: addDaysISO(todayISO(), 45), status: 'open', notes: '' });
  }, [open, order, reset]);

  const onSubmit = (values) => {
    const poTaken = data.orders.some((o) => o.poNo.toLowerCase() === values.poNo.toLowerCase() && o.id !== order?.id);
    if (poTaken) return setError('poNo', { message: 'This production order number already exists' });
    if (isEdit) {
      const planned = data.allocations.filter((a) => a.orderId === order.id).reduce((s, a) => s + a.qty, 0);
      const next = { ...order, ...values };
      commit((d) => ({ ...d, orders: d.orders.map((o) => (o.id === order.id ? next : o)) }), [{ entity: 'order', entityId: order.id, action: 'updated', summary: `${order.poNo} updated`, before: { qty: order.qty, deliveryDate: order.deliveryDate, styleId: order.styleId }, after: { qty: values.qty, deliveryDate: values.deliveryDate, styleId: values.styleId } }]);
      toast.success(`${values.poNo} saved`, planned > values.qty ? { description: `Planned allocations (${planned} pcs) now exceed the order quantity — review on the planning board.` } : undefined);
    } else {
      const id = uid('po');
      const o = { id, ...values, source: 'Manual', createdAt: Date.now() };
      const style = data.styles.find((s) => s.id === values.styleId);
      const tpl = data.templates.find((t) => t.id === style?.templateId);
      const ms = tpl ? generateFromTemplate(tpl, id, addDaysISO(values.deliveryDate, -22), addDaysISO(values.deliveryDate, -10)) : [];
      commit((d) => ({ ...d, orders: [o, ...d.orders], milestones: [...d.milestones, ...ms] }), [{ entity: 'order', entityId: id, action: 'created', summary: `${values.poNo} created manually (demo simulation)` }]);
      toast.success(`${values.poNo} created`, { description: tpl ? `${ms.length} milestones generated from "${tpl.name}"` : undefined });
    }
    onClose();
  };

  const stylesSorted = [...data.styles].sort((a, b) => a.code.localeCompare(b.code));
  const buyerName = (id) => data.buyers.find((b) => b.id === id)?.name || '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${order.poNo}` : 'New production order'}
      description={isEdit && order.source === 'ERP' ? 'ERP-sourced order — edits are local to this demo.' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {isEdit ? 'Save changes' : 'Create order'}
          </Button>
        </>
      }
    >
      {!isEdit && (
        <Alert tone="blue" className="mb-4" title="Simulation only">
          In production, orders are created in the ERP and synchronised here. Manual creation exists for demonstration.
        </Alert>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3" noValidate>
        <Field label="Production order no." error={errors.poNo?.message} required>
          <Input {...register('poNo')} error={errors.poNo} placeholder="PO-61999" />
        </Field>
        <Field label="Sales order no." error={errors.soNo?.message} required>
          <Input {...register('soNo')} error={errors.soNo} placeholder="SO-8812" />
        </Field>
        <Field label="Style" error={errors.styleId?.message} required className="col-span-2">
          <Select {...register('styleId')} error={errors.styleId}>
            <option value="">Select style…</option>
            {stylesSorted.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.description} ({buyerName(s.buyerId)}, SMV {s.smv})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Line item" error={errors.lineItem?.message} required>
          <Input {...register('lineItem')} error={errors.lineItem} />
        </Field>
        <Field label="Order quantity (pcs)" error={errors.qty?.message} required>
          <Input type="number" min={1} {...register('qty')} error={errors.qty} />
        </Field>
        <Field label="Delivery date" error={errors.deliveryDate?.message} required>
          <Input type="date" {...register('deliveryDate')} error={errors.deliveryDate} />
        </Field>
        <Field label="Status">
          <Select {...register('status')}>
            <option value="open">Open</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="Notes" className="col-span-2" error={errors.notes?.message}>
          <Textarea {...register('notes')} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
