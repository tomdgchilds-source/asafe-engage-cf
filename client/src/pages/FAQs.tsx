import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp,
  Shield,
  Settings,
  Wrench,
  Building,
  TrendingUp,
  Users,
  Zap,
  Smartphone,
  Info,
  Share2,
  Mail,
  MessageCircle,
  FileText,
  Download
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import jsPDF from "jspdf";
import { useToast } from "@/hooks/use-toast";
import { InfoPopover } from "@/components/ui/info-popover";
import asafeLogo from '../assets/asafe-logo.jpeg';

interface FAQ {
  question: string;
  answer: string;
  category: string;
}

interface CategoryConfig {
  title: string;
  description: string;
  icon: any;
  color: string;
}

export default function FAQs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const { toast } = useToast();

  const categories: Record<string, CategoryConfig> = {
    "product-technology": {
      title: "Product & Technology",
      description: "Learn about A-SAFE's innovative polymer technology and advanced materials",
      icon: Zap,
      color: "bg-blue-100 text-blue-800"
    },
    "safety-performance": {
      title: "Safety & Performance", 
      description: "Understanding crash testing, compliance standards, and safety outcomes",
      icon: Shield,
      color: "bg-green-100 text-green-800"
    },
    "installation-planning": {
      title: "Installation & Planning",
      description: "Site assessments, installation processes, and planning tools",
      icon: Settings,
      color: "bg-purple-100 text-purple-800"
    },
    "maintenance-durability": {
      title: "Maintenance & Durability",
      description: "Lifespan, maintenance requirements, and replacement guidance",
      icon: Wrench,
      color: "bg-orange-100 text-orange-800"
    },
    "applications-industries": {
      title: "Applications & Industries",
      description: "Industry applications, environmental resistance, and specialized uses",
      icon: Building,
      color: "bg-indigo-100 text-indigo-800"
    },
    "flexibility-customization": {
      title: "Flexibility & Customization",
      description: "Customization options, adaptability, and environmental benefits",
      icon: Users,
      color: "bg-pink-100 text-pink-800"
    },
    "business-roi": {
      title: "Business & ROI",
      description: "Investment returns, cost savings, and business impact",
      icon: TrendingUp,
      color: "bg-yellow-100 text-yellow-800"
    },
    "assessment-support": {
      title: "Assessment & Support",
      description: "Consultations, assessments, and ongoing support services",
      icon: Info,
      color: "bg-gray-100 text-gray-800"
    },
    "app-usage-platform": {
      title: "App Usage & Platform",
      description: "How to use A-SAFE ENGAGE platform features and maximize your experience",
      icon: Smartphone,
      color: "bg-teal-100 text-teal-800"
    }
  };

  const faqs: FAQ[] = [
    // Product & Technology
    {
      category: "product-technology",
      question: "What makes A‑SAFE barriers different from steel barriers?",
      answer: "A‑SAFE barriers are made from advanced polymer technology that flexes and absorbs impact energy. Unlike steel, which transfers impact to the floor and often needs replacing after a collision, A‑SAFE barriers self-recover, protecting people, equipment, floors, and vehicles while reducing long-term costs."
    },
    {
      category: "product-technology", 
      question: "What does PAS 13 crash testing mean?",
      answer: "PAS 13 is an internationally recognized code of practice that defines how barriers should be tested and installed. A‑SAFE barriers are independently crash-tested to these rigorous standards, so you can trust they perform exactly as promised when it matters most."
    },
    {
      category: "product-technology",
      question: "What materials are A‑SAFE barriers made from?",
      answer: "Our barriers are made from patented advanced polymer blends called Memaplex™ and Monoplex™, specifically engineered to flex, absorb energy, and return to shape after impact."
    },
    {
      category: "product-technology",
      question: "Can A‑SAFE barriers be used in automated warehouses or with AGVs (Automated Guided Vehicles)?",
      answer: "Yes. Our barriers are designed to guide and protect both manned and unmanned traffic. In highly automated environments, they help define pathways for AGVs and protect robotics, storage systems, and segregate personnel zones to not interfere or disrupt AGV traffic flow."
    },
    {
      category: "product-technology",
      question: "What innovations are coming next for barrier technology?",
      answer: "We are working on integrating smart technology, such as sensors and IoT connectivity, into barrier systems. These will help facilities track impacts, analyze risk hotspots, and make data-driven improvements."
    },

    // Safety & Performance
    {
      category: "safety-performance",
      question: "Do A‑SAFE barriers stop forklifts completely?",
      answer: "They are designed to absorb energy and slow vehicles safely while protecting structures and people. Depending on the impact conditions, the barrier can stop or significantly decelerate a vehicle, preventing serious damage or injury."
    },
    {
      category: "safety-performance",
      question: "Can barriers protect against racking damage?",
      answer: "Yes. Specially designed racking protectors and low-level barriers shield racking legs and structures from forklift impacts, which are one of the most common causes of warehouse damage and racking collapse."
    },
    {
      category: "safety-performance",
      question: "Do A‑SAFE barriers comply with OSHA and EU regulations?",
      answer: "Yes. A‑SAFE barriers are designed and installed in compliance with international safety standards, including OSHA requirements and EU directives for workplace safety."
    },
    {
      category: "safety-performance",
      question: "How do A‑SAFE barriers support a safety culture in the workplace?",
      answer: "Barriers are a visual and practical commitment to protecting people. They help set boundaries, encourage safe behavior, and show that management prioritizes safety - creating a stronger safety culture."
    },
    {
      category: "safety-performance",
      question: "Do A‑SAFE barriers reduce workplace stress?",
      answer: "Yes. When pedestrians and operators see clear segregation and protection, it reduces anxiety. This leads to a calmer, more confident workforce and improved productivity."
    },
    {
      category: "safety-performance",
      question: "How do barriers help prevent legal and compliance issues?",
      answer: "Proper impact protection helps companies comply with health and safety regulations, reducing the risk of fines, legal claims, and insurance disputes after incidents."
    },
    {
      category: "safety-performance",
      question: "Do barriers make forklift drivers overconfident?",
      answer: "No. In fact, clear separation of vehicles and pedestrians reduces driver stress and increases attentiveness. Barriers are a safeguard, not a substitute for safe driving practices."
    },

    // Installation & Planning
    {
      category: "installation-planning",
      question: "How long does installation take?",
      answer: "It really depends on site size and complexity. Our teams work around your operations to minimize downtime and disruption and it is typically a lot faster than steel alternative barriers due to A-SAFE modular assembly and supplied, fit-for-purpose floor fixings."
    },
    {
      category: "installation-planning",
      question: "Do you offer on-site safety assessments?",
      answer: "Yes. Our expert team will visit your site, review traffic and pedestrian risks, and provide a customized safety plan. This service is free of charge and comes with a detailed proposal."
    },
    {
      category: "installation-planning",
      question: "Do you provide CAD drawings for planning?",
      answer: "Yes. We create detailed CAD layouts to help you visualize barrier placement and ensure your system integrates seamlessly with your facility."
    },
    {
      category: "installation-planning",
      question: "Can A‑SAFE provide 3D visualizations before installation?",
      answer: "Yes. Our team can provide 3D models of your facility showing exactly where barriers will be installed (customer supplied Revit design required). This makes planning clear for decision-makers and stakeholders."
    },
    {
      category: "installation-planning",
      question: "Can barriers be installed without drilling into floors?",
      answer: "In some cases, temporary or surface-mounted solutions can be provided. However, for maximum impact protection, anchoring barriers to the floor ensures full crash-tested performance. We also have special slider base plates to allow for full impact performance along with the ability to easily remove barriers without any tools e.g. for periodic maintenance etc."
    },

    // Maintenance & Durability
    {
      category: "maintenance-durability",
      question: "Are A‑SAFE barriers maintenance-free?",
      answer: "Unlike steel barriers, A‑SAFE barriers don't rust, need repainting, or warp after impact. Periodic visual checks are all that's needed, but we can also provide periodic inspections or training for your teams on site."
    },
    {
      category: "maintenance-durability",
      question: "What's the lifespan of a polymer barrier?",
      answer: "A‑SAFE barriers typically last years longer than steel alternatives because they absorb impacts rather than bend or break. They retain their strength and appearance even in demanding environments."
    },
    {
      category: "maintenance-durability",
      question: "Do you provide training for barrier inspection?",
      answer: "Absolutely. We provide guidance and optional training for your staff to carry out periodic visual inspections, ensuring your system performs optimally."
    },
    {
      category: "maintenance-durability",
      question: "How do I know when it's time to replace a barrier?",
      answer: "Polymer barriers are highly durable and self‑recover after impact, but if a barrier has sustained a major hit, it should be inspected. We provide clear guidelines and can offer inspections to confirm integrity."
    },
    {
      category: "maintenance-durability",
      question: "What happens if an A‑SAFE barrier is hit multiple times?",
      answer: "Our unique polymer design absorbs impacts and flexes back into shape. Repeated minor impacts typically cause no damage. After severe or repeated collisions in the same spot, the barrier can be inspected and individual parts replaced as and when may be necessary."
    },

    // Applications & Industries
    {
      category: "applications-industries",
      question: "What industries are A‑SAFE barriers suitable for?",
      answer: "Our barriers are used across logistics, food & drink, automotive, airports, manufacturing, and pharmaceuticals. Any industry that values the protection of people, assets, and infrastructure can benefit from A‑SAFE systems."
    },
    {
      category: "applications-industries",
      question: "Can barriers integrate with other safety systems?",
      answer: "Yes. We can integrate barriers with gates, access control, and warning signage. Our solutions can also be designed to complement automated systems like sensors or traffic lights."
    },
    {
      category: "applications-industries",
      question: "Can barriers help protect sensitive machinery or infrastructure?",
      answer: "Absolutely. We offer barriers and bollards specifically designed to shield machinery, control panels, conveyors, columns, and even building walls from impact damage."
    },
    {
      category: "applications-industries",
      question: "Are there options for outdoor use (loading bays, car parks)?",
      answer: "Yes. A‑SAFE provides outdoor‑rated barriers and bollards with UV protection and weather-resistant finishes. These are ideal for truck yards, car parks, and external walkways."
    },
    {
      category: "applications-industries",
      question: "Are barriers resistant to chemicals, oils, and weather?",
      answer: "Our advanced polymers are resistant to most chemicals, oils, and fuels. Outdoor barrier solutions also include UV stabilizers to withstand weather without fading or degrading."
    },
    {
      category: "applications-industries",
      question: "Are there lightweight options for low-speed areas?",
      answer: "Yes. We offer a range of barrier types, from lightweight pedestrian guides for low-speed areas to heavy-duty systems for high-traffic, high-impact zones."
    },

    // Flexibility & Customization
    {
      category: "flexibility-customization",
      question: "Can barriers be moved if my layout changes?",
      answer: "Yes. A‑SAFE barriers are modular and can be relocated or reconfigured as your facility changes, making them a flexible long-term investment."
    },
    {
      category: "flexibility-customization",
      question: "Can A‑SAFE barriers be customized in color or design?",
      answer: "Yes. Our barriers are available in a range of high‑visibility standard colors, and we also offer custom colors to match your corporate branding or site requirements (custom colours may incur additional fees for production)."
    },
    {
      category: "flexibility-customization",
      question: "What are the environmental benefits of polymer barriers?",
      answer: "Our barriers are 100% recyclable and have a longer lifespan than steel, which reduces material waste. Lower replacement frequency also means fewer resources consumed over the life of your system."
    },

    // Business & ROI
    {
      category: "business-roi",
      question: "How do barriers help with insurance compliance?",
      answer: "Properly installed, crash-tested barriers reduce risks, which can support compliance with insurer requirements and in some cases help reduce premiums."
    },
    {
      category: "business-roi",
      question: "Can barriers prevent vehicle downtime costs?",
      answer: "Yes. Barriers absorb impacts to protect vehicles from major structural damage, which reduces repair costs, downtime, and productivity losses."
    },
    {
      category: "business-roi",
      question: "What's the typical payback period for an A‑SAFE system?",
      answer: "Most clients see a return on investment within 18–24 months through reduced repairs, downtime, and accident costs. Many report savings that continue for years after installation."
    },
    {
      category: "business-roi",
      question: "How do I get a budget estimate before a site visit?",
      answer: "You can request an initial estimate by sharing site layouts and vehicle details with us. For accurate pricing, a site assessment is recommended, but we can give rough costs quickly based on your basic information."
    },
    {
      category: "business-roi",
      question: "Can I start with a small project and expand later?",
      answer: "Yes. Many clients start with a pilot area or high‑risk zone. As they see the results, they expand coverage. A‑SAFE barriers are modular and easy to extend as needed."
    },

    // Assessment & Support
    {
      category: "assessment-support",
      question: "How do I know which barrier strength I need?",
      answer: "We assess your site for factors such as vehicle weight, speed, and traffic flow. From this, we recommend a barrier system engineered to absorb the specific impact forces in your facility. We can also share some indicative potential impact forces based upon your vehicle details when input into our impact calculator."
    },
    {
      category: "assessment-support",
      question: "How do barriers affect warehouse traffic flow?",
      answer: "Properly planned barrier systems guide safe vehicle and pedestrian movement, making facilities more organized. This reduces congestion, improves flow, and minimizes near-misses."
    },
    {
      category: "assessment-support",
      question: "How do I request a free consultation?",
      answer: "Simply fill out our online form or call your nearest A‑SAFE office. One of our safety specialists will contact you to arrange a site visit or virtual assessment at a convenient time."
    },
    {
      category: "assessment-support",
      question: "Do you work internationally?",
      answer: "A‑SAFE has a global presence with offices and partners in multiple regions. We supply and install barrier solutions worldwide, adapting to local standards and languages."
    },

    // App Usage & Platform
    {
      category: "app-usage-platform",
      question: "How does the Impact Calculator help me choose the right barriers?",
      answer: "The Impact Calculator uses PAS 13 methodology to calculate kinetic energy based on your vehicle specifications (weight, speed, turning angles). It provides instant product recommendations with impact ratings and safety margins, eliminating guesswork and ensuring you select barriers engineered for your specific application."
    },
    {
      category: "app-usage-platform",
      question: "What makes the A-SAFE ENGAGE product catalog better than traditional catalogs?",
      answer: "Our interactive catalog features real product data, authentic imagery, detailed specifications, and impact ratings. You can filter by industry, application, and impact requirements while viewing live pricing in multiple currencies. Each product includes comprehensive technical details and installation guides."
    },
    {
      category: "app-usage-platform",
      question: "How do case studies on the platform help me make better decisions?",
      answer: "Case studies provide real-world examples from your industry with authentic video content from A-SAFE's projects. You can see actual implementations, measurable outcomes, and ROI data from similar facilities. Filter by industry to find relevant applications and proven results that support your business case."
    },
    {
      category: "app-usage-platform",
      question: "What resources are available in the app to support my projects?",
      answer: "The Resources section includes installation guides, technical certificates, CAD drawings, BIM objects, and video tutorials. All resources are categorized by product line and downloadable. You also get access to A-SAFE's virtual product space and factory tour for immersive learning."
    },
    {
      category: "app-usage-platform",
      question: "How does the cart system help me manage multiple projects?",
      answer: "The intelligent cart system supports multi-currency pricing, automatic discount calculations, and quantity-based pricing tiers. It includes VAT calculations, delivery costs, and installation estimates. You can save carts for different projects and generate detailed quotes with all project specifications."
    },
    {
      category: "app-usage-platform",
      question: "Can I save and track my calculations for future reference?",
      answer: "Yes! The Calculations History feature saves all your impact calculations with full details including vehicle specs, recommended products, and safety margins. You can revisit previous calculations, modify parameters, and use them as templates for similar projects, building your personal library of solutions."
    },
    {
      category: "app-usage-platform",
      question: "How does the quote request feature streamline my procurement process?",
      answer: "Quote requests automatically pull your user profile data, selected products, and calculation results. The system generates comprehensive technical specifications and submits directly to A-SAFE experts. You get faster, more accurate quotes with all technical details pre-populated, reducing back-and-forth communication."
    },
    {
      category: "app-usage-platform",
      question: "What advantages does the mobile app experience offer?",
      answer: "The mobile-optimized platform lets you access calculations, product specs, and resources on-site. Touch-friendly interface allows quick barrier selection during facility walks, instant access to installation guides, and the ability to share technical data with your team immediately."
    },
    {
      category: "app-usage-platform",
      question: "How does my user profile enhance my experience?",
      answer: "Your profile stores company information, preferences, and project history. It automatically populates quote forms, personalizes product recommendations, and maintains your discount tier status. The system learns your usage patterns to surface relevant content and streamline repeat processes."
    },
    {
      category: "app-usage-platform",
      question: "How does the platform save me time compared to traditional methods?",
      answer: "ENGAGE eliminates multiple steps: instant impact calculations vs. manual engineering, immediate product filtering vs. catalog browsing, one-click quote requests vs. phone calls and emails, downloadable resources vs. requesting documents, and real-time pricing vs. waiting for quotes. Users typically save 60-80% of procurement time."
    }
  ];

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  // Helper function to load image and get dimensions
  const loadImageWithAspectRatio = async (imagePath: string): Promise<{ dataUrl: string; width: number; height: number }> => {
    const response = await fetch(imagePath);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const img = new Image();
      
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        img.onload = () => {
          resolve({ dataUrl, width: img.width, height: img.height });
        };
        img.onerror = reject;
        img.src = dataUrl;
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Generate PDF with A-SAFE branding - COMPLETELY REWRITTEN
  const generateFAQsPDF = async (): Promise<jsPDF> => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Filter out app-related FAQs for customer version
    const customerFAQs = faqs.filter(faq => faq.category !== 'app-usage-platform');
    
    // A-SAFE Brand Colors
    const yellowColor: [number, number, number] = [255, 199, 44]; // #FFC72C
    const blackColor: [number, number, number] = [0, 0, 0];
    const grayColor: [number, number, number] = [100, 100, 100];
    const darkGrayColor: [number, number, number] = [50, 50, 50];
    const lightGrayColor: [number, number, number] = [240, 240, 240];
    
    // CRITICAL: Conservative page dimensions to prevent text cutoff
    const pageWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const leftMargin = 30; // 30mm left margin for safety
    const rightMargin = 30; // 30mm right margin for safety
    const topMargin = 25;
    const bottomMargin = 30;
    
    // CRITICAL: Very conservative content width to prevent ANY text cutoff
    const maxTextWidth = 140; // Reduced from 145mm for extra safety
    const safeTextWidth = maxTextWidth - 5; // 135mm for actual text
    const contentStartX = leftMargin;
    
    // Helper functions for text wrapping
    // Sanitize special characters that confuse jsPDF
    const sanitizeText = (text: string): string => {
      return text
        .replace(/[\u2011\u2013-\u2015\u2212]/g, '-')  // Convert special hyphens to regular
        .replace(/[\u2018\u2019]/g, "'")  // Convert smart quotes
        .replace(/[\u201C\u201D]/g, '"')  // Convert smart double quotes  
        .replace(/\u00A0/g, ' ');  // Convert non-breaking spaces
    };

    // Accurately measure text width in mm
    const getTextWidthMm = (text: string): number => {
      return doc.getStringUnitWidth(text) * doc.getFontSize() / (doc as any).internal.scaleFactor;
    };

    // Custom text wrapping that guarantees no overflow
    const wrapText = (text: string, maxWidthMm: number): string[] => {
      const sanitized = sanitizeText(text);
      const words = sanitized.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = getTextWidthMm(testLine);
        
        if (width > maxWidthMm) {
          // If single word is too long, break it
          if (!currentLine) {
            let charLine = '';
            for (const char of word) {
              if (getTextWidthMm(charLine + char) > maxWidthMm) {
                lines.push(charLine);
                charLine = char;
              } else {
                charLine += char;
              }
            }
            if (charLine) lines.push(charLine);
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        } else {
          currentLine = testLine;
        }
      }
      
      if (currentLine) lines.push(currentLine);
      return lines;
    };
    
    // Footer and content area
    const footerHeight = 25;
    const maxContentY = pageHeight - footerHeight - 10;
    
    // Consistent typography settings
    const titleSize = 16;
    const categorySize = 12;
    const questionSize = 10;
    const answerSize = 9;
    const lineHeight = 5;
    const qaSeparation = 8;
    const categorySeparation = 12;
    
    let currentPageNumber = 1;
    let yPosition = topMargin;
    
    // Helper function to add footer to every page
    const addPageFooter = (pageNum: number = currentPageNumber) => {
      // Save current position
      const savedY = yPosition;
      
      // Footer background
      doc.setFillColor(...lightGrayColor);
      doc.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, 'F');
      
      // Footer divider line
      doc.setDrawColor(...yellowColor);
      doc.setLineWidth(0.5);
      doc.line(leftMargin, pageHeight - footerHeight, pageWidth - rightMargin, pageHeight - footerHeight);
      
      // UAE Office Details - Using custom text wrapping
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...blackColor);
      doc.text(sanitizeText('A-SAFE DWC-LLC - Dubai'), pageWidth / 2, pageHeight - 18, { 
        align: 'center'
      });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...grayColor);
      doc.text(sanitizeText('Office 220, Building A5, Dubai South Business Park'), pageWidth / 2, pageHeight - 13, { 
        align: 'center'
      });
      doc.text(sanitizeText('+971 (4) 8842 422 | support@asafe.ae | www.asafe.com'), pageWidth / 2, pageHeight - 9, { 
        align: 'center'
      });
      
      // Page number
      doc.setFontSize(8);
      doc.text(sanitizeText(`Page ${pageNum}`), pageWidth / 2, pageHeight - 4, { 
        align: 'center'
      });
      
      // Restore position
      yPosition = savedY;
    };
    
    // Helper function to check if new page is needed
    const checkNewPage = (requiredSpace: number): boolean => {
      if (yPosition + requiredSpace > maxContentY) {
        addPageFooter(currentPageNumber);
        doc.addPage();
        currentPageNumber++;
        yPosition = topMargin;
        addPageHeader();
        return true;
      }
      return false;
    };
    
    // Helper function to add subtle page header (on new pages)
    const addPageHeader = () => {
      // Add yellow accent line at top
      doc.setFillColor(...yellowColor);
      doc.rect(0, 0, pageWidth, 3, 'F');
      yPosition = topMargin + 5;
    };
    
    // Helper function to add wrapped text
    const addWrappedText = (text: string, x: number, y: number, maxWidth: number, align: 'left' | 'center' | 'right' = 'left'): number => {
      const lines = wrapText(text, maxWidth);
      lines.forEach((line, index) => {
        if (align === 'center') {
          doc.text(line, x, y + (index * lineHeight), { align: 'center' });
        } else {
          doc.text(line, x, y + (index * lineHeight));
        }
      });
      return lines.length * lineHeight;
    };
    
    // SIMPLIFIED HEADER: Always use programmatic logo to avoid stretching
    // Draw perfect yellow circle logo (no image loading issues)
    const logoRadius = 12; // 12mm radius for 24mm diameter circle
    const logoCenterX = contentStartX + logoRadius;
    const logoCenterY = yPosition + logoRadius;
    
    // Draw yellow circle
    doc.setFillColor(...yellowColor);
    doc.circle(logoCenterX, logoCenterY, logoRadius, 'F');
    
    // Add "A" in the center of the circle
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...blackColor);
    doc.text('A', logoCenterX, logoCenterY + 7, { align: 'center' });
    
    // Add company name next to logo
    const textStartX = contentStartX + (logoRadius * 2) + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...blackColor);
    doc.text(sanitizeText('A-SAFE'), textStartX, logoCenterY - 2);
    
    // Add tagline
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...grayColor);
    doc.text(sanitizeText('Workplace Safety Solutions'), textStartX, logoCenterY + 5);
    
    yPosition = logoCenterY + logoRadius + 10;
    
    // Title Section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(titleSize);
    doc.setTextColor(...blackColor);
    doc.text(sanitizeText('FREQUENTLY ASKED QUESTIONS'), pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...grayColor);
    doc.text(sanitizeText('Customer Reference Guide'), pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 6;
    const dateStr = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    doc.setFontSize(8);
    doc.text(sanitizeText(dateStr), pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 12;
    
    // Introduction text with custom wrapping
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...darkGrayColor);
    const introText = 'This comprehensive guide addresses the most common questions about A-SAFE barrier systems, safety solutions, and workplace protection.';
    const introLines = wrapText(introText, safeTextWidth);
    introLines.forEach((line: string) => {
      checkNewPage(lineHeight);
      doc.text(line, contentStartX, yPosition);
      yPosition += lineHeight;
    });
    
    yPosition += 10;
    
    // Group FAQs by category
    const categorizedForPDF = Object.keys(categories)
      .filter(key => key !== 'app-usage-platform')
      .map(key => ({
        categoryKey: key,
        category: categories[key],
        faqs: customerFAQs.filter(faq => faq.category === key)
      }))
      .filter(item => item.faqs.length > 0);
    
    // Process each category
    categorizedForPDF.forEach((categoryGroup, categoryIndex) => {
      // Check space for category header
      checkNewPage(30);
      
      // Category header with yellow background
      doc.setFillColor(...yellowColor);
      doc.roundedRect(contentStartX, yPosition - 4, maxTextWidth, 10, 2, 2, 'F');
      
      // Category title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(categorySize);
      doc.setTextColor(...blackColor);
      doc.text(sanitizeText(categoryGroup.category.title.toUpperCase()), contentStartX + 3, yPosition + 2);
      yPosition += 10;
      
      // Category description
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...grayColor);
      const descLines = wrapText(categoryGroup.category.description, safeTextWidth - 5);
      descLines.forEach((line: string) => {
        checkNewPage(5);
        doc.text(line, contentStartX, yPosition);
        yPosition += 4;
      });
      yPosition += 6;
      
      // Questions and answers with custom wrapping
      categoryGroup.faqs.forEach((faq, index) => {
        // Use custom wrapping for reliable text splitting
        const questionText = `Q: ${faq.question}`;
        const answerText = `A: ${faq.answer}`;
        
        // Split text using custom wrapper with safe width
        const questionLines = wrapText(questionText, safeTextWidth - 10);
        const answerLines = wrapText(answerText, safeTextWidth - 15);
        
        const totalLinesNeeded = questionLines.length + answerLines.length;
        const spaceNeeded = (totalLinesNeeded * lineHeight) + qaSeparation + 5;
        
        // Check if Q&A fits on current page
        checkNewPage(spaceNeeded);
        
        // Question formatting
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(questionSize);
        doc.setTextColor(...blackColor);
        
        // Add yellow bullet point
        doc.setFillColor(...yellowColor);
        doc.circle(contentStartX - 3, yPosition - 2, 1, 'F');
        
        // Question text with custom wrapping
        questionLines.forEach((line: string) => {
          checkNewPage(lineHeight);
          doc.text(line, contentStartX + 2, yPosition);
          yPosition += lineHeight;
        });
        
        yPosition += 2; // Gap between Q and A
        
        // Answer formatting (indented)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(answerSize);
        doc.setTextColor(...darkGrayColor);
        
        const answerIndent = contentStartX + 8;
        answerLines.forEach((line: string) => {
          checkNewPage(lineHeight);
          doc.text(line, answerIndent, yPosition);
          yPosition += lineHeight;
        });
        
        yPosition += qaSeparation; // Space between Q&A pairs
      });
      
      yPosition += categorySeparation; // Space between categories
    });
    
    // Add final call-to-action section if space permits
    if (yPosition + 30 < maxContentY) {
      yPosition = maxContentY - 25;
      
      // Call to action box
      doc.setFillColor(...yellowColor);
      doc.roundedRect(contentStartX, yPosition, maxTextWidth, 20, 3, 3, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...blackColor);
      doc.text(sanitizeText('Need Expert Advice?'), pageWidth / 2, yPosition + 8, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(sanitizeText('Contact our safety specialists for personalized solutions'), pageWidth / 2, yPosition + 14, { align: 'center' });
    }
    
    // Add footer to the last page
    addPageFooter(currentPageNumber);
    
    // Ensure ALL pages have footers
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      // Re-add footer to ensure it's on every page
      if (i < currentPageNumber) {
        addPageFooter(i);
      }
    }
    
    return doc;
  };

  // Handle email sharing - ASYNC
  const handleEmailShare = async () => {
    try {
      // Show loading toast
      toast({
        title: "Generating PDF...",
        description: "Please wait while we prepare your document.",
      });
      
      const doc = await generateFAQsPDF();
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      // Create email body
      const emailSubject = encodeURIComponent('A-SAFE Frequently Asked Questions');
      const emailBody = encodeURIComponent(
        `Hello,\n\nPlease find attached the A-SAFE Frequently Asked Questions document.\n\nThis comprehensive guide covers:\n• Product & Technology\n• Safety & Performance\n• Installation & Planning\n• Maintenance & Durability\n• Applications & Industries\n• Business & ROI\n\nFor more information, please visit www.asafe.com or contact us at +971 50 388 1285.\n\nBest regards,\nA-SAFE Team`
      );
      
      // Download PDF first
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = 'A-SAFE_FAQs.pdf';
      link.click();
      
      // Open email client
      setTimeout(() => {
        window.open(`mailto:?subject=${emailSubject}&body=${emailBody}`, '_blank');
      }, 500);
      
      toast({
        title: "PDF Downloaded",
        description: "The FAQs PDF has been downloaded. Please attach it to your email.",
      });
      
      setShareDialogOpen(false);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle WhatsApp sharing - ASYNC
  const handleWhatsAppShare = async () => {
    try {
      // Show loading toast
      toast({
        title: "Generating PDF...",
        description: "Please wait while we prepare your document.",
      });
      
      const doc = await generateFAQsPDF();
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      // Download PDF first
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = 'A-SAFE_FAQs.pdf';
      link.click();
      
      // WhatsApp message
      const message = encodeURIComponent(
        `Hello! Here are the A-SAFE Frequently Asked Questions.\n\nThis guide covers:\n• Product & Technology\n• Safety & Performance\n• Installation & Planning\n• Maintenance & Durability\n• Applications & Industries\n• Business & ROI\n\nPlease find the PDF document attached.\n\nFor more information: www.asafe.com`
      );
      
      // Open WhatsApp
      setTimeout(() => {
        window.open(`https://wa.me/?text=${message}`, '_blank');
      }, 500);
      
      toast({
        title: "PDF Downloaded",
        description: "The FAQs PDF has been downloaded. Please share it via WhatsApp.",
      });
      
      setShareDialogOpen(false);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle direct PDF download - ASYNC
  const handlePDFDownload = async () => {
    try {
      // Show loading toast
      toast({
        title: "Generating PDF...",
        description: "Please wait while we prepare your document.",
      });
      
      const doc = await generateFAQsPDF();
      doc.save('A-SAFE_FAQs.pdf');
      
      toast({
        title: "PDF Downloaded",
        description: "The FAQs PDF has been successfully downloaded.",
      });
      
      setShareDialogOpen(false);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredFAQs = faqs.filter((faq) => {
    const matchesSearch = !searchTerm || 
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = !selectedCategory || faq.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const categorizedFAQs = Object.keys(categories).map(categoryKey => ({
    key: categoryKey,
    config: categories[categoryKey],
    faqs: filteredFAQs.filter(faq => faq.category === categoryKey)
  })).filter(category => category.faqs.length > 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <h1 className="text-3xl font-bold text-black" data-testid="faqs-title">
              Frequently Asked Questions
            </h1>
            <InfoPopover
              content="Find answers to common questions about A-SAFE barrier systems, installation, and safety solutions."
              iconClassName="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-pointer"
            />
          </div>
          
          {/* Share Button */}
          <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-[#FFC72C] hover:bg-[#FFB300] text-black font-semibold"
                data-testid="share-faqs-button"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share FAQs
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Share FAQs</DialogTitle>
                <DialogDescription>
                  Choose how you'd like to share the A-SAFE FAQs document
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                {/* Email Option */}
                <Button
                  onClick={handleEmailShare}
                  variant="outline"
                  className="w-full justify-start hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                  data-testid="share-email-button"
                >
                  <Mail className="h-5 w-5 mr-3 text-blue-600" />
                  <div className="text-left">
                    <div className="font-semibold">Share via Email</div>
                    <div className="text-xs text-gray-500">Download PDF and attach to email</div>
                  </div>
                </Button>
                
                {/* WhatsApp Option */}
                <Button
                  onClick={handleWhatsAppShare}
                  variant="outline"
                  className="w-full justify-start hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                  data-testid="share-whatsapp-button"
                >
                  <MessageCircle className="h-5 w-5 mr-3 text-green-600" />
                  <div className="text-left">
                    <div className="font-semibold">Share via WhatsApp</div>
                    <div className="text-xs text-gray-500">Download PDF and share on WhatsApp</div>
                  </div>
                </Button>
                
                {/* Download Option */}
                <Button
                  onClick={handlePDFDownload}
                  variant="outline"
                  className="w-full justify-start hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                  data-testid="download-pdf-button"
                >
                  <Download className="h-5 w-5 mr-3 text-[#FFC72C]" />
                  <div className="text-left">
                    <div className="font-semibold">Download PDF</div>
                    <div className="text-xs text-gray-500">Save FAQs document to your device</div>
                  </div>
                </Button>
              </div>
              
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-gray-700 dark:text-gray-300">
                    <p className="font-semibold mb-1">Professional PDF Document</p>
                    <p className="text-xs">Includes all customer-relevant FAQs with A-SAFE branding, organized by category for easy reference.</p>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search FAQs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search questions and answers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 focus:ring-yellow-400 focus:border-yellow-400"
                  data-testid="search-faqs"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("");
                }}
                data-testid="clear-filters"
              >
                Clear Filters
              </Button>
            </div>

            {/* Category Filter Badges */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === "" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("")}
                className={selectedCategory === "" ? "bg-yellow-400 hover:bg-yellow-500" : ""}
                data-testid="category-all"
              >
                All Categories
              </Button>
              {Object.entries(categories).map(([key, config]) => {
                const Icon = config.icon;
                const hasResults = faqs.filter(faq => faq.category === key).some(faq =>
                  !searchTerm || 
                  faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
                );
                
                return (
                  <Button
                    key={key}
                    variant={selectedCategory === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(key)}
                    disabled={!hasResults}
                    className={`${selectedCategory === key ? "bg-yellow-400 hover:bg-yellow-500" : ""} ${!hasResults ? "opacity-50" : ""}`}
                    data-testid={`category-${key}`}
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {config.title}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* FAQ Results Count */}
        <div className="mb-6">
          <p className="text-sm text-gray-600">
            Showing {filteredFAQs.length} {filteredFAQs.length === 1 ? 'question' : 'questions'}
            {searchTerm && ` matching "${searchTerm}"`}
            {selectedCategory && ` in ${categories[selectedCategory].title}`}
          </p>
        </div>

        {/* FAQ Categories */}
        {categorizedFAQs.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <HelpCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">No FAQs Found</h3>
              <p className="text-gray-600 mb-4">
                No questions match your current search. Try different keywords or clear your filters.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("");
                }}
              >
                Show All FAQs
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {categorizedFAQs.map(({ key, config, faqs: categoryFAQs }) => {
              const Icon = config.icon;
              return (
                <div key={key} className="space-y-4">
                  {/* Category Header */}
                  <Card className="border-l-4 border-l-yellow-400">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <div className={`p-2 rounded-lg ${config.color}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <h2 className="text-xl font-bold text-black mb-1">
                            {config.title}
                          </h2>
                          <p className="text-sm text-gray-600">
                            {config.description}
                          </p>
                          <Badge className="mt-2 bg-[#FFC72C] dark:bg-[#FFC72C] text-black dark:text-black border-0 font-semibold">
                            {categoryFAQs.length} {categoryFAQs.length === 1 ? 'question' : 'questions'}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>

                  {/* Category FAQs */}
                  <div className="space-y-3 ml-4">
                    {categoryFAQs.map((faq, index) => {
                      const faqIndex = faqs.indexOf(faq);
                      const isExpanded = expandedItems.has(faqIndex);
                      
                      return (
                        <Card key={faqIndex} className="hover:shadow-md transition-shadow">
                          <CardHeader 
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors pb-3"
                            onClick={() => toggleExpanded(faqIndex)}
                            data-testid={`faq-question-${faqIndex}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-1">
                                <HelpCircle className="h-4 w-4 text-yellow-500" />
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold text-black text-left leading-relaxed">
                                  {faq.question}
                                </h3>
                              </div>
                              <div className="flex-shrink-0">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-gray-500" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-gray-500" />
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          
                          {isExpanded && (
                            <CardContent className="pt-0 pl-10">
                              <div className="border-l-2 border-gray-200 pl-4">
                                <p className="text-gray-700 text-sm leading-relaxed" data-testid={`faq-answer-${faqIndex}`}>
                                  {faq.answer}
                                </p>
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Contact CTA */}
        <Card className="mt-8 bg-yellow-50 border-yellow-200">
          <CardContent className="p-6 text-center">
            <HelpCircle className="h-8 w-8 text-yellow-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-black mb-2">
              Still have questions?
            </h3>
            <p className="text-gray-600 mb-4">
              Can't find the answer you're looking for? Our experts are here to help with personalized guidance.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="bg-yellow-400 hover:bg-yellow-500 text-black">
                <a href="/contact">Contact Our Experts</a>
              </Button>
              <Button variant="outline" asChild>
                <a 
                  href="https://wa.me/971503881285?text=Hello%20A-SAFE%20team%2C%0A%0AI%20have%20a%20question%20about%20A-SAFE%20products%20and%20would%20like%20to%20speak%20with%20an%20expert.%0A%0APlease%20provide%20information%20about%3A%0A%0A%0A%0AThank%20you%20for%20your%20assistance."
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp Support
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}