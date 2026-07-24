import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { HttpError } from "../../../lib/http";
import { fetchUserList } from "../api";
import {
  CreateUserValidationError,
  createUser,
  type CreateUserFieldErrors,
  type CreateUserRequest,
  type CreateUserSuccess,
} from "../createUserApi";

const initialValues: CreateUserRequest = {
  firstName: "",
  lastName: "",
  email: "",
  initialPassword: "",
};

interface NewUserPageProps {
  accessProbe?: () => Promise<unknown>;
  submitter?: (payload: CreateUserRequest) => Promise<CreateUserSuccess>;
}

export function NewUserPage({ accessProbe = fetchUserList, submitter = createUser }: NewUserPageProps = {}) {
  const [formValues, setFormValues] = useState<CreateUserRequest>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<CreateUserFieldErrors>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "error" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAccessLoading, setIsAccessLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    accessProbe()
      .then(() => {
        if (cancelled) {
          return;
        }

        setHasAccess(true);
      })
      .catch((reason: unknown) => {
        if (cancelled) {
          return;
        }

        if (reason instanceof HttpError && (reason.status === 401 || reason.status === 403)) {
          setStatusMessage("You do not have access to create users.");
          setStatusTone("error");
          return;
        }

        setStatusMessage("Unable to load user creation access right now.");
        setStatusTone("error");
      })
      .finally(() => {
        if (!cancelled) {
          setIsAccessLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessProbe]);

  function updateField(fieldName: keyof CreateUserRequest, value: string) {
    setFormValues((current) => ({ ...current, [fieldName]: value }));
    setFieldErrors((current) => {
      if (!current[fieldName]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[fieldName];
      return nextErrors;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    setStatusMessage(null);
    setStatusTone(null);

    try {
      const result = await submitter(formValues);
      setFormValues(initialValues);
      setStatusMessage(result.message);
      setStatusTone("success");
    } catch (reason: unknown) {
      if (reason instanceof CreateUserValidationError) {
        setFieldErrors(reason.fieldErrors);
        return;
      }

      if (reason instanceof HttpError && (reason.status === 401 || reason.status === 403)) {
        setStatusMessage("You do not have access to create users.");
        setStatusTone("error");
        return;
      }

      setStatusMessage("Unable to create the user right now.");
      setStatusTone("error");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className="user-list-page">
      <section className="user-list-frame" aria-labelledby="new-user-title">
        <header className="user-list-header new-user-header">
          <div className="new-user-heading-row">
            <div>
              <p className="eyebrow">System administration</p>
              <h1 id="new-user-title">New User</h1>
            </div>
            <Link className="ghost-button new-user-back-link" to="/admin/users">
              Back to User List
            </Link>
          </div>
          <p>Create a colleague account and send the initial password by e-mail after the account is saved.</p>
        </header>

        <div className="user-list-content new-user-content">
          {statusMessage && statusTone ? (
            <div
              className={`notice-banner ${statusTone === "success" ? "notice-banner-success" : "notice-banner-error"}`}
              role={statusTone === "success" ? "status" : "alert"}
            >
              {statusMessage}
            </div>
          ) : null}

          {isAccessLoading ? <p role="status">Checking access...</p> : null}

          {!isAccessLoading && hasAccess ? (
            <form className="new-user-form" onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <label className="field">
                <span>First Name</span>
                <input
                  aria-describedby={fieldErrors.firstName ? "new-user-firstName-error" : undefined}
                  aria-invalid={fieldErrors.firstName ? "true" : undefined}
                  autoComplete="given-name"
                  className="text-input"
                  name="firstName"
                  onChange={(event) => updateField("firstName", event.target.value)}
                  type="text"
                  value={formValues.firstName}
                />
                {fieldErrors.firstName ? (
                  <p className="field-error" id="new-user-firstName-error">
                    {fieldErrors.firstName}
                  </p>
                ) : null}
              </label>

              <label className="field">
                <span>Last Name</span>
                <input
                  aria-describedby={fieldErrors.lastName ? "new-user-lastName-error" : undefined}
                  aria-invalid={fieldErrors.lastName ? "true" : undefined}
                  autoComplete="family-name"
                  className="text-input"
                  name="lastName"
                  onChange={(event) => updateField("lastName", event.target.value)}
                  type="text"
                  value={formValues.lastName}
                />
                {fieldErrors.lastName ? (
                  <p className="field-error" id="new-user-lastName-error">
                    {fieldErrors.lastName}
                  </p>
                ) : null}
              </label>

              <label className="field field-span-full">
                <span>E-Mail</span>
                <input
                  aria-describedby={fieldErrors.email ? "new-user-email-error" : undefined}
                  aria-invalid={fieldErrors.email ? "true" : undefined}
                  autoComplete="email"
                  className="text-input"
                  name="email"
                  onChange={(event) => updateField("email", event.target.value)}
                  type="email"
                  value={formValues.email}
                />
                {fieldErrors.email ? (
                  <p className="field-error" id="new-user-email-error">
                    {fieldErrors.email}
                  </p>
                ) : null}
              </label>

              <label className="field field-span-full">
                <span>Initial Password</span>
                <input
                  aria-describedby={fieldErrors.initialPassword ? "new-user-initialPassword-error" : undefined}
                  aria-invalid={fieldErrors.initialPassword ? "true" : undefined}
                  autoComplete="new-password"
                  className="text-input"
                  name="initialPassword"
                  onChange={(event) => updateField("initialPassword", event.target.value)}
                  type="password"
                  value={formValues.initialPassword}
                />
                {fieldErrors.initialPassword ? (
                  <p className="field-error" id="new-user-initialPassword-error">
                    {fieldErrors.initialPassword}
                  </p>
                ) : null}
              </label>
            </div>

            <div className="new-user-actions">
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Creating user..." : "Create User"}
              </button>
            </div>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}