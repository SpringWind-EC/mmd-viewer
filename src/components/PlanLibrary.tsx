import { useEffect, useState, type FormEvent } from "react";
import { accountApi, planApi, type Account, type PlanData, type SavedPlan } from "../services/api";
import "./planLibrary.css";

interface Props {
  currentPlan: PlanData | null;
  suggestedTitle: string;
  revision: number;
  onLoad: (plan: PlanData) => void;
}

export default function PlanLibrary({ currentPlan, suggestedTitle, revision, onLoad }: Props) {
  const [user, setUser] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    accountApi.me()
      .then(({ user }) => { if (active) setUser(user); })
      .catch((error: Error) => { if (active) setError(error.message); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) { setPlans([]); return; }
    let active = true;
    planApi.list()
      .then(({ plans }) => { if (active) setPlans(plans); })
      .catch((error: Error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    setSelectedId(null);
    setTitle(suggestedTitle);
  }, [revision, suggestedTitle]);

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = authMode === "register"
        ? await accountApi.register(email, password)
        : await accountApi.login(email, password);
      setUser(result.user);
      setPassword("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError(null);
    try {
      await accountApi.logout();
      setUser(null);
      setSelectedId(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!currentPlan) return;
    setBusy(true);
    setError(null);
    try {
      const name = title.trim();
      const result = selectedId
        ? await planApi.update(selectedId, name, currentPlan)
        : await planApi.create(name, currentPlan);
      setSelectedId(result.plan.id);
      setPlans((existing) => [result.plan, ...existing.filter((plan) => plan.id !== result.plan.id)]);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await planApi.delete(id);
      setPlans((existing) => existing.filter((plan) => plan.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="plan-library" aria-label="Motion plan library">
      <div className="plan-library-heading">
        <h2>My plans</h2>
        {user && <button type="button" onClick={handleLogout} disabled={busy}>Sign out</button>}
      </div>
      {error && <p className="plan-library-error" role="alert">{error}</p>}
      {!ready && <p>Loading account...</p>}
      {ready && !user && (
        <form onSubmit={handleAuth} className="plan-library-auth">
          <div className="plan-library-modes" role="group" aria-label="Account action">
            <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Sign in</button>
            <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Create account</button>
          </div>
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button type="submit" disabled={busy}>{busy ? "Please wait..." : authMode === "register" ? "Create account" : "Sign in"}</button>
        </form>
      )}
      {user && (
        <>
          <p className="plan-library-email">{user.email}</p>
          {currentPlan && (
            <div className="plan-library-save">
              <label>Plan name<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
              <div className="plan-library-actions">
                <button type="button" onClick={handleSave} disabled={busy || !title.trim()}>{selectedId ? "Update plan" : "Save plan"}</button>
                {selectedId && <button type="button" onClick={() => { setSelectedId(null); setTitle(suggestedTitle); }} disabled={busy}>Save as new</button>}
              </div>
            </div>
          )}
          <div className="plan-library-list">
            {plans.length === 0 && <p>No saved plans yet.</p>}
            {plans.map((item) => (
              <div className="plan-library-item" key={item.id}>
                <button type="button" className={`plan-library-load${selectedId === item.id ? " is-selected" : ""}`} aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setTitle(item.title); onLoad(item.plan); }}>
                  {item.title}
                </button>
                <button type="button" onClick={() => handleDelete(item.id)} disabled={busy} aria-label={`Delete ${item.title}`} title={`Delete ${item.title}`}>Delete</button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
