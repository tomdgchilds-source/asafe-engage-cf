// Consultative advisor message templates for pre-sales enablement
// Designed for same-day follow-ups after customer site meetings

export const consultativeTemplates = {
  // Post-Site Visit Templates (Same day follow-up)
  post_site_visit: {
    site_assessment_delivery: {
      email: {
        subject: "Site Safety Assessment - {{companyName}}",
        content: `Dear {{contactName}},

Thank you for showing us around your facility today. As discussed, I've prepared a safety assessment focusing on the areas we reviewed together.

Key Observations from Today's Visit:
• {{observationArea1}}: {{observation1}}
• {{observationArea2}}: {{observation2}}
• {{observationArea3}}: {{observation3}}

Based on PAS 13:2017 standards, I've calculated the impact ratings for your high-traffic zones and included recommendations in the attached assessment.

The assessment includes:
- Risk mapping of your facility layout
- Impact calculations for each zone
- Product specifications matched to your requirements
- Installation considerations we discussed

You can review the full assessment here: {{assessmentLink}}

Please let me know if you need any clarification on the technical specifications or calculations.

Best regards,
{{salesRepName}}
Safety Consultant, A-SAFE`,
      },
      whatsapp: `Hi {{contactName}},

Thanks for the facility tour today. I've completed your safety assessment based on our discussions.

Key findings:
✓ {{keyFinding1}}
✓ {{keyFinding2}}
✓ {{keyFinding3}}

View assessment: {{assessmentLink}}

Any questions on the calculations or recommendations?`,
    },
    
    survey_and_quote: {
      email: {
        subject: "Safety Survey & Quote - {{companyName}}",
        content: `Hi {{contactName}},

Following our meeting today, I've prepared the safety survey and quote we discussed.

Survey Summary:
• Total areas assessed: {{areaCount}}
• Priority zones identified: {{priorityZones}}
• Compliance requirements addressed: {{complianceItems}}

Quote Details:
• Survey reference: {{surveyReference}}
• Total investment: {{quoteAmount}}
• Lead time: {{leadTime}}
• Installation duration: {{installationTime}}

Access your documents:
- Safety Survey: {{surveyLink}}
- Detailed Quote: {{quoteLink}}

The quote includes all products, delivery, and installation supervision as we discussed. The pricing is valid for {{validityPeriod}} days.

Let me know if you need any adjustments to the specifications.

Regards,
{{salesRepName}}`,
      },
      whatsapp: `{{contactName}}, your survey and quote from today's meeting:

📋 Survey: {{surveyLink}}
💰 Quote: {{quoteAmount}}
📅 Lead time: {{leadTime}}

Valid for {{validityPeriod}} days.

Need any changes to the specifications?`,
    },
  },

  // Technical Review Templates
  technical_review: {
    impact_calculations: {
      email: {
        subject: "Impact Calculations for {{companyName}} - Technical Review",
        content: `{{contactName}},

Here are the impact calculations we discussed for your facility's vehicle operations.

Vehicle Impact Analysis:
• Vehicle type: {{vehicleType}}
• Operating speed: {{speed}} km/h
• Vehicle weight: {{weight}} kg
• Calculated impact energy: {{impactEnergy}} kJ

Recommended Protection Levels:
{{protectionZone1}}: {{product1}} ({{rating1}} kJ rating)
{{protectionZone2}}: {{product2}} ({{rating2}} kJ rating)
{{protectionZone3}}: {{product3}} ({{rating3}} kJ rating)

All recommendations include appropriate safety factors as per PAS 13:2017 standards.

Technical datasheets and test certificates are available in your portal: {{portalLink}}

Would you like to discuss any of these calculations in more detail?

Best regards,
{{salesRepName}}`,
      },
      whatsapp: `Impact calculations ready for {{companyName}}:

🚗 {{vehicleType}} at {{speed}} km/h
⚡ Impact energy: {{impactEnergy}} kJ
✅ Products selected with safety margin

View full calculations: {{calculationsLink}}

Questions about the technical data?`,
    },
    
    compliance_documentation: {
      email: {
        subject: "Safety Compliance Documentation - {{companyName}}",
        content: `{{contactName}},

As requested, here's the compliance documentation for your safety infrastructure requirements.

Documentation Package Includes:
• PAS 13:2017 compliance certificates
• Product test reports and certifications
• Installation method statements
• Risk assessment templates
• Maintenance schedules

Specific to Your Requirements:
- {{requirement1}}: {{document1}}
- {{requirement2}}: {{document2}}
- {{requirement3}}: {{document3}}

All documentation is available for download: {{documentLink}}

These documents should satisfy your {{complianceBody}} audit requirements. If your compliance team needs additional information, please let me know.

Regards,
{{salesRepName}}`,
      },
      whatsapp: `Compliance docs ready for {{companyName}}:

📄 PAS 13:2017 certificates
📄 Test reports
📄 Installation guides
📄 Risk assessments

Download all: {{documentLink}}

Compliance team needs anything else?`,
    },
  },

  // Implementation Planning Templates
  implementation_planning: {
    installation_schedule: {
      email: {
        subject: "Installation Schedule - {{companyName}}",
        content: `{{contactName}},

Here's the proposed installation schedule for your safety barrier system.

Installation Timeline:
• Delivery to site: {{deliveryDate}}
• Installation start: {{installStartDate}}
• Phase 1 ({{phase1Areas}}): {{phase1Duration}}
• Phase 2 ({{phase2Areas}}): {{phase2Duration}}
• Completion & handover: {{completionDate}}

Site Requirements:
- Access needed: {{accessRequirements}}
- Power/utilities: {{utilityRequirements}}
- Coordination with your team: {{coordinationNeeds}}

Our installation team will contact you {{contactTiming}} to confirm arrangements.

Please confirm this schedule works with your operational requirements.

Best regards,
{{salesRepName}}`,
      },
      whatsapp: `Installation schedule for {{companyName}}:

📦 Delivery: {{deliveryDate}}
🔧 Start: {{installStartDate}}
✅ Complete: {{completionDate}}

Duration: {{totalDuration}}

Does this timeline work for you?`,
    },
    
    pre_installation_checklist: {
      email: {
        subject: "Pre-Installation Checklist - {{companyName}}",
        content: `{{contactName}},

To ensure smooth installation, please review this pre-installation checklist:

Site Preparation:
□ Floor marking completed as per drawings
□ Installation areas clear of obstructions
□ Forklift/equipment moved from installation zones
□ Power outlets available for tools

Documentation:
□ Permits/approvals obtained
□ Safety induction requirements confirmed
□ Site contact person designated

Coordination:
□ Installation dates confirmed with operations team
□ Access arrangements in place
□ Parking/unloading area allocated

The installation team will arrive at {{arrivalTime}} on {{installDate}}.

Please confirm these items are addressed or let me know if you need assistance with any preparations.

Regards,
{{salesRepName}}`,
      },
      whatsapp: `Pre-installation checklist:

☐ Areas marked & cleared
☐ Permits ready
☐ Site contact: {{siteContact}}
☐ Access arranged

Team arrives: {{arrivalTime}}, {{installDate}}

All set?`,
    },
  },

  // Project Support Templates
  project_support: {
    technical_clarification: {
      email: {
        subject: "Technical Clarification - {{topic}}",
        content: `{{contactName}},

Regarding your question about {{topic}}:

{{technicalExplanation}}

For your specific application:
• {{applicationPoint1}}
• {{applicationPoint2}}
• {{applicationPoint3}}

I've attached the relevant technical documentation for reference.

If you need further clarification or would like to discuss alternative solutions, I'm available for a call at your convenience.

Best regards,
{{salesRepName}}`,
      },
      whatsapp: `{{contactName}}, about {{topic}}:

{{briefExplanation}}

Need more details? Happy to call.`,
    },
    
    post_installation_followup: {
      email: {
        subject: "Installation Complete - {{companyName}}",
        content: `{{contactName}},

Your safety barrier installation has been completed successfully.

Installation Summary:
• Products installed: {{productCount}} units
• Areas protected: {{areasCovered}}
• Compliance achieved: {{complianceStandards}}

Next Steps:
1. Review the installation certificate (attached)
2. Schedule staff safety briefing if needed
3. Implement maintenance schedule as provided

Your installation warranty is active from today for {{warrantyPeriod}} years.

Thank you for choosing A-SAFE as your safety partner. Please don't hesitate to contact me if you need any assistance.

Best regards,
{{salesRepName}}`,
      },
      whatsapp: `Installation complete at {{companyName}}! ✅

• {{productCount}} barriers installed
• {{warrantyPeriod}} year warranty active
• Certificate attached

Need anything else?`,
    },
  },

  // Quick Response Templates
  quick_responses: {
    thank_you: {
      email: {
        subject: "Thank You - {{companyName}}",
        content: `{{contactName}},

Thank you for your time today. I'll prepare the {{documentType}} we discussed and send it over by {{deadline}}.

Best regards,
{{salesRepName}}`,
      },
      whatsapp: `Thanks {{contactName}}! I'll send the {{documentType}} by {{deadline}}.`,
    },
    
    information_request: {
      email: {
        subject: "Information Requested - {{topic}}",
        content: `{{contactName}},

Here's the information you requested about {{topic}}:

{{information}}

Let me know if you need anything else.

Regards,
{{salesRepName}}`,
      },
      whatsapp: `{{contactName}}, info on {{topic}}:

{{briefInfo}}

Need more details?`,
    },
    
    meeting_confirmation: {
      email: {
        subject: "Meeting Confirmed - {{date}}",
        content: `{{contactName}},

Confirming our meeting:
• Date: {{date}}
• Time: {{time}}
• Location: {{location}}
• Purpose: {{purpose}}

See you then.

Regards,
{{salesRepName}}`,
      },
      whatsapp: `Meeting confirmed:
📅 {{date}}
⏰ {{time}}
📍 {{location}}

See you then!`,
    },
  },
};

// Helper function to get all templates for dropdown
export const getAllTemplates = () => {
  const templates: Array<{
    id: string;
    category: string;
    name: string;
    template: any;
  }> = [];

  Object.entries(consultativeTemplates).forEach(([categoryKey, category]) => {
    Object.entries(category).forEach(([templateKey, template]) => {
      templates.push({
        id: `${categoryKey}.${templateKey}`,
        category: categoryKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        name: templateKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        template,
      });
    });
  });

  return templates;
};

// Simplified workflow stages for pre-sales enablement
export const workflowStages = [
  {
    id: 'post_site_visit',
    name: 'Post-Site Visit',
    description: 'Same-day follow-up with assessment and quote',
    timing: 'Same day',
    actions: ['Send assessment', 'Deliver quote', 'Share survey results'],
  },
  {
    id: 'technical_review',
    name: 'Technical Review',
    description: 'Share calculations and compliance documentation',
    timing: 'Day 1-3',
    actions: ['Impact calculations', 'Compliance docs', 'Technical specs'],
  },
  {
    id: 'implementation_planning',
    name: 'Implementation Planning',
    description: 'Schedule installation and coordinate logistics',
    timing: 'Upon approval',
    actions: ['Installation schedule', 'Site preparation', 'Team coordination'],
  },
  {
    id: 'project_support',
    name: 'Project Support',
    description: 'Ongoing technical support and guidance',
    timing: 'As needed',
    actions: ['Technical questions', 'Post-installation', 'Maintenance guidance'],
  },
];