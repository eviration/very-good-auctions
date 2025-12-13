import { Link } from 'react-router-dom'

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="clay-section">
          <h1 className="font-display text-4xl font-black text-white mb-2">
            Terms of Service
          </h1>
          <p className="text-white/70 mb-8">Last updated: December 1, 2024</p>

          <div className="prose prose-invert max-w-none space-y-8">
            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">1. Acceptance of Terms</h2>
              <p className="text-white/70 leading-relaxed">
                By accessing or using Very Good Auctions ("the Service"), you agree to be bound
                by these Terms of Service. If you do not agree to these terms, please do not use
                our Service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">2. Description of Service</h2>
              <p className="text-white/70 leading-relaxed">
                Very Good Auctions provides an online platform that enables organizations to run
                fundraising auctions. We facilitate connections between auction organizers, item
                donors, and bidders.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">3. User Accounts</h2>
              <p className="text-white/70 leading-relaxed mb-4">
                To use certain features of the Service, you must create an account. You agree to:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4">
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Notify us immediately of any unauthorized access</li>
                <li>Accept responsibility for all activities under your account</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">4. Bidding and Transactions</h2>
              <p className="text-white/70 leading-relaxed mb-4">
                When you place a bid:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4">
                <li>Your bid is a binding offer to purchase the item at that price</li>
                <li>Winning bids create an obligation to complete the purchase</li>
                <li>You agree to pay the winning amount plus any applicable fees</li>
                <li>Items are sold "as described" by the seller</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">5. Organization Responsibilities</h2>
              <p className="text-white/70 leading-relaxed mb-4">
                Organizations using our platform agree to:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4">
                <li>Provide accurate descriptions of auction items</li>
                <li>Fulfill winning bids in a timely manner</li>
                <li>Handle disputes fairly and professionally</li>
                <li>Comply with all applicable laws and regulations</li>
                <li>Maintain appropriate records for tax purposes</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">6. Prohibited Conduct</h2>
              <p className="text-white/70 leading-relaxed mb-4">
                You agree not to:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4">
                <li>Bid on your own items to inflate prices (shill bidding)</li>
                <li>Submit false or misleading information</li>
                <li>Interfere with auctions or other users</li>
                <li>Use the Service for illegal purposes</li>
                <li>Attempt to circumvent fees or security measures</li>
                <li>List prohibited or illegal items</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">7. Fees and Payments</h2>
              <p className="text-white/70 leading-relaxed">
                Organizations pay a flat fee based on auction size. Payment processing fees may
                apply to transactions. All fees are disclosed before you commit to using the Service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">8. Intellectual Property</h2>
              <p className="text-white/70 leading-relaxed">
                The Service and its original content, features, and functionality are owned by
                Very Good Auctions and are protected by copyright, trademark, and other laws.
                You retain ownership of content you submit but grant us a license to use it in
                connection with the Service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">9. Limitation of Liability</h2>
              <p className="text-white/70 leading-relaxed">
                Very Good Auctions is not liable for any indirect, incidental, special,
                consequential, or punitive damages arising from your use of the Service. We are
                a platform and do not guarantee the quality, safety, or legality of items listed.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">10. Dispute Resolution</h2>
              <p className="text-white/70 leading-relaxed">
                Disputes between users should first be resolved directly between the parties.
                We may assist in mediation but are not obligated to resolve disputes. Any legal
                disputes with us shall be resolved through binding arbitration.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">11. Termination</h2>
              <p className="text-white/70 leading-relaxed">
                We may terminate or suspend your account at any time for violations of these
                terms. You may close your account at any time. Upon termination, your right to
                use the Service ceases immediately.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">12. Changes to Terms</h2>
              <p className="text-white/70 leading-relaxed">
                We may modify these terms at any time. Continued use of the Service after changes
                constitutes acceptance of the new terms. We will notify users of material changes.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">13. Contact</h2>
              <p className="text-white/70 leading-relaxed">
                For questions about these Terms of Service, please contact us at{' '}
                <a href="mailto:legal@verygoodauctions.com" className="text-sage hover:underline">
                  legal@verygoodauctions.com
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
