import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const colors = {
  bg: "#F7F8FA",
  card: "#FFFFFF",
  text: "#14181F",
  muted: "#5B6472",
  border: "#D9DEE5",
  primary: "#1F6FEB",
  primaryText: "#FFFFFF",
  danger: "#B42318",
  dangerBg: "#FEF3F2",
  warn: "#93370D",
  warnBg: "#FFFAEB",
  ok: "#067647",
};

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const body = <View style={styles.inner}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title} accessibilityRole="header">{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        {...input}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  title: string;
  onPress(): void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" ? styles.buttonSecondary : null,
        isDisabled ? styles.buttonDisabled : null,
        pressed ? styles.buttonPressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.primaryText : colors.primary} />
      ) : (
        <Text style={variant === "primary" ? styles.buttonText : styles.buttonTextSecondary}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Segmented single choice. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange(v: T): void;
}) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <View style={styles.choiceRow} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              aria-checked={selected}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={[styles.choice, selected ? styles.choiceSelected : null]}
            >
              <Text style={selected ? styles.choiceTextSelected : styles.choiceText}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Banner({ tone, children }: { tone: "error" | "warning" | "info"; children: ReactNode }) {
  const toneStyle = tone === "error" ? styles.bannerError : tone === "warning" ? styles.bannerWarn : styles.bannerInfo;
  return (
    <View style={[styles.banner, toneStyle]} accessibilityRole="alert">
      <Text style={tone === "error" ? styles.bannerErrorText : tone === "warning" ? styles.bannerWarnText : styles.bannerInfoText}>
        {children}
      </Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: 16, gap: 16, width: "100%", maxWidth: 640, alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 26, fontWeight: "700", color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  field: { gap: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, color: colors.text, backgroundColor: colors.card,
  },
  inputError: { borderColor: colors.danger },
  errorText: { fontSize: 13, color: colors.danger },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", minHeight: 44, justifyContent: "center" },
  buttonSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: "600" },
  buttonTextSecondary: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.card, minHeight: 40, justifyContent: "center" },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.text, fontSize: 14 },
  choiceTextSelected: { color: colors.primaryText, fontSize: 14, fontWeight: "600" },
  banner: { borderRadius: 8, padding: 12 },
  bannerError: { backgroundColor: colors.dangerBg },
  bannerWarn: { backgroundColor: colors.warnBg },
  bannerInfo: { backgroundColor: "#EFF4FF" },
  bannerErrorText: { color: colors.danger, fontSize: 14 },
  bannerWarnText: { color: colors.warn, fontSize: 14 },
  bannerInfoText: { color: "#1849A9", fontSize: 14 },
});
