import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Info, Users, Linkedin, CheckCircle2, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Props {
  subtotal: number;
  currency: string;
  exchangeRate: number;
  onDiscountChange?: (discount: number) => void;
}

export function LinkedInSocialReciprocitySimple({ subtotal, currency, exchangeRate, onDiscountChange }: Props) {
  const { toast } = useToast();
  const [companyUrl, setCompanyUrl] = useState("");
  const [followers, setFollowers] = useState<number>(0);
  const [commitment, setCommitment] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const [discount, setDiscount] = useState(0);

  // Calculate discount locally
  const calculateDiscount = (followerCount: number) => {
    if (!followerCount || subtotal <= 0) return 0;
    
    const baseDiscount = followerCount * 0.001; // 0.001 AED per follower
    const maxDiscount = Math.min(2500, subtotal * 0.01); // Cap at 2,500 AED or 1% of order
    return Math.min(baseDiscount, maxDiscount);
  };

  const handleFollowersChange = (value: string) => {
    const num = parseInt(value) || 0;
    setFollowers(num);
    const calculatedDiscount = calculateDiscount(num);
    setDiscount(calculatedDiscount);
  };

  const handleApplyDiscount = async () => {
    if (!companyUrl || !followers || !commitment) {
      toast({
        title: "Missing Information",
        description: "Please provide all required information.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("/api/linkedin-discount", "POST", {
        companyUrl,
        followers,
        commitment,
        status: "pending",
      });
      
      setIsApplied(true);
      onDiscountChange?.(discount);
      
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-discount"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      
      toast({
        title: "LinkedIn Discount Applied",
        description: `Your discount of ${formatDiscount(discount)} has been applied.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to apply discount",
        variant: "destructive",
      });
    }
  };

  const handleRemoveDiscount = async () => {
    try {
      await apiRequest("/api/linkedin-discount", "POST", {
        companyUrl: "",
        followers: 0,
        commitment: false,
        status: "removed",
      });
      
      setIsApplied(false);
      setCompanyUrl("");
      setFollowers(0);
      setCommitment(false);
      setDiscount(0);
      onDiscountChange?.(0);
      
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-discount"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      
      toast({
        title: "Discount Removed",
        description: "LinkedIn discount has been removed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove discount",
        variant: "destructive",
      });
    }
  };

  const formatDiscount = (amount: number) => {
    if (currency === "AED") {
      return `${amount.toFixed(0)} AED`;
    }
    const convertedAmount = amount * exchangeRate;
    return `${convertedAmount.toFixed(0)} ${currency} (${amount.toFixed(0)} AED)`;
  };

  return (
    <div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-[#2a2a2a] rounded-lg p-3 sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <Linkedin className="h-5 w-5 text-blue-600" />
            LinkedIn Social Reciprocity
          </h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="text-sm">
                  Get 0.001 AED discount per LinkedIn follower when you commit to posting about your A-SAFE partnership.
                  Maximum discount: 2,500 AED or 1% of order value.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {!isApplied ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="company-url" className="text-sm">Company LinkedIn Page URL</Label>
              <Input
                id="company-url"
                type="url"
                placeholder="https://linkedin.com/company/your-company"
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                className="mt-1"
                data-testid="input-linkedin-url"
              />
            </div>
            
            <div>
              <Label htmlFor="followers" className="text-sm">Number of Followers</Label>
              <div className="flex items-center gap-2 mt-1">
                <Users className="h-4 w-4 text-gray-400" />
                <Input
                  id="followers"
                  type="number"
                  placeholder="Enter follower count"
                  value={followers || ""}
                  onChange={(e) => handleFollowersChange(e.target.value)}
                  className="flex-1"
                  min="0"
                  data-testid="input-linkedin-followers"
                />
              </div>
            </div>
            
            {discount > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Discount Amount:</span>
                  <span className="font-semibold text-blue-600">
                    {formatDiscount(discount)}
                  </span>
                </div>
              </div>
            )}
            
            <div className="flex items-start gap-2">
              <Checkbox
                id="commitment"
                checked={commitment}
                onCheckedChange={(checked) => setCommitment(checked as boolean)}
                className="mt-1"
                data-testid="checkbox-linkedin-commitment"
              />
              <div className="flex-1">
                <Label htmlFor="commitment" className="text-sm cursor-pointer">
                  I commit to posting about our A-SAFE partnership on our company LinkedIn page within 30 days
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  Post must mention @A-SAFE and include project photos
                </p>
              </div>
            </div>
            
            <Button
              onClick={handleApplyDiscount}
              disabled={!companyUrl || !followers || !commitment}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-apply-linkedin-discount"
            >
              Apply LinkedIn Discount
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-700 dark:text-green-400">
                  LinkedIn Discount Active
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-gray-600 dark:text-gray-400">
                  Company: {companyUrl}
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  Followers: {followers.toLocaleString()}
                </p>
                <p className="font-semibold text-blue-600">
                  Discount: {formatDiscount(discount)}
                </p>
              </div>
            </div>
            
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1">
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                Remember to post about your A-SAFE partnership within 30 days.
              </p>
            </div>
            
            <Button
              variant="outline"
              onClick={handleRemoveDiscount}
              className="w-full"
              data-testid="button-remove-linkedin-discount"
            >
              Remove LinkedIn Discount
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}