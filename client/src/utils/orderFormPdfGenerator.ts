import jsPDF from 'jspdf';

interface SignatureField {
  name: string;
  jobTitle: string;
  mobile: string;
  signedAt?: string;
  signed?: boolean;
}

interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  impactRating?: number;
  pricingType?: string;
  imageUrl?: string;
  category?: string;
  applicationArea?: string;
  // Additional product details for comprehensive PDF
  productId?: string;
  pas13Video?: string;
  installationVideo?: string;
  impactTestVideo?: string;
  technicalGuideUrl?: string;
  installationGuideUrl?: string;
  certificateUrl?: string;
  caseStudies?: Array<{
    id: string;
    title: string;
    pdfUrl?: string;
  }>;
  referenceImages?: Array<{
    url: string;
    caption?: string;
  }>;
  notes?: string;
}

interface DiscountDetail {
  id: string;
  title: string;
  description: string;
  category: string;
  discountPercent: number;
}

interface OrderFormPdfData {
  orderNumber: string;
  customerName?: string;
  customerJobTitle?: string;
  customerCompany?: string;
  customerMobile?: string;
  customerEmail?: string;
  orderDate: string;
  items: OrderItem[];
  servicePackage?: string;
  discountOptions?: string[]; // For backward compatibility
  discountDetails?: DiscountDetail[]; // New field for detailed discount information
  totalAmount: number;
  currency: string;
  technicalSignature?: SignatureField;
  commercialSignature?: SignatureField;
  impactCalculation?: any;
  layoutDrawings?: any[];
  subtotal: number;
  discountAmount: number;
  servicePackageCost: number;
  deliveryCharge: number;
  installationCharge: number;
  installationComplexity?: 'simple' | 'standard' | 'complex';
  grandTotal: number;
  user?: any; // Add user field for accessing profile data
  isForUser?: boolean; // Add isForUser field
  recommendedCaseStudies?: any[]; // Related case studies
  recommendedResources?: any[]; // Related resources
  projectCaseStudies?: any[]; // Project-specific case studies
  linkedInDiscountAmount?: number; // LinkedIn social discount amount
  linkedInDiscountData?: any; // LinkedIn discount data including followers and commitment
}

// Helper to load image as base64
async function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        // Try to preserve original format if possible
        const dataURL = canvas.toDataURL('image/png', 1.0);
        resolve(dataURL);
      } else {
        resolve('');
      }
    };
    img.onerror = (error) => {
      console.error('Failed to load image:', url, error);
      resolve(''); // Return empty string if image fails
    };
    img.src = url;
  });
}

export async function generateOrderFormPDF(orderData: OrderFormPdfData, formatPrice: (value: number) => string) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);
  let yPos = margin;
  let currentPage = 1;
  
  // Helper function to format prices that are already in the order's currency
  const formatOrderPrice = (value: number) => {
    // Prices are already in the order's currency, just format the number
    const formattedNumber = Math.round(value).toLocaleString('en-US');
    return `${orderData.currency} ${formattedNumber}`;
  };
  
  // Helper function to format price values without duplicate currency
  const formatPriceValue = (value: number) => {
    // Just format the number, no currency symbol
    return Math.round(value).toLocaleString('en-US');
  };

  // A-SAFE Brand Colors
  const asafeYellow = { r: 255, g: 199, b: 44 };
  const asafeBlack = { r: 0, g: 0, b: 0 };
  const asafeGray = { r: 100, g: 100, b: 100 };
  const asafeLightGray = { r: 245, g: 245, b: 245 };

  // Determine company name based on currency
  const getCompanyName = () => {
    if (orderData.currency === 'SAR') {
      return 'ASAFE FOR SAFETY COMPANY';
    } else if (orderData.currency === 'AED') {
      return 'A SAFE DWC-LLC';
    }
    return 'A-SAFE MIDDLE EAST';
  };

  const divisionName = getCompanyName();
  const returnEmail = orderData.currency === 'SAR' ? 'sales@asafe.sa' : 'sales@asafe.ae';

  // Load logo image from public directory
  let logoBase64 = '';
  try {
    logoBase64 = await loadImageAsBase64('/asafe-logo.jpeg');
  } catch (error) {
    console.log('Logo loading failed, using text fallback');
  }

  // Load product images - handle authenticated URLs
  const productImages: { [key: string]: string } = {};
  for (const item of orderData.items) {
    if (item.imageUrl) {
      try {
        // Convert relative URLs to absolute and handle authenticated endpoints
        let imageUrl = item.imageUrl;
        if (imageUrl.startsWith('/')) {
          // For relative URLs, prepend the origin
          imageUrl = window.location.origin + imageUrl;
        } else if (imageUrl.startsWith('blob:')) {
          // For blob URLs, they should already be loaded
          productImages[item.productName] = imageUrl;
          continue;
        }
        
        // For authenticated endpoints, fetch through the API
        if (imageUrl.includes('/api/') || imageUrl.includes('/objects/')) {
          const response = await fetch(imageUrl, {
            credentials: 'include',
            headers: {
              'Accept': 'image/*'
            }
          });
          if (response.ok) {
            const blob = await response.blob();
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            productImages[item.productName] = base64;
          } else {
            console.log(`Failed to fetch authenticated image: ${imageUrl}`);
          }
        } else if (imageUrl.includes('/attached_assets/')) {
          // For attached assets, load them directly
          const base64 = await loadImageAsBase64(imageUrl);
          if (base64) {
            productImages[item.productName] = base64;
          } else {
            console.log(`Failed to load attached asset: ${imageUrl}`);
          }
        } else {
          // For regular URLs, use the standard loading
          const base64 = await loadImageAsBase64(imageUrl);
          if (base64) {
            productImages[item.productName] = base64;
          } else {
            console.log(`Failed to load image: ${imageUrl}`);
          }
        }
      } catch (error) {
        console.log(`Failed to load image for ${item.productName}:`, error);
      }
    }
  }

  // Helper function to add page number
  const addPageNumber = () => {
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Page ${currentPage}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  };

  // Helper function to check page overflow
  const checkPageOverflow = (requiredSpace: number) => {
    if (yPos + requiredSpace > pageHeight - 25) {
      addPageNumber();
      addFooter();
      pdf.addPage();
      currentPage++;
      yPos = margin;
      addHeader();
      return true;
    }
    return false;
  };

  // Helper function to add footer with professional formatting
  const addFooter = () => {
    // Add subtle footer separator line
    pdf.setDrawColor(230, 230, 230);
    pdf.setLineWidth(0.5);
    pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
    
    // Footer content with UAE office details
    const footerY = pageHeight - 15;
    pdf.setFontSize(9);
    
    // Office address on the left
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    pdf.text('Office 220, Building A5, Dubai South Business Park', margin, footerY);
    
    // Contact info in center
    const centerX = pageWidth / 2;
    
    // Phone with proper formatting
    pdf.setTextColor(0, 100, 200);
    const phoneText = '+971 (4) 8842 422';
    pdf.textWithLink(phoneText, centerX - 25, footerY, {
      url: 'tel:+97148842422'
    }, { align: 'center' });
    
    // Website and email on the right
    pdf.setTextColor(0, 100, 200);
    const websiteText = 'www.asafe.ae';
    pdf.textWithLink(websiteText, pageWidth - margin - 50, footerY, {
      url: 'https://www.asafe.ae'
    });
    
    // Email next to website
    const emailText = 'sales@asafe.ae';
    pdf.textWithLink(emailText, pageWidth - margin - 50, footerY - 4, {
      url: 'mailto:sales@asafe.ae'
    });
    
    // Small WhatsApp support note at bottom right
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(150, 150, 150);
    pdf.text('WhatsApp Support Available', pageWidth - margin, footerY + 3, { align: 'right' });
  };

  // Helper function to add A-SAFE header to each page - with clean white background
  const addHeader = () => {
    // Clean white header background (no orange fill)
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, 35, 'F');
    
    // Add yellow accent line at bottom of header
    pdf.setFillColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
    pdf.rect(0, 33, pageWidth, 2, 'F');
    
    // Add actual A-SAFE logo image
    if (logoBase64) {
      try {
        pdf.addImage(logoBase64, 'JPEG', margin, 8, 70, 19);
      } catch (e) {
        // Fallback to text if image fails
        pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
        pdf.setFontSize(20);
        pdf.setFont('helvetica', 'bold');
        pdf.text('A-SAFE', margin, 18);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.text('PIONEERING WORKPLACE SAFETY', margin, 24);
      }
    } else {
      // Fallback text logo
      pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('A-SAFE', margin, 18);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.text('PIONEERING WORKPLACE SAFETY', margin, 24);
    }
    
    // Order Form text on right
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text('ORDER FORM', pageWidth - margin, 20, { align: 'right' });
    
    yPos = 45;
  };

  // Helper function to add section header with clean underline
  const addSectionHeader = (title: string) => {
    checkPageOverflow(20);
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text(title.toUpperCase(), margin, yPos);
    
    // Yellow underline
    pdf.setDrawColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
    pdf.setFillColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
    pdf.rect(margin, yPos + 2, contentWidth, 3, 'F');
    yPos += 12;
  };

  // Start document with header
  addHeader();

  // Project Reference Box - Clean layout without overlapping
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(220, 220, 220);
  pdf.setLineWidth(0.3);
  pdf.rect(margin, yPos, contentWidth, 30, 'FD');
  
  // Project details in clean two-column format
  const leftCol = margin + 5;
  const rightCol = margin + contentWidth / 2;
  const labelWidth = 28;
  
  pdf.setFontSize(9);
  
  // Left column
  let detailY = yPos + 7;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Project Ref:', leftCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  const projectRef = (orderData.customerCompany || 'N/A').substring(0, 25);
  pdf.text(projectRef, leftCol + labelWidth, detailY);
  
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Date:', leftCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text(new Date(orderData.orderDate).toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  }), leftCol + labelWidth, detailY);
  
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Rev:', leftCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text('1', leftCol + labelWidth, detailY);
  
  // Right column
  detailY = yPos + 7;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Quote Ref:', rightCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text(orderData.orderNumber, rightCol + labelWidth, detailY);
  
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Drawing Ref:', rightCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text('N/A', rightCol + labelWidth, detailY);
  
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Option:', rightCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text('1', rightCol + labelWidth, detailY);
  
  yPos += 35;

  // Customer Information Section - Clean layout
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(220, 220, 220);
  pdf.setLineWidth(0.3);
  // Increase height to accommodate position field if present
  const customerBoxHeight = orderData.user?.jobTitle ? 50 : 45;
  pdf.rect(margin, yPos, contentWidth, customerBoxHeight, 'FD');
  
  // Client details - clean two-column layout
  detailY = yPos + 7;
  
  // Left column - Client info
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Client Name:', leftCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  const clientCompany = (orderData.customerCompany || 'N/A').substring(0, 25);
  pdf.text(clientCompany, leftCol + labelWidth, detailY);
  
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Attention:', leftCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text(orderData.customerName || 'N/A', leftCol + labelWidth, detailY);
  
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Email:', leftCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const email = orderData.customerEmail || 'N/A';
  if (email !== 'N/A') {
    pdf.setTextColor(0, 100, 200);
    pdf.textWithLink(email.substring(0, 28), leftCol + labelWidth, detailY, {
      url: `mailto:${email}`
    });
  } else {
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text(email, leftCol + labelWidth, detailY);
  }
  
  pdf.setFontSize(9);
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Mobile:', leftCol, detailY);
  pdf.setFont('helvetica', 'normal');
  // Use customer's mobile number for the client section
  const clientMobile = orderData.customerMobile || 'N/A';
  if (clientMobile !== 'N/A') {
    // Phone link
    pdf.setTextColor(0, 100, 200);
    pdf.textWithLink(clientMobile, leftCol + labelWidth, detailY, {
      url: `tel:${clientMobile.replace(/\s+/g, '')}`
    });
    // WhatsApp link
    pdf.setTextColor(37, 211, 102);
    pdf.setFontSize(7);
    pdf.textWithLink(' 💬', leftCol + labelWidth + pdf.getTextWidth(clientMobile), detailY, {
      url: `https://wa.me/${clientMobile.replace(/[^0-9]/g, '')}`
    });
    pdf.setFontSize(9);
  } else {
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text(clientMobile, leftCol + labelWidth, detailY);
  }
  
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Tel:', leftCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text('N/A', leftCol + labelWidth, detailY);
  
  // Right column - A-SAFE representative with profile image
  detailY = yPos + 7;
  
  // Add user profile image if available (circular format)
  let profileImageOffset = 0;
  if (orderData.user?.profileImageUrl && orderData.user.profileImageUrl !== '/attached_assets/default-avatar.svg') {
    try {
      // Load profile image
      const profileImageBase64 = await loadImageAsBase64(orderData.user.profileImageUrl);
      if (profileImageBase64) {
        // Create a circular profile image (25x25mm) on the right side
        const profileImgSize = 25;
        const profileImgX = pageWidth - margin - profileImgSize - 5;
        const profileImgY = yPos + 5;
        
        // Create circular profile image effect
        const centerX = profileImgX + profileImgSize / 2;
        const centerY = profileImgY + profileImgSize / 2;
        const radius = profileImgSize / 2;
        
        // Add the profile image (it will be square but we'll add circular border)
        pdf.addImage(profileImageBase64, 'PNG', profileImgX, profileImgY, profileImgSize, profileImgSize);
        
        // Draw thick white border to create circular effect
        pdf.setDrawColor(255, 255, 255);
        pdf.setLineWidth(3);
        
        // Draw white corners to hide square edges
        const cornerSize = profileImgSize * 0.3;
        pdf.setFillColor(255, 255, 255);
        // Top-left corner
        pdf.rect(profileImgX - 1, profileImgY - 1, cornerSize, cornerSize, 'F');
        // Top-right corner
        pdf.rect(profileImgX + profileImgSize - cornerSize + 1, profileImgY - 1, cornerSize, cornerSize, 'F');
        // Bottom-left corner
        pdf.rect(profileImgX - 1, profileImgY + profileImgSize - cornerSize + 1, cornerSize, cornerSize, 'F');
        // Bottom-right corner
        pdf.rect(profileImgX + profileImgSize - cornerSize + 1, profileImgY + profileImgSize - cornerSize + 1, cornerSize, cornerSize, 'F');
        
        // Draw circular border on top
        pdf.setDrawColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
        pdf.setLineWidth(1.5);
        pdf.circle(centerX, centerY, radius, 'D');
        
        // Add inner circle for better visual effect
        pdf.setDrawColor(220, 220, 220);
        pdf.setLineWidth(0.3);
        pdf.circle(centerX, centerY, radius - 1, 'D');
        
        // Adjust the right column position to avoid overlapping with image
        profileImageOffset = profileImgSize + 10;
      }
    } catch (error) {
      console.log('Failed to load user profile image:', error);
    }
  }
  
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Division:', rightCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  // Show division based on currency or user company
  const userDivision = divisionName; // Always use A-SAFE KSA/UAE based on currency
  pdf.text(userDivision, rightCol + labelWidth, detailY);
  
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Name:', rightCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  // Use the app user's full name from profile data
  const repName = orderData.user ? `${orderData.user.firstName || ''} ${orderData.user.lastName || ''}`.trim() || orderData.user.email?.split('@')[0] || 'Sales Team' : 'Sales Team';
  const maxRepNameWidth = contentWidth / 2 - labelWidth - (profileImageOffset > 0 ? 30 : 0);
  const repNameLines = pdf.splitTextToSize(repName, maxRepNameWidth);
  pdf.text(repNameLines[0], rightCol + labelWidth, detailY);
  
  // Add Position/Job Title if available
  if (orderData.user?.jobTitle) {
    detailY += 6;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
    pdf.text('Position:', rightCol, detailY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    const maxTitleWidth = contentWidth / 2 - labelWidth - (profileImageOffset > 0 ? 30 : 0);
    const titleLines = pdf.splitTextToSize(orderData.user.jobTitle, maxTitleWidth);
    pdf.text(titleLines[0], rightCol + labelWidth, detailY);
  }
  
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Email:', rightCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  // Use the app user's email from profile data
  const userEmail = orderData.user?.email || returnEmail;
  const maxEmailWidth = contentWidth / 2 - labelWidth - (profileImageOffset > 0 ? 30 : 0);
  const emailLines = pdf.splitTextToSize(userEmail, maxEmailWidth);
  pdf.setTextColor(0, 100, 200);
  pdf.textWithLink(emailLines[0], rightCol + labelWidth, detailY, {
    url: `mailto:${userEmail}`
  });
  
  pdf.setFontSize(9);
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Mobile:', rightCol, detailY);
  pdf.setFont('helvetica', 'normal');
  // Use the app user's mobile number from profile data
  const userMobileForRep = orderData.user?.phone || (divisionName === 'ASAFE FOR SAFETY COMPANY' ? '+966 50 123 4567' : '+971 50 123 4567');
  pdf.setTextColor(0, 100, 200);
  pdf.textWithLink(userMobileForRep, rightCol + labelWidth, detailY, {
    url: `tel:${userMobileForRep.replace(/\s+/g, '')}`
  });
  // WhatsApp link for rep
  pdf.setTextColor(37, 211, 102);
  pdf.setFontSize(7);
  pdf.textWithLink(' 💬', rightCol + labelWidth + pdf.getTextWidth(userMobileForRep), detailY, {
    url: `https://wa.me/${userMobileForRep.replace(/[^0-9]/g, '')}`
  });
  pdf.setFontSize(9);
  
  detailY += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Tel:', rightCol, detailY);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  // Use office number based on division
  const officePhone = divisionName === 'ASAFE FOR SAFETY COMPANY' ? '+966 13 857 3111' : '+971 4 884 2422';
  pdf.text(officePhone, rightCol + labelWidth, detailY);
  
  yPos += (orderData.user?.jobTitle ? 55 : 50);

  // PROPOSED SOLUTIONS header
  checkPageOverflow(30);
  addSectionHeader('PROPOSED SOLUTIONS');

  // Group items by application area/category
  const groupedItems: { [key: string]: OrderItem[] } = {};
  orderData.items.forEach(item => {
    const key = item.applicationArea || item.category || 'Rack Protection';
    const formattedKey = key.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    if (!groupedItems[formattedKey]) {
      groupedItems[formattedKey] = [];
    }
    groupedItems[formattedKey].push(item);
  });

  // Display items by group with LARGER product images (3x bigger)
  let groupLetter = 65; // ASCII for 'A'
  Object.entries(groupedItems).forEach(([groupName, items]) => {
    checkPageOverflow(30);
    
    // Group header with letter designation
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text(`${String.fromCharCode(groupLetter++)}: ${groupName}`, margin, yPos);
    yPos += 10;
    
    items.forEach((item) => {
      checkPageOverflow(50); // Increased space for larger images
      
      // Product box with LARGER image
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.3);
      
      // Main product container - increased height for larger image
      pdf.rect(margin, yPos, contentWidth, 45, 'FD');
      
      // Product image positioning with proper aspect ratio
      const maxImageHeight = 35; // Maximum height for the image
      const maxImageWidth = 50; // Maximum width for the image (wider to accommodate landscape images)
      const imgX = margin + 2;
      const imgY = yPos + 2;
      
      // Add product image if available
      if (productImages && productImages[item.productName]) {
        try {
          let imageFormat = 'PNG'; // Default format
          
          // Determine image format from data URL
          if (productImages[item.productName].includes('data:image/png')) {
            imageFormat = 'PNG';
          } else if (productImages[item.productName].includes('data:image/jpeg') || 
                     productImages[item.productName].includes('data:image/jpg')) {
            imageFormat = 'JPEG';
          }
          
          // Create a temporary image to get actual dimensions
          const img = new Image();
          img.src = productImages[item.productName];
          
          // Calculate aspect ratio and proper dimensions
          let imgWidth = maxImageWidth;
          let imgHeight = maxImageHeight;
          
          // Most A-SAFE product images are wider than tall (landscape orientation)
          // Use width as the constraint and adjust height to maintain aspect ratio
          const aspectRatio = 1.5; // Default aspect ratio for A-SAFE products (wider than tall)
          imgHeight = imgWidth / aspectRatio;
          
          // If calculated height exceeds max, constrain by height instead
          if (imgHeight > maxImageHeight) {
            imgHeight = maxImageHeight;
            imgWidth = imgHeight * aspectRatio;
          }
          
          // Center the image vertically within the allocated space
          const centerY = imgY + (maxImageHeight - imgHeight) / 2;
          
          // Add the image with calculated dimensions to maintain aspect ratio
          pdf.addImage(productImages[item.productName], imageFormat, imgX, centerY, imgWidth, imgHeight);
        } catch (e) {
          console.log(`Failed to add image for ${item.productName}:`, e);
          // If image fails, show placeholder
          pdf.setFillColor(250, 250, 250);
          pdf.rect(margin + 2, yPos + 2, maxImageWidth, maxImageHeight, 'FD');
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineWidth(0.3);
          pdf.setFontSize(8);
          pdf.setTextColor(150, 150, 150);
          pdf.text('Image', margin + maxImageWidth/2 + 2, yPos + maxImageHeight/2 + 2, { align: 'center' });
        }
      } else {
        // Placeholder if no image
        pdf.setFillColor(250, 250, 250);
        pdf.rect(margin + 2, yPos + 2, maxImageWidth, maxImageHeight, 'FD');
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.3);
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text('No Image', margin + maxImageWidth/2 + 2, yPos + maxImageHeight/2 + 2, { align: 'center' });
      }
      
      // Product details - adjusted position for wider image
      const textX = margin + maxImageWidth + 10;
      
      // Solution name
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
      pdf.text('Solution:', textX, yPos + 8);
      
      pdf.setFont('helvetica', 'normal');
      const productName = item.productName;
      const maxProductLength = 35;
      const displayName = productName.length > maxProductLength 
        ? productName.substring(0, maxProductLength) + '...'
        : productName;
      pdf.text(displayName, textX + 20, yPos + 8);
      
      // Product Details and Resources section with hyperlinks
      const linkY = yPos + 8;
      let linkX = pageWidth - margin - 3;
      
      // Product Details link
      pdf.setTextColor(0, 100, 200);
      pdf.setFontSize(8);
      const productDetailsText = 'Product Details';
      pdf.textWithLink(productDetailsText, linkX - pdf.getTextWidth(productDetailsText), linkY, {
        url: `https://asafe.ae/products/${item.productId || item.productName.toLowerCase().replace(/\s+/g, '-')}`
      });
      
      // Add additional resource links if available
      if (item.technicalGuideUrl || item.installationGuideUrl || item.pas13Video) {
        let resourceY = yPos + 15;
        
        // Technical Guide link
        if (item.technicalGuideUrl) {
          pdf.setFontSize(7);
          pdf.setTextColor(0, 100, 200);
          const techGuideText = '📄 Technical Guide';
          pdf.textWithLink(techGuideText, pageWidth - margin - 50, resourceY, {
            url: item.technicalGuideUrl
          });
          resourceY += 5;
        }
        
        // Installation Guide link
        if (item.installationGuideUrl) {
          pdf.setFontSize(7);
          pdf.setTextColor(0, 100, 200);
          const installGuideText = '📋 Installation Guide';
          pdf.textWithLink(installGuideText, pageWidth - margin - 50, resourceY, {
            url: item.installationGuideUrl
          });
          resourceY += 5;
        }
        
        // PAS13 Video link
        if (item.pas13Video) {
          pdf.setFontSize(7);
          pdf.setTextColor(0, 100, 200);
          const videoText = '🎥 Impact Test Video';
          pdf.textWithLink(videoText, pageWidth - margin - 50, resourceY, {
            url: item.pas13Video
          });
        }
      }
      
      // Impact rating if available
      if (item.impactRating) {
        pdf.setFillColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
        pdf.roundedRect(textX, yPos + 15, 30, 8, 1, 1, 'F');
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
        pdf.text(`${item.impactRating}J`, textX + 15, yPos + 20, { align: 'center' });
      }
      
      // Quantity and pricing
      const priceY = yPos + 30;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
      
      const qtyText = `Qty: ${item.quantity} ${item.pricingType === 'linear_meter' ? 'meters' : 'units'}`;
      pdf.text(qtyText, textX, priceY);
      
      pdf.text(`Unit: ${orderData.currency} ${formatPriceValue(item.unitPrice)}`, textX + 50, priceY);
      
      // Total price
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
      pdf.text(`Total: ${orderData.currency} ${formatPriceValue(item.totalPrice)}`, pageWidth - margin - 3, priceY, { align: 'right' });
      
      yPos += 50; // Increased spacing for larger images
    });
    
    yPos += 5;
  });

  // RECIPROCAL VALUE COMMITMENTS section - moved after products for better flow
  if (orderData.discountDetails && orderData.discountDetails.length > 0 && orderData.discountAmount > 0) {
    checkPageOverflow(30);
    
    // Section header with gift icon
    pdf.setFillColor(255, 255, 255);
    pdf.rect(margin, yPos, contentWidth, 12, 'F');
    
    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text('Reciprocal Value Commitments', margin + 2, yPos + 8);
    
    // Unlocked Savings button placeholder
    pdf.setDrawColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
    pdf.setFillColor(255, 255, 255);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(pageWidth - margin - 42, yPos + 3, 40, 7, 1, 1, 'FD');
    pdf.setFontSize(8);
    pdf.setTextColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
    pdf.text('Unlocked Savings', pageWidth - margin - 22, yPos + 7, { align: 'center' });
    
    yPos += 15;
    
    // Calculate total savings percentage
    const totalSavingsPercent = orderData.discountDetails.reduce((sum, d) => sum + d.discountPercent, 0);
    
    // List each discount item like in cart
    orderData.discountDetails.forEach((discount: any) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
      pdf.text(discount.title, margin + 2, yPos);
      
      // Percentage badge
      pdf.setFillColor(255, 243, 224); // Light yellow background
      pdf.roundedRect(pageWidth - margin - 25, yPos - 4, 23, 6, 1, 1, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(184, 134, 11); // Yellow text
      pdf.text(`${discount.discountPercent}% Off`, pageWidth - margin - 13.5, yPos, { align: 'center' });
      
      yPos += 7;
    });
    
    yPos += 5;
    
    // Total Savings Applied line
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text('Total Savings Applied:', margin + 2, yPos);
    
    // Total percentage on the right
    pdf.setTextColor(34, 197, 94); // Green color for total
    pdf.text(`${totalSavingsPercent}%`, pageWidth - margin - 2, yPos, { align: 'right' });
    
    yPos += 15;
  }

  // QUOTE TO SUPPLY section on new page
  pdf.addPage();
  currentPage++;
  addHeader();
  addSectionHeader('QUOTE TO SUPPLY');

  // Table header with clean design
  pdf.setFillColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.rect(margin, yPos, contentWidth, 8, 'F');
  
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text('Item Description', margin + 2, yPos + 5);
  pdf.text('Length (m)', margin + 100, yPos + 5, { align: 'center' });
  pdf.text('Qty.', margin + 120, yPos + 5, { align: 'center' });
  pdf.text('Unit Price', margin + 140, yPos + 5, { align: 'center' });
  pdf.text(`Total (${orderData.currency})`, pageWidth - margin - 2, yPos + 5, { align: 'right' });
  yPos += 10;

  // Table rows with alternating colors - FIXED currency display
  orderData.items.forEach((item, index) => {
    checkPageOverflow(8);
    
    // Alternate row colors for better readability
    if (index % 2 === 0) {
      pdf.setFillColor(250, 250, 250);
      pdf.rect(margin, yPos - 1, contentWidth, 7, 'F');
    }
    
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    
    // Item name with truncation
    const maxNameLength = 50;
    const itemName = item.productName.length > maxNameLength 
      ? item.productName.substring(0, maxNameLength - 3) + '...' 
      : item.productName;
    
    pdf.text(itemName, margin + 2, yPos + 3);
    pdf.text(item.pricingType === 'linear_meter' ? item.quantity.toString() : '-', margin + 100, yPos + 3, { align: 'center' });
    pdf.text(item.quantity.toString(), margin + 120, yPos + 3, { align: 'center' });
    
    // Unit price - use formatPriceValue to avoid currency prefix issues
    const unitPriceValue = formatPriceValue(item.unitPrice);
    pdf.text(`${orderData.currency} ${unitPriceValue}`, margin + 140, yPos + 3, { align: 'center' });
    
    // Total price - use formatPriceValue to avoid currency prefix issues
    const totalPriceValue = formatPriceValue(item.totalPrice);
    pdf.text(`${orderData.currency} ${totalPriceValue}`, pageWidth - margin - 2, yPos + 3, { align: 'right' });
    
    yPos += 7;
  });

  // Summary section with clean layout
  yPos += 10;
  checkPageOverflow(90);
  
  // Divider line
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.5);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 7;
  
  // Summary items with proper spacing and no overflow
  pdf.setFontSize(10);
  
  // Goods Total
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text('Goods Total', margin, yPos);
  pdf.text(`${orderData.currency}`, pageWidth - margin - 45, yPos, { align: 'right' });
  pdf.text(formatPriceValue(orderData.subtotal), pageWidth - margin - 2, yPos, { align: 'right' });
  yPos += 10;
  
  // Reciprocal discounts if applicable
  if ((orderData.reciprocalDiscountAmount && orderData.reciprocalDiscountAmount > 0) || orderData.discountDetails?.length > 0) {
    // If we have detailed discount information, show each discount
    if (orderData.discountDetails && orderData.discountDetails.length > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
      pdf.text('Applied Discounts:', margin, yPos);
      yPos += 8;
      
      // Group discounts by category for better organization
      const discountsByCategory = orderData.discountDetails.reduce((acc: any, discount: any) => {
        if (!acc[discount.category]) {
          acc[discount.category] = [];
        }
        acc[discount.category].push(discount);
        return acc;
      }, {});
      
      // Display each category and its discounts
      Object.entries(discountsByCategory).forEach(([category, discounts]: [string, any]) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
        pdf.text(`${category}:`, margin + 5, yPos);
        yPos += 6;
        
        discounts.forEach((discount: any) => {
          pdf.setFontSize(8);
          pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
          const discountText = `• ${discount.title}`;
          pdf.text(discountText, margin + 10, yPos);
          
          // Show discount percentage
          pdf.setTextColor(34, 197, 94);
          pdf.text(`${discount.discountPercent}%`, pageWidth - margin - 45, yPos, { align: 'right' });
          yPos += 5;
          
          // Show description in smaller gray text
          if (discount.description) {
            pdf.setFontSize(7);
            pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
            const descLines = pdf.splitTextToSize(discount.description, contentWidth - 35);
            descLines.forEach((line: string) => {
              pdf.text(line, margin + 15, yPos);
              yPos += 4;
            });
          }
          yPos += 2;
        });
      });
      
      // Show reciprocal discount amount
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
      pdf.text('Total Reciprocal Savings', margin, yPos);
      pdf.text(`${orderData.currency}`, pageWidth - margin - 45, yPos, { align: 'right' });
      pdf.setTextColor(34, 197, 94);
      pdf.text('-' + formatPriceValue(orderData.reciprocalDiscountAmount || orderData.discountAmount), pageWidth - margin - 2, yPos, { align: 'right' });
      yPos += 10;
    } else {
      // Fallback to simple display if no detailed info
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.text('Special Project Savings', margin, yPos);
      pdf.text(`${orderData.currency}`, pageWidth - margin - 45, yPos, { align: 'right' });
      pdf.setTextColor(34, 197, 94);
      pdf.text('-' + formatPriceValue(orderData.discountAmount), pageWidth - margin - 2, yPos, { align: 'right' });
      yPos += 10;
    }
    
  }
  
  // Partner discount if applicable
  if (orderData.partnerDiscountPercent && orderData.partnerDiscountPercent > 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(128, 90, 213); // Purple color for partner discount
    pdf.text(`Partner Rate (${orderData.partnerDiscountPercent}%)`, margin, yPos);
    pdf.text(`${orderData.currency}`, pageWidth - margin - 45, yPos, { align: 'right' });
    pdf.text('-' + formatPriceValue(orderData.partnerDiscountAmount), pageWidth - margin - 2, yPos, { align: 'right' });
    yPos += 10;
  }
  
  // LinkedIn Social Reciprocity discount if applicable
  if (orderData.linkedInDiscountAmount && orderData.linkedInDiscountAmount > 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(0, 119, 181); // LinkedIn blue color
    const linkedInText = orderData.linkedInDiscountData?.followers 
      ? `LinkedIn Social Reciprocity (${orderData.linkedInDiscountData.followers.toLocaleString()} followers)`
      : 'LinkedIn Social Reciprocity';
    pdf.text(linkedInText, margin, yPos);
    pdf.text(`${orderData.currency}`, pageWidth - margin - 45, yPos, { align: 'right' });
    pdf.text('-' + formatPriceValue(orderData.linkedInDiscountAmount), pageWidth - margin - 2, yPos, { align: 'right' });
    yPos += 10;
  }
  
  // Show total after all discounts if any discount was applied
  if (orderData.discountAmount > 0) {
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Goods Total after Savings', margin, yPos);
    pdf.text(`${orderData.currency}`, pageWidth - margin - 45, yPos, { align: 'right' });
    pdf.text(formatPriceValue(orderData.subtotal - orderData.discountAmount), pageWidth - margin - 2, yPos, { align: 'right' });
    yPos += 10;
  }
  
  // Service Package
  if (orderData.servicePackageCost > 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(orderData.servicePackage || 'Service Package', margin, yPos);
    pdf.text(`${orderData.currency}`, pageWidth - margin - 45, yPos, { align: 'right' });
    pdf.text(formatPriceValue(orderData.servicePackageCost), pageWidth - margin - 2, yPos, { align: 'right' });
    yPos += 10;
  }
  
  // Delivery and Installation - improved spacing to prevent overlap
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Material Packing, Customs Documentation', margin, yPos);
  yPos += 6;
  // Don't show complexity text in parentheses in summary section
  pdf.text('And Door to Door Delivery + Installation', margin, yPos);
  pdf.text(`${orderData.currency}`, pageWidth - margin - 45, yPos, { align: 'right' });
  const deliveryInstallTotal = orderData.deliveryCharge + orderData.installationCharge;
  pdf.text(formatPriceValue(deliveryInstallTotal), pageWidth - margin - 2, yPos, { align: 'right' });
  yPos += 12;
  
  // Grand Total with highlighted background
  pdf.setFillColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
  pdf.rect(margin, yPos - 3, contentWidth, 10, 'F');
  
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text('Grand Total (Ex. VAT)', margin + 5, yPos + 3);
  pdf.text(`${orderData.currency}`, pageWidth - margin - 45, yPos + 3, { align: 'right' });
  pdf.text(formatPriceValue(orderData.grandTotal), pageWidth - margin - 2, yPos + 3, { align: 'right' });
  
  // TERMS & CONDITIONS on new page
  pdf.addPage();
  currentPage++;
  addHeader();
  addSectionHeader('TERMS & CONDITIONS');
  
  // Terms table with proper text wrapping - FIXED to prevent overflow
  const terms = [
    { label: 'Quotation Validity:', value: '30 Days', note: 'From date of quotation' },
    { label: 'Lead time:', value: '10-12 weeks', note: 'Subject to availability' },
    { label: 'Payment terms:', value: '50% pre-payment upon order confirmation', note: '' }
  ];
  
  // Draw terms table with proper formatting
  pdf.setFillColor(asafeLightGray.r, asafeLightGray.g, asafeLightGray.b);
  pdf.rect(margin, yPos, contentWidth, 50, 'F');
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.rect(margin, yPos, contentWidth, 50, 'S');
  
  let termY = yPos + 8;
  terms.forEach(term => {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text(term.label, margin + 5, termY);
    
    pdf.setFont('helvetica', 'normal');
    pdf.text(term.value, margin + 45, termY);
    
    if (term.note) {
      pdf.setFontSize(8);
      pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
      pdf.text(term.note, margin + 130, termY);
    }
    
    termY += 8;
  });
  
  // Additional payment terms - improved alignment
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  const paymentLine1 = 'Balance payment for material & carriage cost 30 days from date of material delivery';
  const paymentLine2 = '100% installation due 30 days from installation completion';
  
  const lines1 = pdf.splitTextToSize(paymentLine1, contentWidth - 10);
  lines1.forEach((line: string) => {
    pdf.text(line, margin + 5, termY);
    termY += 4;
  });
  
  const lines2 = pdf.splitTextToSize(paymentLine2, contentWidth - 10);
  lines2.forEach((line: string) => {
    pdf.text(line, margin + 5, termY);
    termY += 4;
  });
  
  yPos += 55;
  
  // Warranty
  pdf.setFillColor(asafeLightGray.r, asafeLightGray.g, asafeLightGray.b);
  pdf.rect(margin, yPos, contentWidth, 10, 'F');
  pdf.setDrawColor(200, 200, 200);
  pdf.rect(margin, yPos, contentWidth, 10, 'S');
  
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('Warranty:', margin + 5, yPos + 7);
  pdf.setFont('helvetica', 'normal');
  pdf.text('24 Months', margin + 45, yPos + 7);
  pdf.setFontSize(8);
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  pdf.text('Against manufacturing defects', margin + 130, yPos + 7);
  
  yPos += 15;
  
  // Add Reciprocal Value Commitments Terms if applicable
  if (orderData.discountDetails && orderData.discountDetails.length > 0 && orderData.discountAmount > 0) {
    checkPageOverflow(40);
    
    // Reciprocal Value section header
    pdf.setFillColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
    pdf.rect(margin, yPos, contentWidth, 10, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text('RECIPROCAL VALUE COMMITMENTS - TERMS & CONDITIONS', margin + 5, yPos + 7);
    
    yPos += 15;
    
    // Explanatory text about reciprocal value
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    const reciprocalExplanation = 'At A-SAFE, we believe in creating partnerships that benefit both sides. That\'s why we offer added value through a reciprocal approach meaning if you share your safety successes, such as a testimonial, referrals, or a LinkedIn post, we can recognize your achievements, promote safer work practices, and celebrate your improvements while enhancing the overall value you receive on your project.';
    
    const explanationLines = pdf.splitTextToSize(reciprocalExplanation, contentWidth - 10);
    explanationLines.forEach((line: string) => {
      pdf.text(line, margin + 5, yPos);
      yPos += 4;
    });
    
    yPos += 5;
    
    // Add specific terms for each selected discount
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('Selected Commitments & Obligations:', margin + 5, yPos);
    yPos += 6;
    
    // Define terms for each discount type - using actual discount percentages from the system
    const discountTerms: { [key: string]: { timeframe: string; obligations: string[]; discountPercent: number } } = {
      'LOGO_USAGE': {
        timeframe: '30 days',
        discountPercent: 1,
        obligations: [
          'Provide high-resolution logo files within 30 days of order confirmation',
          'Grant written permission for logo usage in A-SAFE marketing materials'
        ]
      },
      'CASE_STUDY': {
        timeframe: '90 days',
        discountPercent: 3,
        obligations: [
          'Participate in project interview within 60 days of installation',
          'Review and approve case study content within 14 days of receipt'
        ]
      },
      'VIDEO_TESTIMONIAL': {
        timeframe: '60 days',
        discountPercent: 4,
        obligations: [
          'Schedule filming session within 45 days of installation',
          'Provide 2-4 hours for professional video production'
        ]
      },
      'SITE_PHOTOGRAPHY': {
        timeframe: '45 days',
        discountPercent: 3,
        obligations: [
          'Provide site access for photography within 45 days',
          'Allow 4-6 hours for comprehensive photo session'
        ]
      },
      'PRESS_RELEASE': {
        timeframe: '60 days',
        discountPercent: 4,
        obligations: [
          'Collaborate on press release content within 14 days',
          'Review and approve content within 7 business days'
        ]
      },
      'REFERRALS': {
        timeframe: '90 days',
        discountPercent: 5,
        obligations: [
          'Provide 2-3 qualified warm introductions within 90 days',
          'Facilitate initial contact and introduction calls'
        ]
      },
      'SERVICE_CONTRACT': {
        timeframe: '30 days',
        discountPercent: 6,
        obligations: [
          'Sign multi-year service contract within 30 days',
          'Maintain service agreement for minimum 2 years'
        ]
      },
      'EXCLUSIVE_SUPPLIER': {
        timeframe: '45 days',
        discountPercent: 12,
        obligations: [
          'Sign 24-month exclusive supplier agreement within 45 days',
          'Commit minimum annual spend of 100,000 AED'
        ]
      },
      'ADVANCE_PAYMENT': {
        timeframe: '7 days',
        discountPercent: 5,
        obligations: [
          'Full 100% payment within 7 days of proforma invoice',
          'Payment via bank transfer or approved methods only'
        ]
      },
      'FLAGSHIP_SHOWCASE': {
        timeframe: 'Ongoing',
        discountPercent: 10,
        obligations: [
          'Allow site to be featured as flagship showcase for 2 years',
          'Accommodate client visits and tours (max 2 per month)'
        ]
      },
      'LINKEDIN_POST': {
        timeframe: '30 days',
        discountPercent: 3,
        obligations: [
          'Publish official LinkedIn post within 30 days',
          'Include A-SAFE project details and tagging'
        ]
      },
      'REFERENCE_SITE': {
        timeframe: 'Ongoing',
        discountPercent: 5,
        obligations: [
          'Allow site visits for potential customers',
          'Maintain reference availability for 24 months'
        ]
      }
    };
    
    // List each selected discount with its terms
    orderData.discountDetails.forEach((discount: any) => {
      checkPageOverflow(25);
      
      // Discount title with percentage
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
      pdf.text(`• ${discount.title} (${discount.discountPercent}% Discount)`, margin + 10, yPos);
      yPos += 5;
      
      // Get specific terms for this discount type
      const terms = discountTerms[discount.optionId] || discountTerms['LOGO_USAGE'];
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
      pdf.text(`Timeframe: ${terms.timeframe}`, margin + 15, yPos);
      yPos += 4;
      
      // List obligations
      terms.obligations.forEach(obligation => {
        const obligationLines = pdf.splitTextToSize(`- ${obligation}`, contentWidth - 25);
        obligationLines.forEach((line: string) => {
          pdf.text(line, margin + 15, yPos);
          yPos += 3.5;
        });
      });
      
      // Add non-compliance line with correct discount percentage
      const nonComplianceLine = `- Non-compliance voids ${discount.discountPercent}% discount which becomes immediately chargeable`;
      const nonComplianceLines = pdf.splitTextToSize(nonComplianceLine, contentWidth - 25);
      nonComplianceLines.forEach((line: string) => {
        pdf.text(line, margin + 15, yPos);
        yPos += 3.5;
      });
      
      yPos += 3;
    });
    
    // Important notice about discount reversal
    yPos += 5;
    pdf.setFillColor(255, 243, 224); // Light yellow background
    pdf.rect(margin, yPos - 2, contentWidth, 20, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(184, 134, 11); // Dark yellow text
    pdf.text('IMPORTANT:', margin + 5, yPos + 4);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    const importantNotice = 'Failure to fulfill any reciprocal commitment within the specified timeframe will result in immediate discount reversal. The full discount amount will become chargeable as an additional fee to your project total. All commitments are legally binding upon order confirmation.';
    
    const noticeLines = pdf.splitTextToSize(importantNotice, contentWidth - 35);
    let noticeY = yPos + 4;
    noticeLines.forEach((line: string) => {
      pdf.text(line, margin + 30, noticeY);
      noticeY += 3.5;
    });
    
    yPos += 25;
  }
  
  // Standard conditions text - properly wrapped to avoid overflow
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  
  const conditions = [
    'Concrete bases are required where a suitable concrete floor slab is not available. This is not included in the above quote unless listed.',
    '',
    'It is the clients responsibility to offload the materials/pallets from the delivery vehicle at the destination unless specifically mentioned above. It is the clients responsibility to store the materials in a suitable location at the site prior to installation unless otherwise stated above.',
    '',
    'Images as depicted on the product details are for representational purposes only, and may not picture the actual product quoted for.',
    '',
    'Our standard products are produced with yellow impact rails and black posts units to provide hazard warning colouring (unless otherwise specified) within typical working environments.',
    '',
    'Please note that although all of our products are UV stabilised for impact performance, the yellow colour is primarily intended for internal use as direct sunlight may cause some degree of bleaching effect over a period of time.',
    '',
    'If the quoted barrier is for external application likely to be in direct sunlight, consideration should be given to accepting the impact rails in either a grey or black colour.',
    '',
    'The above prices include the supply of all standard zinc galvanized post floor-fixing bolts, unless specified otherwise as stainless steel/ countersunk/ chemical fixings, etc.',
    '',
    'Please note we do not accept retention deductions or any contractor discounts.'
  ];
  
  conditions.forEach(condition => {
    if (condition) {
      checkPageOverflow(12);
      const lines = pdf.splitTextToSize(condition, contentWidth - 10);
      lines.forEach((line: string, idx: number) => {
        pdf.text(line, margin + 5, yPos);
        yPos += 3.5;
      });
    } else {
      yPos += 2;
    }
  });
  
  // Additional conditions at bottom
  checkPageOverflow(25);
  yPos += 3;
  const additionalConditions = [
    'In the case where installation is unreasonably delayed by Client after delivery of products (>10days), A-Safe reserves the right to issue the final invoice for 100% of the order value.',
    '',
    'All products remain the property of A-Safe until final invoice payment is received.',
    '',
    'A-Safe is not responsible for the removal of any existing barriers, bollards or floor repair works unless specifically listed in the quotation.'
  ];
  
  additionalConditions.forEach(condition => {
    if (condition) {
      const lines = pdf.splitTextToSize(condition, contentWidth - 10);
      lines.forEach((line: string) => {
        pdf.text(line, margin + 5, yPos);
        yPos += 3.5;
      });
    } else {
      yPos += 2;
    }
  });
  
  // Signature Section on new page
  pdf.addPage();
  currentPage++;
  addHeader();
  addSectionHeader('AUTHORIZATION & SIGN-OFF');
  
  // Add instruction text for signing
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  const instructionText = [
    'Please sign both the Technical and Commercial Approval sections below to confirm your order with A-SAFE.',
    `Once signed, please email this completed form to ${returnEmail} for processing.`,
    'Our team will initiate your order upon receipt of the signed authorization.'
  ];
  
  instructionText.forEach(text => {
    pdf.text(text, margin, yPos);
    yPos += 6;
  });
  
  yPos += 10;
  
  // Technical Approval Section with proper borders
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
  pdf.setLineWidth(2);
  pdf.rect(margin, yPos, contentWidth, 45, 'FD');
  
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text('Technical Approval', margin + 5, yPos + 8);
  
  yPos += 15;
  
  // Add form fields for Technical Approval - properly contained
  pdf.setFontSize(9);
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  
  // Name field
  pdf.text('Name:', margin + 5, yPos);
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(margin + 25, yPos + 1, margin + 85, yPos + 1);
  
  // Job Title field
  pdf.text('Job Title:', margin + 95, yPos);
  pdf.line(margin + 115, yPos + 1, pageWidth - margin - 5, yPos + 1);
  yPos += 10;
  
  // Mobile field
  pdf.text('Mobile:', margin + 5, yPos);
  pdf.line(margin + 25, yPos + 1, margin + 85, yPos + 1);
  
  // Date field
  pdf.text('Date:', margin + 95, yPos);
  pdf.line(margin + 115, yPos + 1, pageWidth - margin - 5, yPos + 1);
  yPos += 10;
  
  // Signature field with approval action button for Technical
  pdf.text('Signature:', margin + 5, yPos);
  pdf.line(margin + 30, yPos + 1, pageWidth - margin - 50, yPos + 1);
  
  // Approved button that triggers email for Technical
  pdf.setFillColor(34, 197, 94); // Green color
  pdf.roundedRect(pageWidth - margin - 45, yPos - 3, 40, 8, 1, 1, 'F');
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  const techApproveSubject = encodeURIComponent(`Technical Approval - Order ${orderData.orderNumber}`);
  const techApproveBody = encodeURIComponent(`I hereby approve the technical specifications for Order ${orderData.orderNumber}.\n\nName: [Your Name]\nDate: ${new Date().toLocaleDateString()}`);
  pdf.textWithLink('APPROVE', pageWidth - margin - 25, yPos + 2, {
    url: `mailto:${returnEmail}?subject=${techApproveSubject}&body=${techApproveBody}`,
    align: 'center'
  });
  
  yPos += 20;
  
  // Commercial Approval Section with proper borders
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
  pdf.setLineWidth(2);
  pdf.rect(margin, yPos, contentWidth, 45, 'FD');
  
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
  pdf.text('Commercial Approval', margin + 5, yPos + 8);
  
  yPos += 15;
  
  // Add form fields for Commercial Approval - properly contained
  pdf.setFontSize(9);
  pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
  
  // Name field
  pdf.text('Name:', margin + 5, yPos);
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(margin + 25, yPos + 1, margin + 85, yPos + 1);
  
  // Job Title field
  pdf.text('Job Title:', margin + 95, yPos);
  pdf.line(margin + 115, yPos + 1, pageWidth - margin - 5, yPos + 1);
  yPos += 10;
  
  // Mobile field
  pdf.text('Mobile:', margin + 5, yPos);
  pdf.line(margin + 25, yPos + 1, margin + 85, yPos + 1);
  
  // Date field
  pdf.text('Date:', margin + 95, yPos);
  pdf.line(margin + 115, yPos + 1, pageWidth - margin - 5, yPos + 1);
  yPos += 10;
  
  // Signature field with approval action button for Commercial
  pdf.text('Signature:', margin + 5, yPos);
  pdf.line(margin + 30, yPos + 1, pageWidth - margin - 50, yPos + 1);
  
  // Approved button that triggers email for Commercial
  pdf.setFillColor(34, 197, 94); // Green color
  pdf.roundedRect(pageWidth - margin - 45, yPos - 3, 40, 8, 1, 1, 'F');
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  const commercialApproveSubject = encodeURIComponent(`Commercial Approval - Order ${orderData.orderNumber}`);
  const commercialApproveBody = encodeURIComponent(`I hereby approve the commercial terms for Order ${orderData.orderNumber}.\n\nName: [Your Name]\nDate: ${new Date().toLocaleDateString()}`);
  pdf.textWithLink('APPROVE', pageWidth - margin - 25, yPos + 2, {
    url: `mailto:${returnEmail}?subject=${commercialApproveSubject}&body=${commercialApproveBody}`,
    align: 'center'
  });
  
  yPos += 20;
  
  // Marketing Sign-off Section (for reciprocal discounts)
  if (orderData.discountDetails && orderData.discountDetails.length > 0 && orderData.discountAmount > 0) {
    // Marketing Approval Section with proper borders
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
    pdf.setLineWidth(2);
    pdf.rect(margin, yPos, contentWidth, 60, 'FD');
    
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text('Marketing Sign-off (Required for Reciprocal Discounts)', margin + 5, yPos + 8);
    
    yPos += 12;
    
    // Add note about marketing commitments
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
    const marketingNote = 'Permission for A-SAFE to professionally photograph installed barriers in operation at the customer\'s facility for marketing use.';
    const noteLines = pdf.splitTextToSize(marketingNote, contentWidth - 10);
    noteLines.forEach((line: string) => {
      pdf.text(line, margin + 5, yPos);
      yPos += 4;
    });
    
    yPos += 5;
    
    // Add form fields for Marketing Sign-off
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
    
    // Name field
    pdf.text('Name:', margin + 5, yPos);
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.line(margin + 25, yPos + 1, margin + 85, yPos + 1);
    
    // Job Title field
    pdf.text('Job Title:', margin + 95, yPos);
    pdf.line(margin + 115, yPos + 1, pageWidth - margin - 5, yPos + 1);
    yPos += 10;
    
    // Date field
    pdf.text('Date:', margin + 5, yPos);
    pdf.line(margin + 25, yPos + 1, margin + 85, yPos + 1);
    
    // Signature field
    pdf.text('Signature:', margin + 95, yPos);
    pdf.line(margin + 120, yPos + 1, pageWidth - margin - 5, yPos + 1);
    
    yPos += 15;
  }
  
  // Add Impact Calculation section if available
  if (orderData.impactCalculation) {
    pdf.addPage();
    currentPage++;
    addHeader();
    addSectionHeader('IMPACT CALCULATION DETAILS');
    
    // Impact calculation details box
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(220, 220, 220);
    pdf.setLineWidth(0.3);
    pdf.rect(margin, yPos, contentWidth, 80, 'FD');
    
    const calcY = yPos + 10;
    pdf.setFontSize(10);
    
    // Vehicle Information
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text('Vehicle Type:', margin + 5, calcY);
    pdf.setFont('helvetica', 'normal');
    pdf.text(orderData.impactCalculation.vehicleType || 'Forklift', margin + 40, calcY);
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Vehicle Weight:', margin + 100, calcY);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${orderData.impactCalculation.vehicleWeight || 0} kg`, margin + 135, calcY);
    
    // Impact Information
    const calcY2 = calcY + 10;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Impact Speed:', margin + 5, calcY2);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${orderData.impactCalculation.impactSpeed || 0} km/h`, margin + 40, calcY2);
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Impact Angle:', margin + 100, calcY2);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${orderData.impactCalculation.impactAngle || 90}°`, margin + 135, calcY2);
    
    // Calculated Impact Energy
    const calcY3 = calcY2 + 15;
    pdf.setFillColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
    pdf.rect(margin + 5, calcY3 - 5, contentWidth - 10, 15, 'F');
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text('Calculated Impact Energy:', margin + 10, calcY3 + 3);
    pdf.text(`${orderData.impactCalculation.impactEnergy || 0} Joules`, pageWidth - margin - 10, calcY3 + 3, { align: 'right' });
    
    // Safety Margin
    const calcY4 = calcY3 + 20;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Safety Margin Applied:', margin + 5, calcY4);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${orderData.impactCalculation.safetyMargin || 30}%`, margin + 60, calcY4);
    
    pdf.setFont('helvetica', 'bold');
    pdf.text('Required Rating:', margin + 100, calcY4);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(34, 197, 94);
    pdf.text(`${orderData.impactCalculation.requiredRating || 0} Joules`, margin + 135, calcY4);
    
    yPos += 90;
  }
  
  // Add Layout Drawings section if available
  if (orderData.layoutDrawings && orderData.layoutDrawings.length > 0) {
    for (const drawing of orderData.layoutDrawings) {
      pdf.addPage();
      currentPage++;
      addHeader();
      addSectionHeader('LAYOUT DRAWING - PRODUCT PLACEMENT');
      
      // Drawing title
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
      pdf.text(drawing.name || 'Site Layout', margin, yPos);
      yPos += 8;
      
      if (drawing.description) {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
        const descLines = pdf.splitTextToSize(drawing.description, contentWidth);
        descLines.forEach((line: string) => {
          pdf.text(line, margin, yPos);
          yPos += 5;
        });
      }
      
      yPos += 5;
      
      // Load and display the marked up drawing image
      if (drawing.markedUpImageUrl || drawing.imageUrl) {
        try {
          let drawingBase64 = '';
          const imageUrl = drawing.markedUpImageUrl || drawing.imageUrl;
          
          // Handle authenticated URLs
          if (imageUrl.startsWith('/')) {
            const fullUrl = window.location.origin + imageUrl;
            const response = await fetch(fullUrl, {
              credentials: 'include',
              headers: {
                'Accept': 'image/*'
              }
            });
            if (response.ok) {
              const blob = await response.blob();
              const reader = new FileReader();
              drawingBase64 = await new Promise<string>((resolve) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            }
          } else if (imageUrl.startsWith('blob:')) {
            drawingBase64 = imageUrl;
          } else {
            drawingBase64 = await loadImageAsBase64(imageUrl);
          }
          
          if (drawingBase64) {
            // Calculate optimal size for full-page display
            const maxWidth = contentWidth;
            const maxHeight = pageHeight - yPos - 30; // Leave space for footer
            
            // Add the image with aspect ratio preservation
            const img = new Image();
            img.src = drawingBase64;
            await new Promise(resolve => {
              img.onload = resolve;
            });
            
            const aspectRatio = img.width / img.height;
            let imgWidth = maxWidth;
            let imgHeight = maxWidth / aspectRatio;
            
            if (imgHeight > maxHeight) {
              imgHeight = maxHeight;
              imgWidth = maxHeight * aspectRatio;
            }
            
            // Center the image horizontally
            const xOffset = margin + (contentWidth - imgWidth) / 2;
            
            // Add border around image
            pdf.setDrawColor(220, 220, 220);
            pdf.setLineWidth(0.5);
            pdf.rect(xOffset - 2, yPos - 2, imgWidth + 4, imgHeight + 4, 'D');
            
            // Add the image
            pdf.addImage(drawingBase64, 'JPEG', xOffset, yPos, imgWidth, imgHeight);
            
            // Add scale information if available
            if (drawing.scale) {
              const scaleY = yPos + imgHeight + 8;
              pdf.setFontSize(8);
              pdf.setFont('helvetica', 'italic');
              pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
              pdf.text(`Scale: ${drawing.scale}`, pageWidth / 2, scaleY, { align: 'center' });
            }
          }
        } catch (error) {
          console.log('Failed to load layout drawing:', error);
          // Add placeholder text if image fails
          pdf.setFontSize(10);
          pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
          pdf.text('Layout drawing could not be loaded', pageWidth / 2, yPos + 50, { align: 'center' });
        }
      }
    }
  }
  
  // Add Related Case Studies and Resources Section (if available)
  if ((orderData.recommendedCaseStudies && orderData.recommendedCaseStudies.length > 0) || 
      (orderData.recommendedResources && orderData.recommendedResources.length > 0)) {
    pdf.addPage();
    currentPage++;
    addHeader();
    addSectionHeader('ADDITIONAL RESOURCES');
    
    // Case Studies Section
    if (orderData.recommendedCaseStudies && orderData.recommendedCaseStudies.length > 0) {
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
      pdf.text('Relevant Case Studies', margin, yPos);
      yPos += 8;
      
      orderData.recommendedCaseStudies.slice(0, 5).forEach((study: any) => {
        checkPageOverflow(15);
        
        // Case study title with link
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 100, 200);
        const studyTitle = study.title || 'Case Study';
        const studyUrl = study.pdfUrl || `https://asafe.ae/case-studies/${study.id}`;
        pdf.textWithLink(`• ${studyTitle}`, margin + 5, yPos, {
          url: studyUrl
        });
        
        // Industry and company info
        if (study.industry || study.company) {
          pdf.setFontSize(8);
          pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
          const metadata = [];
          if (study.industry) metadata.push(study.industry);
          if (study.company) metadata.push(study.company);
          pdf.text(metadata.join(' | '), margin + 10, yPos + 4);
          yPos += 4;
        }
        
        yPos += 8;
      });
      
      yPos += 10;
    }
    
    // Resources Section
    if (orderData.recommendedResources && orderData.recommendedResources.length > 0) {
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
      pdf.text('Technical Resources & Guides', margin, yPos);
      yPos += 8;
      
      // Group resources by type
      const resourcesByType: { [key: string]: any[] } = {};
      orderData.recommendedResources.forEach((resource: any) => {
        const type = resource.resourceType || resource.category || 'Other';
        if (!resourcesByType[type]) {
          resourcesByType[type] = [];
        }
        resourcesByType[type].push(resource);
      });
      
      // Display resources by type
      Object.entries(resourcesByType).forEach(([type, resources]) => {
        checkPageOverflow(20);
        
        // Resource type header
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(asafeGray.r, asafeGray.g, asafeGray.b);
        pdf.text(type, margin + 5, yPos);
        yPos += 5;
        
        resources.slice(0, 3).forEach((resource: any) => {
          // Resource title with link
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 100, 200);
          const resourceTitle = resource.title || 'Resource';
          const resourceUrl = resource.fileUrl || `https://asafe.ae/resources/${resource.id}`;
          pdf.textWithLink(`  • ${resourceTitle}`, margin + 10, yPos, {
            url: resourceUrl
          });
          yPos += 5;
        });
        
        yPos += 3;
      });
    }
    
    // Virtual Tour Link
    yPos += 10;
    checkPageOverflow(15);
    pdf.setFillColor(asafeYellow.r, asafeYellow.g, asafeYellow.b);
    pdf.roundedRect(margin, yPos, contentWidth, 12, 2, 2, 'F');
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(asafeBlack.r, asafeBlack.g, asafeBlack.b);
    pdf.text('Experience Our Virtual Product Tour', margin + 5, yPos + 8);
    pdf.setTextColor(0, 100, 200);
    pdf.textWithLink('Click here to explore', pageWidth - margin - 40, yPos + 8, {
      url: 'https://asafe.ae/virtual-tour',
      align: 'right'
    });
    
    addPageNumber();
    addFooter();
  } else {
    // Add footer and page number on last page if no resources section
    addPageNumber();
    addFooter();
  }

  // Save the PDF with company-specific naming - use actual currency from order
  const companyPrefix = orderData.currency === 'SAR' ? 'A-SAFE-KSA' : orderData.currency === 'AED' ? 'A-SAFE-UAE' : 'A-SAFE';
  pdf.save(`${companyPrefix}_Order_${orderData.orderNumber}_${new Date().toISOString().split('T')[0]}.pdf`);
}