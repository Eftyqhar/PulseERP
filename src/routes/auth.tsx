import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Sign in — PulseERP" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AuthPage,
});

const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
});

function AuthPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  const signInForm = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSignIn = signInForm.handleSubmit(async (data) => {
    setSubmitting(true);
    try {
      await signIn(data.email, data.password);
      toast.success("Welcome back");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      {/* Brand panel */}
      <div className="hidden md:flex flex-col justify-between bg-primary text-primary-foreground p-12 relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-2">
          <div className="size-9 rounded-lg bg-primary-foreground/10 grid place-items-center">
            <ShieldCheck className="size-5" />
          </div>
          <span className="font-semibold text-lg tracking-tight">PulseERP</span>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 space-y-4"
        >
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">
            Inventory, orders &amp; profit — in one calm dashboard.
          </h1>
          <p className="text-primary-foreground/70 max-w-md">
            Authorized administrators only. Every action is logged and role-scoped.
          </p>
        </motion.div>
        <div className="relative z-10 text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} PulseERP — Internal use only
        </div>
        <div
          aria-hidden
          className="absolute -bottom-32 -right-32 size-[480px] rounded-full bg-primary-foreground/5 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -top-32 -left-32 size-[420px] rounded-full bg-primary-foreground/5 blur-3xl"
        />
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="md:hidden flex items-center gap-2 mb-8">
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <ShieldCheck className="size-5" />
            </div>
            <span className="font-semibold text-lg">PulseERP</span>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in with your administrator account.
            </p>
          </div>
          <form onSubmit={onSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="si-email">Email</Label>
              <Input
                id="si-email"
                type="email"
                autoComplete="email"
                {...signInForm.register("email")}
              />
              {signInForm.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {signInForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="si-password">Password</Label>
              <Input
                id="si-password"
                type="password"
                autoComplete="current-password"
                {...signInForm.register("password")}
              />
              {signInForm.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {signInForm.formState.errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />} Sign in
            </Button>
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-foreground">SQLite Default Admin:</div>
              <div className="flex justify-between items-center">
                <span>
                  Email: <code className="text-foreground">admin@pulseerp.com</code>
                </span>
                <span>
                  Pass: <code className="text-foreground">admin123</code>
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full mt-2 h-7 text-xs"
                onClick={() => {
                  signInForm.setValue("email", "admin@pulseerp.com");
                  signInForm.setValue("password", "admin123");
                }}
              >
                Fill demo credentials
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
