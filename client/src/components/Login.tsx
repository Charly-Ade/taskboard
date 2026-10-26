import { useState, type FormEvent } from "react";
import { api } from "../api";
import type { Session } from "../types";

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [username, setUsername] = useState("charles");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { onLogin(await api.login(username, password)); }
    catch (err: any) { setError(err.message); }
  };

  return (
    <div className="login">
      <form onSubmit={submit} className="card">
        <h1>Live Task Board</h1>
        <p className="muted">Demo users: charles, bob, carol · password123</p>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" aria-label="username" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" aria-label="password" />
        {error && <p className="error">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}
