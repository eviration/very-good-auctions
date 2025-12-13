import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function DataDeletionPage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="clay-section">
          <h1 className="font-display text-4xl font-black text-white mb-2">
            User Data Deletion
          </h1>
          <p className="text-white/70 mb-8">Your data, your choice</p>

          <div className="prose prose-invert max-w-none space-y-8">
            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">Your Right to Delete Your Data</h2>
              <p className="text-white/70 leading-relaxed">
                At Very Good Auctions, we respect your right to control your personal data.
                You can request complete deletion of your account and associated data at any time.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">What Data Will Be Deleted</h2>
              <p className="text-white/70 leading-relaxed mb-4">
                When you request account deletion, we will remove:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4">
                <li>Your account profile and login credentials</li>
                <li>Your bidding history and preferences</li>
                <li>Items you have submitted (if not sold)</li>
                <li>Your notification settings and history</li>
                <li>Any other personal information associated with your account</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">Data We May Retain</h2>
              <p className="text-white/70 leading-relaxed mb-4">
                Certain information may be retained for legal or operational purposes:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4">
                <li>Transaction records (required for tax and legal compliance)</li>
                <li>Completed auction records (anonymized where possible)</li>
                <li>Information necessary to resolve disputes</li>
                <li>Data required by law to be retained</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">How to Request Deletion</h2>
              <div className="clay-card p-6 bg-clay-mint/20">
                {isAuthenticated ? (
                  <div>
                    <p className="text-white/70 leading-relaxed mb-4">
                      To delete your account and data:
                    </p>
                    <ol className="list-decimal list-inside text-white/70 space-y-2 ml-4">
                      <li>Go to your <Link to="/profile" className="text-sage hover:underline">Profile Settings</Link></li>
                      <li>Scroll to the bottom of the page</li>
                      <li>Click "Delete My Account"</li>
                      <li>Confirm your decision</li>
                    </ol>
                  </div>
                ) : (
                  <div>
                    <p className="text-white/70 leading-relaxed mb-4">
                      To request deletion of your data, you can:
                    </p>
                    <ol className="list-decimal list-inside text-white/70 space-y-2 ml-4">
                      <li>Sign in to your account and use the self-service deletion option in your profile settings</li>
                      <li>Email us at <a href="mailto:privacy@verygoodauctions.com" className="text-sage hover:underline">privacy@verygoodauctions.com</a> with the subject "Data Deletion Request"</li>
                    </ol>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">Processing Time</h2>
              <p className="text-white/70 leading-relaxed">
                Data deletion requests are typically processed within 30 days. You will receive
                a confirmation email once your data has been deleted. During this period, your
                account will be deactivated.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">Before You Delete</h2>
              <p className="text-white/70 leading-relaxed mb-4">
                Please note that account deletion is permanent and cannot be undone. Before
                requesting deletion, please ensure:
              </p>
              <ul className="list-disc list-inside text-white/70 space-y-2 ml-4">
                <li>You have no active bids on ongoing auctions</li>
                <li>You have paid for all won items</li>
                <li>You have fulfilled any pending obligations as an organizer</li>
                <li>You have downloaded any data you wish to keep</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">Facebook Login Users</h2>
              <p className="text-white/70 leading-relaxed">
                If you signed up using Facebook, you can also manage your data connection
                through Facebook's settings. Disconnecting our app from Facebook will not
                automatically delete your Very Good Auctions account - please follow the
                steps above to request complete data deletion.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold text-white mb-3">Contact Us</h2>
              <p className="text-white/70 leading-relaxed">
                If you have questions about data deletion or need assistance, please contact us at{' '}
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
