import type { DocumentsInput } from "../../types";

interface DocumentsStepProps {
  documents: DocumentsInput;
  errors: Record<string, string[]>;
  onFileChange: (field: keyof DocumentsInput, file: File | null) => void;
}

function getError(errors: Record<string, string[]>, path: string): string | undefined {
  return errors[path]?.[0];
}

interface UploadControlProps {
  label: string;
  hint: string;
  error?: string;
  file: File | null;
  onChange: (file: File | null) => void;
}

function UploadControl({ error, file, hint, label, onChange }: UploadControlProps) {
  return (
    <label className="upload-card field">
      <span>{label}</span>
      <input
        accept=".pdf,.jpg,.jpeg"
        className="file-input"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        type="file"
      />
      <span className="field-support">{hint}</span>
      <strong>{file?.name ?? "No file selected"}</strong>
      {error && <p className="field-error">{error}</p>}
    </label>
  );
}

export function DocumentsStep({ documents, errors, onFileChange }: DocumentsStepProps) {
  return (
    <div className="step-layout">
      <section className="step-intro-card">
        <strong>Upload the core proof package.</strong>
        <p>
          Add one boarding pass and one identification document so we can verify the trip and the passenger.
        </p>
      </section>

      <div className="upload-grid">
        <UploadControl
          error={getError(errors, "documents.boardingPass.file")}
          file={documents.boardingPass.file}
          hint="PDF or JPG, up to 5 MB."
          label="Boarding pass"
          onChange={(file) => onFileChange("boardingPass", file)}
        />
        <UploadControl
          error={getError(errors, "documents.identification.file")}
          file={documents.identification.file}
          hint="Passport or identity card in PDF or JPG, up to 5 MB."
          label="Identification"
          onChange={(file) => onFileChange("identification", file)}
        />
      </div>
    </div>
  );
}