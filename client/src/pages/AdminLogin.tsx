import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Turnstile } from "@/components/Turnstile";
import { usePublicConfig } from "@/hooks/usePublicConfig";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { data: publicConfig } = usePublicConfig();
  const turnstileSiteKey = publicConfig?.turnstileSiteKey ?? "";
  const turnstileRequired = Boolean(turnstileSiteKey);
  const [tsToken, setTsToken] = useState<string | null>(null);
  const handleTsToken = useCallback((t: string | null) => setTsToken(t), []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, turnstileToken: tsToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Login failed");
        return;
      }

      toast({
        title: "Login successful",
        description: `Welcome back, ${data.fullName}`,
      });

      // Redirect to admin dashboard
      setLocation("/admin/dashboard");
    } catch (err) {
      setError("An error occurred during login");
      console.error("Login error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <Shield className="h-12 w-12 text-[#FFC72C]" />
          </div>
          <CardTitle className="text-2xl font-bold text-center">
            Admin Portal
          </CardTitle>
          <CardDescription className="text-center">
            A-SAFE Staff Authentication Required
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-admin-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-admin-password"
              />
            </div>
            
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {turnstileRequired && (
              <Turnstile siteKey={turnstileSiteKey} onToken={handleTsToken} />
            )}

            <Button
              type="submit"
              className="w-full bg-[#FFC72C] hover:bg-[#FFD54F] text-black"
              disabled={isLoading || (turnstileRequired && !tsToken)}
              data-testid="button-admin-login"
            >
              {isLoading ? "Logging in..." : "Login"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            <p>For A-SAFE administrative staff only.</p>
            <p className="mt-2">
              Contact your system administrator if you need access.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}