import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useHapticFeedback, useHapticPreferences, HapticPattern } from '@/hooks/useHapticFeedback';
import { Smartphone, Vibrate, CheckCircle, XCircle, Info } from 'lucide-react';

export function HapticTest() {
  const haptic = useHapticFeedback();
  const { isHapticEnabled, setHapticEnabled } = useHapticPreferences();
  const [testResults, setTestResults] = useState<string[]>([]);

  const addTestResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };

  const testPattern = (pattern: HapticPattern, name: string) => {
    haptic.triggerHaptic(pattern);
    addTestResult(`Triggered ${name} pattern`);
  };

  const deviceInfo = {
    userAgent: navigator.userAgent,
    isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
    isIOS: /iPhone|iPad|iPod/.test(navigator.userAgent),
    isAndroid: /Android/.test(navigator.userAgent),
    supportVibrate: 'vibrate' in navigator,
    supportWebkit: 'webkitVibrate' in (navigator as any),
    hasTouchScreen: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Vibrate className="h-5 w-5" />
            Haptic Feedback Test
          </CardTitle>
          <CardDescription>
            Test haptic feedback functionality on your device
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <Label htmlFor="haptic-toggle" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Haptic Feedback
            </Label>
            <Switch
              id="haptic-toggle"
              checked={isHapticEnabled}
              onCheckedChange={(checked) => {
                setHapticEnabled(checked);
                if (checked) {
                  haptic.success();
                }
              }}
            />
          </div>

          {/* Device Info */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Info className="h-4 w-4" />
              Device Information
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Mobile Device:</span>
                <Badge variant={deviceInfo.isMobile ? "default" : "outline"}>
                  {deviceInfo.isMobile ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                  {deviceInfo.isMobile ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Touch Screen:</span>
                <Badge variant={deviceInfo.hasTouchScreen ? "default" : "outline"}>
                  {deviceInfo.hasTouchScreen ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                  {deviceInfo.hasTouchScreen ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Vibration API:</span>
                <Badge variant={deviceInfo.supportVibrate ? "default" : "outline"}>
                  {deviceInfo.supportVibrate ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                  {deviceInfo.supportVibrate ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Platform:</span>
                <Badge variant="secondary">
                  {deviceInfo.isIOS ? 'iOS' : deviceInfo.isAndroid ? 'Android' : 'Desktop'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Haptic Status</span>
              <Badge variant={haptic.isSupported && haptic.isEnabled ? "default" : "destructive"}>
                {haptic.isSupported ? (haptic.isEnabled ? 'Active' : 'Disabled') : 'Not Supported'}
              </Badge>
            </div>
          </div>

          {/* Test Buttons */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Test Patterns</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => testPattern(HapticPattern.LIGHT, 'Light')}
                data-testid="haptic-test-light"
              >
                Light Tap
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testPattern(HapticPattern.MEDIUM, 'Medium')}
                data-testid="haptic-test-medium"
              >
                Medium Tap
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testPattern(HapticPattern.HEAVY, 'Heavy')}
                data-testid="haptic-test-heavy"
              >
                Heavy Tap
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testPattern(HapticPattern.SUCCESS, 'Success')}
                data-testid="haptic-test-success"
              >
                Success
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testPattern(HapticPattern.WARNING, 'Warning')}
                data-testid="haptic-test-warning"
              >
                Warning
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testPattern(HapticPattern.ERROR, 'Error')}
                data-testid="haptic-test-error"
              >
                Error
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testPattern(HapticPattern.ADD_TO_CART, 'Add to Cart')}
                data-testid="haptic-test-cart"
              >
                Add to Cart
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testPattern(HapticPattern.NOTIFICATION, 'Notification')}
                data-testid="haptic-test-notification"
              >
                Notification
              </Button>
            </div>
          </div>

          {/* Test Results */}
          {testResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Test Log</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTestResults([])}
                >
                  Clear
                </Button>
              </div>
              <div className="max-h-32 overflow-y-auto p-2 bg-muted rounded text-xs font-mono space-y-1">
                {testResults.map((result, index) => (
                  <div key={index} className="text-muted-foreground">
                    {result}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}