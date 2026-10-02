import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { accountApi } from "../services/api";
import "./authPage.css";

interface Props {
  mode: "login" | "register";
}

export default function AuthPage({ mode }: Props) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPassword("");
    setConfirmPassword("");
    setError(null);
  }, [mode]);

  useEffect(() => {
    let active = true;
    accountApi.me()
      .then(({ user }) => { if (active && user) navigate("/MMD", { replace: true }); })
      .catch(() => { /* The form can still report an API error on submit. */ })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "register") await accountApi.register(email.trim(), password);
      else await accountApi.login(email.trim(), password);
      navigate("/MMD", { replace: true });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <Link to="/MMD" className="auth-brand"><span className="auth-brand-mark" aria-hidden="true" />Motion Studio</Link>
        <Link to="/MMD" className="auth-back">Back to viewer</Link>
      </header>
      <div className="auth-main">
        <section className="auth-panel" aria-labelledby="auth-title">
          <h1 id="auth-title">{mode === "register" ? "Create account" : "Sign in"}</h1>
          <nav className="auth-tabs" aria-label="Account pages">
            <Link to="/login" aria-current={mode === "login" ? "page" : undefined}>Sign in</Link>
            <Link to="/signup" aria-current={mode === "register" ? "page" : undefined}>Create account</Link>
          </nav>
          {checking ? <p className="auth-status">Checking account...</p> : (
            <form onSubmit={handleSubmit} className="auth-form">
              {error && <p className="auth-error" role="alert">{error}</p>}
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
              {mode === "register" && (
                <>
                  <p className="auth-hint">Use at least 12 characters.</p>
                  <label htmlFor="auth-confirm">Confirm password</label>
                  <input id="auth-confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </>
              )}
              <button type="submit" disabled={busy}>{busy ? "Please wait..." : mode === "register" ? "Create account" : "Sign in"}</button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
