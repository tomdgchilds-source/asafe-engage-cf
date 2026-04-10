import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Mail, Phone, Loader2 } from 'lucide-react';

export function VerificationPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [verificationMethod, setVerificationMethod] = useState<'email' | 'whatsapp'>('email');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const [phone, setPhone] = useState('');

  // Check verification status
  const { data: verificationStatus, refetch } = useQuery({
    queryKey: ['/api/auth/verification-status'],
    refetchInterval: false,
  });

  // Send verification code mutation
  const sendCodeMutation = useMutation({
    mutationFn: async (data: { method: 'email' | 'whatsapp'; phone?: string }) => {
      const res = await apiRequest('/api/auth/send-verification', 'POST', data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: data.message || 'Verification code sent',
      });
      setCountdown(60);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send verification code',
        variant: 'destructive',
      });
    },
  });

  // Verify code mutation
  const verifyCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest('/api/auth/verify-code', 'POST', { code });
      return res.json();
    },
    onSuccess: async (data) => {
      toast({
        title: 'Success',
        description: 'Verification successful!',
      });
      
      // Refetch status and redirect
      const status = await refetch();
      if (status.data?.mustCompleteProfile) {
        setLocation('/complete-profile');
      } else {
        setLocation('/dashboard');
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Invalid verification code',
        variant: 'destructive',
      });
      // Clear the code inputs
      setOtpCode(['', '', '', '', '', '']);
    },
  });

  // Resend code mutation
  const resendCodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('/api/auth/resend-code', 'POST');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: data.message || 'Verification code resent',
      });
      setCountdown(60);
    },
    onError: (error: any) => {
      if (error.status === 429) {
        toast({
          title: 'Please wait',
          description: 'You can request a new code in a moment',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: error.message || 'Failed to resend code',
          variant: 'destructive',
        });
      }
    },
  });

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Check if already verified
  useEffect(() => {
    if (verificationStatus?.isVerified) {
      if (verificationStatus.mustCompleteProfile) {
        setLocation('/complete-profile');
      } else {
        setLocation('/dashboard');
      }
    }
  }, [verificationStatus, setLocation]);

  // Handle OTP input
  const handleOtpChange = (index: number, value: string) => {
    if (value.length <= 1 && /^\d*$/.test(value)) {
      const newOtp = [...otpCode];
      newOtp[index] = value;
      setOtpCode(newOtp);

      // Auto-focus next input
      if (value && index < 5) {
        const nextInput = document.getElementById(`otp-${index + 1}`);
        nextInput?.focus();
      }

      // Auto-submit when complete
      if (index === 5 && value) {
        const fullCode = newOtp.join('');
        if (fullCode.length === 6) {
          verifyCodeMutation.mutate(fullCode);
        }
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleSendCode = () => {
    if (verificationMethod === 'whatsapp' && !phone) {
      toast({
        title: 'Phone number required',
        description: 'Please enter your phone number for WhatsApp verification',
        variant: 'destructive',
      });
      return;
    }

    sendCodeMutation.mutate({
      method: verificationMethod,
      phone: verificationMethod === 'whatsapp' ? phone : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-full">
            <div className="bg-[#FFC72C] rounded-lg p-4 inline-block">
              <h1 className="text-3xl font-bold text-black">A-SAFE</h1>
              <p className="text-sm text-black">ENGAGE</p>
            </div>
          </div>
          <CardTitle className="text-2xl">Employee Verification</CardTitle>
          <CardDescription>
            Verify your identity to access A-SAFE ENGAGE
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Method Selection */}
          <Tabs value={verificationMethod} onValueChange={(v) => setVerificationMethod(v as 'email' | 'whatsapp')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                WhatsApp
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Phone Input for WhatsApp */}
          {verificationMethod === 'whatsapp' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone Number</label>
              <Input
                type="tel"
                placeholder="+971 XX XXX XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full"
              />
            </div>
          )}

          {/* Send Code Button */}
          {!sendCodeMutation.data && (
            <Button
              onClick={handleSendCode}
              disabled={sendCodeMutation.isPending}
              className="w-full bg-[#FFC72C] hover:bg-[#e6b429] text-black"
            >
              {sendCodeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                `Send Verification Code via ${verificationMethod === 'email' ? 'Email' : 'WhatsApp'}`
              )}
            </Button>
          )}

          {/* OTP Input */}
          {sendCodeMutation.data && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Enter 6-digit code</label>
                <div className="flex gap-2 justify-center">
                  {otpCode.map((digit, index) => (
                    <Input
                      key={index}
                      id={`otp-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-12 h-12 text-center text-lg font-semibold"
                      disabled={verifyCodeMutation.isPending}
                    />
                  ))}
                </div>
              </div>

              {/* Resend Button */}
              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-sm text-gray-500">
                    Resend code in {countdown} seconds
                  </p>
                ) : (
                  <Button
                    variant="link"
                    onClick={() => resendCodeMutation.mutate()}
                    disabled={resendCodeMutation.isPending}
                    className="text-[#FFC72C] hover:text-[#e6b429]"
                  >
                    Resend verification code
                  </Button>
                )}
              </div>

              {/* Verify Button */}
              <Button
                onClick={() => verifyCodeMutation.mutate(otpCode.join(''))}
                disabled={otpCode.join('').length !== 6 || verifyCodeMutation.isPending}
                className="w-full bg-black hover:bg-gray-800 text-white"
              >
                {verifyCodeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Code'
                )}
              </Button>
            </>
          )}

          {/* Info Text */}
          <p className="text-xs text-center text-gray-500">
            Access is restricted to A-SAFE employees only.
            If you're having trouble, contact IT support.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}