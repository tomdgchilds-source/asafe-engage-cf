import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Clock, FileText, Camera, Video, Users, Trophy, Handshake, Building, Share2, Calendar, DollarSign } from "lucide-react";

interface DiscountTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  discountType?: string;
}

export function DiscountTermsModal({ isOpen, onClose, discountType }: DiscountTermsModalProps) {
  const getDiscountTerms = (type: string) => {
    switch (type) {
      case "LOGO_USAGE":
        return {
          title: "Logo Usage Rights Terms & Conditions",
          discount: "1%",
          icon: <Trophy className="h-5 w-5" />,
          timeframe: "30 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Provide high-resolution logo files (PNG, SVG, AI formats) within 30 days of order confirmation",
                "Grant written permission for logo usage across all A-SAFE marketing materials",
                "Respond to logo usage requests within 5 business days",
                "Provide brand guidelines and usage restrictions if applicable"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "Logo files must be provided within 30 days of discount activation",
                "Written permission must be granted within 14 days of request",
                "Any delays beyond specified timeframes will void the discount"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Failure to provide logo files within 30 days",
                "Withdrawal of permission after discount has been applied",
                "Non-compliance with agreed usage terms",
                "If voided, full 1% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "CASE_STUDY":
        return {
          title: "Written Case Study Terms & Conditions", 
          discount: "3%",
          icon: <FileText className="h-5 w-5" />,
          timeframe: "90 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Participate in detailed project interview within 60 days of installation completion",
                "Provide access to project stakeholders for quotes and testimonials",
                "Review and approve case study content within 14 days of receipt",
                "Provide project images, data, and metrics as requested"
              ]
            },
            {
              title: "Time Requirements", 
              content: [
                "Initial interview must be scheduled within 60 days of project completion",
                "Client must respond to interview requests within 7 business days",
                "Case study review and approval within 14 days of submission",
                "Total completion within 90 days of installation"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Failure to participate in interview within specified timeframe",
                "Unreasonable delays in content review process",
                "Withdrawal of participation after discount activation",
                "If voided, full 3% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "VIDEO_TESTIMONIAL":
        return {
          title: "Video Testimonial Terms & Conditions",
          discount: "4%",
          icon: <Video className="h-5 w-5" />,
          timeframe: "60 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Provide HSE or Operations lead for on-camera testimonial",
                "Schedule and attend filming session within 60 days of installation",
                "Allow 2-4 hours for professional video production",
                "Sign video release forms and usage agreements"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "Filming must be scheduled within 45 days of installation completion",
                "Client must confirm filming date within 5 business days of request",
                "Video production session must be completed within 60 days total",
                "Retakes (if needed) must be accommodated within timeframe"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Failure to schedule filming within 45 days",
                "No-show or cancellation without 48-hour notice",
                "Refusal to sign necessary release forms",
                "If voided, full 4% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "SITE_PHOTOGRAPHY":
        return {
          title: "On-Site Photography Terms & Conditions",
          discount: "3%",
          icon: <Camera className="h-5 w-5" />,
          timeframe: "45 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Provide site access for professional photography within 45 days",
                "Ensure safety compliance and escort arrangements",
                "Allow 4-6 hours for comprehensive photo session",
                "Coordinate with site personnel for optimal timing"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "Photography session must be scheduled within 30 days of installation",
                "Site access must be confirmed within 5 business days of request",
                "Weather contingency dates must be provided",
                "All photography completed within 45 days of installation"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Denial of reasonable site access within timeframe",
                "Failure to provide necessary safety clearances",
                "Cancellation without providing alternative dates",
                "If voided, full 3% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "PRESS_RELEASE":
        return {
          title: "Joint Press Release Terms & Conditions",
          discount: "4%",
          icon: <Share2 className="h-5 w-5" />,
          timeframe: "60 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Collaborate with communications team on press release content",
                "Provide executive quotes and project details",
                "Review and approve final content within 7 business days",
                "Share press release through internal channels"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "Initial collaboration meeting within 14 days of installation",
                "Content draft review within 7 business days",
                "Final approval within 5 business days of submission",
                "Press release published within 60 days of project completion"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Failure to participate in collaboration process",
                "Unreasonable content revision requests causing delays",
                "Withdrawal of approval after agreed timeline",
                "If voided, full 4% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "REFERRALS":
        return {
          title: "Warm Referrals Terms & Conditions",
          discount: "5%",
          icon: <Users className="h-5 w-5" />,
          timeframe: "90 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Provide 2-3 qualified warm introductions to peer companies",
                "Facilitate initial contact and introduction calls",
                "Vouch for A-SAFE's capabilities and experience",
                "Maintain active referral relationship for 12 months"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "First referral contact within 30 days of installation completion",
                "All 2-3 referrals provided within 90 days",
                "Introduction calls facilitated within 14 days of contact",
                "Ongoing support for referral relationships as needed"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Failure to provide minimum 2 qualified referrals within 90 days",
                "Referrals that are not genuine business opportunities",
                "Lack of active participation in introduction process",
                "If voided, full 5% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "SERVICE_CONTRACT":
        return {
          title: "Multi-Year Service Agreement Terms & Conditions",
          discount: "1%", 
          icon: <Handshake className="h-5 w-5" />,
          timeframe: "30 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Sign binding multi-year service/maintenance contract",
                "Commit to minimum 2-year service agreement",
                "Maintain service contract for agreed duration",
                "Allow scheduled maintenance and inspection visits"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "Service contract must be signed within 30 days of installation",
                "Contract terms negotiated and finalized within 21 days",
                "First service visit scheduled within 6 months",
                "Immediate activation required for discount validation"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Failure to sign service contract within 30 days",
                "Early termination of service agreement without cause",
                "Breach of service contract terms and conditions",
                "If voided, full 1% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "EXCLUSIVE_SUPPLIER":
        return {
          title: "Exclusive Supplier Agreement Terms & Conditions",
          discount: "12%",
          icon: <Building className="h-5 w-5" />,
          timeframe: "45 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Sign 24-month exclusive supplier agreement for safety barriers",
                "Commit minimum annual spend of 100,000 AED",
                "Use A-SAFE as sole supplier for barrier solutions across all sites",
                "Provide preferential access for new projects and expansions"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "Exclusive agreement must be signed within 45 days",
                "Contract negotiations completed within 30 days",
                "Immediate exclusivity effective upon contract signing",
                "Annual spend commitments verified quarterly"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Failure to sign exclusive agreement within timeframe",
                "Breach of exclusivity by using competitor suppliers",
                "Failure to meet minimum annual spend commitments",
                "If voided, full 12% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "ADVANCE_PAYMENT":
        return {
          title: "100% Advance Payment Terms & Conditions",
          discount: "5%",
          icon: <DollarSign className="h-5 w-5" />,
          timeframe: "7 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Full payment of 100% project value before work commences",
                "Payment must be made within 7 days of proforma invoice",
                "Payment via bank transfer or approved payment methods only",
                "No payment terms or credit facilities applicable"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "Payment confirmation within 7 days of invoice date",
                "Bank transfer clearance must be confirmed before project starts",
                "Any payment delays will affect project scheduling",
                "Discount valid only with full advance payment"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Failure to pay 100% within specified timeframe",
                "Request for payment terms after discount activation",
                "Partial payment or installment requests",
                "If voided, full 5% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "FLAGSHIP_SHOWCASE":
        return {
          title: "Flagship Showcase Project Terms & Conditions",
          discount: "10%",
          icon: <Trophy className="h-5 w-5" />,
          timeframe: "Ongoing",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Allow site to be featured as A-SAFE flagship showcase installation",
                "Accommodate regular client visits and tours (max 2 per month)",
                "Participate in industry events showcasing the installation",
                "Maintain barriers to showcase standard for 2 years minimum"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "Showcase agreement effective immediately upon installation",
                "Must accommodate first showcase tour within 60 days",
                "Ongoing availability for scheduled tours",
                "2-year commitment from installation completion"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Refusal to accommodate reasonable showcase requests",
                "Failure to maintain installation to showcase standards",
                "Withdrawal from showcase program before 2-year commitment",
                "If voided, full 10% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "LINKEDIN_POST":
        return {
          title: "LinkedIn Post Terms & Conditions",
          discount: "3%",
          icon: <Share2 className="h-5 w-5" />,
          timeframe: "14 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Publish a professional LinkedIn post on official corporate page",
                "Include high-quality photos of the A-SAFE installation",
                "Tag @A-SAFE Middle East in the post content",
                "Highlight safety improvements and project success metrics"
              ]
            },
            {
              title: "Post Requirements",
              content: [
                "Minimum 150 words describing the installation and benefits",
                "Include at least 2-3 professional photos of installed barriers",
                "Mention A-SAFE as the safety barrier provider",
                "Post must remain live for minimum 12 months"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "LinkedIn post must be published within 14 days of installation completion",
                "Draft content can be reviewed by A-SAFE if requested",
                "Post must be from official company LinkedIn page (not personal)",
                "Immediate notification to A-SAFE once post is live"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Failure to publish post within 14-day timeframe",
                "Post deletion or removal before 12-month period",
                "Content that does not meet minimum requirements",
                "If voided, full 3% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "REFERENCE_SITE":
        return {
          title: "Reference Site Access Terms & Conditions",
          discount: "5%",
          icon: <Building className="h-5 w-5" />,
          timeframe: "12 months",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Provide site access for prospective A-SAFE client tours",
                "Accommodate up to 2 reference visits per month",
                "Designate a point of contact for tour coordination",
                "Maintain installation in presentable showcase condition"
              ]
            },
            {
              title: "Tour Requirements",
              content: [
                "Minimum 2-week advance notice for tour scheduling",
                "Tours limited to 1-2 hours during normal business hours",
                "A-SAFE to manage all visitor safety compliance and insurance",
                "Client may request specific areas to be excluded from tours"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "Reference site agreement active for 12 months from installation",
                "First tour availability within 30 days of installation completion",
                "Response to tour requests within 3 business days",
                "Reasonable flexibility for rescheduling if operational conflicts arise"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Refusal to accommodate more than 2 consecutive tour requests",
                "Withdrawal from reference program before 12-month commitment",
                "Failure to maintain installation in presentable condition",
                "If voided, full 5% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      case "WRITTEN_TESTIMONIAL":
        return {
          title: "Written Testimonial Terms & Conditions",
          discount: "1%",
          icon: <FileText className="h-5 w-5" />,
          timeframe: "30 days",
          terms: [
            {
              title: "Client Obligations",
              content: [
                "Provide a detailed written testimonial (300-500 words)",
                "Include specific project outcomes and safety improvements",
                "Provide satisfaction ratings across key performance areas",
                "Authorize use of testimonial in A-SAFE marketing materials"
              ]
            },
            {
              title: "Content Requirements",
              content: [
                "Description of safety challenges before A-SAFE installation",
                "Specific benefits achieved post-installation",
                "Quantifiable improvements (accident reduction, efficiency gains, etc.)",
                "Overall satisfaction rating and recommendation"
              ]
            },
            {
              title: "Time Requirements",
              content: [
                "Written testimonial submitted within 30 days of installation",
                "Response to any clarification requests within 5 business days",
                "Final approval of edited version within 7 days",
                "Testimonial remains valid for A-SAFE use indefinitely"
              ]
            },
            {
              title: "Void Conditions",
              content: [
                "Failure to provide testimonial within 30-day timeframe",
                "Testimonial lacks required detail or specificity",
                "Withdrawal of permission to use testimonial",
                "If voided, full 1% discount amount becomes immediately chargeable"
              ]
            }
          ]
        };

      default:
        return {
          title: "General Discount Terms & Conditions",
          discount: "Variable",
          icon: <DollarSign className="h-5 w-5" />,
          timeframe: "As specified",
          terms: [
            {
              title: "General Terms",
              content: [
                "All discount obligations must be fulfilled within specified timeframes",
                "Client cooperation and timely response required for all discount activities",
                "Failure to meet obligations will result in discount reversal and charges",
                "Terms may vary based on specific discount type selected"
              ]
            }
          ]
        };
    }
  };

  const selectedTerms = discountType ? getDiscountTerms(discountType) : getDiscountTerms("default");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedTerms.icon}
            {selectedTerms.title}
          </DialogTitle>
          <DialogDescription>
            Please review all terms and conditions carefully before activating this discount
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Discount Summary */}
            <Card className="bg-orange-50 border-orange-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Discount Summary</CardTitle>
                  <Badge className="bg-orange-600 text-white text-lg px-3 py-1">
                    {selectedTerms.discount} OFF
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-600" />
                    <span className="text-sm">
                      <strong>Completion Timeframe:</strong> {selectedTerms.timeframe}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span className="text-sm text-red-700">
                      <strong>Non-compliance results in full charge</strong>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Important Notice */}
            <Card className="bg-red-50 border-red-200">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-red-900 mb-2">IMPORTANT NOTICE</h4>
                    <p className="text-sm text-red-800 leading-relaxed">
                      By selecting this discount option, you agree to fulfill ALL specified obligations within the stated timeframes. 
                      Failure to complete any requirement will result in the <strong>immediate reversal of the discount</strong> and 
                      the <strong>full discount amount becoming chargeable</strong> as an additional fee to your project total.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Terms Sections */}
            {selectedTerms.terms.map((section, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-base">{section.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {section.content.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex gap-2 text-sm">
                        <span className="text-blue-600 font-bold flex-shrink-0">•</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}

            {/* Legal Notice */}
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Legal & Billing Terms
                  </h4>
                  <div className="space-y-2 text-sm text-gray-700">
                    <p>• Discount is applied to project total upon order confirmation</p>
                    <p>• All timeframes commence from installation completion date</p>
                    <p>• Force majeure events may extend deadlines by mutual agreement</p>
                    <p>• Disputes subject to UAE commercial law and Dubai courts jurisdiction</p>
                    <p>• Client responsible for any costs incurred due to non-compliance</p>
                    <p>• Terms form part of the main supply contract and are legally binding</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <h4 className="font-semibold text-blue-900 mb-3">Questions or Support</h4>
                <div className="space-y-2 text-sm text-blue-800">
                  <p>For questions about discount terms or to discuss timeline adjustments:</p>
                  <p><strong>Email:</strong> support@asafe.ae</p>
                  <p><strong>Phone:</strong> +971 50 388 1285</p>
                  <p><strong>Business Hours:</strong> Monday - Friday, 8:30 AM - 5:30 PM GST</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <Separator />
        
        <div className="flex justify-between items-center pt-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>Terms effective from order confirmation date</span>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={onClose}
            >
              I Understand Terms
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}