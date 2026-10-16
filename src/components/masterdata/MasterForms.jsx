import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button, Field, Input, Modal, Select, Textarea, Checkbox } from '../common/ui';
import { useAppStore } from '../../store/appStore';
import { uid } from '../../utils/formatters';

export const CATEGORIES = ['Dresses', 'Tops', 'Shirts', 'Trousers', 'Skirts'];

const lineSchema = z.object({
  code: z.string().trim().min(2, 'Line code is required').max(16).regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only'),
  plantId: z.string().min(1, 'Select a plant'),
  name: z.string().trim().min(2, 'Display name is required').max(60),
  status: z.enum(['active', 'inactive']),
  calendarId: z.string(),
  defaultOperators: z.coerce.number().int('Whole number').min(0, 'Cannot be negative').max(200),
  categories: z.array(z.string()),
  notes: z.string().max(300).optional(),
});

export function LineFormModal({ open, onClose, line, defaultPlantId }) {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const { register, handleSubmit, reset, control, setError, formState: { errors } } = useForm({ resolver: zodResolver(lineSchema) });

  useEffect(() => {
    if (!open) return;
    reset(
      line
        ? { ...line, calendarId: line.calendarId || '', notes: line.notes || '', categories: line.categories || [] }
        : { code: '', plantId: defaultPlantId || data.plants.find((p) => p.status === 'active')?.id || '', name: '', status: 'active', calendarId: '', defaultOperators: 30, categories: [], notes: '' },
    );
  }, [open, line, defaultPlantId, reset, data.plants]);

  const onSubmit = (v) => {
    if (data.lines.some((l) => l.code.toLowerCase() === v.code.toLowerCase() && l.id !== line?.id)) return setError('code', { message: 'Line code already exists' });
    if (v.status === 'inactive' && line?.status === 'active') {
      const future = data.allocations.filter((a) => a.lineId === line.id).length;
      if (future) toast.warning(`${line.code} still has ${future} allocation(s)`, { description: 'They are flagged on the board until moved to an active line.' });
    }
    const item = { ...(line || {}), ...v, code: v.code.toUpperCase(), calendarId: v.calendarId || null, id: line?.id || uid('ln') };
    commit(
      (d) => ({ ...d, lines: line ? d.lines.map((l) => (l.id === line.id ? item : l)) : [...d.lines, item] }),
      [{ entity: 'line', entityId: item.id, action: line ? 'updated' : 'created', summary: `Line ${item.code} ${line ? 'updated' : 'created'}`, before: line ? { status: line.status, calendarId: line.calendarId, defaultOperators: line.defaultOperators } : null, after: { status: item.status, calendarId: item.calendarId, defaultOperators: item.defaultOperators } }],
    );
    toast.success(`Line ${item.code} saved`);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={line ? `Edit line ${line.code}` : 'Add production line'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={handleSubmit(onSubmit)}>Save line</Button></>}>
      <form className="grid grid-cols-2 gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Line code" required error={errors.code?.message}><Input {...register('code')} error={errors.code} placeholder="NTM-04" /></Field>
        <Field label="Plant" required error={errors.plantId?.message}>
          <Select {...register('plantId')} error={errors.plantId}>
            {data.plants.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Display name" required error={errors.name?.message} className="col-span-2"><Input {...register('name')} error={errors.name} /></Field>
        <Field label="Status"><Select {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
        <Field label="Working calendar" hint="Inherit uses the plant calendar">
          <Select {...register('calendarId')}>
            <option value="">Inherit from plant</option>
            {data.calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Default operators (MOS)" error={errors.defaultOperators?.message} hint="Used only when no monthly carder record exists"><Input type="number" {...register('defaultOperators')} error={errors.defaultOperators} /></Field>
        <Field label="Permitted categories" hint="Leave empty to allow all categories" className="col-span-2">
          <Controller
            control={control}
            name="categories"
            render={({ field }) => (
              <div className="flex flex-wrap gap-3 pt-1">
                {CATEGORIES.map((c) => (
                  <Checkbox key={c} label={c} checked={field.value?.includes(c)} onChange={(on) => field.onChange(on ? [...(field.value || []), c] : field.value.filter((x) => x !== c))} />
                ))}
              </div>
            )}
          />
        </Field>
        <Field label="Notes" className="col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}

const plantSchema = z.object({
  code: z.string().trim().min(2, 'Plant code is required').max(12).regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only'),
  name: z.string().trim().min(2, 'Name is required').max(60),
  location: z.string().trim().min(2, 'Location is required').max(60),
  status: z.enum(['active', 'inactive']),
  calendarId: z.string().min(1, 'Select a calendar'),
  notes: z.string().max(300).optional(),
});

export function PlantFormModal({ open, onClose, plant }) {
  const data = useAppStore((s) => s.data);
  const commit = useAppStore((s) => s.commit);
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm({ resolver: zodResolver(plantSchema) });

  useEffect(() => {
    if (open) reset(plant ? { ...plant, notes: plant.notes || '' } : { code: '', name: '', location: '', status: 'active', calendarId: data.settings.defaultCalendarId || 'cal-std', notes: '' });
  }, [open, plant, reset, data.settings.defaultCalendarId]);

  const onSubmit = (v) => {
    if (data.plants.some((p) => p.code.toLowerCase() === v.code.toLowerCase() && p.id !== plant?.id)) return setError('code', { message: 'Plant code already exists' });
    const item = { ...(plant || {}), ...v, code: v.code.toUpperCase(), id: plant?.id || uid('pl') };
    commit((d) => ({ ...d, plants: plant ? d.plants.map((p) => (p.id === plant.id ? item : p)) : [...d.plants, item] }), [{ entity: 'plant', entityId: item.id, action: plant ? 'updated' : 'created', summary: `Plant ${item.code} ${plant ? 'updated' : 'created'}` }]);
    toast.success(`Plant ${item.code} saved`);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={plant ? `Edit plant ${plant.code}` : 'Add plant'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={handleSubmit(onSubmit)}>Save plant</Button></>}>
      <form className="grid grid-cols-2 gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Plant code" required error={errors.code?.message}><Input {...register('code')} error={errors.code} placeholder="KDW" /></Field>
        <Field label="Status"><Select {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
        <Field label="Plant name" required error={errors.name?.message} className="col-span-2"><Input {...register('name')} error={errors.name} /></Field>
        <Field label="Location" required error={errors.location?.message}><Input {...register('location')} error={errors.location} /></Field>
        <Field label="Working calendar" required error={errors.calendarId?.message}>
          <Select {...register('calendarId')}>{data.calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <Field label="Notes" className="col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      </form>
    </Modal>
  );
}
