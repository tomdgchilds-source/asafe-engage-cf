import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  MessageSquare, 
  Settings, 
  Hash, 
  Bell, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Link,
  Webhook,
  Key,
  RefreshCw,
  TestTube,
  Send
} from "lucide-react";

interface SlackConfig {
  webhookUrl?: string;
  botToken?: string;
  signingSecret?: string;
  channelId?: string;
  notificationChannelId?: string;
  enabled: boolean;
  testMode: boolean;
}

export function SlackIntegration() {
  const { toast } = useToast();
  const [config, setConfig] = useState<SlackConfig>({
    enabled: false,
    testMode: false
  });
  const [testMessage, setTestMessage] = useState("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Fetch current Slack configuration
  const { data: slackConfig, isLoading } = useQuery({
    queryKey: ["/api/admin/slack-config"],
    enabled: true
  });

  useEffect(() => {
    if (slackConfig) {
      setConfig(slackConfig);
    }
  }, [slackConfig]);

  // Save configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (configData: SlackConfig) => {
      return apiRequest("/api/admin/slack-config", "POST", configData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/slack-config"] });
      toast({
        title: "Configuration Saved",
        description: "Your Slack integration settings have been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save configuration",
        variant: "destructive",
      });
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      setIsTestingConnection(true);
      return apiRequest("/api/admin/slack-test", "POST", {
        message: testMessage || "Test message from A-SAFE ENGAGE",
        config
      });
    },
    onSuccess: (response) => {
      setIsTestingConnection(false);
      toast({
        title: "Test Successful",
        description: "Message sent to Slack successfully!",
      });
    },
    onError: (error: any) => {
      setIsTestingConnection(false);
      toast({
        title: "Test Failed",
        description: error.message || "Could not connect to Slack",
        variant: "destructive",
      });
    },
  });

  const handleSaveConfig = () => {
    saveConfigMutation.mutate(config);
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  const webhookUrlPlaceholder = "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX";
  const botTokenPlaceholder = "xoxb-your-token-here";
  const signingSecretPlaceholder = "your-signing-secret";

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Slack Integration</h1>
          <p className="text-muted-foreground">
            Configure Slack notifications for order management and team collaboration
          </p>
        </div>

        <Tabs defaultValue="configuration" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="configuration">
              <Settings className="h-4 w-4 mr-2" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="channels">
              <Hash className="h-4 w-4 mr-2" />
              Channels
            </TabsTrigger>
            <TabsTrigger value="testing">
              <TestTube className="h-4 w-4 mr-2" />
              Testing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configuration" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Slack Connection</CardTitle>
                <CardDescription>
                  Configure your Slack workspace connection settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enabled">Enable Slack Integration</Label>
                    <div className="text-sm text-muted-foreground">
                      Turn on to send notifications to Slack
                    </div>
                  </div>
                  <Switch
                    id="enabled"
                    checked={config.enabled}
                    onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                    data-testid="switch-enable-slack"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">
                    <Webhook className="h-4 w-4 inline mr-2" />
                    Incoming Webhook URL
                  </Label>
                  <Input
                    id="webhookUrl"
                    type="text"
                    value={config.webhookUrl || ""}
                    onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                    placeholder={webhookUrlPlaceholder}
                    data-testid="input-webhook-url"
                  />
                  <p className="text-sm text-muted-foreground">
                    Used for sending messages to Slack
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="botToken">
                    <Key className="h-4 w-4 inline mr-2" />
                    Bot User OAuth Token (Optional)
                  </Label>
                  <Input
                    id="botToken"
                    type="password"
                    value={config.botToken || ""}
                    onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                    placeholder={botTokenPlaceholder}
                    data-testid="input-bot-token"
                  />
                  <p className="text-sm text-muted-foreground">
                    Required for advanced features like interactive messages
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signingSecret">
                    <Key className="h-4 w-4 inline mr-2" />
                    Signing Secret (Optional)
                  </Label>
                  <Input
                    id="signingSecret"
                    type="password"
                    value={config.signingSecret || ""}
                    onChange={(e) => setConfig({ ...config, signingSecret: e.target.value })}
                    placeholder={signingSecretPlaceholder}
                    data-testid="input-signing-secret"
                  />
                  <p className="text-sm text-muted-foreground">
                    Required for verifying requests from Slack
                  </p>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    To get these values:
                    <ol className="mt-2 ml-4 space-y-1 list-decimal">
                      <li>Go to <a href="https://api.slack.com/apps" target="_blank" className="text-[#FFC72C] hover:underline">api.slack.com/apps</a></li>
                      <li>Create a new app or select existing one</li>
                      <li>For Webhook: Features → Incoming Webhooks</li>
                      <li>For Bot Token: OAuth & Permissions → Bot User OAuth Token</li>
                      <li>For Signing Secret: Basic Information → App Credentials</li>
                    </ol>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="channels" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Channel Configuration</CardTitle>
                <CardDescription>
                  Specify which channels to send different types of notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="notificationChannel">
                    <Hash className="h-4 w-4 inline mr-2" />
                    Order Notifications Channel
                  </Label>
                  <Input
                    id="notificationChannel"
                    type="text"
                    value={config.notificationChannelId || ""}
                    onChange={(e) => setConfig({ ...config, notificationChannelId: e.target.value })}
                    placeholder="#orders or order-notifications"
                    data-testid="input-notification-channel"
                  />
                  <p className="text-sm text-muted-foreground">
                    Channel for new order notifications
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="generalChannel">
                    <Hash className="h-4 w-4 inline mr-2" />
                    General Updates Channel (Optional)
                  </Label>
                  <Input
                    id="generalChannel"
                    type="text"
                    value={config.channelId || ""}
                    onChange={(e) => setConfig({ ...config, channelId: e.target.value })}
                    placeholder="#sales or general"
                    data-testid="input-general-channel"
                  />
                  <p className="text-sm text-muted-foreground">
                    Channel for general system updates and status changes
                  </p>
                </div>

                <Alert>
                  <Bell className="h-4 w-4" />
                  <AlertDescription>
                    Make sure the Slack app is invited to these channels. 
                    Type <code className="bg-muted px-1 py-0.5 rounded">/invite @your-app-name</code> in each channel.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="testing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Test Connection</CardTitle>
                <CardDescription>
                  Send a test message to verify your Slack integration is working
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="testMode">Test Mode</Label>
                    <div className="text-sm text-muted-foreground">
                      Enable to send test messages without affecting real orders
                    </div>
                  </div>
                  <Switch
                    id="testMode"
                    checked={config.testMode}
                    onCheckedChange={(checked) => setConfig({ ...config, testMode: checked })}
                    data-testid="switch-test-mode"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="testMessage">Test Message</Label>
                  <Input
                    id="testMessage"
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="Enter a test message..."
                    data-testid="input-test-message"
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={handleTestConnection}
                    disabled={!config.webhookUrl || isTestingConnection}
                    data-testid="button-test-connection"
                  >
                    {isTestingConnection ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Test Message
                      </>
                    )}
                  </Button>
                </div>

                {config.enabled && (
                  <Alert className="border-green-500/20 bg-green-50 dark:bg-green-900/20">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-600 dark:text-green-400">
                      Slack integration is enabled and ready to receive notifications
                    </AlertDescription>
                  </Alert>
                )}

                {!config.enabled && config.webhookUrl && (
                  <Alert className="border-yellow-500/20 bg-yellow-50 dark:bg-yellow-900/20">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-600 dark:text-yellow-400">
                      Configuration is set but integration is disabled. Enable it to start receiving notifications.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Webhook URLs</CardTitle>
                <CardDescription>
                  Configure these URLs in your Slack app settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Events URL</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm">
                      {window.location.origin}/api/slack/events
                    </code>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/slack/events`);
                        toast({ title: "Copied!", description: "Events URL copied to clipboard" });
                      }}
                      data-testid="button-copy-events-url"
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Interactive URL</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm">
                      {window.location.origin}/api/slack/interactive
                    </code>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/slack/interactive`);
                        toast({ title: "Copied!", description: "Interactive URL copied to clipboard" });
                      }}
                      data-testid="button-copy-interactive-url"
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-6 gap-2">
          <Button 
            variant="outline" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/slack-config"] })}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={handleSaveConfig}
            disabled={saveConfigMutation.isPending}
            className="bg-[#FFC72C] hover:bg-[#F0B800] text-black"
            data-testid="button-save-config"
          >
            {saveConfigMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Save Configuration
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}