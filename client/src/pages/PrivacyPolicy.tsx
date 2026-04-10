import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-black mb-4">Privacy Policy</h1>
        <p className="text-gray-600">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Information We Collect</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Personal Information</h4>
              <p className="text-gray-700">
                When you register for A-SAFE ENGAGE, we collect personal information including your name, email address, company details, job title, and phone number. This information is necessary to provide you with access to our platform and services.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Usage Data</h4>
              <p className="text-gray-700">
                We automatically collect information about how you use our platform, including pages visited, features used, time spent on the platform, and interaction patterns. This helps us improve our services and user experience.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Technical Information</h4>
              <p className="text-gray-700">
                We collect technical data such as IP address, browser type, device information, and operating system to ensure platform compatibility and security.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How We Use Your Information</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Provide access to A-SAFE ENGAGE platform and services</li>
              <li>Process your orders and quote requests</li>
              <li>Communicate with you about your account, orders, and platform updates</li>
              <li>Provide technical support and customer service</li>
              <li>Improve our platform functionality and user experience</li>
              <li>Ensure platform security and prevent unauthorized access</li>
              <li>Comply with legal obligations and business requirements</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Information Sharing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-700">
              We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><strong>Service Providers:</strong> We may share information with trusted third-party service providers who assist us in operating our platform, processing payments, or providing customer support.</li>
              <li><strong>Legal Requirements:</strong> We may disclose information when required by law, court order, or government request.</li>
              <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of the transaction.</li>
              <li><strong>Safety and Security:</strong> We may share information to protect the safety of our users, prevent fraud, or investigate suspected illegal activities.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Security</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. This includes encryption, secure servers, access controls, and regular security assessments. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Retention</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              We retain your personal information for as long as necessary to provide our services, comply with legal obligations, resolve disputes, and enforce our agreements. When information is no longer needed, we securely delete or anonymize it according to our data retention policies.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Rights</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">
              Depending on your location, you may have the following rights regarding your personal information:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information, subject to legal obligations</li>
              <li><strong>Portability:</strong> Request transfer of your data to another service provider</li>
              <li><strong>Restriction:</strong> Request limitation of processing in certain circumstances</li>
              <li><strong>Objection:</strong> Object to processing of your personal information for certain purposes</li>
            </ul>
            <p className="text-gray-700 mt-4">
              To exercise these rights, please contact us using the information provided below.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cookies and Tracking</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              A-SAFE ENGAGE uses cookies and similar tracking technologies to enhance your experience, analyze usage patterns, and provide personalized content. Cookies are small data files stored on your device that help us remember your preferences and improve platform functionality. You can control cookie settings through your browser preferences, though disabling cookies may affect platform functionality.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Third-Party Services</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              Our platform may contain links to third-party websites or integrate with external services. This privacy policy does not apply to third-party sites or services. We encourage you to review the privacy policies of any third-party services you access through our platform.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Children's Privacy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              A-SAFE ENGAGE is intended for business use and is not designed for children under 16. We do not knowingly collect personal information from children under 16. If we become aware that we have collected such information, we will take steps to delete it promptly.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Changes to This Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              We may update this privacy policy from time to time to reflect changes in our practices, technology, or legal requirements. We will notify you of any material changes by posting the updated policy on our platform and updating the "Last updated" date. We encourage you to review this policy periodically.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">
              If you have questions about this privacy policy or our data practices, please contact us:
            </p>
            <div className="space-y-2 text-gray-700">
              <p><strong>Email:</strong> support@asafe.ae</p>
              <p><strong>Phone:</strong> +971 4 884 2422</p>
              <p><strong>Address:</strong> A-SAFE Middle East, Dubai, United Arab Emirates</p>
              <p><strong>Business Hours:</strong> Monday to Friday, 8:30 AM - 5:30 PM (GST)</p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center py-8">
          <p className="text-gray-600">
            This privacy policy is part of our commitment to protecting your personal information and maintaining your trust in A-SAFE ENGAGE.
          </p>
        </div>
      </div>
    </div>
  );
}