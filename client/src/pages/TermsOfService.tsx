import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsOfService() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-black mb-4">Terms of Service</h1>
        <p className="text-gray-600">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Agreement to Terms</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              By accessing and using A-SAFE ENGAGE ("the Platform"), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this platform. The materials contained in this platform are protected by applicable copyright and trademark law.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              A-SAFE ENGAGE is a B2B customer portal providing authenticated users access to safety barrier product catalogs, impact calculation tools, case studies, technical resources, and order management systems. The platform is designed exclusively for business use by authorized customers, partners, and stakeholders of A-SAFE.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>User Accounts and Registration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Account Creation</h4>
              <p className="text-gray-700">
                To access A-SAFE ENGAGE, you must create an account using accurate and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Account Security</h4>
              <p className="text-gray-700">
                You must immediately notify A-SAFE of any unauthorized use of your account or any other breach of security. A-SAFE will not be liable for any loss or damage arising from your failure to comply with this security obligation.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Account Termination</h4>
              <p className="text-gray-700">
                A-SAFE reserves the right to suspend or terminate your account at any time for violation of these terms, suspicious activity, or any other reason deemed necessary to protect the platform or other users.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permitted Use</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">
              You may use A-SAFE ENGAGE for legitimate business purposes only. Permitted uses include:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Browsing and evaluating A-SAFE safety products and solutions</li>
              <li>Using calculation tools for impact assessment and product selection</li>
              <li>Downloading technical resources and documentation</li>
              <li>Submitting quote requests and managing orders</li>
              <li>Accessing case studies and educational materials</li>
              <li>Communicating with A-SAFE regarding products and services</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prohibited Activities</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">
              You agree not to engage in any of the following prohibited activities:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Using the platform for any unlawful purpose or in violation of any applicable laws</li>
              <li>Attempting to gain unauthorized access to any portion of the platform</li>
              <li>Interfering with or disrupting the platform's functionality or security features</li>
              <li>Copying, reproducing, or distributing platform content without authorization</li>
              <li>Using automated tools to access the platform without express permission</li>
              <li>Impersonating another user or providing false information</li>
              <li>Transmitting viruses, malware, or other harmful code</li>
              <li>Using the platform to compete with A-SAFE or for reverse engineering purposes</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Intellectual Property Rights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">A-SAFE Content</h4>
              <p className="text-gray-700">
                All content on A-SAFE ENGAGE, including text, graphics, logos, images, software, and documentation, is the property of A-SAFE and protected by copyright, trademark, and other intellectual property laws. You may not use this content without express written permission.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">User Content</h4>
              <p className="text-gray-700">
                By submitting content to the platform (such as project specifications or feedback), you grant A-SAFE a non-exclusive, royalty-free license to use, modify, and distribute such content for business purposes related to providing services to you.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Trademarks</h4>
              <p className="text-gray-700">
                A-SAFE, the A-SAFE logo, and other A-SAFE trademarks are the exclusive property of A-SAFE. You may not use these trademarks without prior written consent.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders and Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Quote Requests</h4>
              <p className="text-gray-700">
                Quote requests submitted through the platform are not binding orders. All quotes are subject to verification, availability, and final approval by A-SAFE sales representatives.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Pricing</h4>
              <p className="text-gray-700">
                Prices displayed on the platform are estimates and may vary based on specifications, quantities, delivery requirements, and current market conditions. Final pricing will be confirmed in written quotations.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Payment Terms</h4>
              <p className="text-gray-700">
                Payment terms and methods will be specified in individual sales agreements. Orders are subject to credit approval and A-SAFE's standard terms and conditions of sale.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform Availability</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              A-SAFE strives to maintain platform availability 24/7 but does not guarantee uninterrupted access. The platform may be temporarily unavailable due to maintenance, updates, or technical issues. A-SAFE reserves the right to modify, suspend, or discontinue any aspect of the platform at any time.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Disclaimer of Warranties</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              A-SAFE ENGAGE is provided "as is" without warranty of any kind. A-SAFE disclaims all warranties, express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. A-SAFE does not warrant that the platform will be error-free, secure, or continuously available.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limitation of Liability</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              To the maximum extent permitted by law, A-SAFE shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities, arising from your use of the platform. A-SAFE's total liability shall not exceed the amount paid by you for platform access in the twelve months preceding the claim.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Indemnification</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              You agree to indemnify and hold harmless A-SAFE, its affiliates, officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from your use of the platform, violation of these terms, or infringement of any rights of another party.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy and Data Protection</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              Your privacy is important to us. Our collection and use of personal information is governed by our Privacy Policy, which is incorporated into these terms by reference. By using the platform, you consent to the collection and use of your information as described in the Privacy Policy.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Modifications to Terms</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              A-SAFE reserves the right to modify these Terms of Service at any time. Updated terms will be posted on the platform with the revised effective date. Your continued use of the platform after such modifications constitutes acceptance of the updated terms. Material changes will be communicated via email or platform notification.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Governing Law and Jurisdiction</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              These Terms of Service shall be governed by and construed in accordance with the laws of the United Arab Emirates. Any disputes arising from these terms or your use of the platform shall be subject to the exclusive jurisdiction of the courts of Dubai, UAE.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Severability</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              If any provision of these Terms of Service is found to be unenforceable or invalid, that provision will be limited or eliminated to the minimum extent necessary so that the remaining terms remain in full force and effect.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">
              If you have questions about these Terms of Service, please contact us:
            </p>
            <div className="space-y-2 text-gray-700">
              <p><strong>Email:</strong> legal@asafe.ae</p>
              <p><strong>Phone:</strong> +971 4 884 2422</p>
              <p><strong>Address:</strong> A-SAFE Middle East, Dubai, United Arab Emirates</p>
              <p><strong>Business Hours:</strong> Monday to Friday, 8:30 AM - 5:30 PM (GST)</p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center py-8">
          <p className="text-gray-600">
            By using A-SAFE ENGAGE, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
          </p>
        </div>
      </div>
    </div>
  );
}