import { Link } from 'react-router-dom'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="clay-section">
          <h1 className="font-display text-4xl font-black text-white mb-2">
            Privacy Policy
          </h1>
          <p className="text-white/70 mb-8">Last updated: December 1, 2024</p>

          <div className="prose prose-invert max-w-none space-y-8">
            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">1. Introduction</h2>
              <p className="text-white/70 leading-relaxed">
                Very Good Auctions ("we," "our," or "us") is committed to protecting your privacy.
                This Privacy Policy explains how we collect, use, disclose, and safeguard your
                information when you use our online auction platform.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">2. Information We Collect</h2>
              <p className="text-white/70 leading-relaxed mb-4">
                We collect information you provide directly to us, including:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4">
                <li>Account information (name, email address)</li>
                <li>Profile information you choose to provide</li>
                <li>Organization details (for auction organizers)</li>
                <li>Bidding and transaction history</li>
                <li>Communications with us or other users</li>
                <li>Items you submit for auction</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">3. How We Use Your Information</h2>
              <p className="text-white/70 leading-relaxed mb-4">
                We use the information we collect to:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4">
                <li>Provide, maintain, and improve our services</li>
                <li>Process transactions and send related information</li>
                <li>Send you notifications about auctions, bids, and wins</li>
                <li>Respond to your comments, questions, and requests</li>
                <li>Detect, investigate, and prevent fraudulent transactions</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">4. Information Sharing</h2>
              <p className="text-white/70 leading-relaxed">
                We do not sell your personal information. We may share your information with:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4 mt-4">
                <li>Service providers who assist in our operations</li>
                <li>Auction organizers (for transaction fulfillment)</li>
                <li>Law enforcement when required by law</li>
                <li>Other parties with your consent</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">5. Data Security</h2>
              <p className="text-white/70 leading-relaxed">
                We implement appropriate technical and organizational measures to protect your
                personal information against unauthorized access, alteration, disclosure, or
                destruction. However, no method of transmission over the Internet is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">6. Your Rights</h2>
              <p className="text-white/70 leading-relaxed mb-4">
                You have the right to:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4">
                <li>Access your personal information</li>
                <li>Correct inaccurate information</li>
                <li>Request deletion of your data</li>
                <li>Object to processing of your information</li>
                <li>Export your data in a portable format</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">7. Cookies</h2>
              <p className="text-white/70 leading-relaxed">
                We use cookies and similar technologies to maintain your session, remember your
                preferences, and understand how you use our platform. You can control cookies
                through your browser settings.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">8. Children's Privacy</h2>
              <p className="text-white/70 leading-relaxed">
                Our services are not intended for users under 18 years of age. We do not
                knowingly collect information from children under 18.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">9. Changes to This Policy</h2>
              <p className="text-white/70 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any
                changes by posting the new policy on this page and updating the "Last updated" date.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">10. Contact Us</h2>
              <p className="text-white/70 leading-relaxed">
                If you have any questions about this Privacy Policy, please contact us at{' '}
                <a href="mailto:privacy@verygoodauctions.com" className="text-sage hover:underline">
                  privacy@verygoodauctions.com
                </a>
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-white/60">
            <Link to="/" className="text-sage hover:underline font-medium">
              &larr; Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
