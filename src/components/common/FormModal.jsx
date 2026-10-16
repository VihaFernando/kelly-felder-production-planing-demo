import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, cn } from './ui';

/**
 * Schema-driven form dialog for simple master-data records.
 * fields: [{ name, label, type: 'text'|'number'|'date'|'time'|'select'|'textarea'|'checkboxes', options, required, span, hint, placeholder }]
 * onSubmit(values, { setError }) returns true to close.
 */
export function FormModal({ open, onClose, title, description, schema, fields, defaultValues, onSubmit, submitLabel = 'Save', size = 'md', children }) {
  const { register, handleSubmit, reset, control, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) reset(defaultValues);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = handleSubmit(async (values) => {
    const ok = await onSubmit(values, { setError });
    if (ok !== false) onClose();
  });

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size={size} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={isSubmitting} onClick={submit}>{submitLabel}</Button></>}>
      {children}
      <form onSubmit={submit} className="grid grid-cols-2 gap-3" noValidate>
        {fields.map((f) => {
          const err = errors[f.name];
          return (
            <Field key={f.name} label={f.label} required={f.required} error={err?.message} hint={f.hint} className={cn(f.span === 2 && 'col-span-2')}>
              {f.type === 'select' ? (
                <Select {...register(f.name)} error={err}>
                  {f.placeholder && <option value="">{f.placeholder}</option>}
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea rows={2} {...register(f.name)} error={err} />
              ) : f.type === 'checkboxes' ? (
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {f.options.map((o) => (
                        <Checkbox key={o.value} label={o.label} checked={(field.value || []).includes(o.value)} onChange={(on) => field.onChange(on ? [...(field.value || []), o.value] : (field.value || []).filter((x) => x !== o.value))} />
                      ))}
                    </div>
                  )}
                />
              ) : (
                <Input type={f.type || 'text'} step={f.step} placeholder={f.placeholder} {...register(f.name)} error={err} />
              )}
            </Field>
          );
        })}
      </form>
    </Modal>
  );
}
