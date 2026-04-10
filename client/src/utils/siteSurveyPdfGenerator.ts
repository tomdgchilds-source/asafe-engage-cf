import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
// Import A-SAFE logo - Secondary Version with strapline for better visibility on colored backgrounds
import asafeLogoImg from '../../../attached_assets/A-SAFE_Logo_Strapline_Secondary_Version_1767686263231.png';

interface SurveyArea {
  id: string;
  zoneName: string;
  areaName: string;
  areaType: string;
  customApplicationArea?: string;
  issueDescription?: string;
  currentCondition: string;
  riskLevel: string;
  vehicleWeight?: number;
  vehicleSpeed?: number;
  impactAngle?: number;
  calculatedJoules?: number;
  photosUrls?: string[];
  recommendedProducts?: Array<{
    productId: string;
    productName: string;
    imageUrl?: string;
    impactRating?: number;
    reason?: string;
    price?: number;
  }>;
}

interface SiteSurvey {
  id: string;
  title: string;
  facilityName: string;
  facilityLocation: string;
  description?: string;
  overallRiskLevel?: string;
  totalAreasReviewed?: number;
  totalImpactCalculations?: number;
  riskBreakdown?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  conditionBreakdown?: {
    critical: number;
    damaged: number;
    unprotected: number;
    good: number;
  };
  createdAt?: string;
  updatedAt?: string;
  requestedByName?: string;
  requestedByPosition?: string;
  requestedByEmail?: string;
  requestedByMobile?: string;
  companyLogoUrl?: string;
}

// Risk & Benefit data
const applicationAreaData = {
  "WorkStation(s)": {
    risk: "Employees seated close to vehicle routes remain exposed while distracted. Basic, non-tested barriers are easily damaged and ineffective against real impacts.",
    benefit: "Impact-rated barriers shield staff, reduce repeat maintenance, and prevent costly downtime from accidents."
  },
  "Pedestrian Walkways": {
    risk: "Painted lines alone offer no protection. Pedestrians are exposed to vehicles, blocked routes, and poor driver visibility.",
    benefit: "Physical barriers safely segregate pedestrians, maintain evacuation routes, and improve MHE efficiency with fewer obstacles."
  },
  "Crossing Points / Entry & Exits": {
    risk: "Staff crossing high-traffic or blind spots are vulnerable. Painted markings fail to stop vehicles or distracted pedestrians.",
    benefit: "Guided crossings and barriers provide safe, visible, and controlled movement across vehicle zones."
  },
  "Racking": {
    risk: "Vehicle impacts compromise racking integrity, risking collapse, product loss, and costly replacement.",
    benefit: "Barriers preserve racking stability, prevent collapse, and protect both staff and stored goods."
  },
  "Shutter Doors": {
    risk: "Vehicle damage disrupts workflows, reduces loading capacity, and compromises environmental control.",
    benefit: "Robust barriers protect doors, maintain security, efficiency, and climate control, while avoiding repair downtime."
  },
  "Cold Store Walls": {
    risk: "Insulated panels are easily damaged, causing temperature loss, product spoilage, and high repair costs.",
    benefit: "Barriers prevent panel damage, preserve goods, reduce energy waste, and avoid operational disruption."
  },
  "Fire Hose Cabinets": {
    risk: "Impact damage can render firefighting equipment unusable, delaying emergency response.",
    benefit: "Barriers ensure cabinets remain accessible and operational, protecting staff, assets, and compliance."
  },
  "Columns (Structural / Mezzanine)": {
    risk: "Impacts from vehicles can damage structural or mezzanine columns, threatening building integrity.",
    benefit: "Impact-rated barriers absorb collisions, protect structures, and prevent costly facility repairs."
  },
  "Overhead Pipework / Cables": {
    risk: "Overhead utilities are often overlooked. Impacts can disrupt power, processing, or CCTV, causing downtime.",
    benefit: "Barriers protect critical infrastructure, ensuring uninterrupted power and operations."
  },
  "Loading Docks": {
    risk: "Forklifts risk falling 1–2m from raised docks, endangering operators and damaging equipment.",
    benefit: "Barriers eliminate fall hazards, safeguard operators, and maintain safe, continuous loading operations."
  },
  "Processing Machines": {
    risk: "Vehicle collisions can cause severe equipment damage, downtime, and injury or fatalities.",
    benefit: "Barriers protect machinery, prevent production halts, and safeguard employees from life-threatening risks."
  },
  "Electrical DBs": {
    risk: "Impact damage risks short circuits, outages, fires, and prolonged downtime from complex repairs.",
    benefit: "Barriers maintain power continuity, reduce outage risks, and mitigate fire hazards."
  }
};

// Helper function to load image and get dimensions
async function loadImageWithAspectRatio(imagePath: string): Promise<{ dataUrl: string; width: number; height: number }> {
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
}

interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  phone?: string;
  jobTitle?: string;
  company?: string;
}

export async function generateSiteSurveyPdf(
  survey: SiteSurvey,
  areas: SurveyArea[],
  userProfile?: UserProfile
): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);
  let yPosition = 0;
  let currentPageNum = 1;

  // A-SAFE Brand Colors
  const yellowColor: [number, number, number] = [255, 199, 44]; // #FFC72C
  const blackColor: [number, number, number] = [0, 0, 0]; // #000000
  const grayColor: [number, number, number] = [128, 128, 128];
  const lightGrayColor: [number, number, number] = [245, 245, 245];
  const darkGrayColor: [number, number, number] = [64, 64, 64];
  const borderGrayColor: [number, number, number] = [200, 200, 200];

  // Risk Level Colors
  const riskColors = {
    critical: [220, 38, 38] as [number, number, number], // Red
    high: [251, 146, 60] as [number, number, number], // Orange
    medium: [255, 199, 44] as [number, number, number], // Yellow (A-SAFE Yellow)
    low: [34, 197, 94] as [number, number, number] // Green
  };

  // Helper function to add page footer
  const addPageFooter = () => {
    const footerY = pageHeight - 15;
    
    // Footer separator line
    pdf.setDrawColor(...borderGrayColor);
    pdf.setLineWidth(0.3);
    pdf.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
    
    // A-SAFE contact information
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...darkGrayColor);
    
    // Left side - UAE office details
    pdf.text('A-SAFE UAE', margin, footerY);
    pdf.text('Office 220, Building A5, Dubai South Business Park', margin, footerY + 3);
    pdf.text('Tel: +971 (4) 8842 422', margin, footerY + 6);
    
    // Center - Website
    pdf.text('www.asafe.com', pageWidth / 2, footerY, { align: 'center' });
    
    // Right side - Page number and timestamp
    const timestamp = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    pdf.text(`Page ${currentPageNum}`, pageWidth - margin, footerY, { align: 'right' });
    pdf.text(timestamp, pageWidth - margin, footerY + 3, { align: 'right' });
  };

  // Footer height includes: separator line at footerY-5, contact info (3 lines ~9mm) + padding = ~20mm total
  const footerHeight = 22;
  const safeContentBottom = pageHeight - footerHeight;
  
  // Helper function to check if we need a new page
  const checkNewPage = async (requiredSpace: number, skipFooter: boolean = false) => {
    if (yPosition + requiredSpace > safeContentBottom) {
      if (!skipFooter) {
        addPageFooter();
      }
      pdf.addPage();
      currentPageNum++;
      yPosition = margin;
      await addPageHeader();
      return true;
    }
    return false;
  };

  // Helper function to add page header (for pages after the first)
  const addPageHeader = async () => {
    // Yellow accent bar at top
    pdf.setFillColor(...yellowColor);
    pdf.rect(0, 0, pageWidth, 4, 'F');
    
    // Small A-SAFE logo with proper aspect ratio
    try {
      const logoData = await loadImageWithAspectRatio(asafeLogoImg);
      // Calculate proper dimensions maintaining aspect ratio
      const logoMaxWidth = 35;
      const logoMaxHeight = 12;
      let logoDisplayWidth = logoMaxWidth;
      let logoDisplayHeight = logoMaxHeight;
      
      const aspectRatio = logoData.width / logoData.height;
      if (aspectRatio > logoMaxWidth / logoMaxHeight) {
        logoDisplayHeight = logoMaxWidth / aspectRatio;
      } else {
        logoDisplayWidth = logoMaxHeight * aspectRatio;
      }
      
      pdf.addImage(logoData.dataUrl, 'PNG', margin, 6, logoDisplayWidth, logoDisplayHeight);
    } catch (error) {
      console.error('Failed to load logo for header:', error);
    }
    
    // Report reference
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...grayColor);
    pdf.text(`Site Survey Report - ${survey.facilityName}`, pageWidth - margin, 10, { align: 'right' });
    pdf.text(`Ref: SS-${survey.id.substring(0, 8).toUpperCase()}`, pageWidth - margin, 14, { align: 'right' });
    
    yPosition = 22;
  };

  // COVER PAGE - Professional Design
  yPosition = 0;
  
  // Yellow header bar
  pdf.setFillColor(...yellowColor);
  pdf.rect(0, 0, pageWidth, 50, 'F');
  
  // Add A-SAFE logo with white background for visibility
  try {
    const logoData = await loadImageWithAspectRatio(asafeLogoImg);
    // Calculate proper dimensions maintaining aspect ratio
    const logoMaxWidth = 65;
    const logoMaxHeight = 22;
    let logoDisplayWidth = logoMaxWidth;
    let logoDisplayHeight = logoMaxHeight;
    
    const aspectRatio = logoData.width / logoData.height;
    if (aspectRatio > logoMaxWidth / logoMaxHeight) {
      logoDisplayHeight = logoMaxWidth / aspectRatio;
    } else {
      logoDisplayWidth = logoMaxHeight * aspectRatio;
    }
    
    // Add white rounded background behind logo for visibility
    const logoPadding = 4;
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(
      margin - logoPadding/2, 
      14 - logoPadding/2, 
      logoDisplayWidth + logoPadding, 
      logoDisplayHeight + logoPadding, 
      3, 3, 'F'
    );
    
    // Add the logo without stretching
    pdf.addImage(logoData.dataUrl, 'PNG', margin, 14, logoDisplayWidth, logoDisplayHeight);
  } catch (error) {
    console.error('Failed to load logo:', error);
  }
  
  // Report title on yellow background
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...blackColor);
  pdf.text('SITE SURVEY REPORT', pageWidth - margin, 25, { align: 'right' });
  
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Safety Assessment & Risk Analysis', pageWidth - margin, 35, { align: 'right' });
  
  yPosition = 60;
  
  // Client company logo if available
  if (survey.companyLogoUrl) {
    try {
      const companyLogoData = await loadImageWithAspectRatio(survey.companyLogoUrl);
      const logoMaxWidth = 70;
      const logoMaxHeight = 35;
      let logoDisplayWidth = logoMaxWidth;
      let logoDisplayHeight = logoMaxHeight;
      
      const aspectRatio = companyLogoData.width / companyLogoData.height;
      if (aspectRatio > logoMaxWidth / logoMaxHeight) {
        logoDisplayHeight = logoMaxWidth / aspectRatio;
      } else {
        logoDisplayWidth = logoMaxHeight * aspectRatio;
      }
      
      // Center the logo
      pdf.addImage(companyLogoData.dataUrl, 'PNG', 
        pageWidth / 2 - logoDisplayWidth / 2, 
        yPosition, 
        logoDisplayWidth, 
        logoDisplayHeight
      );
      yPosition += logoDisplayHeight + 15;
    } catch (error) {
      console.error('Failed to load company logo:', error);
    }
  }
  
  // Facility Information Card
  pdf.setFillColor(...lightGrayColor);
  pdf.roundedRect(margin, yPosition, contentWidth, 45, 4, 4, 'F');
  pdf.setDrawColor(...borderGrayColor);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(margin, yPosition, contentWidth, 45, 4, 4, 'S');
  
  yPosition += 10;
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...blackColor);
  pdf.text(survey.facilityName.toUpperCase(), pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += 10;
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'normal');
  pdf.text(survey.title, pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += 8;
  pdf.setFontSize(12);
  pdf.setTextColor(...darkGrayColor);
  pdf.text(survey.facilityLocation, pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += 8;
  const assessmentDate = survey.createdAt ? new Date(survey.createdAt).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }) : new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  pdf.text(`Assessment Date: ${assessmentDate}`, pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += 25;
  
  // Assessment Details Cards (side by side)
  const cardWidth = (contentWidth - 10) / 2;
  
  // Left Card - Facility Contact
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(margin, yPosition, cardWidth, 70, 4, 4, 'F');
  pdf.setDrawColor(...borderGrayColor);
  pdf.roundedRect(margin, yPosition, cardWidth, 70, 4, 4, 'S');
  
  // Yellow accent for header
  pdf.setFillColor(...yellowColor);
  pdf.roundedRect(margin, yPosition, cardWidth, 12, 4, 4, 'F');
  pdf.rect(margin, yPosition + 6, cardWidth, 6, 'F'); // Square bottom to connect
  
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...blackColor);
  pdf.text('FACILITY CONTACT', margin + cardWidth/2, yPosition + 8, { align: 'center' });
  
  let leftCardY = yPosition + 20;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...darkGrayColor);
  
  if (survey.requestedByName) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(survey.requestedByName, margin + 5, leftCardY);
    pdf.setFont('helvetica', 'normal');
    leftCardY += 6;
  }
  
  if (survey.requestedByPosition) {
    pdf.text(survey.requestedByPosition, margin + 5, leftCardY);
    leftCardY += 6;
  }
  
  if (survey.requestedByEmail) {
    pdf.text(survey.requestedByEmail, margin + 5, leftCardY);
    leftCardY += 6;
  }
  
  if (survey.requestedByMobile) {
    pdf.text(survey.requestedByMobile, margin + 5, leftCardY);
  }
  
  // Right Card - Assessment By
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(margin + cardWidth + 10, yPosition, cardWidth, 70, 4, 4, 'F');
  pdf.setDrawColor(...borderGrayColor);
  pdf.roundedRect(margin + cardWidth + 10, yPosition, cardWidth, 70, 4, 4, 'S');
  
  // Yellow accent for header
  pdf.setFillColor(...yellowColor);
  pdf.roundedRect(margin + cardWidth + 10, yPosition, cardWidth, 12, 4, 4, 'F');
  pdf.rect(margin + cardWidth + 10, yPosition + 6, cardWidth, 6, 'F');
  
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...blackColor);
  pdf.text('ASSESSMENT BY', margin + cardWidth + 10 + cardWidth/2, yPosition + 8, { align: 'center' });
  
  let rightCardY = yPosition + 20;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...darkGrayColor);
  
  if (userProfile) {
    const fullName = `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() || 'A-SAFE Consultant';
    pdf.setFont('helvetica', 'bold');
    pdf.text(fullName, margin + cardWidth + 15, rightCardY);
    pdf.setFont('helvetica', 'normal');
    rightCardY += 6;
    
    if (userProfile.jobTitle) {
      pdf.text(userProfile.jobTitle, margin + cardWidth + 15, rightCardY);
      rightCardY += 6;
    }
    
    pdf.text(userProfile.company || 'A-SAFE', margin + cardWidth + 15, rightCardY);
    rightCardY += 6;
    
    if (userProfile.email) {
      pdf.text(userProfile.email, margin + cardWidth + 15, rightCardY);
      rightCardY += 6;
    }
    
    if (userProfile.phone) {
      pdf.text(userProfile.phone, margin + cardWidth + 15, rightCardY);
    }
  } else {
    pdf.text('A-SAFE Safety Consultant', margin + cardWidth + 15, rightCardY);
  }
  
  // Report ID at bottom
  yPosition = pageHeight - 40;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...grayColor);
  pdf.text(`Report ID: SS-${survey.id.substring(0, 8).toUpperCase()}`, pageWidth / 2, yPosition, { align: 'center' });
  
  // Add footer to first page
  addPageFooter();

  // EXECUTIVE SUMMARY PAGE
  pdf.addPage();
  currentPageNum++;
  yPosition = margin;
  
  // Page header
  pdf.setFillColor(...yellowColor);
  pdf.rect(0, 0, pageWidth, 4, 'F');
  
  // Section title with yellow accent
  pdf.setFillColor(...yellowColor);
  pdf.roundedRect(margin, yPosition, 8, 12, 2, 2, 'F');
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...blackColor);
  pdf.text('EXECUTIVE SUMMARY', margin + 12, yPosition + 9);
  
  yPosition += 20;
  
  // Overall Risk Assessment Card
  const riskLevel = survey.overallRiskLevel || 'not assessed';
  const riskColor = riskColors[riskLevel as keyof typeof riskColors] || grayColor;
  
  // Risk level banner with gradient effect
  pdf.setFillColor(...riskColor);
  pdf.roundedRect(margin, yPosition, contentWidth, 20, 4, 4, 'F');
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('OVERALL FACILITY RISK LEVEL', pageWidth / 2, yPosition + 8, { align: 'center' });
  pdf.setFontSize(20);
  pdf.text(riskLevel.toUpperCase(), pageWidth / 2, yPosition + 16, { align: 'center' });
  
  yPosition += 30;
  
  // Key Metrics Cards - Professional Grid Layout
  const metricCardHeight = 35;
  const metricCardWidth = (contentWidth - 20) / 3;
  
  // Card 1 - Areas Reviewed
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(margin, yPosition, metricCardWidth, metricCardHeight, 4, 4, 'F');
  pdf.setDrawColor(...yellowColor);
  pdf.setLineWidth(2);
  pdf.roundedRect(margin, yPosition, metricCardWidth, metricCardHeight, 4, 4, 'S');
  
  pdf.setTextColor(...darkGrayColor);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('AREAS REVIEWED', margin + metricCardWidth/2, yPosition + 10, { align: 'center' });
  
  pdf.setTextColor(...blackColor);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text(String(survey.totalAreasReviewed || 0), margin + metricCardWidth/2, yPosition + 25, { align: 'center' });
  
  // Card 2 - Impact Calculations
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(margin + metricCardWidth + 10, yPosition, metricCardWidth, metricCardHeight, 4, 4, 'F');
  pdf.setDrawColor(...yellowColor);
  pdf.setLineWidth(2);
  pdf.roundedRect(margin + metricCardWidth + 10, yPosition, metricCardWidth, metricCardHeight, 4, 4, 'S');
  
  pdf.setTextColor(...darkGrayColor);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('IMPACT CALCULATIONS', margin + metricCardWidth + 10 + metricCardWidth/2, yPosition + 10, { align: 'center' });
  
  pdf.setTextColor(...blackColor);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text(String(survey.totalImpactCalculations || 0), margin + metricCardWidth + 10 + metricCardWidth/2, yPosition + 25, { align: 'center' });
  
  // Card 3 - Critical/High Risk Areas
  const criticalCount = (survey.riskBreakdown?.critical || 0) + (survey.riskBreakdown?.high || 0);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(margin + (metricCardWidth + 10) * 2, yPosition, metricCardWidth, metricCardHeight, 4, 4, 'F');
  const borderColor = criticalCount > 0 ? riskColors.high : yellowColor;
  pdf.setDrawColor(...borderColor);
  pdf.setLineWidth(2);
  pdf.roundedRect(margin + (metricCardWidth + 10) * 2, yPosition, metricCardWidth, metricCardHeight, 4, 4, 'S');
  
  pdf.setTextColor(...darkGrayColor);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('CRITICAL/HIGH RISK', margin + (metricCardWidth + 10) * 2 + metricCardWidth/2, yPosition + 10, { align: 'center' });
  
  pdf.setTextColor(...(criticalCount > 0 ? riskColors.high : blackColor));
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text(String(criticalCount), margin + (metricCardWidth + 10) * 2 + metricCardWidth/2, yPosition + 25, { align: 'center' });
  
  yPosition += metricCardHeight + 15;
  
  // Risk Distribution Analysis with Visual Chart
  if (survey.riskBreakdown) {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...blackColor);
    pdf.text('Risk Distribution Analysis', margin, yPosition);
    yPosition += 10;
    
    const total = (survey.riskBreakdown.critical || 0) + (survey.riskBreakdown.high || 0) + 
                  (survey.riskBreakdown.medium || 0) + (survey.riskBreakdown.low || 0);
    
    if (total > 0) {
      // Background for chart
      pdf.setFillColor(...lightGrayColor);
      pdf.roundedRect(margin, yPosition, contentWidth, 15, 2, 2, 'F');
      
      const barHeight = 15;
      let barX = margin;
      
      // Draw segments with proper rounding
      if (survey.riskBreakdown.critical > 0) {
        const width = (survey.riskBreakdown.critical / total) * contentWidth;
        pdf.setFillColor(...riskColors.critical);
        pdf.rect(barX, yPosition, width, barHeight, 'F');
        barX += width;
      }
      
      if (survey.riskBreakdown.high > 0) {
        const width = (survey.riskBreakdown.high / total) * contentWidth;
        pdf.setFillColor(...riskColors.high);
        pdf.rect(barX, yPosition, width, barHeight, 'F');
        barX += width;
      }
      
      if (survey.riskBreakdown.medium > 0) {
        const width = (survey.riskBreakdown.medium / total) * contentWidth;
        pdf.setFillColor(...riskColors.medium);
        pdf.rect(barX, yPosition, width, barHeight, 'F');
        barX += width;
      }
      
      if (survey.riskBreakdown.low > 0) {
        const width = (survey.riskBreakdown.low / total) * contentWidth;
        pdf.setFillColor(...riskColors.low);
        pdf.rect(barX, yPosition, width, barHeight, 'F');
      }
      
      yPosition += barHeight + 8;
      
      // Legend with percentages
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      let legendX = margin;
      const legendSpacing = contentWidth / 4;
      
      if (survey.riskBreakdown.critical > 0) {
        pdf.setFillColor(...riskColors.critical);
        pdf.circle(legendX + 2, yPosition, 2, 'F');
        const percentage = ((survey.riskBreakdown.critical / total) * 100).toFixed(0);
        pdf.setTextColor(...blackColor);
        pdf.text(`Critical: ${survey.riskBreakdown.critical} (${percentage}%)`, legendX + 6, yPosition + 1);
        legendX += legendSpacing;
      }
      
      if (survey.riskBreakdown.high > 0) {
        pdf.setFillColor(...riskColors.high);
        pdf.circle(legendX + 2, yPosition, 2, 'F');
        const percentage = ((survey.riskBreakdown.high / total) * 100).toFixed(0);
        pdf.text(`High: ${survey.riskBreakdown.high} (${percentage}%)`, legendX + 6, yPosition + 1);
        legendX += legendSpacing;
      }
      
      if (survey.riskBreakdown.medium > 0) {
        pdf.setFillColor(...riskColors.medium);
        pdf.circle(legendX + 2, yPosition, 2, 'F');
        const percentage = ((survey.riskBreakdown.medium / total) * 100).toFixed(0);
        pdf.text(`Medium: ${survey.riskBreakdown.medium} (${percentage}%)`, legendX + 6, yPosition + 1);
        legendX += legendSpacing;
      }
      
      if (survey.riskBreakdown.low > 0) {
        pdf.setFillColor(...riskColors.low);
        pdf.circle(legendX + 2, yPosition, 2, 'F');
        const percentage = ((survey.riskBreakdown.low / total) * 100).toFixed(0);
        pdf.text(`Low: ${survey.riskBreakdown.low} (${percentage}%)`, legendX + 6, yPosition + 1);
      }
      
      yPosition += 15;
    }
  }
  
  // Key Findings Summary
  yPosition += 10;
  pdf.setFillColor(255, 250, 240);
  pdf.roundedRect(margin, yPosition, contentWidth, 50, 4, 4, 'F');
  pdf.setDrawColor(...yellowColor);
  pdf.setLineWidth(1);
  pdf.roundedRect(margin, yPosition, contentWidth, 50, 4, 4, 'S');
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...blackColor);
  pdf.text('KEY FINDINGS', margin + 5, yPosition + 10);
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  const keyFindings = [
    `• ${areas.length} areas assessed for workplace safety risks`,
    `• ${areas.filter(a => a.calculatedJoules).length} impact energy calculations performed`,
    `• ${areas.filter(a => a.riskLevel === 'critical' || a.riskLevel === 'high').length} areas require immediate safety improvements`,
    `• ${areas.filter(a => a.recommendedProducts && a.recommendedProducts.length > 0).length} areas have safety solutions identified`
  ];
  
  let findingsY = yPosition + 18;
  keyFindings.forEach(finding => {
    pdf.text(finding, margin + 5, findingsY);
    findingsY += 7;
  });
  
  // Add footer
  addPageFooter();

  // DETAILED AREA ASSESSMENTS
  pdf.addPage();
  currentPageNum++;
  yPosition = margin;
  await addPageHeader();
  
  // Section title
  pdf.setFillColor(...yellowColor);
  pdf.roundedRect(margin, yPosition, 8, 12, 2, 2, 'F');
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...blackColor);
  pdf.text('DETAILED AREA ASSESSMENTS', margin + 12, yPosition + 9);
  yPosition += 20;

  // Process each area with professional formatting
  for (let i = 0; i < areas.length; i++) {
    const area = areas[i];
    
    // Check if we need a new page
    await checkNewPage(180);
    
    // Area Header Card
    pdf.setFillColor(...lightGrayColor);
    pdf.roundedRect(margin, yPosition, contentWidth, 12, 3, 3, 'F');
    
    // Area number badge
    pdf.setFillColor(...yellowColor);
    pdf.circle(margin + 8, yPosition + 6, 5, 'F');
    pdf.setTextColor(...blackColor);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(i + 1), margin + 8, yPosition + 7, { align: 'center' });
    
    // Area name
    pdf.setFontSize(14);
    pdf.text(area.areaName.toUpperCase(), margin + 18, yPosition + 8);
    
    // Zone info on the right
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...darkGrayColor);
    pdf.text(`Zone: ${area.zoneName}`, pageWidth - margin - 50, yPosition + 8);
    
    yPosition += 18;
    
    // Risk and Condition Status Cards (side by side)
    const statusCardWidth = (contentWidth - 10) / 2;
    
    // Risk Level Card
    const areaRiskColor = riskColors[area.riskLevel as keyof typeof riskColors] || grayColor;
    pdf.setFillColor(...areaRiskColor);
    pdf.roundedRect(margin, yPosition, statusCardWidth, 10, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`RISK LEVEL: ${area.riskLevel?.toUpperCase() || 'N/A'}`, margin + statusCardWidth/2, yPosition + 7, { align: 'center' });
    
    // Condition Card
    const conditionColors = {
      critical: riskColors.critical,
      damaged: riskColors.high,
      unprotected: riskColors.medium,
      good: riskColors.low
    };
    const conditionColor = conditionColors[area.currentCondition as keyof typeof conditionColors] || grayColor;
    pdf.setFillColor(...conditionColor);
    pdf.roundedRect(margin + statusCardWidth + 10, yPosition, statusCardWidth, 10, 3, 3, 'F');
    pdf.text(`CONDITION: ${area.currentCondition.toUpperCase()}`, margin + statusCardWidth + 10 + statusCardWidth/2, yPosition + 7, { align: 'center' });
    
    yPosition += 15;
    pdf.setTextColor(...blackColor);
    
    // Area Type and Issue Description
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Application Area: ${area.areaType === 'Other' ? area.customApplicationArea || 'Custom' : area.areaType}`, margin, yPosition);
    yPosition += 6;
    
    if (area.issueDescription) {
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(...darkGrayColor);
      const issueLines = pdf.splitTextToSize(`Issue Description: ${area.issueDescription}`, contentWidth);
      pdf.text(issueLines, margin, yPosition);
      yPosition += issueLines.length * 5 + 5;
      pdf.setTextColor(...blackColor);
    }
    
    // Impact Analysis Table (if applicable)
    if (area.calculatedJoules) {
      yPosition += 5;
      
      // Table header
      pdf.setFillColor(...yellowColor);
      pdf.roundedRect(margin, yPosition, contentWidth, 10, 3, 3, 'F');
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...blackColor);
      pdf.text('IMPACT ENERGY ANALYSIS', margin + 5, yPosition + 7);
      
      yPosition += 10;
      
      // Table body with borders
      pdf.setFillColor(255, 255, 255);
      pdf.rect(margin, yPosition, contentWidth, 25, 'F');
      pdf.setDrawColor(...borderGrayColor);
      pdf.setLineWidth(0.3);
      pdf.rect(margin, yPosition, contentWidth, 25, 'S');
      
      // Vertical lines for columns
      const colWidth = contentWidth / 4;
      pdf.line(margin + colWidth, yPosition, margin + colWidth, yPosition + 25);
      pdf.line(margin + colWidth * 2, yPosition, margin + colWidth * 2, yPosition + 25);
      pdf.line(margin + colWidth * 3, yPosition, margin + colWidth * 3, yPosition + 25);
      
      // Headers
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...darkGrayColor);
      pdf.text('Vehicle Weight', margin + colWidth/2, yPosition + 6, { align: 'center' });
      pdf.text('Vehicle Speed', margin + colWidth + colWidth/2, yPosition + 6, { align: 'center' });
      pdf.text('Impact Angle', margin + colWidth * 2 + colWidth/2, yPosition + 6, { align: 'center' });
      pdf.text('Impact Energy', margin + colWidth * 3 + colWidth/2, yPosition + 6, { align: 'center' });
      
      // Horizontal line
      pdf.line(margin, yPosition + 10, margin + contentWidth, yPosition + 10);
      
      // Values
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...blackColor);
      pdf.text(`${area.vehicleWeight || '-'} kg`, margin + colWidth/2, yPosition + 18, { align: 'center' });
      pdf.text(`${area.vehicleSpeed || '-'} km/h`, margin + colWidth + colWidth/2, yPosition + 18, { align: 'center' });
      pdf.text(`${area.impactAngle || '-'}°`, margin + colWidth * 2 + colWidth/2, yPosition + 18, { align: 'center' });
      
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...riskColors.high);
      pdf.text(`${area.calculatedJoules.toLocaleString()} J`, margin + colWidth * 3 + colWidth/2, yPosition + 18, { align: 'center' });
      pdf.setTextColor(...blackColor);
      
      yPosition += 30;
    }
    
    // Photo Cards Section (Professional Gallery)
    if (area.photosUrls && area.photosUrls.length > 0) {
      yPosition += 5;
      
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SITE PHOTOGRAPHS', margin, yPosition);
      yPosition += 8;
      
      // Display photos in professional cards (max 2 per row)
      const photoCardWidth = (contentWidth - 10) / 2;
      const photoCardHeight = 55;
      let photoX = margin;
      let photoCount = 0;
      
      for (const photoUrl of area.photosUrls.slice(0, 4)) { // Max 4 photos per area
        if (photoCount > 0 && photoCount % 2 === 0) {
          yPosition += photoCardHeight + 10;
          photoX = margin;
          await checkNewPage(photoCardHeight + 20);
        }
        
        try {
          const imgResponse = await fetch(photoUrl);
          if (imgResponse.ok) {
            const imgBlob = await imgResponse.blob();
            const imgDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(imgBlob);
            });
            
            // Photo card with shadow effect (simulated with gray background)
            pdf.setFillColor(...borderGrayColor);
            pdf.roundedRect(photoX + 1, yPosition + 1, photoCardWidth, photoCardHeight, 4, 4, 'F');
            
            // White card background
            pdf.setFillColor(255, 255, 255);
            pdf.roundedRect(photoX, yPosition, photoCardWidth, photoCardHeight, 4, 4, 'F');
            
            // Card border
            pdf.setDrawColor(...borderGrayColor);
            pdf.setLineWidth(0.5);
            pdf.roundedRect(photoX, yPosition, photoCardWidth, photoCardHeight, 4, 4, 'S');
            
            // Add image with padding
            const imagePadding = 3;
            const imageWidth = photoCardWidth - (imagePadding * 2);
            const imageHeight = photoCardHeight - 12; // Leave room for caption
            pdf.addImage(imgDataUrl, 'JPEG', 
              photoX + imagePadding, 
              yPosition + imagePadding, 
              imageWidth, 
              imageHeight
            );
            
            // Caption area
            pdf.setFillColor(...lightGrayColor);
            pdf.rect(photoX, yPosition + photoCardHeight - 8, photoCardWidth, 8, 'F');
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(...darkGrayColor);
            pdf.text(`Photo ${photoCount + 1}`, photoX + photoCardWidth/2, yPosition + photoCardHeight - 3, { align: 'center' });
            
            photoX += photoCardWidth + 10;
            photoCount++;
          }
        } catch (error) {
          console.error('Failed to load photo:', error);
        }
      }
      
      yPosition += photoCardHeight + 15;
    }
    
    // Risk & Benefit Analysis (Professional Table)
    if (area.areaType && area.areaType !== 'Other' && applicationAreaData[area.areaType as keyof typeof applicationAreaData]) {
      const areaData = applicationAreaData[area.areaType as keyof typeof applicationAreaData];
      
      // Table with professional styling
      pdf.setFillColor(...yellowColor);
      pdf.roundedRect(margin, yPosition, contentWidth, 8, 3, 3, 'F');
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...blackColor);
      pdf.text('RISK & BENEFIT ANALYSIS', margin + 5, yPosition + 5.5);
      
      yPosition += 8;
      
      // Risk section
      pdf.setFillColor(255, 245, 245); // Light red background
      pdf.rect(margin, yPosition, contentWidth/2, 35, 'F');
      pdf.setDrawColor(...riskColors.high);
      pdf.setLineWidth(1);
      pdf.rect(margin, yPosition, contentWidth/2, 35, 'S');
      
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...riskColors.high);
      pdf.text('CURRENT RISK', margin + 3, yPosition + 6);
      
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...blackColor);
      const riskLines = pdf.splitTextToSize(areaData.risk, contentWidth/2 - 6);
      pdf.text(riskLines, margin + 3, yPosition + 12);
      
      // Benefit section
      pdf.setFillColor(245, 255, 245); // Light green background
      pdf.rect(margin + contentWidth/2, yPosition, contentWidth/2, 35, 'F');
      pdf.setDrawColor(...riskColors.low);
      pdf.setLineWidth(1);
      pdf.rect(margin + contentWidth/2, yPosition, contentWidth/2, 35, 'S');
      
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...riskColors.low);
      pdf.text('SAFETY BENEFIT', margin + contentWidth/2 + 3, yPosition + 6);
      
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...blackColor);
      const benefitLines = pdf.splitTextToSize(areaData.benefit, contentWidth/2 - 6);
      pdf.text(benefitLines, margin + contentWidth/2 + 3, yPosition + 12);
      
      yPosition += 40;
    }
    
    // Recommended Products Table
    if (area.recommendedProducts && area.recommendedProducts.length > 0) {
      yPosition += 5;
      
      // Products header
      pdf.setFillColor(34, 197, 94); // Green
      pdf.roundedRect(margin, yPosition, contentWidth, 10, 3, 3, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RECOMMENDED SAFETY SOLUTIONS', margin + 5, yPosition + 7);
      
      yPosition += 15;
      
      // Products table
      for (const product of area.recommendedProducts) {
        await checkNewPage(30);
        
        // Product row with professional styling
        pdf.setFillColor(250, 250, 250);
        pdf.roundedRect(margin, yPosition, contentWidth, 25, 3, 3, 'F');
        pdf.setDrawColor(...borderGrayColor);
        pdf.setLineWidth(0.5);
        pdf.roundedRect(margin, yPosition, contentWidth, 25, 3, 3, 'S');
        
        // Product name
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...blackColor);
        pdf.text(product.productName, margin + 5, yPosition + 8);
        
        // Impact rating badge
        if (product.impactRating && area.calculatedJoules) {
          const safetyMargin = ((product.impactRating - area.calculatedJoules) / area.calculatedJoules * 100).toFixed(0);
          const marginValue = Number(safetyMargin);
          const marginColor = marginValue > 20 ? riskColors.low : [255, 152, 0] as [number, number, number];
          
          // Rating badge
          pdf.setFillColor(...marginColor);
          pdf.roundedRect(pageWidth - margin - 40, yPosition + 3, 35, 8, 2, 2, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${product.impactRating.toLocaleString()}J`, pageWidth - margin - 22.5, yPosition + 8, { align: 'center' });
          
          // Safety margin text
          pdf.setTextColor(...marginColor);
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`${safetyMargin}% margin`, pageWidth - margin - 22.5, yPosition + 14, { align: 'center' });
        }
        
        // Product description/reason
        if (product.reason) {
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(...darkGrayColor);
          const reasonLines = pdf.splitTextToSize(product.reason, contentWidth - 50);
          pdf.text(reasonLines, margin + 5, yPosition + 15);
        }
        
        yPosition += 30;
      }
    }
    
    // Area separator
    if (i < areas.length - 1) {
      yPosition += 10;
      pdf.setDrawColor(...lightGrayColor);
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;
    }
  }
  
  // Add footer to last assessment page
  addPageFooter();

  // RECOMMENDATIONS SUMMARY PAGE
  pdf.addPage();
  currentPageNum++;
  yPosition = margin;
  await addPageHeader();
  
  // Section title
  pdf.setFillColor(...yellowColor);
  pdf.roundedRect(margin, yPosition, 8, 12, 2, 2, 'F');
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...blackColor);
  pdf.text('IMPLEMENTATION ROADMAP', margin + 12, yPosition + 9);
  yPosition += 20;
  
  // Priority Action Plan
  pdf.setFillColor(255, 245, 240);
  pdf.roundedRect(margin, yPosition, contentWidth, 60, 4, 4, 'F');
  pdf.setDrawColor(...yellowColor);
  pdf.setLineWidth(1);
  pdf.roundedRect(margin, yPosition, contentWidth, 60, 4, 4, 'S');
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('PRIORITY ACTION PLAN', margin + 5, yPosition + 10);
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  const priorities = [
    '1. IMMEDIATE (0-30 days): Address all CRITICAL risk areas',
    '2. SHORT TERM (1-3 months): Implement solutions for HIGH risk zones',
    '3. MEDIUM TERM (3-6 months): Upgrade MEDIUM risk areas',
    '4. LONG TERM (6-12 months): Enhance LOW risk areas and preventive measures'
  ];
  
  let priorityY = yPosition + 20;
  priorities.forEach(priority => {
    pdf.text(priority, margin + 10, priorityY);
    priorityY += 10;
  });
  
  yPosition += 70;
  
  // Investment Summary Card
  pdf.setFillColor(240, 253, 244); // Light green
  pdf.roundedRect(margin, yPosition, contentWidth, 40, 4, 4, 'F');
  pdf.setDrawColor(...riskColors.low);
  pdf.setLineWidth(1);
  pdf.roundedRect(margin, yPosition, contentWidth, 40, 4, 4, 'S');
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RETURN ON SAFETY INVESTMENT', margin + 5, yPosition + 10);
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  const roiPoints = [
    '• Reduced accident rates and associated costs',
    '• Lower insurance premiums through risk mitigation',
    '• Improved productivity from safer work environment',
    '• Compliance with safety regulations and standards'
  ];
  
  let roiY = yPosition + 18;
  roiPoints.forEach(point => {
    pdf.text(point, margin + 10, roiY);
    roiY += 6;
  });
  
  yPosition += 50;
  
  // Contact for Quote
  pdf.setFillColor(...yellowColor);
  pdf.roundedRect(margin, yPosition, contentWidth, 30, 4, 4, 'F');
  
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...blackColor);
  pdf.text('READY TO ENHANCE YOUR WORKPLACE SAFETY?', pageWidth/2, yPosition + 10, { align: 'center' });
  
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Contact our safety experts for a detailed quotation', pageWidth/2, yPosition + 18, { align: 'center' });
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('+971 (4) 8842 422  |  sales@asafe.ae  |  www.asafe.com', pageWidth/2, yPosition + 26, { align: 'center' });
  
  // Add final footer
  addPageFooter();
  
  // Generate and download the PDF
  const reportName = `A-SAFE_Site_Survey_${survey.facilityName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(reportName);
}