import { useState } from "react";
import { useSession } from "../auth/SessionProvider";
import { Banner, Button, Card, Choice, Field, Muted, Screen, Title } from "../ui";

type Mode = "sign-in" | "sign-up";

export default function SignIn() {
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSubmit = /\S+@\S+\.\S+/.test(email) && password.length >= 8;

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "sign-in") {
        const err = await signIn(email.trim(), password);
        if (err) setError(err);
      } else {
        const res = await signUp(email.trim(), password);
        if (res.error) setError(res.error);
        else if (res.needsConfirmation) setNotice("Check your email to confirm your account, then sign in.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Health, Fitness & Nutrition</Title>
      <Muted>Plan and track your body transformation: goals, nutrition and its cost, and progress.</Muted>
      <Card>
        <Choice<Mode>
          label="Account"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
            setNotice(null);
          }}
          options={[
            { value: "sign-in", label: "Sign in" },
            { value: "sign-up", label: "Create account" },
          ]}
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          textContentType="emailAddress"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          textContentType={mode === "sign-in" ? "password" : "newPassword"}
          hint={mode === "sign-up" ? "At least 8 characters." : undefined}
          onSubmitEditing={() => canSubmit && submit()}
        />
        {error ? <Banner tone="error">{error}</Banner> : null}
        {notice ? <Banner tone="info">{notice}</Banner> : null}
        <Button
          title={mode === "sign-in" ? "Sign in" : "Create account"}
          onPress={submit}
          disabled={!canSubmit}
          loading={busy}
        />
      </Card>
    </Screen>
  );
}
