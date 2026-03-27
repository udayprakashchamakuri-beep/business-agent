import { useMemo, useState } from "react";

function AuthPanel({ loading, authUser, authBusy, authMessage, onLogin, onRegister, onRequestReset, onResetPassword }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const helperText = useMemo(() => {
    if (mode === "login") {
      return "Sign in to access protected analysis and saved memory.";
    }
    if (mode === "register") {
      return "Create an account. New accounts must verify email before signing in.";
    }
    if (mode === "request-reset") {
      return "Request a password reset link for your account.";
    }
    return "Enter the reset token and choose a strong new password.";
  }, [mode]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (mode === "login") {
      await onLogin({ email, password });
      return;
    }
    if (mode === "register") {
      if (password !== confirmPassword) {
        return;
      }
      await onRegister({ email, password });
      return;
    }
    if (mode === "request-reset") {
      await onRequestReset({ email });
      return;
    }
    await onResetPassword({ token: resetToken, new_password: newPassword });
  }

  return (
    <div className="auth-screen">
      <div className="auth-card panel">
        <div className="auth-header">
          <span className="auth-kicker">Protected Workspace</span>
          <h1>Secure sign-in for Business Agent</h1>
          <p>{helperText}</p>
        </div>

        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "auth-tab active" : "auth-tab"} onClick={() => setMode("login")}>
            Sign in
          </button>
          <button type="button" className={mode === "register" ? "auth-tab active" : "auth-tab"} onClick={() => setMode("register")}>
            Create account
          </button>
          <button
            type="button"
            className={mode === "request-reset" ? "auth-tab active" : "auth-tab"}
            onClick={() => setMode("request-reset")}
          >
            Reset password
          </button>
          <button
            type="button"
            className={mode === "reset-confirm" ? "auth-tab active" : "auth-tab"}
            onClick={() => setMode("reset-confirm")}
          >
            Use reset token
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode !== "reset-confirm" ? (
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>
          ) : null}

          {mode === "login" || mode === "register" ? (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 12 characters"
              />
            </label>
          ) : null}

          {mode === "register" ? (
            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Retype your password"
              />
            </label>
          ) : null}

          {mode === "reset-confirm" ? (
            <>
              <label>
                Reset token
                <input value={resetToken} onChange={(event) => setResetToken(event.target.value)} placeholder="Paste the token from your reset link" />
              </label>
              <label>
                New password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Choose a new password"
                />
              </label>
            </>
          ) : null}

          {authMessage ? <p className="auth-message">{authMessage}</p> : null}

          <button type="submit" className="primary-action auth-submit" disabled={loading || authBusy}>
            {loading || authBusy
              ? "Working..."
              : mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : mode === "request-reset"
                    ? "Request reset"
                    : "Update password"}
          </button>
        </form>

        {authUser ? (
          <p className="auth-session-note">Signed in as {authUser.email}</p>
        ) : (
          <p className="auth-session-note">
            Passwords are hashed on the server, sessions expire automatically, and analysis is only available after sign-in.
          </p>
        )}
      </div>
    </div>
  );
}

export default AuthPanel;
