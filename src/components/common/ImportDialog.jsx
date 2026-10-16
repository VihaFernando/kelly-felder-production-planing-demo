import { useRef, useState } from 'react';
import { FileUp, Download } from 'lucide-react';
import { Alert, Button, Modal } from './ui';
import { downloadTemplate, parseCsvFile, validateRows } from '../../services/importExportService';

/**
 * Generic CSV import: template download → choose file → validate → preview → import valid rows.
 * config: { title, headers, example, required, toItem(row), keyOf(item), existingKeys, onImport(items) }
 */
export function ImportDialog({ open, onClose, config }) {
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');

  const close = () => {
    setResult(null);
    setFileName('');
    onClose();
  };

  const onFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = await parseCsvFile(file);
      const missingCols = config.required.filter((c) => !parsed.meta.fields?.includes(c));
      if (missingCols.length) return setResult({ valid: [], errors: [`Missing column(s): ${missingCols.join(', ')}. Download the template for the expected format.`] });
      setResult(validateRows(parsed.data, config));
    } catch (e) {
      setResult({ valid: [], errors: [`Could not read file: ${e.message}`] });
    }
  };

  if (!open) return null;
  return (
    <Modal
      open
      onClose={close}
      title={config.title}
      description="CSV files only. Invalid or duplicate rows are listed and skipped — nothing is imported silently."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!result?.valid.length} onClick={() => { config.onImport(result.valid, result.errors); close(); }}>
            Import {result?.valid.length || 0} row(s)
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Download} onClick={() => downloadTemplate(config.templateName, config.headers, config.example)}>Download template</Button>
        <Button variant="primary" icon={FileUp} onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {fileName && <span className="text-xs text-slate-500">{fileName}</span>}
      </div>
      <p className="mt-3 text-xs text-slate-500">Columns: {config.headers.join(', ')}</p>
      {result && (
        <div className="mt-4 space-y-2">
          <Alert tone={result.valid.length ? 'blue' : 'gray'} title={`${result.valid.length} valid row(s) ready to import`} />
          {result.errors.length > 0 && (
            <Alert tone="red" title={`${result.errors.length} row(s) rejected`}>
              <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-4">
                {result.errors.slice(0, 50).map((e) => <li key={e}>{e}</li>)}
              </ul>
            </Alert>
          )}
        </div>
      )}
    </Modal>
  );
}
